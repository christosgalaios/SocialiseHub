import { Router } from 'express';
import type { SqliteServiceStore } from '../data/sqlite-service-store.js';
import { VALID_PLATFORMS } from '../shared/types.js';
import type { PlatformName } from '../shared/types.js';

function isValidPlatform(value: string): value is PlatformName {
  return VALID_PLATFORMS.includes(value as PlatformName);
}

export function createServicesRouter(serviceStore: SqliteServiceStore): Router {
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
      const service = serviceStore.disconnect(req.params.platform);
      if (!service) {
        return res.status(404).json({ error: 'Platform not found' });
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
