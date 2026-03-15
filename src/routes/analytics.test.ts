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
  ticketPrice?: number | null;
  venue?: string | null;
}) {
  const {
    id,
    eventId = null,
    platform = 'meetup',
    date = null,
    attendance = null,
    capacity = null,
    revenue = null,
    ticketPrice = null,
    venue = null,
  } = opts;
  db.prepare(`
    INSERT INTO platform_events (id, event_id, platform, external_id, title, date, status, synced_at, attendance, capacity, revenue, ticket_price, venue)
    VALUES (?, ?, ?, ?, 'Test Event', ?, 'active', datetime('now'), ?, ?, ?, ?, ?)
  `).run(id, eventId, platform, `ext-${id}`, date, attendance, capacity, revenue, ticketPrice, venue);
}

function insertEventScore(eventId: string, overall: number) {
  db.prepare(`
    INSERT INTO event_scores (event_id, overall, breakdown_json, suggestions_json, scored_at)
    VALUES (?, ?, '{}', '[]', datetime('now'))
  `).run(eventId, overall);
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

function insertEventWithVenue(id: string, title: string, venue: string, startTime = '2026-04-01T19:00:00Z') {
  db.prepare(`
    INSERT INTO events (id, title, description, start_time, venue, status, created_at, updated_at)
    VALUES (?, ?, '', ?, ?, 'published', datetime('now'), datetime('now'))
  `).run(id, title, startTime, venue);
}

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

// ─── pricing queries ──────────────────────────────────────────────────────────

describe('analytics pricing', () => {
  it('buckets free events correctly (NULL ticket_price)', () => {
    insertPlatformEvent({ id: 'pe-1', attendance: 30, capacity: 50, ticketPrice: null });

    const rows = db.prepare(`
      SELECT
        CASE
          WHEN ticket_price IS NULL OR ticket_price = 0 THEN 'free'
          WHEN ticket_price < 10 THEN 'under_10'
          WHEN ticket_price < 20 THEN '10_to_20'
          ELSE 'over_20'
        END as price_range,
        COUNT(*) as event_count
      FROM platform_events
      WHERE attendance IS NOT NULL AND capacity > 0
      GROUP BY price_range
    `).all() as { price_range: string; event_count: number }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].price_range).toBe('free');
    expect(rows[0].event_count).toBe(1);
  });

  it('buckets events into all four price ranges', () => {
    // free (price = 0), under_10, 10_to_20, over_20
    insertPlatformEvent({ id: 'pe-1', attendance: 10, capacity: 20, ticketPrice: 0 });
    insertPlatformEvent({ id: 'pe-2', attendance: 10, capacity: 20, ticketPrice: 5 });
    insertPlatformEvent({ id: 'pe-3', attendance: 10, capacity: 20, ticketPrice: 15 });
    insertPlatformEvent({ id: 'pe-4', attendance: 10, capacity: 20, ticketPrice: 25 });

    const rows = db.prepare(`
      SELECT
        CASE
          WHEN ticket_price IS NULL OR ticket_price = 0 THEN 'free'
          WHEN ticket_price < 10 THEN 'under_10'
          WHEN ticket_price < 20 THEN '10_to_20'
          ELSE 'over_20'
        END as price_range,
        COUNT(*) as event_count,
        AVG(ticket_price) as avg_price
      FROM platform_events
      WHERE attendance IS NOT NULL AND capacity > 0
      GROUP BY price_range
      ORDER BY avg_price ASC
    `).all() as { price_range: string; event_count: number; avg_price: number | null }[];

    const ranges = rows.map(r => r.price_range);
    expect(ranges).toContain('free');
    expect(ranges).toContain('under_10');
    expect(ranges).toContain('10_to_20');
    expect(ranges).toContain('over_20');
  });

  it('calculates avg fill rate per price range', () => {
    // Two paid (10_to_20) events: 20/40=50%, 30/40=75% → avg 62.5%
    insertPlatformEvent({ id: 'pe-1', attendance: 20, capacity: 40, ticketPrice: 15 });
    insertPlatformEvent({ id: 'pe-2', attendance: 30, capacity: 40, ticketPrice: 15 });

    const rows = db.prepare(`
      SELECT
        CASE
          WHEN ticket_price IS NULL OR ticket_price = 0 THEN 'free'
          WHEN ticket_price < 10 THEN 'under_10'
          WHEN ticket_price < 20 THEN '10_to_20'
          ELSE 'over_20'
        END as price_range,
        AVG(CASE WHEN capacity > 0 THEN CAST(attendance AS REAL) / capacity ELSE NULL END) as avg_fill
      FROM platform_events
      WHERE attendance IS NOT NULL AND capacity > 0
      GROUP BY price_range
    `).all() as { price_range: string; avg_fill: number | null }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].price_range).toBe('10_to_20');
    expect(Math.round(rows[0].avg_fill! * 100)).toBe(63); // rounds up from 62.5
  });

  it('calculates revenue_per_attendee by platform', () => {
    // meetup: revenue 200 / attendance 20 = 10.00
    // eventbrite: revenue 150 / attendance 50 = 3.00
    insertPlatformEvent({ id: 'pe-1', platform: 'meetup', attendance: 20, revenue: 200 });
    insertPlatformEvent({ id: 'pe-2', platform: 'eventbrite', attendance: 50, revenue: 150 });

    const rows = db.prepare(`
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
    `).all() as { platform: string; revenue_per_attendee: number; event_count: number }[];

    const meetup = rows.find(r => r.platform === 'meetup')!;
    const eventbrite = rows.find(r => r.platform === 'eventbrite')!;

    expect(meetup).toBeDefined();
    expect(meetup.revenue_per_attendee).toBeCloseTo(10.0, 2);
    expect(eventbrite).toBeDefined();
    expect(eventbrite.revenue_per_attendee).toBeCloseTo(3.0, 2);
  });

  it('returns empty result when no data', () => {
    const rows = db.prepare(`
      SELECT
        CASE
          WHEN ticket_price IS NULL OR ticket_price = 0 THEN 'free'
          WHEN ticket_price < 10 THEN 'under_10'
          WHEN ticket_price < 20 THEN '10_to_20'
          ELSE 'over_20'
        END as price_range,
        COUNT(*) as event_count
      FROM platform_events
      WHERE attendance IS NOT NULL AND capacity > 0
      GROUP BY price_range
    `).all();

    expect(rows).toHaveLength(0);
  });
});

// ─── venues queries ───────────────────────────────────────────────────────────

describe('analytics venues', () => {
  it('groups events by venue and returns event_count', () => {
    insertEventWithVenue('e-1', 'Event A', 'The Granary');
    insertEventWithVenue('e-2', 'Event B', 'The Granary');
    insertEventWithVenue('e-3', 'Event C', 'Arnolfini');

    const rows = db.prepare(`
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
    `).all() as { venue: string; event_count: number; avg_score: number | null; platform_count: number }[];

    expect(rows).toHaveLength(2);
    expect(rows[0].venue).toBe('The Granary');
    expect(rows[0].event_count).toBe(2);
    expect(rows[1].venue).toBe('Arnolfini');
    expect(rows[1].event_count).toBe(1);
  });

  it('calculates avg_score from event_scores join', () => {
    insertEventWithVenue('e-1', 'Event A', 'The Granary');
    insertEventWithVenue('e-2', 'Event B', 'The Granary');
    insertEventScore('e-1', 80);
    insertEventScore('e-2', 60);

    const rows = db.prepare(`
      SELECT
        e.venue,
        AVG(es.overall) as avg_score
      FROM events e
      LEFT JOIN event_scores es ON es.event_id = e.id
      WHERE e.venue IS NOT NULL AND e.venue != '' AND e.status != 'archived'
      GROUP BY e.venue
    `).all() as { venue: string; avg_score: number | null }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].avg_score).toBe(70); // (80 + 60) / 2
  });

  it('counts distinct platforms per venue', () => {
    insertEventWithVenue('e-1', 'Event A', 'The Granary');
    insertPlatformEvent({ id: 'pe-1', eventId: 'e-1', platform: 'meetup' });
    insertPlatformEvent({ id: 'pe-2', eventId: 'e-1', platform: 'eventbrite' });
    insertPlatformEvent({ id: 'pe-3', eventId: 'e-1', platform: 'meetup' }); // duplicate platform

    const rows = db.prepare(`
      SELECT
        e.venue,
        COUNT(DISTINCT pe.platform) as platform_count
      FROM events e
      LEFT JOIN platform_events pe ON pe.event_id = e.id
      WHERE e.venue IS NOT NULL AND e.venue != '' AND e.status != 'archived'
      GROUP BY e.venue
    `).all() as { venue: string; platform_count: number }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].platform_count).toBe(2); // meetup + eventbrite, not 3
  });

  it('calculates venue performance per platform (fill rate, attendance, revenue)', () => {
    insertPlatformEvent({ id: 'pe-1', platform: 'meetup', venue: 'The Granary', attendance: 40, capacity: 50, revenue: 400 });
    insertPlatformEvent({ id: 'pe-2', platform: 'meetup', venue: 'The Granary', attendance: 30, capacity: 50, revenue: 300 });
    insertPlatformEvent({ id: 'pe-3', platform: 'eventbrite', venue: 'Arnolfini', attendance: 20, capacity: 40, revenue: 200 });

    const rows = db.prepare(`
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
    `).all() as { venue: string; platform: string; event_count: number; avg_fill: number | null; avg_attendance: number | null; total_revenue: number | null }[];

    expect(rows).toHaveLength(2);
    const granary = rows.find(r => r.venue === 'The Granary')!;
    expect(granary).toBeDefined();
    expect(granary.event_count).toBe(2);
    expect(Math.round(granary.avg_fill! * 100)).toBe(70); // (40/50 + 30/50) / 2 = 70%
    expect(granary.avg_attendance).toBe(35);
    expect(granary.total_revenue).toBe(700);
  });

  it('excludes archived events from venue stats', () => {
    db.prepare(`
      INSERT INTO events (id, title, description, start_time, venue, status, created_at, updated_at)
      VALUES ('e-archived', 'Old Event', '', '2026-01-01T19:00:00Z', 'The Granary', 'archived', datetime('now'), datetime('now'))
    `).run();
    insertEventWithVenue('e-1', 'Live Event', 'The Granary');

    const rows = db.prepare(`
      SELECT e.venue, COUNT(*) as event_count
      FROM events e
      LEFT JOIN event_scores es ON es.event_id = e.id
      LEFT JOIN platform_events pe ON pe.event_id = e.id
      WHERE e.venue IS NOT NULL AND e.venue != '' AND e.status != 'archived'
      GROUP BY e.venue
    `).all() as { venue: string; event_count: number }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].event_count).toBe(1);
  });

  it('returns empty result when no venue data', () => {
    insertEvent('e-1', 'No Venue Event');

    const rows = db.prepare(`
      SELECT e.venue, COUNT(*) as event_count
      FROM events e
      WHERE e.venue IS NOT NULL AND e.venue != '' AND e.status != 'archived'
      GROUP BY e.venue
    `).all();

    expect(rows).toHaveLength(0);
  });
});

// ─── roi queries ──────────────────────────────────────────────────────────────

describe('analytics roi', () => {
  it('returns top events sorted by revenue DESC', () => {
    insertPlatformEvent({ id: 'pe-1', platform: 'meetup', attendance: 20, revenue: 100, date: '2026-01-10T19:00:00Z' });
    insertPlatformEvent({ id: 'pe-2', platform: 'eventbrite', attendance: 30, revenue: 500, date: '2026-02-10T19:00:00Z' });
    insertPlatformEvent({ id: 'pe-3', platform: 'meetup', attendance: 10, revenue: 250, date: '2026-03-10T19:00:00Z' });

    const rows = db.prepare(`
      SELECT title, platform, date, revenue, attendance
      FROM platform_events
      WHERE revenue IS NOT NULL AND revenue > 0
        AND attendance IS NOT NULL AND attendance > 0
      ORDER BY revenue DESC
      LIMIT 10
    `).all() as { title: string; platform: string; date: string; revenue: number; attendance: number }[];

    expect(rows).toHaveLength(3);
    expect(rows[0].revenue).toBe(500);
    expect(rows[1].revenue).toBe(250);
    expect(rows[2].revenue).toBe(100);
  });

  it('calculates revenue_per_head correctly', () => {
    insertPlatformEvent({ id: 'pe-1', attendance: 25, revenue: 500 });

    const rows = db.prepare(`
      SELECT
        revenue,
        attendance,
        CASE WHEN attendance > 0 THEN CAST(revenue AS REAL) / attendance ELSE 0 END as revenue_per_head
      FROM platform_events
      WHERE revenue IS NOT NULL AND revenue > 0
        AND attendance IS NOT NULL AND attendance > 0
    `).all() as { revenue: number; attendance: number; revenue_per_head: number }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].revenue_per_head).toBeCloseTo(20.0, 2);
  });

  it('excludes rows with zero or null revenue from top events', () => {
    insertPlatformEvent({ id: 'pe-1', attendance: 20, revenue: 0 });
    insertPlatformEvent({ id: 'pe-2', attendance: 10, revenue: null });
    insertPlatformEvent({ id: 'pe-3', attendance: 30, revenue: 300 });

    const rows = db.prepare(`
      SELECT title, revenue
      FROM platform_events
      WHERE revenue IS NOT NULL AND revenue > 0
        AND attendance IS NOT NULL AND attendance > 0
      ORDER BY revenue DESC
      LIMIT 10
    `).all() as { title: string; revenue: number }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].revenue).toBe(300);
  });

  it('aggregates monthly revenue with attendees and event count', () => {
    insertPlatformEvent({ id: 'pe-1', date: '2026-01-10T19:00:00Z', attendance: 20, revenue: 200 });
    insertPlatformEvent({ id: 'pe-2', date: '2026-01-20T19:00:00Z', attendance: 10, revenue: 100 });
    insertPlatformEvent({ id: 'pe-3', date: '2026-02-15T19:00:00Z', attendance: 30, revenue: 600 });

    const rows = db.prepare(`
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
    `).all() as { month: string; revenue: number; attendees: number; event_count: number; revenue_per_head: number }[];

    expect(rows).toHaveLength(2);
    expect(rows[0].month).toBe('2026-01');
    expect(rows[0].revenue).toBe(300);
    expect(rows[0].attendees).toBe(30);
    expect(rows[0].event_count).toBe(2);
    expect(rows[0].revenue_per_head).toBe(10); // 300/30
    expect(rows[1].month).toBe('2026-02');
    expect(rows[1].revenue).toBe(600);
    expect(rows[1].revenue_per_head).toBe(20); // 600/30
  });

  it('calculates platform efficiency sorted by total_revenue DESC', () => {
    insertPlatformEvent({ id: 'pe-1', platform: 'meetup', attendance: 20, revenue: 400 });
    insertPlatformEvent({ id: 'pe-2', platform: 'meetup', attendance: 30, revenue: 600 });
    insertPlatformEvent({ id: 'pe-3', platform: 'eventbrite', attendance: 50, revenue: 250 });

    const rows = db.prepare(`
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
    `).all() as { platform: string; event_count: number; total_revenue: number; total_attendees: number; avg_revenue: number; revenue_per_head: number }[];

    expect(rows).toHaveLength(2);
    expect(rows[0].platform).toBe('meetup');
    expect(rows[0].total_revenue).toBe(1000);
    expect(rows[0].total_attendees).toBe(50);
    expect(rows[0].event_count).toBe(2);
    expect(rows[0].revenue_per_head).toBe(20); // 1000/50
    expect(rows[1].platform).toBe('eventbrite');
    expect(rows[1].total_revenue).toBe(250);
  });

  it('returns empty result when no revenue data', () => {
    insertPlatformEvent({ id: 'pe-1', attendance: 20, revenue: null });

    const topEvents = db.prepare(`
      SELECT title FROM platform_events
      WHERE revenue IS NOT NULL AND revenue > 0
        AND attendance IS NOT NULL AND attendance > 0
      ORDER BY revenue DESC
      LIMIT 10
    `).all();

    expect(topEvents).toHaveLength(0);

    const monthlyRevenue = db.prepare(`
      SELECT strftime('%Y-%m', date) as month, SUM(revenue) as revenue
      FROM platform_events
      WHERE date IS NOT NULL AND revenue IS NOT NULL
      GROUP BY month
      ORDER BY month ASC
    `).all();

    expect(monthlyRevenue).toHaveLength(0);
  });
});
