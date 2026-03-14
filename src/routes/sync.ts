import { Router } from 'express';
import type { SyncLogStore } from '../data/sync-log-store.js';
import type { PlatformEventStore } from '../data/platform-event-store.js';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';
import type { SqliteServiceStore } from '../data/sqlite-service-store.js';
import type { PublishService } from '../tools/publish-service.js';
import type { DashboardSummary, PlatformEvent, PlatformName } from '../shared/types.js';
import { VALID_PLATFORMS } from '../shared/types.js';

/**
 * Creates or updates a row in the events table based on a platform event.
 * Skips update if the event has local edits (sync_status === 'modified').
 * Links the platform_event to the event row after creation.
 */
function mapPlatformStatus(platformStatus: string): 'draft' | 'published' | 'cancelled' {
  if (platformStatus === 'active' || platformStatus === 'past') return 'published';
  if (platformStatus === 'cancelled') return 'cancelled';
  return 'draft';
}

export async function linkPlatformEventToEvent(
  pe: PlatformEvent,
  eventStore: SqliteEventStore,
  platformEventStore: PlatformEventStore,
): Promise<void> {
  if (pe.eventId) {
    // Already linked — skip if locally modified
    const existing = eventStore.getById(pe.eventId);
    if (!existing) {
      // Stale link — event was deleted. Re-create and re-link.
      const newEvent = eventStore.create({
        title: pe.title || 'Untitled',
        description: '',
        start_time: pe.date ?? new Date().toISOString(),
        duration_minutes: 120,
        venue: pe.venue ?? '',
        price: 0,
        capacity: pe.capacity ?? 0,
      });
      eventStore.updateStatus(newEvent.id, mapPlatformStatus(pe.status));
      eventStore.updateSyncStatus(newEvent.id, 'synced');
      platformEventStore.linkToEvent(pe.id, newEvent.id);
      return;
    }
    if (existing.sync_status === 'modified') return;

    // Update with latest platform data
    eventStore.update(pe.eventId, {
      title: pe.title,
      start_time: pe.date ?? existing.start_time,
      venue: pe.venue ?? existing.venue,
    });
    eventStore.updateStatus(pe.eventId, mapPlatformStatus(pe.status));
    eventStore.updateSyncStatus(pe.eventId, 'synced');
  } else {
    // New platform event — check if a matching event already exists (cross-platform dedup)
    const match = eventStore.findMatch(pe.title, pe.date ?? undefined);
    if (match) {
      // Link to existing event instead of creating a duplicate
      platformEventStore.linkToEvent(pe.id, match.id);
      return;
    }

    // No match — create a new event row
    const newEvent = eventStore.create({
      title: pe.title || 'Untitled',
      description: '',
      start_time: pe.date ?? new Date().toISOString(),
      duration_minutes: 120,
      venue: pe.venue ?? '',
      price: 0,
      capacity: 0,
    });
    eventStore.updateStatus(newEvent.id, mapPlatformStatus(pe.status));
    eventStore.updateSyncStatus(newEvent.id, 'synced');
    platformEventStore.linkToEvent(pe.id, newEvent.id);
  }
}

export function createSyncRouter(
  syncLogStore: SyncLogStore,
  platformEventStore: PlatformEventStore,
  publishService: PublishService,
  eventStore: SqliteEventStore,
  serviceStore: SqliteServiceStore,
): Router {
  const router = Router();

  /**
   * GET /api/sync/log
   * Returns recent sync log entries.
   */
  router.get('/log', (req, res, next) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const entries = syncLogStore.getRecent(limit);
      res.json({ data: entries, total: entries.length });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/sync/pull
   * Pulls events from all connected platforms.
   */
  router.post('/pull', async (_req, res, next) => {
    try {
      const services = serviceStore.getAll();
      let totalPulled = 0;

      for (const svc of services) {
        if (!svc.connected) continue;
        const client = publishService.getClient(svc.platform);
        if (!client) continue;

        try {
          // Clear cached data for this platform — pull fresh
          platformEventStore.clearPlatform(svc.platform, eventStore);

          const events = await client.fetchEvents();
          for (const pe of events) {
            const upserted = platformEventStore.upsert({
              platform: pe.platform,
              externalId: pe.externalId,
              externalUrl: pe.externalUrl,
              title: pe.title,
              date: pe.date,
              venue: pe.venue,
              status: pe.status,
              rawData: pe.rawData,
              attendance: pe.attendance,
              capacity: pe.capacity,
              revenue: pe.revenue,
              ticketPrice: pe.ticketPrice,
            });
            await linkPlatformEventToEvent(upserted, eventStore, platformEventStore);
          }
          totalPulled += events.length;
          syncLogStore.log({
            platform: svc.platform,
            action: 'pull',
            status: 'success',
            message: `Pulled ${events.length} events`,
          });
        } catch (err) {
          syncLogStore.log({
            platform: svc.platform,
            action: 'pull',
            status: 'error',
            message: String(err),
          });
        }
      }

      res.json({ data: { pulled: totalPulled } });
    } catch (err) { next(err); }
  });

  /**
   * POST /api/sync/push
   * Pushes a locally-modified event to a platform.
   * Body: { eventId: string, platform: string }
   */
  router.post('/push', async (req, res, next) => {
    try {
      const { eventId, platform } = req.body as { eventId?: string; platform?: string };

      if (!eventId || !platform) {
        res.status(400).json({ error: 'eventId and platform are required' });
        return;
      }

      if (!VALID_PLATFORMS.includes(platform as PlatformName)) {
        res.status(400).json({ error: `Invalid platform: ${platform}` });
        return;
      }

      const event = eventStore.getById(eventId);
      if (!event) {
        res.status(404).json({ error: `Event ${eventId} not found` });
        return;
      }

      if (event.sync_status !== 'modified') {
        res.status(400).json({ error: `Event sync_status is '${event.sync_status}', expected 'modified'` });
        return;
      }

      const typedPlatform = platform as PlatformName;

      // Check if there's an existing platform event with an externalId (update vs create)
      const platformEvents = platformEventStore.getByEventId(eventId);
      const existingPe = platformEvents.find((pe) => pe.platform === typedPlatform);

      let result;
      if (existingPe?.externalId) {
        result = await publishService.update(existingPe.externalId, event, typedPlatform);
      } else {
        const results = await publishService.publish(event, [typedPlatform]);
        result = results[0];
      }

      if (!result || !result.success) {
        syncLogStore.log({
          platform: typedPlatform,
          action: 'push',
          status: 'error',
          message: result?.error ?? 'Unknown error',
        });
        res.status(502).json({ error: result?.error ?? 'Push failed' });
        return;
      }

      eventStore.updateSyncStatus(eventId, 'synced');
      syncLogStore.log({
        platform: typedPlatform,
        action: 'push',
        status: 'success',
        message: `Pushed event ${eventId} to ${platform}`,
      });

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/sync/dashboard/summary
   * Returns aggregate stats from platform events.
   */
  router.get('/dashboard/summary', (_req, res, next) => {
    try {
      const allEvents = platformEventStore.getAll();
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const byPlatform = Object.fromEntries(
        VALID_PLATFORMS.map((p) => [p, 0]),
      ) as Record<PlatformName, number>;

      let eventsThisWeek = 0;
      let eventsThisMonth = 0;
      let upcomingEvents = 0;
      let pastEvents = 0;
      let draftEvents = 0;

      // Build monthly trend for last 6 months
      const monthlyMap = new Map<string, number>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyMap.set(key, 0);
      }

      for (const evt of allEvents) {
        byPlatform[evt.platform] = (byPlatform[evt.platform] ?? 0) + 1;

        if (evt.status === 'draft') draftEvents++;

        const date = evt.date ? new Date(evt.date) : null;
        if (date) {
          if (date >= weekStart) eventsThisWeek++;
          if (date >= monthStart) eventsThisMonth++;
          if (date >= now) upcomingEvents++;
          else pastEvents++;

          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (monthlyMap.has(monthKey)) {
            monthlyMap.set(monthKey, monthlyMap.get(monthKey)! + 1);
          }
        }
      }

      const monthlyTrend = Array.from(monthlyMap.entries()).map(([month, count]) => ({
        month,
        count,
      }));

      const summary: DashboardSummary = {
        totalEvents: allEvents.length,
        eventsThisWeek,
        eventsThisMonth,
        byPlatform,
        upcomingEvents,
        pastEvents,
        draftEvents,
        monthlyTrend,
      };

      res.json({ data: summary });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
