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
      const { name, title, price, capacity, durationMinutes } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name is required' });
      }
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'title is required' });
      }
      if (name.length > 200) return res.status(400).json({ error: 'name must be 200 characters or fewer' });
      if (title.length > 200) return res.status(400).json({ error: 'title must be 200 characters or fewer' });
      if (price !== undefined && (typeof price !== 'number' || price < 0)) {
        return res.status(400).json({ error: 'price must be 0 or greater' });
      }
      if (capacity !== undefined && (typeof capacity !== 'number' || capacity < 0 || capacity > 10000)) {
        return res.status(400).json({ error: 'capacity must be between 0 and 10000' });
      }
      if (durationMinutes !== undefined && (typeof durationMinutes !== 'number' || durationMinutes < 1 || durationMinutes > 1440)) {
        return res.status(400).json({ error: 'durationMinutes must be between 1 and 1440' });
      }
      const template = templateStore.create(req.body);
      res.status(201).json({ data: template });
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', (req, res, next) => {
    try {
      const { name, title, price, capacity, durationMinutes } = req.body;
      if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
        return res.status(400).json({ error: 'name must be a non-empty string' });
      }
      if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
        return res.status(400).json({ error: 'title must be a non-empty string' });
      }
      if (name && name.length > 200) return res.status(400).json({ error: 'name must be 200 characters or fewer' });
      if (title && title.length > 200) return res.status(400).json({ error: 'title must be 200 characters or fewer' });
      if (price !== undefined && (typeof price !== 'number' || price < 0)) {
        return res.status(400).json({ error: 'price must be 0 or greater' });
      }
      if (capacity !== undefined && (typeof capacity !== 'number' || capacity < 0 || capacity > 10000)) {
        return res.status(400).json({ error: 'capacity must be between 0 and 10000' });
      }
      if (durationMinutes !== undefined && (typeof durationMinutes !== 'number' || durationMinutes < 1 || durationMinutes > 1440)) {
        return res.status(400).json({ error: 'durationMinutes must be between 1 and 1440' });
      }
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
