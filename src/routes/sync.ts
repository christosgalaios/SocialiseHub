import { Router } from 'express';
import type { SyncLogStore } from '../data/sync-log-store.js';
import type { PlatformEventStore } from '../data/platform-event-store.js';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';
import type { SqliteServiceStore } from '../data/sqlite-service-store.js';
import type { PublishService } from '../tools/publish-service.js';
import type { DashboardSummary, PlatformName } from '../shared/types.js';
import { VALID_PLATFORMS } from '../shared/types.js';

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
          const events = await client.fetchEvents();
          for (const pe of events) {
            platformEventStore.upsert({
              platform: pe.platform,
              externalId: pe.externalId,
              externalUrl: pe.externalUrl,
              title: pe.title,
              date: pe.date,
              venue: pe.venue,
              status: pe.status,
              rawData: pe.rawData,
            });
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
