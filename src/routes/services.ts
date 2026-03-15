import { Router } from 'express';
import type { SqliteServiceStore } from '../data/sqlite-service-store.js';
import type { Database } from '../data/database.js';
import { VALID_PLATFORMS } from '../shared/types.js';
import type { PlatformName } from '../shared/types.js';

function isValidPlatform(value: string): value is PlatformName {
  return VALID_PLATFORMS.includes(value as PlatformName);
}

export function createServicesRouter(serviceStore: SqliteServiceStore, db?: Database): Router {
  const router = Router();

  router.get('/', (_req, res, next) => {
    try {
      const services = serviceStore.getAll();
      res.json({ data: services });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:platform/connect', (req, res, next) => {
    try {
      if (!isValidPlatform(req.params.platform)) {
        return res.status(400).json({ error: 'Invalid platform' });
      }
      const credentials = req.body as Record<string, string>;
      const service = serviceStore.connect(req.params.platform, credentials);
      if (!service) {
        return res.status(404).json({ error: 'Platform not found' });
      }
      res.json({ data: service });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:platform/disconnect', (req, res, next) => {
    try {
      if (!isValidPlatform(req.params.platform)) {
        return res.status(400).json({ error: 'Invalid platform' });
      }
      const platform = req.params.platform;
      const service = serviceStore.disconnect(platform);
      if (!service) {
        return res.status(404).json({ error: 'Platform not found' });
      }

      // Clean up platform events and linked events for this platform
      if (db) {
        // Get event IDs linked to this platform's events before deleting
        const linkedEvents = db.prepare(
          'SELECT event_id FROM platform_events WHERE platform = ? AND event_id IS NOT NULL'
        ).all(platform) as Array<{ event_id: string }>;

        // Delete platform events
        db.prepare('DELETE FROM platform_events WHERE platform = ?').run(platform);

        // Delete linked events (only those created by sync, not manually created ones)
        for (const { event_id } of linkedEvents) {
          // Check if this event is linked to other platforms
          const otherLinks = db.prepare(
            'SELECT COUNT(*) as cnt FROM platform_events WHERE event_id = ? AND platform != ?'
          ).get(event_id, platform) as { cnt: number };

          // Only delete if no other platform links remain and event is sync-created
          if (otherLinks.cnt === 0) {
            db.prepare("DELETE FROM events WHERE id = ? AND sync_status = 'synced'").run(event_id);
          }
        }
      }

      res.json({ data: service });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:platform/setup', (req, res, next) => {
    try {
      if (!isValidPlatform(req.params.platform)) {
        return res.status(400).json({ error: 'Invalid platform' });
      }
      const extra = req.body as Record<string, unknown>;
      serviceStore.updateExtra(req.params.platform, extra);
      res.json({ data: { platform: req.params.platform, updated: true } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
