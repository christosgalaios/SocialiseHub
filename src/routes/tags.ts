import { Router } from 'express';
import type { Database } from '../data/database.js';

export function createTagsRouter(db: Database): Router {
  const router = Router();

  /**
   * GET /api/events/:id/tags
   * List all tags for an event.
   */
  router.get('/:id/tags', (req, res, next) => {
    try {
      const rows = db.prepare(
        'SELECT tag FROM event_tags WHERE event_id = ? ORDER BY tag ASC'
      ).all(req.params.id) as Array<{ tag: string }>;

      res.json({ data: rows.map(r => r.tag) });
    } catch (err) {
      next(err);
    }
  });

  /**
   * PUT /api/events/:id/tags
   * Replace all tags for an event. Body: { tags: string[] }
   */
  router.put('/:id/tags', (req, res, next) => {
    try {
      const { tags } = req.body as { tags?: string[] };
      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'tags must be an array of strings' });
      }
      if (tags.length > 20) {
        return res.status(400).json({ error: 'Maximum 20 tags per event' });
      }

      // Normalize: lowercase, trim, deduplicate, filter empty
      const normalized = [...new Set(
        tags.map(t => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
          .filter(t => t.length > 0 && t.length <= 50)
      )];

      const upsert = db.transaction(() => {
        db.prepare('DELETE FROM event_tags WHERE event_id = ?').run(req.params.id);
        const insert = db.prepare('INSERT INTO event_tags (event_id, tag) VALUES (?, ?)');
        for (const tag of normalized) {
          insert.run(req.params.id, tag);
        }
      });
      upsert();

      res.json({ data: normalized.sort() });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/events/:id/tags
   * Add a single tag. Body: { tag: string }
   */
  router.post('/:id/tags', (req, res, next) => {
    try {
      const { tag } = req.body as { tag?: string };
      if (typeof tag !== 'string' || !tag.trim()) {
        return res.status(400).json({ error: 'tag must be a non-empty string' });
      }
      const normalized = tag.trim().toLowerCase();
      if (normalized.length > 50) {
        return res.status(400).json({ error: 'tag must be 50 characters or less' });
      }

      // Check existing count
      const count = db.prepare(
        'SELECT COUNT(*) as cnt FROM event_tags WHERE event_id = ?'
      ).get(req.params.id) as { cnt: number };
      if (count.cnt >= 20) {
        return res.status(400).json({ error: 'Maximum 20 tags per event' });
      }

      db.prepare(
        'INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES (?, ?)'
      ).run(req.params.id, normalized);

      const rows = db.prepare(
        'SELECT tag FROM event_tags WHERE event_id = ? ORDER BY tag ASC'
      ).all(req.params.id) as Array<{ tag: string }>;

      res.json({ data: rows.map(r => r.tag) });
    } catch (err) {
      next(err);
    }
  });

  /**
   * DELETE /api/events/:id/tags/:tag
   * Remove a specific tag.
   */
  router.delete('/:id/tags/:tag', (req, res, next) => {
    try {
      const tag = decodeURIComponent(req.params.tag).toLowerCase();
      const result = db.prepare(
        'DELETE FROM event_tags WHERE event_id = ? AND tag = ?'
      ).run(req.params.id, tag);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Tag not found' });
      }
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/tags
   * List all unique tags across all events with counts.
   */
  router.get('/', (_req, res, next) => {
    try {
      const rows = db.prepare(
        'SELECT tag, COUNT(*) as count FROM event_tags GROUP BY tag ORDER BY count DESC, tag ASC'
      ).all() as Array<{ tag: string; count: number }>;

      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
