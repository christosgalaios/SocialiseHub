import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createDatabase } from '../data/database.js';
import { SqliteEventStore } from '../data/sqlite-event-store.js';
import { createDashboardRouter } from './dashboard.js';
import type { Database } from '../data/database.js';

function createTestApp() {
  const db = createDatabase(':memory:');
  const eventStore = new SqliteEventStore(db);
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard', createDashboardRouter(db, eventStore));
  return { app, db, eventStore };
}

// Helper to insert a platform_event directly
function insertPlatformEvent(
  db: Database,
  opts: {
    id?: string;
    event_id?: string | null;
    platform?: string;
    external_id?: string;
    title?: string;
    date?: string;
    venue?: string | null;
    attendance?: number | null;
    capacity?: number | null;
    revenue?: number | null;
    synced_at?: string;
  },
) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO platform_events (id, event_id, platform, external_id, title, date, venue, attendance, capacity, revenue, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    opts.id ?? `pe-${Math.random()}`,
    opts.event_id ?? null,
    opts.platform ?? 'meetup',
    opts.external_id ?? `ext-${Math.random()}`,
    opts.title ?? 'Test Event',
    opts.date ?? now,
    opts.venue ?? null,
    opts.attendance ?? null,
    opts.capacity ?? null,
    opts.revenue ?? null,
    opts.synced_at ?? now,
  );
}

describe('Dashboard routes', () => {
  describe('GET /attention', () => {
    it('returns empty when no events', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/dashboard/attention');
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.count).toBe(0);
    });

    it('flags events missing description (< 20 chars)', async () => {
      const { app, db: _db, eventStore } = createTestApp();

      // Event with short description
      const event = eventStore.create({
        title: 'Short Desc Event',
        description: 'Too short',
        start_time: '2030-01-01T19:00:00Z',
        venue: 'Test Venue',
        capacity: 50,
      });

      const res = await request(app).get('/api/dashboard/attention');
      expect(res.status).toBe(200);
      expect(res.body.count).toBeGreaterThan(0);

      const item = res.body.items.find((i: { eventId: string }) => i.eventId === event.id);
      expect(item).toBeDefined();
      const problems = item.problems.map((p: { problem: string }) => p.problem);
      expect(problems).toContain('missing_description');
    });

    it('flags events with null description', async () => {
      const { app, eventStore } = createTestApp();

      const event = eventStore.create({
        title: 'No Description Event',
        description: undefined,
        start_time: '2030-01-01T19:00:00Z',
        venue: 'Test Venue',
        capacity: 50,
      });

      const res = await request(app).get('/api/dashboard/attention');
      expect(res.status).toBe(200);

      const item = res.body.items.find((i: { eventId: string }) => i.eventId === event.id);
      expect(item).toBeDefined();
      const problems = item.problems.map((p: { problem: string }) => p.problem);
      expect(problems).toContain('missing_description');
    });

    it('does not flag events with adequate description', async () => {
      const { app, eventStore } = createTestApp();

      const event = eventStore.create({
        title: 'Good Event',
        description: 'This is a long enough description for the event to pass.',
        start_time: '2030-01-01T19:00:00Z',
        venue: 'Test Venue',
        capacity: 50,
      });

      const res = await request(app).get('/api/dashboard/attention');
      expect(res.status).toBe(200);

      const item = res.body.items.find((i: { eventId: string }) => i.eventId === event.id);
      if (item) {
        const problems = item.problems.map((p: { problem: string }) => p.problem);
        expect(problems).not.toContain('missing_description');
      }
    });

    it('flags upcoming events with no venue', async () => {
      const { app, eventStore } = createTestApp();

      const event = eventStore.create({
        title: 'No Venue Event',
        description: 'This is a long enough description for the test event to pass check.',
        start_time: '2030-06-01T19:00:00Z',
        venue: undefined,
        capacity: 50,
      });

      const res = await request(app).get('/api/dashboard/attention');
      expect(res.status).toBe(200);

      const item = res.body.items.find((i: { eventId: string }) => i.eventId === event.id);
      expect(item).toBeDefined();
      const problems = item.problems.map((p: { problem: string }) => p.problem);
      expect(problems).toContain('no_venue');
    });

    it('does NOT flag past events for missing venue', async () => {
      const { app, eventStore } = createTestApp();

      // Past event with no venue (outside -7 day window)
      const event = eventStore.create({
        title: 'Past No Venue',
        description: 'This is a long enough description for the test event to pass check.',
        start_time: '2020-01-01T19:00:00Z',
        venue: undefined,
        capacity: 50,
      });

      const res = await request(app).get('/api/dashboard/attention');
      expect(res.status).toBe(200);

      const item = res.body.items.find((i: { eventId: string }) => i.eventId === event.id);
      // Past events outside the -7 day window are excluded entirely
      expect(item).toBeUndefined();
    });

    it('groups multiple problems per event into one item', async () => {
      const { app, eventStore } = createTestApp();

      const event = eventStore.create({
        title: 'Problem Event',
        description: 'Too short',
        start_time: '2030-03-01T19:00:00Z',
        venue: undefined,
        capacity: undefined,
      });

      const res = await request(app).get('/api/dashboard/attention');
      expect(res.status).toBe(200);

      // Should appear only once in items
      const matchingItems = res.body.items.filter((i: { eventId: string }) => i.eventId === event.id);
      expect(matchingItems).toHaveLength(1);

      const item = matchingItems[0];
      const problemTypes = item.problems.map((p: { problem: string }) => p.problem);
      // missing_description, no_photos, no_venue, no_capacity should all be present
      expect(problemTypes).toContain('missing_description');
      expect(problemTypes).toContain('no_venue');
      expect(problemTypes).toContain('no_capacity');
      expect(problemTypes).toContain('no_photos');
    });

    it('flags events with low score', async () => {
      const { app, db, eventStore } = createTestApp();

      const event = eventStore.create({
        title: 'Low Score Event',
        description: 'This is a long enough description for the test event to pass check.',
        start_time: '2030-04-01T19:00:00Z',
        venue: 'Somewhere',
        capacity: 50,
      });

      // Insert a low event score
      db.prepare(`
        INSERT INTO event_scores (event_id, overall, breakdown_json, suggestions_json, scored_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(event.id, 25, '{}', '[]', new Date().toISOString());

      const res = await request(app).get('/api/dashboard/attention');
      expect(res.status).toBe(200);

      const item = res.body.items.find((i: { eventId: string }) => i.eventId === event.id);
      expect(item).toBeDefined();
      const problems = item.problems.map((p: { problem: string }) => p.problem);
      expect(problems).toContain('low_score');
    });

    it('urgency is set to highest among problems', async () => {
      const { app, eventStore } = createTestApp();

      // This event will have missing_description (high) + no_capacity (low)
      const event = eventStore.create({
        title: 'Urgency Test Event',
        description: 'Short',
        start_time: '2030-05-01T19:00:00Z',
        venue: 'Some Venue',
        capacity: undefined,
      });

      const res = await request(app).get('/api/dashboard/attention');
      expect(res.status).toBe(200);

      const item = res.body.items.find((i: { eventId: string }) => i.eventId === event.id);
      expect(item).toBeDefined();
      expect(item.urgency).toBe('high');
    });

    it('cancelled events are excluded', async () => {
      const { app, db, eventStore } = createTestApp();

      const event = eventStore.create({
        title: 'Cancelled Event',
        description: 'Short',
        start_time: '2030-07-01T19:00:00Z',
        venue: undefined,
        capacity: undefined,
      });

      db.prepare(`UPDATE events SET status = 'cancelled' WHERE id = ?`).run(event.id);

      const res = await request(app).get('/api/dashboard/attention');
      expect(res.status).toBe(200);

      const item = res.body.items.find((i: { eventId: string }) => i.eventId === event.id);
      expect(item).toBeUndefined();
    });

    it('includes platform info in attention items', async () => {
      const { app, db, eventStore } = createTestApp();

      const event = eventStore.create({
        title: 'Platform Event',
        description: 'Short',
        start_time: '2030-08-01T19:00:00Z',
        venue: undefined,
        capacity: 50,
      });

      insertPlatformEvent(db, {
        event_id: event.id,
        platform: 'meetup',
        external_id: 'ext-123',
        title: 'Platform Event',
      });

      const res = await request(app).get('/api/dashboard/attention');
      expect(res.status).toBe(200);

      const item = res.body.items.find((i: { eventId: string }) => i.eventId === event.id);
      expect(item).toBeDefined();
      expect(item.platforms).toContain('meetup');
    });
  });

  describe('GET /upcoming', () => {
    it('returns empty when no events', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/dashboard/upcoming');
      expect(res.status).toBe(200);
      expect(res.body.events).toEqual([]);
    });

    it('returns upcoming events with readiness score', async () => {
      const { app, eventStore } = createTestApp();

      eventStore.create({
        title: 'Future Event',
        description: 'This is a long enough description with more than 100 characters to pass the readiness check for the event.',
        start_time: '2030-01-15T19:00:00Z',
        venue: 'The Venue',
        price: 15,
        capacity: 40,
      });

      const res = await request(app).get('/api/dashboard/upcoming');
      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(1);

      const ev = res.body.events[0];
      expect(ev.eventTitle).toBe('Future Event');
      expect(ev.readiness).toBeDefined();
      expect(typeof ev.readiness).toBe('number');
      expect(ev.readiness).toBeGreaterThanOrEqual(0);
      expect(ev.readiness).toBeLessThanOrEqual(100);
      expect(ev.passed).toBeDefined();
      expect(ev.total).toBe(7);
      expect(ev.missing).toBeDefined();
      expect(Array.isArray(ev.missing)).toBe(true);
    });

    it('does NOT return past events', async () => {
      const { app, eventStore } = createTestApp();

      eventStore.create({
        title: 'Past Event',
        description: 'This is a long enough description to pass the check.',
        start_time: '2020-01-01T19:00:00Z',
        venue: 'Somewhere',
        capacity: 50,
      });

      const res = await request(app).get('/api/dashboard/upcoming');
      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(0);
    });

    it('does NOT return cancelled events', async () => {
      const { app, db, eventStore } = createTestApp();

      const event = eventStore.create({
        title: 'Cancelled Future',
        description: 'A description long enough.',
        start_time: '2030-02-01T19:00:00Z',
        venue: 'Some Place',
        capacity: 30,
      });

      db.prepare(`UPDATE events SET status = 'cancelled' WHERE id = ?`).run(event.id);

      const res = await request(app).get('/api/dashboard/upcoming');
      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(0);
    });

    it('returns at most 5 upcoming events', async () => {
      const { app, eventStore } = createTestApp();

      for (let i = 1; i <= 7; i++) {
        eventStore.create({
          title: `Event ${i}`,
          description: 'A decent description.',
          start_time: `2030-0${i < 10 ? i : '9'}-01T19:00:00Z`,
          venue: 'Test Venue',
          capacity: 50,
        });
      }

      const res = await request(app).get('/api/dashboard/upcoming');
      expect(res.status).toBe(200);
      expect(res.body.events.length).toBeLessThanOrEqual(5);
    });

    it('calculates correct readiness: all checks passing', async () => {
      const { app, db, eventStore } = createTestApp();

      const event = eventStore.create({
        title: 'Complete Event',
        description: 'This is a comprehensive event description that is more than one hundred characters long for the test.',
        start_time: '2030-03-15T19:00:00Z',
        venue: 'The Grand Hall',
        price: 20,
        capacity: 100,
      });

      // Add a photo to pass photos check
      db.prepare(`
        INSERT INTO event_photos (event_id, photo_path, source, position, is_cover)
        VALUES (?, ?, ?, ?, ?)
      `).run(event.id, '/photos/test.jpg', 'upload', 0, 1);

      const res = await request(app).get('/api/dashboard/upcoming');
      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(1);

      const ev = res.body.events[0];
      expect(ev.passed).toBe(7);
      expect(ev.readiness).toBe(100);
      expect(ev.missing).toHaveLength(0);
    });

    it('calculates readiness when checks are failing', async () => {
      const { app, eventStore } = createTestApp();

      // Missing: description (short), venue, price, photos, capacity
      eventStore.create({
        title: 'Incomplete Event',
        description: 'Short',
        start_time: '2030-04-15T19:00:00Z',
        venue: undefined,
        price: 0,
        capacity: undefined,
      });

      const res = await request(app).get('/api/dashboard/upcoming');
      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(1);

      const ev = res.body.events[0];
      // Only title and date pass
      expect(ev.passed).toBe(2);
      expect(ev.readiness).toBe(Math.round((2 / 7) * 100));
      expect(ev.missing).toContain('Description');
      expect(ev.missing).toContain('Venue');
      expect(ev.missing).toContain('Photos');
    });

    it('includes platforms in upcoming event', async () => {
      const { app, db, eventStore } = createTestApp();

      const event = eventStore.create({
        title: 'Platform Upcoming',
        description: 'A sufficient description.',
        start_time: '2030-05-15T19:00:00Z',
        venue: 'Somewhere',
        capacity: 50,
      });

      insertPlatformEvent(db, {
        event_id: event.id,
        platform: 'eventbrite',
        external_id: 'eb-999',
        title: 'Platform Upcoming',
      });

      const res = await request(app).get('/api/dashboard/upcoming');
      expect(res.status).toBe(200);

      const ev = res.body.events.find((e: { eventId: string }) => e.eventId === event.id);
      expect(ev).toBeDefined();
      expect(ev.platforms).toContain('eventbrite');
    });

    it('includes timeUntil field', async () => {
      const { app, eventStore } = createTestApp();

      eventStore.create({
        title: 'Far Future Event',
        description: 'A description.',
        start_time: '2030-06-01T19:00:00Z',
        venue: 'Place',
        capacity: 50,
      });

      const res = await request(app).get('/api/dashboard/upcoming');
      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(1);
      expect(res.body.events[0].timeUntil).toBeDefined();
      expect(typeof res.body.events[0].timeUntil).toBe('string');
    });

    it('orders events by start_time ascending', async () => {
      const { app, eventStore } = createTestApp();

      eventStore.create({
        title: 'Third Event',
        description: 'A description.',
        start_time: '2030-09-01T19:00:00Z',
        venue: 'Place',
        capacity: 50,
      });

      eventStore.create({
        title: 'First Event',
        description: 'A description.',
        start_time: '2030-07-01T19:00:00Z',
        venue: 'Place',
        capacity: 50,
      });

      eventStore.create({
        title: 'Second Event',
        description: 'A description.',
        start_time: '2030-08-01T19:00:00Z',
        venue: 'Place',
        capacity: 50,
      });

      const res = await request(app).get('/api/dashboard/upcoming');
      expect(res.status).toBe(200);
      const titles = res.body.events.map((e: { eventTitle: string }) => e.eventTitle);
      expect(titles[0]).toBe('First Event');
      expect(titles[1]).toBe('Second Event');
      expect(titles[2]).toBe('Third Event');
    });
  });

  describe('GET /performance', () => {
    it('returns stats structure with zero data', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/dashboard/performance');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.upcomingCount).toBe(0);
      expect(res.body.data.attendeesLast30).toBe(0);
      expect(res.body.data.attendeesTrend).toBe('flat');
      expect(res.body.data.revenueLast30).toBe(0);
      expect(res.body.data.revenueTrend).toBe('flat');
      expect(res.body.data.avgFillRate).toBeNull();
    });

    it('counts upcoming events correctly', async () => {
      const { app, eventStore } = createTestApp();

      eventStore.create({
        title: 'Future 1',
        description: 'A description.',
        start_time: '2030-01-01T19:00:00Z',
        venue: 'Place',
        capacity: 50,
      });

      eventStore.create({
        title: 'Future 2',
        description: 'A description.',
        start_time: '2030-02-01T19:00:00Z',
        venue: 'Place',
        capacity: 50,
      });

      // Past event — should not count
      eventStore.create({
        title: 'Past Event',
        description: 'A description.',
        start_time: '2020-01-01T19:00:00Z',
        venue: 'Place',
        capacity: 50,
      });

      const res = await request(app).get('/api/dashboard/performance');
      expect(res.status).toBe(200);
      expect(res.body.data.upcomingCount).toBe(2);
    });

    it('calculates attendees and revenue from last 30 days', async () => {
      const { app, db } = createTestApp();

      // Insert platform event within last 30 days (use 10 days ago)
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      insertPlatformEvent(db, {
        platform: 'meetup',
        external_id: 'past-1',
        date: tenDaysAgo,
        attendance: 30,
        revenue: 150.0,
      });

      const res = await request(app).get('/api/dashboard/performance');
      expect(res.status).toBe(200);
      expect(res.body.data.attendeesLast30).toBe(30);
      expect(res.body.data.revenueLast30).toBe(150.0);
    });

    it('calculates trend as up when current period is > 110% of previous', async () => {
      const { app, db } = createTestApp();

      // Previous period: 31-60 days ago
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      insertPlatformEvent(db, {
        platform: 'meetup',
        external_id: 'prev-1',
        date: fortyDaysAgo,
        attendance: 10,
        revenue: 50,
      });

      // Current period: last 30 days — much higher
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      insertPlatformEvent(db, {
        platform: 'meetup',
        external_id: 'curr-1',
        date: tenDaysAgo,
        attendance: 50,
        revenue: 250,
      });

      const res = await request(app).get('/api/dashboard/performance');
      expect(res.status).toBe(200);
      expect(res.body.data.attendeesTrend).toBe('up');
      expect(res.body.data.revenueTrend).toBe('up');
    });

    it('calculates trend as down when current period is < 90% of previous', async () => {
      const { app, db } = createTestApp();

      // Previous period: higher attendance
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      insertPlatformEvent(db, {
        platform: 'meetup',
        external_id: 'prev-2',
        date: fortyDaysAgo,
        attendance: 100,
        revenue: 500,
      });

      // Current period: much lower
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      insertPlatformEvent(db, {
        platform: 'meetup',
        external_id: 'curr-2',
        date: tenDaysAgo,
        attendance: 10,
        revenue: 50,
      });

      const res = await request(app).get('/api/dashboard/performance');
      expect(res.status).toBe(200);
      expect(res.body.data.attendeesTrend).toBe('down');
      expect(res.body.data.revenueTrend).toBe('down');
    });

    it('calculates trend as flat when within 10% range', async () => {
      const { app, db } = createTestApp();

      // Previous and current roughly the same
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      insertPlatformEvent(db, {
        platform: 'meetup',
        external_id: 'flat-prev',
        date: fortyDaysAgo,
        attendance: 100,
        revenue: 500,
      });

      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      insertPlatformEvent(db, {
        platform: 'meetup',
        external_id: 'flat-curr',
        date: tenDaysAgo,
        attendance: 103,
        revenue: 505,
      });

      const res = await request(app).get('/api/dashboard/performance');
      expect(res.status).toBe(200);
      expect(res.body.data.attendeesTrend).toBe('flat');
      expect(res.body.data.revenueTrend).toBe('flat');
    });

    it('calculates avgFillRate when data is available', async () => {
      const { app, db } = createTestApp();

      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      insertPlatformEvent(db, {
        platform: 'meetup',
        external_id: 'fill-1',
        date: tenDaysAgo,
        attendance: 50,
        capacity: 100,
      });

      const res = await request(app).get('/api/dashboard/performance');
      expect(res.status).toBe(200);
      // 50/100 = 50% fill rate
      expect(res.body.data.avgFillRate).toBe(50);
    });
  });

  describe('POST /suggestions', () => {
    it('returns a prompt string', async () => {
      const { app } = createTestApp();
      const res = await request(app).post('/api/dashboard/suggestions');
      expect(res.status).toBe(200);
      expect(res.body.prompt).toBeDefined();
      expect(typeof res.body.prompt).toBe('string');
      expect(res.body.prompt.length).toBeGreaterThan(0);
    });

    it('prompt contains reference to upcoming events section', async () => {
      const { app } = createTestApp();
      const res = await request(app).post('/api/dashboard/suggestions');
      expect(res.status).toBe(200);
      expect(res.body.prompt).toContain('Upcoming Events');
    });

    it('prompt includes event title when upcoming events exist', async () => {
      const { app, eventStore } = createTestApp();

      // Event in next 30 days — use a date just a few days from now
      const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      eventStore.create({
        title: 'Prompt Test Event',
        description: 'Short',
        start_time: soon,
        venue: 'Test Venue',
        capacity: 50,
      });

      const res = await request(app).post('/api/dashboard/suggestions');
      expect(res.status).toBe(200);
      expect(res.body.prompt).toContain('Prompt Test Event');
    });

    it('prompt includes past performance stats', async () => {
      const { app } = createTestApp();
      const res = await request(app).post('/api/dashboard/suggestions');
      expect(res.status).toBe(200);
      expect(res.body.prompt).toContain('Past 90 Days Performance');
    });

    it('prompt includes events needing attention count', async () => {
      const { app } = createTestApp();
      const res = await request(app).post('/api/dashboard/suggestions');
      expect(res.status).toBe(200);
      expect(res.body.prompt).toContain('Events needing attention');
    });

    it('prompt requests JSON array output', async () => {
      const { app } = createTestApp();
      const res = await request(app).post('/api/dashboard/suggestions');
      expect(res.status).toBe(200);
      expect(res.body.prompt).toContain('JSON array');
    });
  });

  describe('PUT /suggestions and GET /suggestions', () => {
    it('GET returns null when no suggestions stored', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/dashboard/suggestions');
      expect(res.status).toBe(200);
      expect(res.body.suggestions).toBeNull();
    });

    it('PUT stores suggestions and GET retrieves them', async () => {
      const { app } = createTestApp();

      const suggestions = [
        { title: 'Improve photos', body: 'Add photos to events.', priority: 'high' },
        { title: 'Add venues', body: 'Set venues for upcoming events.', priority: 'medium' },
      ];

      const putRes = await request(app)
        .put('/api/dashboard/suggestions')
        .send({ suggestions });
      expect(putRes.status).toBe(200);
      expect(putRes.body.ok).toBe(true);

      const getRes = await request(app).get('/api/dashboard/suggestions');
      expect(getRes.status).toBe(200);
      expect(getRes.body.suggestions).toEqual(suggestions);
      expect(getRes.body.generatedAt).toBeDefined();
    });

    it('PUT rejects non-array input', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .put('/api/dashboard/suggestions')
        .send({ suggestions: { not: 'an array' } });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('array');
    });

    it('PUT rejects missing suggestions field', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .put('/api/dashboard/suggestions')
        .send({ something: 'else' });
      expect(res.status).toBe(400);
    });

    it('PUT overwrites previously stored suggestions', async () => {
      const { app } = createTestApp();

      const first = [{ title: 'First', body: 'First suggestion.', priority: 'low' }];
      const second = [{ title: 'Second', body: 'Second suggestion.', priority: 'high' }];

      await request(app).put('/api/dashboard/suggestions').send({ suggestions: first });
      await request(app).put('/api/dashboard/suggestions').send({ suggestions: second });

      const getRes = await request(app).get('/api/dashboard/suggestions');
      expect(getRes.status).toBe(200);
      expect(getRes.body.suggestions).toEqual(second);
    });

    it('PUT accepts empty array', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .put('/api/dashboard/suggestions')
        .send({ suggestions: [] });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const getRes = await request(app).get('/api/dashboard/suggestions');
      expect(getRes.status).toBe(200);
      expect(getRes.body.suggestions).toEqual([]);
    });
  });
});
