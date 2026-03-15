import { Router } from 'express';
import type { Database } from '../data/database.js';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';

interface ScoreRow {
  event_id: string;
  overall: number;
  breakdown_json: string;
  suggestions_json: string;
  scored_at: string;
}

export function createScoreRouter(db: Database, eventStore: SqliteEventStore): Router {
  const router = Router();

  /**
   * GET /api/events/:id/score
   * Returns cached score from event_scores table or { score: null } if none.
   */
  router.get('/:id/score', (req, res, next) => {
    try {
      const row = db.prepare<[string], ScoreRow>(
        'SELECT * FROM event_scores WHERE event_id = ?'
      ).get(req.params.id);

      if (!row) return res.json({ score: null });

      let breakdown, suggestions;
      try { breakdown = JSON.parse(row.breakdown_json); } catch { breakdown = {}; }
      try { suggestions = JSON.parse(row.suggestions_json); } catch { suggestions = []; }

      res.json({
        score: {
          overall: row.overall,
          breakdown,
          suggestions,
          scoredAt: row.scored_at,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/events/:id/score
   * Composes a scoring prompt and returns { prompt, eventId }.
   */
  router.post('/:id/score', async (req, res, next) => {
    try {
      const event = eventStore.getById(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      // Count photos
      const photoCount = (db.prepare<[string], { cnt: number }>(
        'SELECT COUNT(*) as cnt FROM event_photos WHERE event_id = ?'
      ).get(req.params.id)?.cnt) ?? 0;

      // Past performance averages from platform_events linked to this event
      const perfRow = db.prepare<[string], { avg_fill: number | null; event_count: number }>(
        `SELECT
           AVG(CASE WHEN capacity > 0 THEN CAST(attendance AS REAL) / capacity ELSE NULL END) as avg_fill,
           COUNT(*) as event_count
         FROM platform_events
         WHERE event_id = ?`
      ).get(req.params.id);

      const avgFill = perfRow?.avg_fill != null ? Math.round(perfRow.avg_fill * 100) : null;
      const pastEventCount = perfRow?.event_count ?? 0;

      const prompt = composeScorePrompt(event, photoCount, avgFill, pastEventCount);

      res.json({ prompt, eventId: req.params.id });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/events/:id/score/save
   * Receives { overall, breakdown, suggestions } and upserts into event_scores.
   */
  router.post('/:id/score/save', (req, res, next) => {
    try {
      const { overall, breakdown, suggestions } = req.body as {
        overall: number;
        breakdown: Record<string, number>;
        suggestions: Array<{
          field: string;
          current_issue: string;
          suggestion: string;
          impact: number;
          suggested_value?: string | null;
        }>;
      };

      const event = eventStore.getById(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      if (typeof overall !== 'number') {
        return res.status(400).json({ error: 'overall must be a number' });
      }

      if (breakdown !== undefined && (typeof breakdown !== 'object' || breakdown === null || Array.isArray(breakdown))) {
        return res.status(400).json({ error: 'breakdown must be an object' });
      }

      if (suggestions !== undefined && !Array.isArray(suggestions)) {
        return res.status(400).json({ error: 'suggestions must be an array' });
      }

      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO event_scores (event_id, overall, breakdown_json, suggestions_json, scored_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
          overall = excluded.overall,
          breakdown_json = excluded.breakdown_json,
          suggestions_json = excluded.suggestions_json,
          scored_at = excluded.scored_at
      `).run(
        req.params.id,
        overall,
        JSON.stringify(breakdown ?? {}),
        JSON.stringify(suggestions ?? []),
        now,
      );

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// ── Prompt helper ────────────────────────────────────────

type EventLike = {
  title: string;
  description?: string;
  start_time: string;
  venue?: string;
  price: number;
  capacity: number;
};

function composeScorePrompt(
  event: EventLike,
  photoCount: number,
  avgFillPct: number | null,
  pastEventCount: number,
): string {
  const today = new Date().toISOString().split('T')[0];
  const eventDate = new Date(event.start_time);
  const dayOfWeek = eventDate.toLocaleDateString('en-GB', { weekday: 'long' });
  const hour = eventDate.getHours();
  const descWords = event.description ? event.description.trim().split(/\s+/).length : 0;

  const perfLine = avgFillPct != null
    ? `Past fill rate (${pastEventCount} linked platform event${pastEventCount !== 1 ? 's' : ''}): ${avgFillPct}%`
    : 'No past performance data available';

  return `You are an event quality scorer for **Socialise**, a social events company in Bristol, UK. Score this event listing across 5 dimensions and provide actionable improvement suggestions.

## Today's Date
${today}

## Event Details
- **Title:** ${event.title || '(empty)'}
- **Description:** ${event.description ? `${descWords} words` : '(empty)'}
- **Description text:** ${event.description ? event.description.slice(0, 500) + (event.description.length > 500 ? '...' : '') : '(empty)'}
- **Date/Time:** ${event.start_time} (${dayOfWeek}, ${hour}:00)
- **Venue:** ${event.venue || '(not set)'}
- **Price:** £${event.price}
- **Capacity:** ${event.capacity}
- **Photos:** ${photoCount}
- **${perfLine}**

## Scoring Dimensions (each 0-100)
1. **seo** — Is the title discoverable? Does it include activity type, location cues, and audience hooks?
2. **timing** — Is the day/time optimal for this type of social event in Bristol?
3. **pricing** — Is the price competitive and appropriate for the event type?
4. **description** — Is it compelling, well-structured, and conversion-focused (hook + bullets + CTA)?
5. **photos** — Are there enough quality photos? (0 photos = 0, 1 = 40, 2 = 70, 3+ = 90-100)

## Overall Score
Weighted average: seo×25% + timing×15% + pricing×15% + description×30% + photos×15%

## Your Task
Return ONLY valid JSON, no markdown fences, no explanation outside the JSON:

{
  "overall": <0-100 integer>,
  "breakdown": {
    "seo": <0-100>,
    "timing": <0-100>,
    "pricing": <0-100>,
    "description": <0-100>,
    "photos": <0-100>
  },
  "suggestions": [
    {
      "field": "<seo|timing|pricing|description|photos>",
      "current_issue": "<one sentence describing the problem>",
      "suggestion": "<one sentence describing what to change>",
      "impact": <estimated point improvement 1-20>,
      "suggested_value": "<concrete replacement text or null if not applicable>"
    }
  ]
}

Include only suggestions where the score is below 80. Order by impact descending. Maximum 5 suggestions.`;
}
