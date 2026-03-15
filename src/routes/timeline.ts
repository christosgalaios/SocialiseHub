import { Router } from 'express';
import type { Database } from '../data/database.js';

interface TimelineEntry {
  type: 'created' | 'note' | 'sync' | 'score' | 'platform_link';
  timestamp: string;
  summary: string;
  details?: Record<string, unknown>;
}

export function createTimelineRouter(db: Database): Router {
  const router = Router();

  /**
   * GET /api/events/:id/timeline
   * Aggregated activity log for an event — notes, syncs, score changes,
   * and platform links in chronological order.
   */
  router.get('/:id/timeline', (req, res, next) => {
    try {
      const eventId = req.params.id;

      // Check event exists
      const event = db.prepare('SELECT id, created_at, title FROM events WHERE id = ?').get(eventId) as
        { id: string; created_at: string; title: string } | undefined;
      if (!event) return res.status(404).json({ error: 'Event not found' });

      const timeline: TimelineEntry[] = [];

      // Event creation
      timeline.push({
        type: 'created',
        timestamp: event.created_at,
        summary: `Event "${event.title}" created`,
      });

      // Notes
      const notes = db.prepare(
        'SELECT content, author, created_at FROM event_notes WHERE event_id = ? ORDER BY created_at ASC'
      ).all(eventId) as Array<{ content: string; author: string; created_at: string }>;
      for (const n of notes) {
        timeline.push({
          type: 'note',
          timestamp: n.created_at,
          summary: `Note by ${n.author}: ${n.content.slice(0, 100)}`,
          details: { author: n.author, contentLength: n.content.length },
        });
      }

      // Sync log entries
      const syncLogs = db.prepare(
        'SELECT platform, action, status, message, created_at FROM sync_log WHERE event_id = ? ORDER BY created_at ASC'
      ).all(eventId) as Array<{
        platform: string; action: string; status: string;
        message: string | null; created_at: string;
      }>;
      for (const s of syncLogs) {
        timeline.push({
          type: 'sync',
          timestamp: s.created_at,
          summary: `${s.action} to ${s.platform}: ${s.status}${s.message ? ` — ${s.message}` : ''}`,
          details: { platform: s.platform, action: s.action, status: s.status },
        });
      }

      // Score
      const score = db.prepare(
        'SELECT overall, scored_at FROM event_scores WHERE event_id = ?'
      ).get(eventId) as { overall: number; scored_at: string } | undefined;
      if (score) {
        timeline.push({
          type: 'score',
          timestamp: score.scored_at,
          summary: `Event scored ${score.overall}/100`,
          details: { overall: score.overall },
        });
      }

      // Platform links (published_at)
      const platformLinks = db.prepare(
        'SELECT platform, published_at, external_url FROM platform_events WHERE event_id = ? AND published_at IS NOT NULL'
      ).all(eventId) as Array<{
        platform: string; published_at: string; external_url: string | null;
      }>;
      for (const p of platformLinks) {
        timeline.push({
          type: 'platform_link',
          timestamp: p.published_at,
          summary: `Published to ${p.platform}`,
          details: { platform: p.platform, url: p.external_url },
        });
      }

      // Sort chronologically
      timeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      res.json({ data: timeline, total: timeline.length });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
