import { Router } from 'express';
import type { Database } from '../data/database.js';

export function createAnalyticsRouter(db: Database): Router {
  const router = Router();

  /**
   * GET /api/analytics/summary
   * Aggregate stats joining events + platform_events.
   */
  router.get('/summary', (_req, res, next) => {
    try {
      const totalEvents = (db.prepare('SELECT COUNT(*) as cnt FROM events').get() as { cnt: number }).cnt;
      // Use MAX per event_id to avoid double-counting multi-platform events
      const totalAttendeesRow = db
        .prepare(`SELECT SUM(max_att) as total FROM (
          SELECT MAX(attendance) as max_att FROM platform_events
          WHERE attendance IS NOT NULL AND event_id IS NOT NULL
          GROUP BY event_id
        )`)
        .get() as { total: number | null };
      const totalRevenueRow = db
        .prepare(`SELECT SUM(max_rev) as total FROM (
          SELECT MAX(revenue) as max_rev FROM platform_events
          WHERE revenue IS NOT NULL AND event_id IS NOT NULL
          GROUP BY event_id
        )`)
        .get() as { total: number | null };
      const fillRateRow = db
        .prepare(
          `SELECT AVG(fill) as avg_fill FROM (
            SELECT MAX(CAST(attendance AS REAL)) / MAX(CAST(capacity AS REAL)) as fill
            FROM platform_events
            WHERE attendance IS NOT NULL AND capacity IS NOT NULL AND capacity > 0 AND event_id IS NOT NULL
            GROUP BY event_id
          )`,
        )
        .get() as { avg_fill: number | null };

      const totalAttendees = totalAttendeesRow.total ?? 0;
      const totalRevenue = totalRevenueRow.total ?? 0;
      const revenuePerAttendee = totalAttendees > 0
        ? Math.round((totalRevenue / totalAttendees) * 100) / 100
        : 0;

      const totalOrganizersRow = db
        .prepare('SELECT COUNT(DISTINCT organizer_name) as cnt FROM platform_events WHERE organizer_name IS NOT NULL AND organizer_name != \'\'')
        .get() as { cnt: number };
      const avgTicketPriceRow = db
        .prepare('SELECT AVG(ticket_price) as avg FROM platform_events WHERE ticket_price > 0')
        .get() as { avg: number | null };
      const paidEventsRow = db
        .prepare('SELECT COUNT(*) as cnt FROM platform_events WHERE ticket_price > 0')
        .get() as { cnt: number };
      const freeEventsRow = db
        .prepare('SELECT COUNT(*) as cnt FROM platform_events WHERE ticket_price IS NULL OR ticket_price = 0')
        .get() as { cnt: number };

      res.json({
        data: {
          total_events: totalEvents,
          total_attendees: totalAttendees,
          total_revenue: totalRevenue,
          avg_fill_rate: fillRateRow.avg_fill != null ? Math.round(fillRateRow.avg_fill * 100) : 0,
          revenue_per_attendee: revenuePerAttendee,
          total_organizers: totalOrganizersRow.cnt,
          avg_ticket_price: avgTicketPriceRow.avg != null ? Math.round(avgTicketPriceRow.avg * 100) / 100 : 0,
          paid_events_count: paidEventsRow.cnt,
          free_events_count: freeEventsRow.cnt,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/analytics/trends
   * Time-series data for charts. Accepts optional startDate/endDate query params.
   */
  router.get('/trends', (req, res, next) => {
    try {
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

      // Build WHERE clause with parameterized placeholders to prevent SQL injection
      const whereParts: string[] = ['date IS NOT NULL'];
      const dateParams: string[] = [];
      if (startDate) {
        whereParts.push('date >= ?');
        dateParams.push(startDate);
      }
      if (endDate) {
        whereParts.push('date <= ?');
        dateParams.push(endDate);
      }
      const dateFilter = `WHERE ${whereParts.join(' AND ')}`;

      // Attendance by month (line chart) — deduplicated per event_id, most recent 24 months
      const attendanceByMonthRows = db
        .prepare(
          `SELECT * FROM (
             SELECT month, SUM(max_att) as attendees, COUNT(*) as events_with_data FROM (
               SELECT strftime('%Y-%m', date) as month, event_id, MAX(COALESCE(attendance, 0)) as max_att
               FROM platform_events
               ${dateFilter} AND event_id IS NOT NULL AND attendance IS NOT NULL
               GROUP BY month, event_id
             ) GROUP BY month
             ORDER BY month DESC
             LIMIT 24
           ) ORDER BY month ASC`,
        )
        .all(...dateParams) as { month: string; attendees: number; events_with_data: number }[];

      // Revenue by month (bar chart) — deduplicated per event_id, most recent 24 months
      const revenueByMonthRows = db
        .prepare(
          `SELECT * FROM (
             SELECT month, SUM(max_rev) as revenue FROM (
               SELECT strftime('%Y-%m', date) as month, event_id, MAX(COALESCE(revenue, 0)) as max_rev
               FROM platform_events
               ${dateFilter} AND event_id IS NOT NULL
               GROUP BY month, event_id
             ) GROUP BY month
             ORDER BY month DESC
             LIMIT 24
           ) ORDER BY month ASC`,
        )
        .all(...dateParams) as { month: string; revenue: number }[];

      // Fill rate by event type/status (use platform as category proxy)
      const fillByTypeRows = db
        .prepare(
          `SELECT platform,
                  AVG(CASE WHEN capacity > 0 THEN CAST(attendance AS REAL) / CAST(capacity AS REAL) ELSE NULL END) as avg_fill,
                  COUNT(*) as event_count
           FROM platform_events
           WHERE attendance IS NOT NULL AND capacity IS NOT NULL AND capacity > 0
           GROUP BY platform
           ORDER BY avg_fill DESC`,
        )
        .all() as { platform: string; avg_fill: number | null; event_count: number }[];

      // Day-of-week × hour heatmap (timing data)
      const timingRows = db
        .prepare(
          `SELECT
             CAST(strftime('%w', date) AS INTEGER) as day_of_week,
             CAST(strftime('%H', date) AS INTEGER) as hour,
             COUNT(*) as event_count,
             AVG(CASE WHEN attendance IS NOT NULL AND attendance > 0 THEN attendance END) as avg_attendance
           FROM platform_events
           ${dateFilter}
           GROUP BY day_of_week, hour
           ORDER BY day_of_week, hour`,
        )
        .all(...dateParams) as { day_of_week: number; hour: number; event_count: number; avg_attendance: number }[];

      res.json({
        data: {
          attendanceByMonth: attendanceByMonthRows,
          revenueByMonth: revenueByMonthRows,
          fillByType: fillByTypeRows.map((r) => ({
            platform: r.platform,
            avg_fill: r.avg_fill != null ? Math.round(r.avg_fill * 100) : 0,
            event_count: r.event_count,
          })),
          timingData: timingRows,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/analytics/insights
   * Compose AI analysis prompt from recent performance data.
   */
  router.post('/insights', (req, res, next) => {
    try {
      // Gather recent performance data for the prompt
      const recentEvents = db
        .prepare(
          `SELECT title, date, platform, attendance, capacity, revenue, ticket_price, status
           FROM platform_events
           WHERE date IS NOT NULL
           ORDER BY date DESC
           LIMIT 20`,
        )
        .all() as {
          title: string;
          date: string;
          platform: string;
          attendance: number | null;
          capacity: number | null;
          revenue: number | null;
          ticket_price: number | null;
          status: string;
        }[];

      const summaryRow = db
        .prepare(
          `SELECT
             COUNT(*) as total_events,
             SUM(attendance) as total_attendees,
             SUM(revenue) as total_revenue,
             AVG(CASE WHEN capacity > 0 THEN CAST(attendance AS REAL) / CAST(capacity AS REAL) ELSE NULL END) as avg_fill
           FROM platform_events`,
        )
        .get() as {
          total_events: number;
          total_attendees: number | null;
          total_revenue: number | null;
          avg_fill: number | null;
        };

      const eventsWithData = recentEvents.filter(e => e.attendance != null).length;

      const prompt = `You are an analytics assistant for Socialise, a Bristol-based events company that organises social activities for young professionals in Bristol and Cardiff.

Analyse the following event data and provide 3-5 actionable insights.

## Overall Summary
- Total events: ${summaryRow.total_events}
- Events with attendance data: ${eventsWithData} of ${recentEvents.length}
${summaryRow.total_attendees ? `- Total attendees: ${summaryRow.total_attendees}` : '- Attendance data: not yet available (events are upcoming or data not synced)'}
${summaryRow.total_revenue ? `- Total revenue: £${summaryRow.total_revenue.toFixed(2)}` : '- Revenue data: not yet available'}
${summaryRow.avg_fill != null ? `- Average fill rate: ${Math.round(summaryRow.avg_fill * 100)}%` : ''}

## Event Calendar (last 20)
${recentEvents
  .map(
    (e) => {
      const parts = [`"${e.title}" (${e.platform}, ${e.date?.slice(0, 10) ?? 'unknown date'})`];
      if (e.attendance != null) parts.push(`${e.attendance} attendees`);
      if (e.capacity != null) parts.push(`capacity ${e.capacity}`);
      if (e.revenue) parts.push(`£${e.revenue.toFixed(2)} revenue`);
      if (e.ticket_price) parts.push(`£${e.ticket_price} ticket`);
      parts.push(`[${e.status}]`);
      return `- ${parts.join(' | ')}`;
    },
  )
  .join('\n')}

## What to Analyse
Even without full attendance data, analyse:
1. **Event mix & frequency** — Are certain event types overrepresented? What's the variety like?
2. **Timing patterns** — Day of week, spacing between events, seasonal alignment
3. **Geographic strategy** — Bristol vs Cardiff presence
4. **Cultural alignment** — Are events tied to holidays, festivals, or seasonal moments?
5. **Naming & branding** — Are titles SEO-friendly and compelling?

Provide 3-5 specific, actionable recommendations. Be direct and practical.

Respond with ONLY the analysis text. No preamble, no introductory text.`;

      res.json({ data: { prompt } });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/analytics/pricing
   * Pricing analysis — compares ticket prices vs fill rates and revenue.
   */
  router.get('/pricing', (_req, res, next) => {
    try {
      // Price vs fill rate correlation
      const priceRanges = db.prepare(`
        SELECT
          CASE
            WHEN ticket_price IS NULL OR ticket_price = 0 THEN 'free'
            WHEN ticket_price < 10 THEN 'under_10'
            WHEN ticket_price < 20 THEN '10_to_20'
            ELSE 'over_20'
          END as price_range,
          COUNT(*) as event_count,
          AVG(CASE WHEN capacity > 0 THEN CAST(attendance AS REAL) / capacity ELSE NULL END) as avg_fill,
          AVG(attendance) as avg_attendance,
          SUM(revenue) as total_revenue,
          AVG(ticket_price) as avg_price
        FROM platform_events
        WHERE attendance IS NOT NULL AND capacity > 0
        GROUP BY price_range
        ORDER BY avg_price ASC
      `).all() as Array<{
        price_range: string;
        event_count: number;
        avg_fill: number | null;
        avg_attendance: number | null;
        total_revenue: number | null;
        avg_price: number | null;
      }>;

      // Revenue per attendee by platform
      const revenuePerAttendee = db.prepare(`
        SELECT
          platform,
          CASE WHEN SUM(attendance) > 0
            THEN CAST(SUM(revenue) AS REAL) / SUM(attendance)
            ELSE 0
          END as revenue_per_attendee,
          COUNT(*) as event_count
        FROM platform_events
        WHERE attendance IS NOT NULL AND attendance > 0
        GROUP BY platform
      `).all() as Array<{ platform: string; revenue_per_attendee: number; event_count: number }>;

      res.json({
        data: {
          priceRanges: priceRanges.map(r => ({
            range: r.price_range,
            eventCount: r.event_count,
            avgFillRate: r.avg_fill != null ? Math.round(r.avg_fill * 100) : null,
            avgAttendance: r.avg_attendance != null ? Math.round(r.avg_attendance) : null,
            totalRevenue: r.total_revenue ?? 0,
            avgPrice: r.avg_price != null ? Math.round(r.avg_price * 100) / 100 : 0,
          })),
          revenuePerAttendee: revenuePerAttendee.map(r => ({
            platform: r.platform,
            revenuePerAttendee: Math.round(r.revenue_per_attendee * 100) / 100,
            eventCount: r.event_count,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/analytics/venues
   * Venue performance analysis — which venues drive the best results.
   */
  router.get('/venues', (_req, res, next) => {
    try {
      const venueStats = db.prepare(`
        SELECT
          e.venue,
          COUNT(*) as event_count,
          AVG(es.overall) as avg_score,
          COUNT(DISTINCT pe.platform) as platform_count
        FROM events e
        LEFT JOIN event_scores es ON es.event_id = e.id
        LEFT JOIN platform_events pe ON pe.event_id = e.id
        WHERE e.venue IS NOT NULL AND e.venue != '' AND e.status != 'archived'
        GROUP BY e.venue
        ORDER BY event_count DESC
        LIMIT 20
      `).all() as Array<{
        venue: string;
        event_count: number;
        avg_score: number | null;
        platform_count: number;
      }>;

      const platformVenueStats = db.prepare(`
        SELECT
          venue,
          platform,
          COUNT(*) as event_count,
          AVG(CASE WHEN capacity > 0 THEN CAST(attendance AS REAL) / capacity ELSE NULL END) as avg_fill,
          AVG(attendance) as avg_attendance,
          SUM(revenue) as total_revenue
        FROM platform_events
        WHERE venue IS NOT NULL AND venue != ''
          AND attendance IS NOT NULL AND capacity > 0
        GROUP BY venue, platform
        ORDER BY event_count DESC
        LIMIT 30
      `).all() as Array<{
        venue: string;
        platform: string;
        event_count: number;
        avg_fill: number | null;
        avg_attendance: number | null;
        total_revenue: number | null;
      }>;

      res.json({
        data: {
          venues: venueStats.map(v => ({
            venue: v.venue,
            eventCount: v.event_count,
            avgScore: v.avg_score != null ? Math.round(v.avg_score) : null,
            platformCount: v.platform_count,
          })),
          venuePerformance: platformVenueStats.map(v => ({
            venue: v.venue,
            platform: v.platform,
            eventCount: v.event_count,
            avgFillRate: v.avg_fill != null ? Math.round(v.avg_fill * 100) : null,
            avgAttendance: v.avg_attendance != null ? Math.round(v.avg_attendance) : null,
            totalRevenue: v.total_revenue ?? 0,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/analytics/roi
   * Revenue efficiency analysis — which events/platforms generate the best return.
   */
  router.get('/roi', (_req, res, next) => {
    try {
      // Top performing events by revenue per capacity
      const topEvents = db.prepare(`
        SELECT
          title,
          platform,
          date,
          revenue,
          attendance,
          capacity,
          ticket_price,
          CASE WHEN capacity > 0 THEN CAST(attendance AS REAL) / capacity ELSE NULL END as fill_rate,
          CASE WHEN attendance > 0 THEN CAST(revenue AS REAL) / attendance ELSE 0 END as revenue_per_head
        FROM platform_events
        WHERE revenue IS NOT NULL AND revenue > 0
          AND attendance IS NOT NULL AND attendance > 0
        ORDER BY revenue DESC
        LIMIT 10
      `).all() as Array<{
        title: string;
        platform: string;
        date: string | null;
        revenue: number;
        attendance: number;
        capacity: number | null;
        ticket_price: number | null;
        fill_rate: number | null;
        revenue_per_head: number;
      }>;

      // Monthly revenue trend with growth rates
      const monthlyRevenue = db.prepare(`
        SELECT
          strftime('%Y-%m', date) as month,
          SUM(revenue) as revenue,
          SUM(attendance) as attendees,
          COUNT(*) as event_count,
          CASE WHEN SUM(attendance) > 0
            THEN CAST(SUM(revenue) AS REAL) / SUM(attendance)
            ELSE 0
          END as revenue_per_head
        FROM platform_events
        WHERE date IS NOT NULL AND revenue IS NOT NULL
        GROUP BY month
        ORDER BY month ASC
        LIMIT 24
      `).all() as Array<{
        month: string;
        revenue: number;
        attendees: number;
        event_count: number;
        revenue_per_head: number;
      }>;

      // Platform efficiency
      const platformEfficiency = db.prepare(`
        SELECT
          platform,
          COUNT(*) as event_count,
          SUM(revenue) as total_revenue,
          SUM(attendance) as total_attendees,
          AVG(revenue) as avg_revenue,
          CASE WHEN SUM(attendance) > 0
            THEN CAST(SUM(revenue) AS REAL) / SUM(attendance)
            ELSE 0
          END as revenue_per_head
        FROM platform_events
        WHERE revenue IS NOT NULL AND attendance IS NOT NULL AND attendance > 0
        GROUP BY platform
        ORDER BY total_revenue DESC
      `).all() as Array<{
        platform: string;
        event_count: number;
        total_revenue: number;
        total_attendees: number;
        avg_revenue: number;
        revenue_per_head: number;
      }>;

      res.json({
        data: {
          topEvents: topEvents.map(e => ({
            title: e.title,
            platform: e.platform,
            date: e.date?.slice(0, 10) ?? null,
            revenue: Math.round(e.revenue * 100) / 100,
            attendance: e.attendance,
            fillRate: e.fill_rate != null ? Math.round(e.fill_rate * 100) : null,
            revenuePerHead: Math.round(e.revenue_per_head * 100) / 100,
          })),
          monthlyRevenue: monthlyRevenue.map(m => ({
            month: m.month,
            revenue: Math.round(m.revenue * 100) / 100,
            attendees: m.attendees,
            eventCount: m.event_count,
            revenuePerHead: Math.round(m.revenue_per_head * 100) / 100,
          })),
          platformEfficiency: platformEfficiency.map(p => ({
            platform: p.platform,
            eventCount: p.event_count,
            totalRevenue: Math.round(p.total_revenue * 100) / 100,
            totalAttendees: p.total_attendees,
            avgRevenue: Math.round(p.avg_revenue * 100) / 100,
            revenuePerHead: Math.round(p.revenue_per_head * 100) / 100,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/analytics/organizers
   * Organizer performance breakdown.
   */
  router.get('/organizers', (_req, res, next) => {
    try {
      const rows = db.prepare(`
        SELECT organizer_name,
          COUNT(*) as event_count,
          SUM(COALESCE(attendance, 0)) as total_attendance,
          AVG(CASE WHEN capacity > 0 THEN CAST(attendance AS REAL) / CAST(capacity AS REAL) ELSE NULL END) as avg_fill_rate,
          SUM(COALESCE(revenue, 0)) as total_revenue,
          AVG(CASE WHEN attendance IS NOT NULL AND attendance > 0 THEN attendance END) as avg_attendance
        FROM platform_events
        WHERE organizer_name IS NOT NULL AND organizer_name != ''
        GROUP BY organizer_name
        ORDER BY total_attendance DESC
      `).all() as Array<{
        organizer_name: string;
        event_count: number;
        total_attendance: number;
        avg_fill_rate: number | null;
        total_revenue: number;
        avg_attendance: number;
      }>;

      res.json({
        data: rows.map(r => ({
          organizerName: r.organizer_name,
          eventCount: r.event_count,
          totalAttendance: r.total_attendance,
          avgFillRate: r.avg_fill_rate != null ? Math.round(r.avg_fill_rate * 100) : null,
          totalRevenue: Math.round(r.total_revenue * 100) / 100,
          avgAttendance: Math.round(r.avg_attendance),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/analytics/categories
   * Category performance (JOIN events table).
   */
  router.get('/categories', (_req, res, next) => {
    try {
      const rows = db.prepare(`
        SELECT e.category,
          COUNT(DISTINCT pe.id) as event_count,
          SUM(COALESCE(pe.attendance, 0)) as total_attendance,
          AVG(CASE WHEN pe.capacity > 0 THEN CAST(pe.attendance AS REAL) / CAST(pe.capacity AS REAL) ELSE NULL END) as avg_fill_rate,
          SUM(COALESCE(pe.revenue, 0)) as total_revenue,
          AVG(COALESCE(pe.ticket_price, 0)) as avg_price
        FROM platform_events pe
        JOIN events e ON pe.event_id = e.id
        WHERE e.category IS NOT NULL AND e.category != ''
        GROUP BY e.category
        ORDER BY total_attendance DESC
      `).all() as Array<{
        category: string;
        event_count: number;
        total_attendance: number;
        avg_fill_rate: number | null;
        total_revenue: number;
        avg_price: number;
      }>;

      res.json({
        data: rows.map(r => ({
          category: r.category,
          eventCount: r.event_count,
          totalAttendance: r.total_attendance,
          avgFillRate: r.avg_fill_rate != null ? Math.round(r.avg_fill_rate * 100) : null,
          totalRevenue: Math.round(r.total_revenue * 100) / 100,
          avgPrice: Math.round(r.avg_price * 100) / 100,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/analytics/drill-down?month=YYYY-MM
   * Returns individual events for a given month, for chart click-through.
   */
  router.get('/drill-down', (req, res, next) => {
    try {
      const { month } = req.query as { month?: string };
      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        res.status(400).json({ error: 'month query param required in YYYY-MM format' });
        return;
      }

      const rows = db.prepare(`
        SELECT pe.title, pe.date, pe.attendance, pe.capacity, pe.revenue, pe.ticket_price, pe.platform, pe.organizer_name, pe.venue, pe.external_url,
          e.category
        FROM platform_events pe
        LEFT JOIN events e ON pe.event_id = e.id
        WHERE strftime('%Y-%m', pe.date) = ?
        ORDER BY pe.attendance DESC
      `).all(month) as Array<{
        title: string;
        date: string | null;
        attendance: number | null;
        capacity: number | null;
        revenue: number | null;
        ticket_price: number | null;
        platform: string;
        organizer_name: string | null;
        venue: string | null;
        external_url: string | null;
        category: string | null;
      }>;

      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/analytics/day-of-week
   * Day-of-week breakdown with Monday=0.
   */
  router.get('/day-of-week', (_req, res, next) => {
    try {
      const rows = db.prepare(`
        SELECT
          CASE CAST(strftime('%w', date) AS INTEGER)
            WHEN 0 THEN 6
            WHEN 1 THEN 0
            WHEN 2 THEN 1
            WHEN 3 THEN 2
            WHEN 4 THEN 3
            WHEN 5 THEN 4
            WHEN 6 THEN 5
          END as day_index,
          COUNT(*) as event_count,
          SUM(COALESCE(attendance, 0)) as total_attendance,
          AVG(CASE WHEN attendance IS NOT NULL AND attendance > 0 THEN attendance END) as avg_attendance,
          SUM(COALESCE(revenue, 0)) as total_revenue
        FROM platform_events
        WHERE date IS NOT NULL AND date != '' AND strftime('%w', date) IS NOT NULL
        GROUP BY 1
        ORDER BY 1
      `).all() as Array<{
        day_index: number;
        event_count: number;
        total_attendance: number;
        avg_attendance: number;
        total_revenue: number;
      }>;

      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/analytics/top-events
   * Top events by attendance.
   */
  router.get('/top-events', (_req, res, next) => {
    try {
      const rows = db.prepare(`
        SELECT pe.title, pe.date, pe.attendance, pe.capacity, pe.revenue, pe.ticket_price, pe.platform, pe.organizer_name, pe.venue, pe.external_url,
          e.category,
          CASE WHEN pe.capacity > 0 THEN CAST(pe.attendance AS REAL) / CAST(pe.capacity AS REAL) ELSE NULL END as fill_rate
        FROM platform_events pe
        LEFT JOIN events e ON pe.event_id = e.id
        WHERE pe.attendance IS NOT NULL AND pe.attendance > 0
        ORDER BY pe.attendance DESC
        LIMIT 20
      `).all() as Array<{
        title: string;
        date: string | null;
        attendance: number;
        capacity: number | null;
        revenue: number | null;
        ticket_price: number | null;
        platform: string;
        organizer_name: string | null;
        venue: string | null;
        external_url: string | null;
        category: string | null;
        fill_rate: number | null;
      }>;

      res.json({
        data: rows.map(r => ({
          ...r,
          fill_rate: r.fill_rate != null ? Math.round(r.fill_rate * 100) : null,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/analytics/pricing-effectiveness
   * How ticket price correlates with fill rate and attendance.
   */
  router.get('/pricing-effectiveness', (_req, res, next) => {
    try {
      const rows = db.prepare(`
        SELECT
          CASE
            WHEN ticket_price IS NULL OR ticket_price = 0 THEN 'Free'
            WHEN ticket_price <= 5 THEN '£1-5'
            WHEN ticket_price <= 10 THEN '£6-10'
            WHEN ticket_price <= 20 THEN '£11-20'
            ELSE '£20+'
          END as price_bucket,
          COUNT(*) as event_count,
          AVG(CASE WHEN attendance IS NOT NULL AND attendance > 0 THEN attendance END) as avg_attendance,
          AVG(CASE WHEN capacity > 0 THEN CAST(attendance AS REAL) / CAST(capacity AS REAL) ELSE NULL END) as avg_fill_rate,
          SUM(COALESCE(revenue, 0)) as total_revenue
        FROM platform_events
        WHERE date IS NOT NULL
        GROUP BY price_bucket
        ORDER BY CASE price_bucket
          WHEN 'Free' THEN 0
          WHEN '£1-5' THEN 1
          WHEN '£6-10' THEN 2
          WHEN '£11-20' THEN 3
          ELSE 4
        END
      `).all() as Array<{
        price_bucket: string;
        event_count: number;
        avg_attendance: number;
        avg_fill_rate: number | null;
        total_revenue: number;
      }>;

      res.json({
        data: rows.map(r => ({
          priceBucket: r.price_bucket,
          eventCount: r.event_count,
          avgAttendance: Math.round(r.avg_attendance),
          avgFillRate: r.avg_fill_rate != null ? Math.round(r.avg_fill_rate * 100) : null,
          totalRevenue: Math.round(r.total_revenue * 100) / 100,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
