import { Router } from 'express';
import type { Database } from '../data/database.js';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';
import type { PlatformEventStore } from '../data/platform-event-store.js';
import { COMPARABLE_FIELDS, valuesMatch } from './conflict-utils.js';
import { checkEventText } from './text-check.js';

export function createDashboardRouter(
  db: Database,
  eventStore: SqliteEventStore,
  platformEventStore?: PlatformEventStore,
): Router {
  const router = Router();

  /**
   * GET /api/dashboard/attention
   * Find events with problems needing attention.
   */
  router.get('/attention', (req, res, next) => {
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

      // Base events query — only future events (actionable)
      const nowIso = new Date().toISOString();
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
          AND e.start_time > ?
        GROUP BY e.id
      `).all(nowIso) as Array<{
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

      // Batch-load checklist stats to avoid N+1 queries
      const checklistStats = new Map<string, { total: number; done: number }>();
      const checklistRows = db.prepare(
        'SELECT event_id, COUNT(*) as total, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as done FROM event_checklist GROUP BY event_id',
      ).all() as Array<{ event_id: string; total: number; done: number }>;
      for (const r of checklistRows) checklistStats.set(r.event_id, { total: r.total, done: r.done });

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

        // Incomplete checklist items for upcoming events (within 14 days)
        if (isUpcoming) {
          const daysOut = (new Date(ev.start_time).getTime() - now.getTime()) / 86400000;
          if (daysOut <= 14) {
            const cs = checklistStats.get(ev.id);
            if (cs && cs.total > 0 && cs.done < cs.total) {
              const remaining = cs.total - cs.done;
              items.push({
                eventId: ev.id,
                eventTitle: ev.title,
                problem: 'incomplete_checklist',
                problemLabel: `${remaining} checklist item${remaining > 1 ? 's' : ''} incomplete`,
                urgency: daysOut <= 3 ? 'high' : 'medium',
                platforms,
                date: ev.start_time,
              });
            }
          }
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

        // Text quality issues (UK English spelling/grammar)
        const textIssue = checkEventText(ev.title, ev.description);
        if (textIssue) {
          items.push({
            eventId: ev.id,
            eventTitle: ev.title,
            problem: 'text_quality',
            problemLabel: `Text issues: ${textIssue}`,
            urgency: 'low',
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
        .slice(0, Math.min(Math.max(parseInt(String(req.query.limit)) || 10, 1), 50));

      res.json({ items: groupedItems, count: Object.keys(grouped).length });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/dashboard/upcoming
   * Next 5 upcoming events with readiness score.
   */
  router.get('/upcoming', (req, res, next) => {
    try {
      const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 5, 1), 50);
      const nowIso = new Date().toISOString();
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
        WHERE e.start_time > ?
          AND e.status != 'cancelled'
        GROUP BY e.id
        ORDER BY e.start_time ASC
        LIMIT ?
      `).all(nowIso, limit) as Array<{
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
          { label: 'Price', passed: true },
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
      const nowIso = new Date().toISOString();
      const upcomingCount = (db.prepare(`
        SELECT COUNT(*) as cnt FROM events WHERE start_time > ? AND status != 'cancelled'
      `).get(nowIso) as { cnt: number }).cnt;

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
      const nowIso = new Date().toISOString();
      const in30Days = new Date(Date.now() + 30 * 86400000).toISOString();
      const upcomingEvents = db.prepare(`
        SELECT e.title, e.start_time, e.venue, e.description, e.capacity, e.price
        FROM events e
        WHERE e.start_time > ?
          AND e.start_time < ?
          AND e.status != 'cancelled'
        ORDER BY e.start_time ASC
      `).all(nowIso, in30Days) as Array<{
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
        WHERE status != 'cancelled' AND start_time > ?
      `).get(new Date().toISOString()) as { cnt: number }).cnt;

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

      let suggestions;
      try { suggestions = JSON.parse(row.suggestions_json); }
      catch { return res.json({ suggestions: null }); }
      res.json({ suggestions, generatedAt: row.generated_at });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/dashboard/digest
   * Compose a weekly digest prompt summarising activity and action items.
   */
  router.post('/digest', (_req, res, next) => {
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

      // Events created this week
      const recentlyCreated = db.prepare(`
        SELECT title, start_time, venue, status, category
        FROM events WHERE created_at > ? ORDER BY created_at DESC
      `).all(weekAgo) as Array<{ title: string; start_time: string; venue: string | null; status: string; category: string | null }>;

      // Events happening next week
      const upcoming = db.prepare(`
        SELECT title, start_time, venue, status, category, capacity
        FROM events WHERE start_time > ? AND start_time < ? AND status != 'cancelled' AND status != 'archived'
        ORDER BY start_time ASC
      `).all(now.toISOString(), weekAhead) as Array<{
        title: string; start_time: string; venue: string | null;
        status: string; category: string | null; capacity: number | null;
      }>;

      // Events needing attention (low scores, missing info)
      const needsAttention = db.prepare(`
        SELECT e.title, e.id, es.overall as score
        FROM events e
        LEFT JOIN event_scores es ON es.event_id = e.id
        WHERE e.start_time > ? AND e.status != 'cancelled' AND e.status != 'archived'
          AND (es.overall IS NULL OR es.overall < 50
               OR e.description IS NULL OR LENGTH(e.description) < 50
               OR e.venue IS NULL OR e.venue = '')
        ORDER BY e.start_time ASC
        LIMIT 10
      `).all(now.toISOString()) as Array<{ title: string; id: string; score: number | null }>;

      // Recent notes
      const recentNotes = db.prepare(`
        SELECT en.content, en.author, en.created_at, e.title as event_title
        FROM event_notes en
        JOIN events e ON e.id = en.event_id
        WHERE en.created_at > ?
        ORDER BY en.created_at DESC
        LIMIT 10
      `).all(weekAgo) as Array<{ content: string; author: string; created_at: string; event_title: string }>;

      // Overall stats
      const totalEvents = (db.prepare('SELECT COUNT(*) as cnt FROM events WHERE status != \'archived\'').get() as { cnt: number }).cnt;
      const draftCount = (db.prepare('SELECT COUNT(*) as cnt FROM events WHERE status = \'draft\'').get() as { cnt: number }).cnt;

      const prompt = `You are the operations manager for Socialise, a Bristol-based social events company. Write a concise weekly digest.

## This Week's Activity

### Events Created (${recentlyCreated.length})
${recentlyCreated.length === 0 ? 'No new events created this week.' : recentlyCreated.map(e =>
  `- "${e.title}" | ${e.start_time.slice(0, 10)} | ${e.venue || 'no venue'} | ${e.status} | ${e.category || 'uncategorized'}`
).join('\n')}

### Upcoming Next 7 Days (${upcoming.length})
${upcoming.length === 0 ? 'No events in the next 7 days.' : upcoming.map(e =>
  `- "${e.title}" | ${e.start_time.slice(0, 10)} | ${e.venue || 'no venue'} | cap ${e.capacity ?? '?'} | ${e.status}`
).join('\n')}

### Needs Attention (${needsAttention.length})
${needsAttention.length === 0 ? 'All events look good!' : needsAttention.map(e =>
  `- "${e.title}" | score: ${e.score ?? 'unscored'}`
).join('\n')}

### Recent Notes (${recentNotes.length})
${recentNotes.length === 0 ? 'No notes this week.' : recentNotes.map(n =>
  `- [${n.author}] on "${n.event_title}": ${n.content.slice(0, 100)}${n.content.length > 100 ? '...' : ''}`
).join('\n')}

### Portfolio
- Total active events: ${totalEvents}
- Drafts pending: ${draftCount}

## Your Task
Write a brief weekly digest (3-5 paragraphs) covering:
1. **Highlights** — What went well this week
2. **Upcoming** — What's coming up and readiness status
3. **Action Items** — Top 3-5 things to focus on
4. **Risks** — Any events at risk of underperforming

Keep it actionable and concise. No JSON, just plain text.`;

      res.json({ prompt });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/dashboard/action-plan
   * Compose an AI prompt analysing the full event portfolio with
   * health scores, conflicts, gaps, and venue diversity to produce
   * a prioritised action plan.
   */
  router.post('/action-plan', (_req, res, next) => {
    try {
      const events = eventStore.getAll().filter(e => e.status !== 'archived');
      const now = new Date();

      // Categorise events
      const drafts = events.filter(e => e.status === 'draft');
      const published = events.filter(e => e.status === 'published');
      const upcoming = events.filter(e => new Date(e.start_time) > now);
      const thisMonth = events.filter(e => {
        const d = new Date(e.start_time);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });

      // Health data
      const healthData = events.map(e => {
        let score = 0;
        if (e.title && e.title.length >= 5) score += 10;
        if (e.description && e.description.length >= 100) score += 15;
        if (e.venue && e.venue.length > 0) score += 10;
        if (e.price !== undefined) score += 5;
        if (e.capacity && e.capacity > 0) score += 5;
        if (e.category) score += 5;
        if (new Date(e.start_time) > now) score += 10;
        score += Math.min(e.platforms.length * 10, 30);
        return { title: e.title, health: Math.min(score, 100), status: e.status };
      });
      const lowHealth = healthData.filter(h => h.health < 50);

      // Venue diversity
      const venues = new Set(events.map(e => e.venue).filter(Boolean));
      const categories = new Set(events.map(e => e.category).filter(Boolean));

      const prompt = `You are a strategic advisor for Socialise, a Bristol-based events company for young professionals.

## Current Portfolio Snapshot (${now.toISOString().slice(0, 10)})
- Total active events: ${events.length} (${drafts.length} drafts, ${published.length} published)
- Upcoming events: ${upcoming.length}
- Events this month: ${thisMonth.length}
- Unique venues: ${venues.size}
- Categories in use: ${[...categories].join(', ') || 'none set'}

## Events Needing Attention
${lowHealth.length > 0
  ? lowHealth.map(h => `- "${h.title}" — health ${h.health}/100 [${h.status}]`).join('\n')
  : '- All events are in good health'}

## Draft Events (need publishing)
${drafts.length > 0
  ? drafts.slice(0, 10).map(e => `- "${e.title}" (${e.start_time.slice(0, 10)}) at ${e.venue || 'no venue'}`).join('\n')
  : '- No drafts pending'}

## Upcoming Events
${upcoming.slice(0, 10).map(e => {
  const days = Math.ceil((new Date(e.start_time).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return `- "${e.title}" in ${days} days (${e.start_time.slice(0, 10)}) — ${e.platforms.length} platform(s)`;
}).join('\n') || '- No upcoming events'}

## What I Need
Produce a prioritised action plan with 5-7 items. For each item:
1. **Priority** (P1/P2/P3)
2. **Action** — What specifically to do
3. **Why** — Business impact
4. **Timeline** — When to do it

Focus on revenue impact, audience growth, and operational efficiency.
Be direct. No preamble.`;

      res.json({ prompt });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/dashboard/portfolio
   * Category-level breakdown of events for portfolio management.
   */
  router.get('/portfolio', (_req, res, next) => {
    try {
      const events = eventStore.getAll().filter(e => e.status !== 'archived');
      const now = new Date();

      // Group by category
      const byCategory: Record<string, {
        count: number; upcoming: number; draft: number;
        published: number; avgPrice: number; totalCapacity: number;
        venues: Set<string>;
      }> = {};

      for (const e of events) {
        const cat = e.category || 'uncategorized';
        if (!byCategory[cat]) {
          byCategory[cat] = { count: 0, upcoming: 0, draft: 0, published: 0, avgPrice: 0, totalCapacity: 0, venues: new Set() };
        }
        const g = byCategory[cat];
        g.count++;
        if (new Date(e.start_time) > now) g.upcoming++;
        if (e.status === 'draft') g.draft++;
        if (e.status === 'published') g.published++;
        g.avgPrice += e.price;
        g.totalCapacity += e.capacity;
        if (e.venue) g.venues.add(e.venue);
      }

      const categories = Object.entries(byCategory).map(([category, g]) => ({
        category,
        count: g.count,
        upcoming: g.upcoming,
        draft: g.draft,
        published: g.published,
        avgPrice: g.count > 0 ? Math.round((g.avgPrice / g.count) * 100) / 100 : 0,
        totalCapacity: g.totalCapacity,
        venueCount: g.venues.size,
      })).sort((a, b) => b.count - a.count);

      // Calendar gaps: find weeks in the next 8 weeks with no events
      const gaps: string[] = [];
      for (let w = 0; w < 8; w++) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() + (w * 7) - weekStart.getDay() + 1); // Monday
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const hasEvent = events.some(e => {
          const d = new Date(e.start_time);
          return d >= weekStart && d <= weekEnd;
        });
        if (!hasEvent) {
          gaps.push(weekStart.toISOString().slice(0, 10));
        }
      }

      res.json({
        data: {
          categories,
          summary: {
            totalEvents: events.length,
            totalCategories: categories.length,
            upcomingEvents: events.filter(e => new Date(e.start_time) > now).length,
            calendarGaps: gaps,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/dashboard/conflicts
   * Detects events where hub field values differ from linked platform events.
   */
  router.get('/conflicts', (_req, res, next) => {
    try {
      if (!platformEventStore) {
        res.json({ data: [], total: 0 });
        return;
      }

      const events = eventStore.getAll().filter(e => e.status !== 'archived');

      const result: Array<{
        eventId: string;
        eventTitle: string;
        conflictCount: number;
        platforms: string[];
        fields: string[];
      }> = [];

      for (const event of events) {
        const platformEvents = platformEventStore.getByEventId(event.id);
        if (platformEvents.length === 0) continue;

        const conflictFields = new Set<string>();
        const conflictPlatforms = new Set<string>();

        for (const fieldDef of COMPARABLE_FIELDS) {
          const hubRaw = (event as unknown as Record<string, unknown>)[fieldDef.hubKey];
          const hubValue = hubRaw == null ? null : (hubRaw as string | number);

          for (const pe of platformEvents) {
            const platRaw = (pe as unknown as Record<string, unknown>)[fieldDef.platformKey];
            const platValue = platRaw == null ? null : (platRaw as string | number);

            if (!valuesMatch(hubValue, platValue, fieldDef.type)) {
              conflictFields.add(fieldDef.field);
              conflictPlatforms.add(pe.platform);
            }
          }
        }

        if (conflictFields.size > 0) {
          result.push({
            eventId: event.id,
            eventTitle: event.title,
            conflictCount: conflictFields.size,
            platforms: Array.from(conflictPlatforms),
            fields: Array.from(conflictFields),
          });
        }
      }

      res.json({ data: result, total: result.length });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/dashboard/health
   * Computes a health score (0-100) for each non-archived event.
   * Aggregates readiness checks, photo count, score, notes, and platform coverage.
   */
  router.get('/health', (_req, res, next) => {
    try {
      const events = eventStore.getAll().filter(e => e.status !== 'archived');
      const now = new Date();

      // Batch-load counts to avoid N+1 queries
      const photoCounts = new Map<string, number>();
      const photoRows = db.prepare(
        'SELECT event_id, COUNT(*) as cnt FROM event_photos GROUP BY event_id',
      ).all() as Array<{ event_id: string; cnt: number }>;
      for (const r of photoRows) photoCounts.set(r.event_id, r.cnt);

      const noteCounts = new Map<string, number>();
      const noteRows = db.prepare(
        'SELECT event_id, COUNT(*) as cnt FROM event_notes GROUP BY event_id',
      ).all() as Array<{ event_id: string; cnt: number }>;
      for (const r of noteRows) noteCounts.set(r.event_id, r.cnt);

      const scoredEvents = new Set<string>();
      const scoreRows = db.prepare(
        'SELECT event_id FROM event_scores',
      ).all() as Array<{ event_id: string }>;
      for (const r of scoreRows) scoredEvents.add(r.event_id);

      const healthData = events.map(e => {
        let score = 0;
        const factors: string[] = [];

        // Title quality (0-10)
        if (e.title && e.title.length >= 5) { score += 5; }
        if (e.title && e.title.length >= 15) { score += 5; factors.push('good_title'); }

        // Description quality (0-15)
        if (e.description && e.description.length >= 20) { score += 5; }
        if (e.description && e.description.length >= 100) { score += 5; }
        if (e.description && e.description.length >= 250) { score += 5; factors.push('rich_description'); }

        // Date set and in future (0-10)
        if (e.start_time) { score += 5; }
        if (e.start_time && new Date(e.start_time) > now) { score += 5; factors.push('future_date'); }

        // Venue (0-10)
        if (e.venue && e.venue.length > 0) { score += 10; factors.push('has_venue'); }

        // Price & capacity (0-10)
        if (e.price !== undefined && e.price !== null) score += 5;
        if (e.capacity && e.capacity > 0) { score += 5; factors.push('has_capacity'); }

        // Category set (0-5)
        if (e.category) { score += 5; factors.push('has_category'); }

        // Photo count (0-15)
        const photoCount = photoCounts.get(e.id) ?? 0;
        if (photoCount >= 1) score += 5;
        if (photoCount >= 3) score += 5;
        if (photoCount >= 5) { score += 5; factors.push('rich_photos'); }

        // Platform coverage (0-15)
        const platformCount = e.platforms.length;
        if (platformCount >= 1) score += 5;
        if (platformCount >= 2) score += 5;
        if (platformCount >= 3) { score += 5; factors.push('full_coverage'); }

        // Notes present (0-5)
        const noteCount = noteCounts.get(e.id) ?? 0;
        if (noteCount >= 1) { score += 5; factors.push('has_notes'); }

        // Event score exists (0-5)
        const hasScore = scoredEvents.has(e.id);
        if (hasScore) { score += 5; factors.push('scored'); }

        return {
          id: e.id,
          title: e.title,
          status: e.status,
          date: e.start_time?.slice(0, 10) ?? null,
          health: Math.min(score, 100),
          factors,
          photoCount,
          platformCount,
          noteCount,
          hasScore,
        };
      });

      // Sort by health ascending (worst first)
      healthData.sort((a, b) => a.health - b.health);

      const avg = healthData.length > 0
        ? Math.round(healthData.reduce((s, e) => s + e.health, 0) / healthData.length)
        : 0;

      res.json({
        data: healthData,
        summary: {
          total: healthData.length,
          averageHealth: avg,
          healthy: healthData.filter(e => e.health >= 70).length,
          needsWork: healthData.filter(e => e.health < 50).length,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/dashboard/week
   * Events for the next 7 days grouped by day, with checklist progress.
   */
  router.get('/week', (_req, res, next) => {
    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfWeek = new Date(startOfToday.getTime() + 7 * 86400000);

      const events = db.prepare(`
        SELECT e.id, e.title, e.start_time, e.venue, e.status, e.capacity, e.price
        FROM events e
        WHERE e.start_time >= ? AND e.start_time < ?
          AND e.status != 'cancelled' AND e.status != 'archived'
        ORDER BY e.start_time ASC
      `).all(startOfToday.toISOString(), endOfWeek.toISOString()) as Array<{
        id: string; title: string; start_time: string; venue: string | null;
        status: string; capacity: number | null; price: number;
      }>;

      // Batch-load checklist stats to avoid N+1 queries
      const weekChecklistStats = new Map<string, { total: number; done: number }>();
      const weekChecklistRows = db.prepare(
        'SELECT event_id, COUNT(*) as total, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as done FROM event_checklist GROUP BY event_id',
      ).all() as Array<{ event_id: string; total: number; done: number }>;
      for (const r of weekChecklistRows) weekChecklistStats.set(r.event_id, { total: r.total, done: r.done });

      const days: Record<string, Array<{
        id: string; title: string; startTime: string; venue: string | null;
        status: string; capacity: number | null; price: number;
        checklist: { total: number; done: number } | null;
      }>> = {};

      for (const e of events) {
        const dayKey = e.start_time.split('T')[0];
        if (!days[dayKey]) days[dayKey] = [];

        const cs = weekChecklistStats.get(e.id);
        days[dayKey].push({
          id: e.id,
          title: e.title,
          startTime: e.start_time,
          venue: e.venue,
          status: e.status,
          capacity: e.capacity,
          price: e.price,
          checklist: cs && cs.total > 0 ? { total: cs.total, done: cs.done } : null,
        });
      }

      res.json({
        data: days,
        totalEvents: events.length,
        startDate: startOfToday.toISOString().split('T')[0],
        endDate: endOfWeek.toISOString().split('T')[0],
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
