import { Router } from 'express';
import type { SyncLogStore } from '../data/sync-log-store.js';
import type { PlatformEventStore } from '../data/platform-event-store.js';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';
import type { SqliteServiceStore } from '../data/sqlite-service-store.js';
import type { PublishService } from '../tools/publish-service.js';
import type { SyncSnapshotStore } from '../data/sync-snapshot-store.js';
import { computeSyncHash } from '../data/sync-snapshot-store.js';
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
        description: pe.description ?? '',
        start_time: pe.date ?? new Date().toISOString(),
        duration_minutes: 120,
        venue: pe.venue ?? '',
        price: pe.ticketPrice ?? 0,
        capacity: pe.capacity ?? 0,
      });
      if (pe.imageUrls?.[0]) eventStore.update(newEvent.id, { image_url: pe.imageUrls[0] } as never);
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
      description: pe.description ?? existing.description,
      price: pe.ticketPrice ?? existing.price,
      capacity: pe.capacity ?? existing.capacity,
      image_url: pe.imageUrls?.[0] ?? existing.imageUrl,
    } as never);
    // update() auto-flips sync_status to 'modified' for synced events — restore to synced
    eventStore.updateSyncStatus(pe.eventId, 'synced');
    eventStore.updateStatus(pe.eventId, mapPlatformStatus(pe.status));
  } else {
    // New platform event — check if a matching event already exists (cross-platform dedup)
    const match = eventStore.findMatch(pe.title, pe.date ?? undefined);
    if (match) {
      // Only link if this platform doesn't already have a link to this event
      // (prevents two Eventbrite events with same name both linking to one event)
      const existingLinks = platformEventStore.getByEventId(match.id);
      const alreadyLinkedOnSamePlatform = existingLinks.some(
        (link) => link.platform === pe.platform
      );
      if (!alreadyLinkedOnSamePlatform) {
        platformEventStore.linkToEvent(pe.id, match.id);
        return;
      }
      // Same platform already has a link — fall through to create a new event
    }

    // No match — create a new event row
    const newEvent = eventStore.create({
      title: pe.title || 'Untitled',
      description: pe.description ?? '',
      start_time: pe.date ?? new Date().toISOString(),
      duration_minutes: 120,
      venue: pe.venue ?? '',
      price: pe.ticketPrice ?? 0,
      capacity: pe.capacity ?? 0,
    });
    if (pe.imageUrls?.[0]) eventStore.update(newEvent.id, { image_url: pe.imageUrls[0] } as never);
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
  snapshotStore: SyncSnapshotStore,
): Router {
  const router = Router();

  /**
   * GET /api/sync/log
   * Returns recent sync log entries.
   */
  router.get('/log', (req, res, next) => {
    try {
      const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 200);
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
  router.post('/pull', async (req, res, next) => {
    try {
      const platformFilter = typeof req.query.platform === 'string' ? req.query.platform as PlatformName : undefined;
      if (platformFilter && !VALID_PLATFORMS.includes(platformFilter)) {
        return res.status(400).json({ error: `Invalid platform: ${platformFilter}` });
      }

      const services = serviceStore.getAll();
      let totalPulled = 0;
      let totalUpdated = 0;
      const conflicts: Array<{ eventId: string; eventTitle: string; platform: string }> = [];

      for (const svc of services) {
        if (!svc.connected) continue;
        if (platformFilter && svc.platform !== platformFilter) continue;
        const client = publishService.getClient(svc.platform);
        if (!client) continue;

        try {
          const events = await client.fetchEvents();
          // Track which external IDs we pulled for stale cleanup after
          const pulledExternalIds = new Set<string>();
          for (const pe of events) {
            try {
              pulledExternalIds.add(pe.externalId);
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
                description: pe.description,
                imageUrls: pe.imageUrls,
              });
              await linkPlatformEventToEvent(upserted, eventStore, platformEventStore);

              // Re-fetch to get the final event_id after linking
              const linked = platformEventStore.getByPlatform(svc.platform).find(
                (p) => p.externalId === pe.externalId,
              ) ?? upserted;

              if (linked.eventId) {
                const incomingHash = computeSyncHash({
                  title: pe.title,
                  description: pe.description ?? '',
                  startTime: pe.date ?? '',
                  venue: pe.venue ?? '',
                  price: pe.ticketPrice ?? 0,
                  capacity: pe.capacity ?? 0,
                  photos: pe.imageUrls ?? [],
                });

                const existingSnapshot = snapshotStore.get(linked.eventId, svc.platform);

                if (!existingSnapshot) {
                  // First sync — store snapshot
                  snapshotStore.upsert({
                    eventId: linked.eventId,
                    platform: svc.platform,
                    title: pe.title,
                    description: pe.description ?? '',
                    startTime: pe.date ?? '',
                    venue: pe.venue ?? '',
                    price: pe.ticketPrice ?? 0,
                    capacity: pe.capacity ?? 0,
                    photosJson: JSON.stringify(pe.imageUrls ?? []),
                    snapshotHash: incomingHash,
                  });
                } else if (incomingHash !== existingSnapshot.snapshotHash) {
                  // Platform changed since last snapshot — check if local also changed
                  const localEvent = eventStore.getById(linked.eventId);
                  if (localEvent) {
                    let localPhotos: string[];
                    try { localPhotos = JSON.parse(existingSnapshot.photosJson || '[]') as string[]; }
                    catch { localPhotos = []; }
                    const localHash = computeSyncHash({
                      title: localEvent.title,
                      description: localEvent.description ?? '',
                      startTime: localEvent.start_time,
                      venue: localEvent.venue ?? '',
                      price: localEvent.price,
                      capacity: localEvent.capacity ?? 0,
                      photos: localPhotos,
                    });

                    if (localHash === existingSnapshot.snapshotHash) {
                      // Local unchanged — auto-update from platform
                      eventStore.update(linked.eventId, {
                        title: pe.title,
                        description: pe.description,
                        start_time: pe.date ?? localEvent.start_time,
                        venue: pe.venue ?? localEvent.venue,
                        price: pe.ticketPrice ?? localEvent.price,
                        capacity: pe.capacity ?? localEvent.capacity,
                      });
                      eventStore.updateSyncStatus(linked.eventId, 'synced');
                      totalUpdated++;
                    } else {
                      // Both local and platform changed — conflict, platform wins
                      eventStore.update(linked.eventId, {
                        title: pe.title,
                        description: pe.description,
                        start_time: pe.date ?? localEvent.start_time,
                        venue: pe.venue ?? localEvent.venue,
                        price: pe.ticketPrice ?? localEvent.price,
                        capacity: pe.capacity ?? localEvent.capacity,
                      });
                      eventStore.updateSyncStatus(linked.eventId, 'synced');
                      conflicts.push({
                        eventId: linked.eventId,
                        eventTitle: pe.title,
                        platform: svc.platform,
                      });
                    }

                    // Update snapshot to reflect new platform state
                    snapshotStore.upsert({
                      eventId: linked.eventId,
                      platform: svc.platform,
                      title: pe.title,
                      description: pe.description ?? '',
                      startTime: pe.date ?? '',
                      venue: pe.venue ?? '',
                      price: pe.ticketPrice ?? 0,
                      capacity: pe.capacity ?? 0,
                      photosJson: JSON.stringify(pe.imageUrls ?? []),
                      snapshotHash: incomingHash,
                    });
                  }
                }
                // If incoming hash matches snapshot — platform unchanged, no action needed
              }
            } catch (eventErr) {
              // Log the error but continue processing other events
              syncLogStore.log({
                platform: svc.platform,
                action: 'pull',
                status: 'error',
                message: `Failed to process "${pe.title}" from ${svc.platform}: ${eventErr instanceof Error ? eventErr.message : String(eventErr)}`,
              });
            }
          }
          // Clean up platform_events that weren't in this pull (deleted on platform)
          const staleRemoved = platformEventStore.cleanStale(svc.platform, pulledExternalIds);
          totalPulled += events.length;
          syncLogStore.log({
            platform: svc.platform,
            action: 'pull',
            status: 'success',
            message: `Pulled ${events.length} events` + (staleRemoved > 0 ? `, removed ${staleRemoved} stale` : ''),
          });
        } catch (err) {
          syncLogStore.log({
            platform: svc.platform,
            action: 'pull',
            status: 'error',
            message: `Pull failed for ${svc.platform}: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      res.json({ data: { pulled: totalPulled, updated: totalUpdated, conflicts } });
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

      if (typeof eventId !== 'string' || !eventId.trim()) {
        res.status(400).json({ error: 'eventId is required' });
        return;
      }
      if (typeof platform !== 'string' || !platform.trim()) {
        res.status(400).json({ error: 'platform is required' });
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

      // After successful push, update snapshot with current local data
      const platformEventsAfter = platformEventStore.getByEventId(eventId);
      const pe = platformEventsAfter.find((p) => p.platform === typedPlatform);
      const photos = pe?.imageUrls ?? [];
      const pushHash = computeSyncHash({
        title: event.title,
        description: event.description ?? '',
        startTime: event.start_time,
        venue: event.venue ?? '',
        price: event.price,
        capacity: event.capacity ?? 0,
        photos,
      });
      snapshotStore.upsert({
        eventId,
        platform: typedPlatform,
        title: event.title,
        description: event.description ?? '',
        startTime: event.start_time,
        venue: event.venue ?? '',
        price: event.price,
        capacity: event.capacity ?? 0,
        photosJson: JSON.stringify(photos),
        snapshotHash: pushHash,
      });

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
   * POST /api/sync/push-all
   * Pushes event to all platforms it has platform_events for.
   * Body: { eventId: string }
   */
  router.post('/push-all', async (req, res, next) => {
    try {
      const { eventId } = req.body as { eventId?: string };

      if (typeof eventId !== 'string' || !eventId.trim()) {
        res.status(400).json({ error: 'eventId is required' });
        return;
      }

      const event = eventStore.getById(eventId);
      if (!event) {
        res.status(404).json({ error: `Event ${eventId} not found` });
        return;
      }

      const platformEvents = platformEventStore.getByEventId(eventId);
      if (platformEvents.length === 0) {
        res.status(400).json({ error: 'No platform events linked to this event' });
        return;
      }

      const results: Array<{ platform: string; success: boolean; error?: string }> = [];

      for (const pe of platformEvents) {
        try {
          let result;
          if (pe.externalId) {
            result = await publishService.update(pe.externalId, event, pe.platform);
          } else {
            const publishResults = await publishService.publish(event, [pe.platform]);
            result = publishResults[0];
          }

          if (result?.success) {
            const photos = pe.imageUrls ?? [];
            const pushHash = computeSyncHash({
              title: event.title,
              description: event.description ?? '',
              startTime: event.start_time,
              venue: event.venue ?? '',
              price: event.price,
              capacity: event.capacity ?? 0,
              photos,
            });
            snapshotStore.upsert({
              eventId,
              platform: pe.platform,
              title: event.title,
              description: event.description ?? '',
              startTime: event.start_time,
              venue: event.venue ?? '',
              price: event.price,
              capacity: event.capacity ?? 0,
              photosJson: JSON.stringify(photos),
              snapshotHash: pushHash,
            });
            results.push({ platform: pe.platform, success: true });
            syncLogStore.log({
              platform: pe.platform as PlatformName,
              action: 'push',
              status: 'success',
              message: `Pushed event ${eventId} to ${pe.platform}`,
            });
          } else {
            results.push({ platform: pe.platform, success: false, error: result?.error ?? 'Push failed' });
            syncLogStore.log({
              platform: pe.platform as PlatformName,
              action: 'push',
              status: 'error',
              message: result?.error ?? 'Push failed',
            });
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          results.push({ platform: pe.platform, success: false, error: errMsg });
          syncLogStore.log({
            platform: pe.platform as PlatformName,
            action: 'push',
            status: 'error',
            message: `Push failed for ${pe.platform}: ${errMsg}`,
          });
        }
      }

      const allSuccess = results.every((r) => r.success);
      if (allSuccess) {
        eventStore.updateSyncStatus(eventId, 'synced');
      }

      res.json({ data: { results } });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/sync/pull-event
   * Overwrites local event data with the latest platform_event data.
   * Body: { eventId: string, platform: string }
   */
  router.post('/pull-event', async (req, res, next) => {
    try {
      const { eventId, platform } = req.body as { eventId?: string; platform?: string };

      if (typeof eventId !== 'string' || !eventId.trim()) {
        res.status(400).json({ error: 'eventId is required' });
        return;
      }
      if (typeof platform !== 'string' || !platform.trim()) {
        res.status(400).json({ error: 'platform is required' });
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

      const platformEvents = platformEventStore.getByEventId(eventId);
      const pe = platformEvents.find((p) => p.platform === platform);
      if (!pe) {
        res.status(404).json({ error: `No platform event found for ${platform}` });
        return;
      }

      // Overwrite local event with platform data
      eventStore.update(eventId, {
        title: pe.title,
        description: pe.description,
        start_time: pe.date ?? event.start_time,
        venue: pe.venue ?? event.venue,
        price: pe.ticketPrice ?? event.price,
        capacity: pe.capacity ?? event.capacity,
      });
      eventStore.updateSyncStatus(eventId, 'synced');

      // Update snapshot to reflect this platform state
      const photos = pe.imageUrls ?? [];
      const hash = computeSyncHash({
        title: pe.title,
        description: pe.description ?? '',
        startTime: pe.date ?? '',
        venue: pe.venue ?? '',
        price: pe.ticketPrice ?? 0,
        capacity: pe.capacity ?? 0,
        photos,
      });
      snapshotStore.upsert({
        eventId,
        platform,
        title: pe.title,
        description: pe.description ?? '',
        startTime: pe.date ?? '',
        venue: pe.venue ?? '',
        price: pe.ticketPrice ?? 0,
        capacity: pe.capacity ?? 0,
        photosJson: JSON.stringify(photos),
        snapshotHash: hash,
      });

      syncLogStore.log({
        platform: platform as PlatformName,
        action: 'pull',
        status: 'success',
        message: `Pulled platform data for event ${eventId} from ${platform}`,
      });

      res.json({ data: eventStore.getById(eventId) });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/sync/dashboard/summary
   * Returns aggregate stats using the events table as the primary source.
   * - totalEvents, upcomingEvents, pastEvents, draftEvents, eventsThisWeek,
   *   eventsThisMonth, monthlyTrend are all derived from eventStore (events table).
   * - byPlatform counts unique event_ids linked on each platform (from platform_events).
   */
  router.get('/dashboard/summary', (_req, res, next) => {
    try {
      const allEvents = eventStore.getAll();
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

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
        if (evt.status === 'draft') draftEvents++;

        const date = new Date(evt.start_time);
        if (date >= weekStart) eventsThisWeek++;
        if (date >= monthStart) eventsThisMonth++;
        if (date >= now) upcomingEvents++;
        else pastEvents++;

        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, monthlyMap.get(monthKey)! + 1);
        }
      }

      // byPlatform: count unique event_ids per platform from platform_events
      const byPlatform = Object.fromEntries(
        VALID_PLATFORMS.map((p) => {
          const platformEvents = platformEventStore.getByPlatform(p);
          const uniqueEventIds = new Set(
            platformEvents.map((pe) => pe.eventId).filter((id): id is string => id != null),
          );
          return [p, uniqueEventIds.size];
        }),
      ) as Record<PlatformName, number>;

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
