import { Router } from 'express';
import type { EventStore } from '../data/store.js';
import type { EventCreator } from '../agents/event-creator.js';
import type { PlatformName } from '../shared/types.js';

export function createEventsRouter(
  store: EventStore,
  creator: EventCreator,
): Router {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      const events = await store.getAll();
      res.json({ data: events, total: events.length });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const event = await store.getById(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });
      res.json({ data: event });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const event = await creator.create(req.body);
      res.status(201).json({ data: event });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Validation')) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const event = await store.update(req.params.id, req.body);
      if (!event) return res.status(404).json({ error: 'Event not found' });
      res.json({ data: event });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const deleted = await store.delete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Event not found' });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/publish', async (req, res, next) => {
    try {
      const platforms = req.body.platforms as PlatformName[] | undefined;
      if (!platforms?.length) {
        return res.status(400).json({ error: 'No platforms specified' });
      }
      const results = await creator.publish(req.params.id, platforms);
      res.json({ data: results });
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes('not found')
      ) {
        return res.status(404).json({ error: err.message });
      }
      next(err);
    }
  });

  return router;
}
