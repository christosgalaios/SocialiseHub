import { Router } from 'express';
import type { ServiceStore } from '../data/store.js';
import { VALID_PLATFORMS } from '../shared/types.js';
import type { PlatformName } from '../shared/types.js';

function isValidPlatform(value: string): value is PlatformName {
  return VALID_PLATFORMS.includes(value as PlatformName);
}

export function createServicesRouter(serviceStore: ServiceStore): Router {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      const services = await serviceStore.getAll();
      res.json({ data: services });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:platform/connect', async (req, res, next) => {
    try {
      if (!isValidPlatform(req.params.platform)) {
        return res.status(400).json({ error: 'Invalid platform' });
      }
      const credentials = req.body as Record<string, string>;
      const service = await serviceStore.connect(req.params.platform, credentials);
      if (!service) {
        return res.status(404).json({ error: 'Platform not found' });
      }
      res.json({ data: service });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:platform/disconnect', async (req, res, next) => {
    try {
      if (!isValidPlatform(req.params.platform)) {
        return res.status(400).json({ error: 'Invalid platform' });
      }
      const service = await serviceStore.disconnect(req.params.platform);
      if (!service) {
        return res.status(404).json({ error: 'Platform not found' });
      }
      res.json({ data: service });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
