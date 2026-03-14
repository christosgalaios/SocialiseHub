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
      const totalEvents = (db.prepare('SELECT COUNT(*) as cnt FROM platform_events').get() as { cnt: number }).cnt;
      const totalAttendeesRow = db
        .prepare('SELECT SUM(attendance) as total FROM platform_events WHERE attendance IS NOT NULL')
        .get() as { total: number | null };
      const totalRevenueRow = db
        .prepare('SELECT SUM(revenue) as total FROM platform_events WHERE revenue IS NOT NULL')
        .get() as { total: number | null };
      const fillRateRow = db
        .prepare(
          `SELECT AVG(CAST(attendance AS REAL) / CAST(capacity AS REAL)) as avg_fill
           FROM platform_events
           WHERE attendance IS NOT NULL AND capacity IS NOT NULL AND capacity > 0`,
        )
        .get() as { avg_fill: number | null };

      res.json({
        data: {
          total_events: totalEvents,
          total_attendees: totalAttendeesRow.total ?? 0,
          total_revenue: totalRevenueRow.total ?? 0,
          avg_fill_rate: fillRateRow.avg_fill != null ? Math.round(fillRateRow.avg_fill * 100) : 0,
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

      const dateFilter = startDate || endDate
        ? `WHERE date IS NOT NULL${startDate ? ` AND date >= '${startDate}'` : ''}${endDate ? ` AND date <= '${endDate}'` : ''}`
        : 'WHERE date IS NOT NULL';

      // Attendance by month (line chart)
      const attendanceByMonthRows = db
        .prepare(
          `SELECT strftime('%Y-%m', date) as month,
                  SUM(COALESCE(attendance, 0)) as attendees,
                  SUM(CASE WHEN attendance IS NOT NULL THEN 1 ELSE 0 END) as events_with_data
           FROM platform_events
           ${dateFilter}
           GROUP BY month
           ORDER BY month ASC
           LIMIT 24`,
        )
        .all() as { month: string; attendees: number; events_with_data: number }[];

      // Revenue by month (bar chart)
      const revenueByMonthRows = db
        .prepare(
          `SELECT strftime('%Y-%m', date) as month,
                  SUM(COALESCE(revenue, 0)) as revenue
           FROM platform_events
           ${dateFilter}
           GROUP BY month
           ORDER BY month ASC
           LIMIT 24`,
        )
        .all() as { month: string; revenue: number }[];

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
             AVG(COALESCE(attendance, 0)) as avg_attendance
           FROM platform_events
           ${dateFilter}
           GROUP BY day_of_week, hour
           ORDER BY day_of_week, hour`,
        )
        .all() as { day_of_week: number; hour: number; event_count: number; avg_attendance: number }[];

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
           FROM platform_events
           WHERE attendance IS NOT NULL`,
        )
        .get() as {
          total_events: number;
          total_attendees: number | null;
          total_revenue: number | null;
          avg_fill: number | null;
        };

      const prompt = `You are an analytics assistant for Socialise, a Bristol-based events company. Analyse the following event performance data and provide 3-5 actionable insights to improve attendance, revenue, and event success.

## Overall Summary
- Total events tracked: ${summaryRow.total_events}
- Total attendees: ${summaryRow.total_attendees ?? 'N/A'}
- Total revenue: £${summaryRow.total_revenue?.toFixed(2) ?? '0'}
- Average fill rate: ${summaryRow.avg_fill != null ? Math.round(summaryRow.avg_fill * 100) + '%' : 'N/A'}

## Recent Events (last 20)
${recentEvents
  .map(
    (e) =>
      `- "${e.title}" (${e.platform}, ${e.date?.slice(0, 10) ?? 'unknown date'}): ` +
      `${e.attendance ?? '?'} attendees / ${e.capacity ?? '?'} capacity` +
      (e.revenue ? `, £${e.revenue.toFixed(2)} revenue` : '') +
      (e.ticket_price ? `, £${e.ticket_price} ticket` : '') +
      ` [${e.status}]`,
  )
  .join('\n')}

Provide specific, data-driven recommendations covering: optimal event timing, pricing strategy, capacity planning, and platform performance. Be concise and actionable.`;

      res.json({ data: { prompt } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
