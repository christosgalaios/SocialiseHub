import { Router } from 'express';
import type { Database } from '../data/database.js';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';

export function createDashboardRouter(db: Database, eventStore: SqliteEventStore): Router {
  const router = Router();

  /**
   * GET /api/dashboard/attention
   * Find events with problems needing attention.
   */
  router.get('/attention', (_req, res, next) => {
    try {
      const items: Array<{
        eventId: string;
        eventTitle: string;
        problem: string;
        problemLabel: string;
        urgency: 'high' | 'medium' | 'low';
        platforms: string[];
        date: string | null;
      }> = [];

      // Base events query with LEFT JOINs for counts
      const events = db.prepare(`
        SELECT
          e.id,
          e.title,
          e.description,
          e.start_time,
          e.venue,
          e.capacity,
          e.sync_status,
          COUNT(DISTINCT ep.id) as photo_count,
          es.overall as score
        FROM events e
        LEFT JOIN event_photos ep ON ep.event_id = e.id
        LEFT JOIN event_scores es ON es.event_id = e.id
        WHERE e.status != 'cancelled'
          AND e.start_time > datetime('now', '-7 days')
        GROUP BY e.id
      `).all() as Array<{
        id: string;
        title: string;
        description: string | null;
        start_time: string;
        venue: string | null;
        capacity: number | null;
        sync_status: string | null;
        photo_count: number;
        score: number | null;
      }>;

      // Get platform events grouped by event_id for platform info and mismatch checks
      const platformEventsRows = db.prepare(`
        SELECT event_id, platform, LOWER(TRIM(title)) as norm_title
        FROM platform_events
        WHERE event_id IS NOT NULL
      `).all() as Array<{ event_id: string; platform: string; norm_title: string }>;

      const platformsByEvent: Record<string, { platforms: string[]; titles: Set<string> }> = {};
      for (const pe of platformEventsRows) {
        if (!platformsByEvent[pe.event_id]) {
          platformsByEvent[pe.event_id] = { platforms: [], titles: new Set() };
        }
        platformsByEvent[pe.event_id].platforms.push(pe.platform);
        if (pe.norm_title) platformsByEvent[pe.event_id].titles.add(pe.norm_title);
      }

      const now = new Date();

      for (const ev of events) {
        const platformInfo = platformsByEvent[ev.id] ?? { platforms: [], titles: new Set() };
        const platforms = [...new Set(platformInfo.platforms)];
        const isUpcoming = new Date(ev.start_time) > now;

        // Missing description
        if (!ev.description || ev.description.trim().length < 20) {
          items.push({
            eventId: ev.id,
            eventTitle: ev.title,
            problem: 'missing_description',
            problemLabel: 'Missing description',
            urgency: 'high',
            platforms,
            date: ev.start_time,
          });
        }

        // No photos
        if (ev.photo_count === 0) {
          items.push({
            eventId: ev.id,
            eventTitle: ev.title,
            problem: 'no_photos',
            problemLabel: 'No photos',
            urgency: 'medium',
            platforms,
            date: ev.start_time,
          });
        }

        // Low score
        if (ev.score !== null && ev.score < 40) {
          items.push({
            eventId: ev.id,
            eventTitle: ev.title,
            problem: 'low_score',
            problemLabel: `Low quality score (${ev.score})`,
            urgency: 'high',
            platforms,
            date: ev.start_time,
          });
        }

        // Cross-platform title mismatch (same event on 2+ platforms with different titles)
        if (platformInfo.platforms.length >= 2 && platformInfo.titles.size > 1) {
          items.push({
            eventId: ev.id,
            eventTitle: ev.title,
            problem: 'title_mismatch',
            problemLabel: 'Title mismatch across platforms',
            urgency: 'medium',
            platforms,
            date: ev.start_time,
          });
        }

        // Upcoming with no venue
        if (isUpcoming && (!ev.venue || ev.venue.trim() === '')) {
          items.push({
            eventId: ev.id,
            eventTitle: ev.title,
            problem: 'no_venue',
            problemLabel: 'No venue set',
            urgency: 'high',
            platforms,
            date: ev.start_time,
          });
        }

        // Upcoming with no capacity
        if (isUpcoming && (!ev.capacity || ev.capacity === 0)) {
          items.push({
            eventId: ev.id,
            eventTitle: ev.title,
            problem: 'no_capacity',
            problemLabel: 'No capacity set',
            urgency: 'low',
            platforms,
            date: ev.start_time,
          });
        }

        // Unsaved changes (modified but not pushed)
        if (ev.sync_status === 'modified') {
          items.push({
            eventId: ev.id,
            eventTitle: ev.title,
            problem: 'unsaved_changes',
            problemLabel: 'Has unsaved changes',
            urgency: 'medium',
            platforms,
            date: ev.start_time,
          });
        }
      }

      // Group problems per event — show one card per event with all its problems
      const grouped: Record<string, typeof items[0] & { problems: Array<{ problem: string; label: string; urgency: string }> }> = {};
      for (const item of items) {
        if (!grouped[item.eventId]) {
          grouped[item.eventId] = {
            ...item,
            problems: [],
          };
        }
        grouped[item.eventId].problems.push({
          problem: item.problem,
          label: item.problemLabel,
          urgency: item.urgency,
        });
        // Upgrade urgency to highest
        if (item.urgency === 'high') grouped[item.eventId].urgency = 'high';
        else if (item.urgency === 'medium' && grouped[item.eventId].urgency !== 'high') {
          grouped[item.eventId].urgency = 'medium';
        }
      }

      const groupedItems = Object.values(grouped)
        .sort((a, b) => {
          const urgencyOrder = { high: 0, medium: 1, low: 2 };
          return (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2);
        })
        .slice(0, 10); // Max 10 events on dashboard

      res.json({ items: groupedItems, count: Object.keys(grouped).length });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/dashboard/upcoming
   * Next 5 upcoming events with readiness score.
   */
  router.get('/upcoming', (_req, res, next) => {
    try {
      const events = db.prepare(`
        SELECT
          e.id,
          e.title,
          e.description,
          e.start_time,
          e.venue,
          e.price,
          e.capacity,
          COUNT(DISTINCT ep.id) as photo_count
        FROM events e
        LEFT JOIN event_photos ep ON ep.event_id = e.id
        WHERE e.start_time > datetime('now')
          AND e.status != 'cancelled'
        GROUP BY e.id
        ORDER BY e.start_time ASC
        LIMIT 5
      `).all() as Array<{
        id: string;
        title: string;
        description: string | null;
        start_time: string;
        venue: string | null;
        price: number | null;
        capacity: number | null;
        photo_count: number;
      }>;

      // Get platforms for each event
      const platformRows = db.prepare(`
        SELECT DISTINCT event_id, platform
        FROM platform_events
        WHERE event_id IS NOT NULL
      `).all() as Array<{ event_id: string; platform: string }>;

      const platformsByEvent: Record<string, string[]> = {};
      for (const pe of platformRows) {
        if (!platformsByEvent[pe.event_id]) platformsByEvent[pe.event_id] = [];
        platformsByEvent[pe.event_id].push(pe.platform);
      }

      const now = new Date();

      const result = events.map((ev) => {
        // 7 readiness checks with human-readable labels
        const checks: Array<{ label: string; passed: boolean }> = [
          { label: 'Title', passed: Boolean(ev.title && ev.title.trim().length > 0) },
          { label: 'Description', passed: Boolean(ev.description && ev.description.trim().length >= 100) },
          { label: 'Date', passed: Boolean(ev.start_time) },
          { label: 'Venue', passed: Boolean(ev.venue && ev.venue.trim().length > 0) },
          { label: 'Price', passed: (ev.price ?? 0) > 0 },
          { label: 'Photos', passed: ev.photo_count > 0 },
          { label: 'Capacity', passed: (ev.capacity ?? 0) > 0 },
        ];
        const passedChecks = checks.filter(c => c.passed).length;
        const missingLabels = checks.filter(c => !c.passed).map(c => c.label);
        const readiness = Math.round((passedChecks / 7) * 100);

        // Human-readable time until
        const startDate = new Date(ev.start_time);
        const diffMs = startDate.getTime() - now.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        let timeUntil: string;
        if (diffDays > 1) timeUntil = `${diffDays} days`;
        else if (diffDays === 1) timeUntil = '1 day';
        else if (diffHours > 1) timeUntil = `${diffHours} hours`;
        else timeUntil = 'soon';

        return {
          eventId: ev.id,
          eventTitle: ev.title,
          startTime: ev.start_time,
          venue: ev.venue,
          readiness,
          passed: passedChecks,
          total: 7,
          missing: missingLabels,
          platforms: platformsByEvent[ev.id] ?? [],
          photoCount: ev.photo_count,
          timeUntil,
        };
      });

      res.json({ events: result });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/dashboard/performance
   * Headline stats with trends.
   */
  router.get('/performance', (_req, res, next) => {
    try {
      const upcomingCount = (db.prepare(`
        SELECT COUNT(*) as cnt FROM events WHERE start_time > datetime('now') AND status != 'cancelled'
      `).get() as { cnt: number }).cnt;

      const attendeesCurrent = (db.prepare(`
        SELECT COALESCE(SUM(attendance), 0) as total
        FROM platform_events
        WHERE date < datetime('now')
          AND date > datetime('now', '-30 days')
          AND attendance IS NOT NULL
      `).get() as { total: number }).total;

      const attendeesPrev = (db.prepare(`
        SELECT COALESCE(SUM(attendance), 0) as total
        FROM platform_events
        WHERE date < datetime('now', '-30 days')
          AND date > datetime('now', '-60 days')
          AND attendance IS NOT NULL
      `).get() as { total: number }).total;

      const revenueCurrent = (db.prepare(`
        SELECT COALESCE(SUM(revenue), 0) as total
        FROM platform_events
        WHERE date < datetime('now')
          AND date > datetime('now', '-30 days')
          AND revenue IS NOT NULL
      `).get() as { total: number }).total;

      const revenuePrev = (db.prepare(`
        SELECT COALESCE(SUM(revenue), 0) as total
        FROM platform_events
        WHERE date < datetime('now', '-30 days')
          AND date > datetime('now', '-60 days')
          AND revenue IS NOT NULL
      `).get() as { total: number }).total;

      const avgFillRow = db.prepare(`
        SELECT AVG(CAST(attendance AS REAL) / capacity) as avg_fill
        FROM platform_events
        WHERE attendance IS NOT NULL AND capacity IS NOT NULL AND capacity > 0
      `).get() as { avg_fill: number | null };

      function trend(current: number, prev: number): 'up' | 'down' | 'flat' {
        if (current > prev * 1.1) return 'up';
        if (current < prev * 0.9) return 'down';
        return 'flat';
      }

      res.json({
        data: {
          upcomingCount,
          attendeesLast30: attendeesCurrent,
          attendeesTrend: trend(attendeesCurrent, attendeesPrev),
          revenueLast30: revenueCurrent,
          revenueTrend: trend(revenueCurrent, revenuePrev),
          avgFillRate: avgFillRow.avg_fill != null ? Math.round(avgFillRow.avg_fill * 100) : null,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/dashboard/suggestions
   * Compose AI prompt for dashboard suggestions.
   */
  router.post('/suggestions', (_req, res, next) => {
    try {
      const upcomingEvents = db.prepare(`
        SELECT e.title, e.start_time, e.venue, e.description, e.capacity, e.price
        FROM events e
        WHERE e.start_time > datetime('now')
          AND e.start_time < datetime('now', '+30 days')
          AND e.status != 'cancelled'
        ORDER BY e.start_time ASC
      `).all() as Array<{
        title: string;
        start_time: string;
        venue: string | null;
        description: string | null;
        capacity: number | null;
        price: number | null;
      }>;

      const pastSummary = db.prepare(`
        SELECT
          COUNT(*) as total_events,
          COALESCE(SUM(attendance), 0) as total_attendees,
          COALESCE(SUM(revenue), 0) as total_revenue,
          AVG(CASE WHEN capacity > 0 THEN CAST(attendance AS REAL) / CAST(capacity AS REAL) ELSE NULL END) as avg_fill
        FROM platform_events
        WHERE date < datetime('now')
          AND date > datetime('now', '-90 days')
      `).get() as {
        total_events: number;
        total_attendees: number;
        total_revenue: number;
        avg_fill: number | null;
      };

      const attentionCount = (db.prepare(`
        SELECT COUNT(*) as cnt FROM events
        WHERE status != 'cancelled' AND start_time > datetime('now', '-7 days')
      `).get() as { cnt: number }).cnt;

      const prompt = `You are an operations assistant for Socialise, a Bristol-based events company that organises social activities for young professionals.

Analyse the following data and return 3-5 actionable dashboard suggestions as a JSON array.

## Upcoming Events (next 30 days)
${upcomingEvents.length === 0 ? 'No events scheduled.' : upcomingEvents.map(e => {
  const parts = [`"${e.title}" on ${e.start_time?.slice(0, 10) ?? 'TBD'}`];
  if (e.venue) parts.push(`at ${e.venue}`);
  if (e.capacity) parts.push(`capacity ${e.capacity}`);
  if (e.price) parts.push(`£${e.price}`);
  if (!e.description || e.description.trim().length < 50) parts.push('[needs description]');
  return `- ${parts.join(' | ')}`;
}).join('\n')}

## Past 90 Days Performance
- Events: ${pastSummary.total_events}
- Attendees: ${pastSummary.total_attendees}
- Revenue: £${pastSummary.total_revenue.toFixed(2)}
- Avg fill rate: ${pastSummary.avg_fill != null ? Math.round(pastSummary.avg_fill * 100) + '%' : 'N/A'}

## Events needing attention: ${attentionCount}

Return a JSON array of suggestions, each with fields:
- "title": short action title (under 10 words)
- "body": 1-2 sentence explanation
- "priority": "high" | "medium" | "low"
- "action": optional link path within the app (e.g. "/events")

Respond ONLY with the JSON array, no markdown.`;

      res.json({ prompt });
    } catch (err) {
      next(err);
    }
  });

  /**
   * PUT /api/dashboard/suggestions
   * Store parsed suggestions from Claude.
   */
  router.put('/suggestions', (req, res, next) => {
    try {
      const { suggestions } = req.body as { suggestions: unknown[] };
      if (!Array.isArray(suggestions)) {
        return res.status(400).json({ error: 'suggestions must be an array' });
      }

      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO dashboard_suggestions (id, suggestions_json, generated_at)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET suggestions_json = excluded.suggestions_json, generated_at = excluded.generated_at
      `).run(JSON.stringify(suggestions), now);

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/dashboard/suggestions
   * Return cached suggestions.
   */
  router.get('/suggestions', (_req, res, next) => {
    try {
      const row = db.prepare('SELECT suggestions_json, generated_at FROM dashboard_suggestions WHERE id = 1').get() as {
        suggestions_json: string;
        generated_at: string;
      } | undefined;

      if (!row) {
        return res.json({ suggestions: null });
      }

      const suggestions = JSON.parse(row.suggestions_json);
      res.json({ suggestions, generatedAt: row.generated_at });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
