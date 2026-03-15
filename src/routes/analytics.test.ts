import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from '../data/database.js';

/**
 * Analytics route tests — test the SQL query logic directly using an in-memory DB.
 * We replicate the exact queries from analytics.ts to verify correctness.
 */

let db: Database;

beforeEach(() => {
  db = createDatabase(':memory:');
});

afterEach(() => {
  db.close();
});

// ─── helpers ────────────────────────────────────────────────────────────────

function insertEvent(id: string, title: string, startTime = '2026-04-01T19:00:00Z') {
  db.prepare(`
    INSERT INTO events (id, title, description, start_time, status, created_at, updated_at)
    VALUES (?, ?, '', ?, 'published', datetime('now'), datetime('now'))
  `).run(id, title, startTime);
}

function insertPlatformEvent(opts: {
  id: string;
  eventId?: string;
  platform?: string;
  date?: string;
  attendance?: number | null;
  capacity?: number | null;
  revenue?: number | null;
}) {
  const {
    id,
    eventId = null,
    platform = 'meetup',
    date = null,
    attendance = null,
    capacity = null,
    revenue = null,
  } = opts;
  db.prepare(`
    INSERT INTO platform_events (id, event_id, platform, external_id, title, date, status, synced_at, attendance, capacity, revenue)
    VALUES (?, ?, ?, ?, 'Test Event', ?, 'active', datetime('now'), ?, ?, ?)
  `).run(id, eventId, platform, `ext-${id}`, date, attendance, capacity, revenue);
}

// ─── summary queries ─────────────────────────────────────────────────────────

describe('analytics summary', () => {
  it('returns zero counts when tables are empty', () => {
    const totalEvents = (db.prepare('SELECT COUNT(*) as cnt FROM events').get() as { cnt: number }).cnt;
    expect(totalEvents).toBe(0);
  });

  it('counts events from the events table (not platform_events)', () => {
    insertEvent('e-1', 'Event One');
    insertEvent('e-2', 'Event Two');

    const totalEvents = (db.prepare('SELECT COUNT(*) as cnt FROM events').get() as { cnt: number }).cnt;
    expect(totalEvents).toBe(2);
  });

  it('counts events table independently of platform_events', () => {
    insertEvent('e-1', 'Event One');
    // Two platform events for a single local event
    insertPlatformEvent({ id: 'pe-1', eventId: 'e-1', platform: 'meetup', attendance: 30, capacity: 50 });
    insertPlatformEvent({ id: 'pe-2', eventId: 'e-1', platform: 'eventbrite', attendance: 20, capacity: 40 });

    const totalEvents = (db.prepare('SELECT COUNT(*) as cnt FROM events').get() as { cnt: number }).cnt;
    expect(totalEvents).toBe(1); // 1 event, not 2 platform events
  });

  it('sums attendance from platform_events', () => {
    insertPlatformEvent({ id: 'pe-1', attendance: 30 });
    insertPlatformEvent({ id: 'pe-2', attendance: 20 });
    insertPlatformEvent({ id: 'pe-3', attendance: null }); // NULL should be excluded

    const row = db
      .prepare('SELECT SUM(attendance) as total FROM platform_events WHERE attendance IS NOT NULL')
      .get() as { total: number | null };

    expect(row.total).toBe(50);
  });

  it('returns null total when no attendance data exists', () => {
    insertPlatformEvent({ id: 'pe-1', attendance: null });

    const row = db
      .prepare('SELECT SUM(attendance) as total FROM platform_events WHERE attendance IS NOT NULL')
      .get() as { total: number | null };

    expect(row.total).toBeNull();
  });

  it('calculates avg_fill_rate correctly', () => {
    // 30/50 = 0.60, 20/40 = 0.50 → avg = 0.55 → 55%
    insertPlatformEvent({ id: 'pe-1', attendance: 30, capacity: 50 });
    insertPlatformEvent({ id: 'pe-2', attendance: 20, capacity: 40 });

    const fillRateRow = db
      .prepare(
        `SELECT AVG(CAST(attendance AS REAL) / CAST(capacity AS REAL)) as avg_fill
         FROM platform_events
         WHERE attendance IS NOT NULL AND capacity IS NOT NULL AND capacity > 0`,
      )
      .get() as { avg_fill: number | null };

    expect(fillRateRow.avg_fill).not.toBeNull();
    const rounded = Math.round(fillRateRow.avg_fill! * 100);
    expect(rounded).toBe(55);
  });

  it('returns null avg_fill when no capacity data exists', () => {
    insertPlatformEvent({ id: 'pe-1', attendance: 30, capacity: null });

    const fillRateRow = db
      .prepare(
        `SELECT AVG(CAST(attendance AS REAL) / CAST(capacity AS REAL)) as avg_fill
         FROM platform_events
         WHERE attendance IS NOT NULL AND capacity IS NOT NULL AND capacity > 0`,
      )
      .get() as { avg_fill: number | null };

    expect(fillRateRow.avg_fill).toBeNull();
  });

  it('excludes zero-capacity rows from fill rate calculation', () => {
    insertPlatformEvent({ id: 'pe-1', attendance: 10, capacity: 0 }); // excluded
    insertPlatformEvent({ id: 'pe-2', attendance: 30, capacity: 50 }); // 60%

    const fillRateRow = db
      .prepare(
        `SELECT AVG(CAST(attendance AS REAL) / CAST(capacity AS REAL)) as avg_fill
         FROM platform_events
         WHERE attendance IS NOT NULL AND capacity IS NOT NULL AND capacity > 0`,
      )
      .get() as { avg_fill: number | null };

    const rounded = Math.round(fillRateRow.avg_fill! * 100);
    expect(rounded).toBe(60);
  });

  it('sums revenue from platform_events', () => {
    insertPlatformEvent({ id: 'pe-1', revenue: 100.0 });
    insertPlatformEvent({ id: 'pe-2', revenue: 200.5 });
    insertPlatformEvent({ id: 'pe-3', revenue: null });

    const row = db
      .prepare('SELECT SUM(revenue) as total FROM platform_events WHERE revenue IS NOT NULL')
      .get() as { total: number | null };

    expect(row.total).toBeCloseTo(300.5);
  });
});

// ─── trends queries ───────────────────────────────────────────────────────────

describe('analytics trends', () => {
  it('returns attendance grouped by month', () => {
    insertPlatformEvent({ id: 'pe-1', date: '2026-01-15T19:00:00Z', attendance: 30 });
    insertPlatformEvent({ id: 'pe-2', date: '2026-01-20T19:00:00Z', attendance: 20 });
    insertPlatformEvent({ id: 'pe-3', date: '2026-02-10T19:00:00Z', attendance: 10 });

    const rows = db
      .prepare(
        `SELECT strftime('%Y-%m', date) as month,
                SUM(COALESCE(attendance, 0)) as attendees,
                SUM(CASE WHEN attendance IS NOT NULL THEN 1 ELSE 0 END) as events_with_data
         FROM platform_events
         WHERE date IS NOT NULL
         GROUP BY month
         ORDER BY month ASC
         LIMIT 24`,
      )
      .all() as { month: string; attendees: number; events_with_data: number }[];

    expect(rows).toHaveLength(2);
    expect(rows[0].month).toBe('2026-01');
    expect(rows[0].attendees).toBe(50);
    expect(rows[0].events_with_data).toBe(2);
    expect(rows[1].month).toBe('2026-02');
    expect(rows[1].attendees).toBe(10);
  });

  it('excludes rows with NULL date from trends', () => {
    insertPlatformEvent({ id: 'pe-1', date: null, attendance: 100 });
    insertPlatformEvent({ id: 'pe-2', date: '2026-01-15T19:00:00Z', attendance: 30 });

    const rows = db
      .prepare(
        `SELECT strftime('%Y-%m', date) as month,
                SUM(COALESCE(attendance, 0)) as attendees
         FROM platform_events
         WHERE date IS NOT NULL
         GROUP BY month
         ORDER BY month ASC`,
      )
      .all() as { month: string; attendees: number }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].month).toBe('2026-01');
    expect(rows[0].attendees).toBe(30);
  });

  it('filters by startDate correctly using parameterized query', () => {
    insertPlatformEvent({ id: 'pe-1', date: '2026-01-15T19:00:00Z', attendance: 10 });
    insertPlatformEvent({ id: 'pe-2', date: '2026-02-15T19:00:00Z', attendance: 20 });
    insertPlatformEvent({ id: 'pe-3', date: '2026-03-15T19:00:00Z', attendance: 30 });

    const startDate = '2026-02-01';
    const rows = db
      .prepare(
        `SELECT strftime('%Y-%m', date) as month,
                SUM(COALESCE(attendance, 0)) as attendees
         FROM platform_events
         WHERE date IS NOT NULL AND date >= ?
         GROUP BY month
         ORDER BY month ASC`,
      )
      .all(startDate) as { month: string; attendees: number }[];

    expect(rows).toHaveLength(2);
    expect(rows[0].month).toBe('2026-02');
    expect(rows[1].month).toBe('2026-03');
  });

  it('filters by endDate correctly using parameterized query', () => {
    insertPlatformEvent({ id: 'pe-1', date: '2026-01-15T19:00:00Z', attendance: 10 });
    insertPlatformEvent({ id: 'pe-2', date: '2026-02-15T19:00:00Z', attendance: 20 });
    insertPlatformEvent({ id: 'pe-3', date: '2026-03-15T19:00:00Z', attendance: 30 });

    const endDate = '2026-02-28';
    const rows = db
      .prepare(
        `SELECT strftime('%Y-%m', date) as month,
                SUM(COALESCE(attendance, 0)) as attendees
         FROM platform_events
         WHERE date IS NOT NULL AND date <= ?
         GROUP BY month
         ORDER BY month ASC`,
      )
      .all(endDate) as { month: string; attendees: number }[];

    expect(rows).toHaveLength(2);
    expect(rows[0].month).toBe('2026-01');
    expect(rows[1].month).toBe('2026-02');
  });

  it('filters by both startDate and endDate using parameterized queries (no SQL injection)', () => {
    insertPlatformEvent({ id: 'pe-1', date: '2026-01-15T19:00:00Z', attendance: 10 });
    insertPlatformEvent({ id: 'pe-2', date: '2026-02-15T19:00:00Z', attendance: 20 });

    // A malicious date string — parameterized queries prevent SQL injection
    const maliciousStartDate = "2026-01-01'; DROP TABLE platform_events; --";
    expect(() => {
      db
        .prepare(
          `SELECT strftime('%Y-%m', date) as month
           FROM platform_events
           WHERE date IS NOT NULL AND date >= ?
           GROUP BY month`,
        )
        .all(maliciousStartDate);
    }).not.toThrow();

    // Table should still exist and data should be intact
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM platform_events').get() as { cnt: number }).cnt;
    expect(count).toBe(2);
  });

  it('returns revenue grouped by month', () => {
    insertPlatformEvent({ id: 'pe-1', date: '2026-01-15T19:00:00Z', revenue: 100 });
    insertPlatformEvent({ id: 'pe-2', date: '2026-01-20T19:00:00Z', revenue: 200 });
    insertPlatformEvent({ id: 'pe-3', date: '2026-02-10T19:00:00Z', revenue: 50 });

    const rows = db
      .prepare(
        `SELECT strftime('%Y-%m', date) as month,
                SUM(COALESCE(revenue, 0)) as revenue
         FROM platform_events
         WHERE date IS NOT NULL
         GROUP BY month
         ORDER BY month ASC
         LIMIT 24`,
      )
      .all() as { month: string; revenue: number }[];

    expect(rows).toHaveLength(2);
    expect(rows[0].month).toBe('2026-01');
    expect(rows[0].revenue).toBe(300);
    expect(rows[1].month).toBe('2026-02');
    expect(rows[1].revenue).toBe(50);
  });

  it('returns fill rate grouped by platform', () => {
    insertPlatformEvent({ id: 'pe-1', platform: 'meetup', attendance: 40, capacity: 50 }); // 80%
    insertPlatformEvent({ id: 'pe-2', platform: 'meetup', attendance: 30, capacity: 50 }); // 60% → avg 70%
    insertPlatformEvent({ id: 'pe-3', platform: 'eventbrite', attendance: 20, capacity: 40 }); // 50%

    const rows = db
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

    expect(rows).toHaveLength(2);
    expect(rows[0].platform).toBe('meetup');
    expect(Math.round(rows[0].avg_fill! * 100)).toBe(70);
    expect(rows[0].event_count).toBe(2);
    expect(rows[1].platform).toBe('eventbrite');
    expect(Math.round(rows[1].avg_fill! * 100)).toBe(50);
  });

  it('returns day-of-week timing data', () => {
    // Wednesday (day 3) at 19:00
    insertPlatformEvent({ id: 'pe-1', date: '2026-01-07T19:00:00Z', attendance: 30 });
    // Wednesday at 19:00 again
    insertPlatformEvent({ id: 'pe-2', date: '2026-01-14T19:00:00Z', attendance: 40 });

    const rows = db
      .prepare(
        `SELECT
           CAST(strftime('%w', date) AS INTEGER) as day_of_week,
           CAST(strftime('%H', date) AS INTEGER) as hour,
           COUNT(*) as event_count,
           AVG(COALESCE(attendance, 0)) as avg_attendance
         FROM platform_events
         WHERE date IS NOT NULL
         GROUP BY day_of_week, hour
         ORDER BY day_of_week, hour`,
      )
      .all() as { day_of_week: number; hour: number; event_count: number; avg_attendance: number }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].day_of_week).toBe(3); // Wednesday
    expect(rows[0].hour).toBe(19);
    expect(rows[0].event_count).toBe(2);
    expect(rows[0].avg_attendance).toBe(35);
  });

  it('returns empty arrays for trends when no data', () => {
    const rows = db
      .prepare(
        `SELECT strftime('%Y-%m', date) as month,
                SUM(COALESCE(attendance, 0)) as attendees
         FROM platform_events
         WHERE date IS NOT NULL
         GROUP BY month
         ORDER BY month ASC`,
      )
      .all();

    expect(rows).toHaveLength(0);
  });
});

// ─── insights data ────────────────────────────────────────────────────────────

describe('analytics insights data', () => {
  it('returns recent events ordered by date desc', () => {
    insertPlatformEvent({ id: 'pe-1', date: '2026-01-15T19:00:00Z', attendance: 10 });
    insertPlatformEvent({ id: 'pe-2', date: '2026-03-10T19:00:00Z', attendance: 20 });
    insertPlatformEvent({ id: 'pe-3', date: '2026-02-20T19:00:00Z', attendance: 15 });

    const rows = db
      .prepare(
        `SELECT title, date, platform, attendance, capacity, revenue, ticket_price, status
         FROM platform_events
         WHERE date IS NOT NULL
         ORDER BY date DESC
         LIMIT 20`,
      )
      .all() as { title: string; date: string; platform: string }[];

    expect(rows).toHaveLength(3);
    expect(rows[0].date).toBe('2026-03-10T19:00:00Z');
    expect(rows[1].date).toBe('2026-02-20T19:00:00Z');
    expect(rows[2].date).toBe('2026-01-15T19:00:00Z');
  });
});
