import { Router } from 'express';
import type { TemplateStore } from '../data/template-store.js';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';

export function createTemplatesRouter(
  templateStore: TemplateStore,
  eventStore: SqliteEventStore,
): Router {
  const router = Router();

  router.get('/', (_req, res, next) => {
    try {
      const templates = templateStore.getAll();
      res.json({ data: templates, total: templates.length });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', (req, res, next) => {
    try {
      const template = templateStore.getById(req.params.id);
      if (!template) return res.status(404).json({ error: 'Template not found' });
      res.json({ data: template });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      if (!req.body.name || !req.body.title) {
        return res.status(400).json({ error: 'Name and title are required' });
      }
      const template = templateStore.create(req.body);
      res.status(201).json({ data: template });
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', (req, res, next) => {
    try {
      const template = templateStore.update(req.params.id, req.body);
      if (!template) return res.status(404).json({ error: 'Template not found' });
      res.json({ data: template });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', (req, res, next) => {
    try {
      const deleted = templateStore.delete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Template not found' });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/create-event', (req, res, next) => {
    try {
      const template = templateStore.getById(req.params.id);
      if (!template) return res.status(404).json({ error: 'Template not found' });

      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(19, 0, 0, 0);

      const event = eventStore.create({
        title: template.title,
        description: template.description,
        start_time: nextWeek.toISOString(),
        duration_minutes: template.durationMinutes,
        venue: template.venue,
        price: template.price,
        capacity: template.capacity,
      });

      res.status(201).json({ data: event });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
