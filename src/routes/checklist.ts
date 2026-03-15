import { Router } from 'express';
import type { Database } from '../data/database.js';

interface ChecklistRow {
  id: number;
  event_id: string;
  label: string;
  completed: number;
  sort_order: number;
  created_at: string;
  completed_at: string | null;
}

function rowToDto(row: ChecklistRow) {
  return {
    id: row.id,
    eventId: row.event_id,
    label: row.label,
    completed: row.completed === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function createChecklistRouter(db: Database): Router {
  const router = Router();

  /**
   * GET /api/events/:id/checklist
   * List all checklist items for an event, ordered by sort_order.
   */
  router.get('/:id/checklist', (req, res, next) => {
    try {
      const rows = db.prepare<[string], ChecklistRow>(
        'SELECT * FROM event_checklist WHERE event_id = ? ORDER BY sort_order ASC, id ASC'
      ).all(req.params.id);

      const items = rows.map(rowToDto);
      const total = items.length;
      const done = items.filter(i => i.completed).length;

      res.json({ data: items, total, done });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/events/:id/checklist
   * Add a checklist item. Body: { label: string }
   */
  router.post('/:id/checklist', (req, res, next) => {
    try {
      const { label } = req.body as { label?: string };
      if (typeof label !== 'string' || !label.trim()) {
        return res.status(400).json({ error: 'label must be a non-empty string' });
      }
      if (label.length > 200) {
        return res.status(400).json({ error: 'label must be 200 characters or less' });
      }

      // Get next sort_order
      const maxOrder = db.prepare(
        'SELECT MAX(sort_order) as max_order FROM event_checklist WHERE event_id = ?'
      ).get(req.params.id) as { max_order: number | null };
      const sortOrder = (maxOrder?.max_order ?? -1) + 1;

      const now = new Date().toISOString();
      const result = db.prepare(
        'INSERT INTO event_checklist (event_id, label, sort_order, created_at) VALUES (?, ?, ?, ?)'
      ).run(req.params.id, label.trim(), sortOrder, now);

      const row = db.prepare<[number], ChecklistRow>(
        'SELECT * FROM event_checklist WHERE id = ?'
      ).get(result.lastInsertRowid as number);

      if (!row) return res.status(500).json({ error: 'Failed to read back checklist item' });
      res.status(201).json({ data: rowToDto(row) });
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /api/events/:id/checklist/:itemId
   * Update a checklist item. Body: { label?, completed? }
   */
  router.patch('/:id/checklist/:itemId', (req, res, next) => {
    try {
      const itemId = Number(req.params.itemId);
      if (Number.isNaN(itemId)) return res.status(400).json({ error: 'Invalid item ID' });

      const existing = db.prepare<[number, string], ChecklistRow>(
        'SELECT * FROM event_checklist WHERE id = ? AND event_id = ?'
      ).get(itemId, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Checklist item not found' });

      const { label, completed } = req.body as { label?: string; completed?: boolean };

      const updates: string[] = [];
      const values: (string | number)[] = [];

      if (typeof label === 'string') {
        if (!label.trim()) return res.status(400).json({ error: 'label must be non-empty' });
        if (label.length > 200) return res.status(400).json({ error: 'label must be 200 characters or less' });
        updates.push('label = ?');
        values.push(label.trim());
      }

      if (typeof completed === 'boolean') {
        updates.push('completed = ?');
        values.push(completed ? 1 : 0);
        updates.push('completed_at = ?');
        values.push(completed ? new Date().toISOString() : '');
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      values.push(itemId);
      db.prepare(`UPDATE event_checklist SET ${updates.join(', ')} WHERE id = ?`).run(...values);

      const row = db.prepare<[number], ChecklistRow>(
        'SELECT * FROM event_checklist WHERE id = ?'
      ).get(itemId);

      res.json({ data: rowToDto(row!) });
    } catch (err) {
      next(err);
    }
  });

  /**
   * DELETE /api/events/:id/checklist/:itemId
   * Remove a checklist item.
   */
  router.delete('/:id/checklist/:itemId', (req, res, next) => {
    try {
      const itemId = Number(req.params.itemId);
      if (Number.isNaN(itemId)) return res.status(400).json({ error: 'Invalid item ID' });

      const result = db.prepare(
        'DELETE FROM event_checklist WHERE id = ? AND event_id = ?'
      ).run(itemId, req.params.id);

      if (result.changes === 0) return res.status(404).json({ error: 'Checklist item not found' });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /api/events/:id/checklist/reorder
   * Reorder checklist items. Body: { order: number[] } — array of item IDs in desired order.
   */
  router.patch('/:id/checklist/reorder', (req, res, next) => {
    try {
      const { order } = req.body as { order?: number[] };
      if (!Array.isArray(order) || order.length === 0) {
        return res.status(400).json({ error: 'order must be a non-empty array of item IDs' });
      }

      const reorder = db.transaction(() => {
        const update = db.prepare(
          'UPDATE event_checklist SET sort_order = ? WHERE id = ? AND event_id = ?'
        );
        for (let i = 0; i < order.length; i++) {
          update.run(i, order[i], req.params.id);
        }
      });
      reorder();

      // Return updated list
      const rows = db.prepare<[string], ChecklistRow>(
        'SELECT * FROM event_checklist WHERE event_id = ? ORDER BY sort_order ASC, id ASC'
      ).all(req.params.id);

      res.json({ data: rows.map(rowToDto) });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/events/:id/checklist/generate
   * Generate default checklist items based on event properties.
   * Won't add items if checklist already has items.
   */
  router.post('/:id/checklist/generate', (req, res, next) => {
    try {
      const eventId = req.params.id;

      // Check event exists
      const event = db.prepare(
        'SELECT id, title, venue, price, capacity, start_time FROM events WHERE id = ?'
      ).get(eventId) as { id: string; title: string; venue: string | null; price: number; capacity: number | null; start_time: string } | undefined;
      if (!event) return res.status(404).json({ error: 'Event not found' });

      // Check existing items
      const existing = db.prepare(
        'SELECT COUNT(*) as cnt FROM event_checklist WHERE event_id = ?'
      ).get(eventId) as { cnt: number };
      if (existing.cnt > 0) {
        return res.status(400).json({ error: 'Event already has checklist items' });
      }

      // Generate default items based on event properties
      const items: string[] = [
        'Finalize event description',
        'Add event photos',
        'Set ticket price and capacity',
      ];

      if (!event.venue || event.venue.trim() === '') {
        items.push('Confirm venue');
      } else {
        items.push('Confirm venue booking');
      }

      if (event.price > 0) {
        items.push('Set up payment collection');
      }

      if (event.capacity && event.capacity > 20) {
        items.push('Arrange staffing');
      }

      items.push('Publish to platforms');
      items.push('Send promotional posts');
      items.push('Day-of: check venue setup');
      items.push('Post-event: record attendance and feedback');

      const now = new Date().toISOString();
      const insert = db.prepare(
        'INSERT INTO event_checklist (event_id, label, sort_order, created_at) VALUES (?, ?, ?, ?)'
      );

      const addAll = db.transaction(() => {
        for (let i = 0; i < items.length; i++) {
          insert.run(eventId, items[i], i, now);
        }
      });
      addAll();

      // Return the created checklist
      const rows = db.prepare(
        'SELECT * FROM event_checklist WHERE event_id = ? ORDER BY sort_order ASC'
      ).all(eventId) as Array<{
        id: number; event_id: string; label: string; completed: number;
        sort_order: number; created_at: string; completed_at: string | null;
      }>;

      res.status(201).json({
        data: rows.map(rowToDto),
        total: rows.length,
        done: 0,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
