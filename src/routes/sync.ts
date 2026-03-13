import { Router } from 'express';
import type { SyncLogStore } from '../data/sync-log-store.js';
import type { PlatformEventStore } from '../data/platform-event-store.js';
import type { DashboardSummary, PlatformName } from '../shared/types.js';
import { VALID_PLATFORMS } from '../shared/types.js';

export function createSyncRouter(
  syncLogStore: SyncLogStore,
  platformEventStore: PlatformEventStore,
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
   * Stub for pulling events from connected platforms.
   */
  router.post('/pull', (_req, res) => {
    res.json({ pulled: 0 });
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

      for (const evt of allEvents) {
        byPlatform[evt.platform] = (byPlatform[evt.platform] ?? 0) + 1;

        const date = evt.date ? new Date(evt.date) : null;
        if (date) {
          if (date >= weekStart) eventsThisWeek++;
          if (date >= monthStart) eventsThisMonth++;
        }
      }

      const summary: DashboardSummary = {
        totalEvents: allEvents.length,
        eventsThisWeek,
        eventsThisMonth,
        byPlatform,
      };

      res.json({ data: summary });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
