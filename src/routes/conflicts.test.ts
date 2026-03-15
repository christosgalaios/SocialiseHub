import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createDatabase } from '../data/database.js';
import { SqliteEventStore } from '../data/sqlite-event-store.js';
import { PlatformEventStore } from '../data/platform-event-store.js';
import { createConflictsRouter } from './conflicts.js';
import { createDashboardRouter } from './dashboard.js';
import type { Database } from '../data/database.js';

function createTestApp() {
  const db = createDatabase(':memory:');
  const eventStore = new SqliteEventStore(db);
  const platformEventStore = new PlatformEventStore(db);
  const app = express();
  app.use(express.json());
  app.use('/api/events', createConflictsRouter(eventStore, platformEventStore));
  app.use('/api/dashboard', createDashboardRouter(db, eventStore, platformEventStore));
  return { app, db, eventStore, platformEventStore };
}

function insertPlatformEvent(
  db: Database,
  opts: {
    id?: string;
    event_id?: string | null;
    platform?: string;
    external_id?: string;
    external_url?: string | null;
    title?: string;
    date?: string | null;
    venue?: string | null;
    ticket_price?: number | null;
    capacity?: number | null;
    description?: string | null;
    synced_at?: string;
  },
) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO platform_events
      (id, event_id, platform, external_id, external_url, title, date, venue, ticket_price, capacity, description, synced_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(
    opts.id ?? `pe-${Math.random()}`,
    opts.event_id ?? null,
    opts.platform ?? 'meetup',
    opts.external_id ?? `ext-${Math.random()}`,
    opts.external_url ?? null,
    opts.title ?? 'Test Event',
    opts.date ?? null,
    opts.venue ?? null,
    opts.ticket_price ?? null,
    opts.capacity ?? null,
    opts.description ?? null,
    opts.synced_at ?? now,
  );
}

describe('GET /api/events/:id/conflicts', () => {
  it('returns 404 for nonexistent event', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/events/nonexistent-id/conflicts');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Event not found');
  });

  it('returns empty conflicts when no platform events are linked', async () => {
    const { app, eventStore } = createTestApp();
    const event = eventStore.create({
      title: 'Solo Event',
      description: 'No platforms',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'Test Venue',
      price: 10,
      capacity: 50,
      duration_minutes: 120,
    });

    const res = await request(app).get(`/api/events/${event.id}/conflicts`);
    expect(res.status).toBe(200);
    expect(res.body.eventId).toBe(event.id);
    expect(res.body.conflicts).toEqual([]);
    expect(res.body.platforms).toEqual([]);
  });

  it('returns empty conflicts when all fields match', async () => {
    const { app, db, eventStore } = createTestApp();
    const event = eventStore.create({
      title: 'Matching Event',
      description: 'Same description',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'Test Venue',
      price: 10,
      capacity: 50,
      duration_minutes: 120,
    });

    insertPlatformEvent(db, {
      event_id: event.id,
      platform: 'meetup',
      external_id: 'ext-1',
      title: 'Matching Event',
      description: 'Same description',
      date: '2030-06-01T19:00:00Z',
      venue: 'Test Venue',
      ticket_price: 10,
      capacity: 50,
    });

    const res = await request(app).get(`/api/events/${event.id}/conflicts`);
    expect(res.status).toBe(200);
    expect(res.body.conflicts).toEqual([]);
  });

  it('detects title conflict between hub and platform', async () => {
    const { app, db, eventStore } = createTestApp();
    const event = eventStore.create({
      title: 'Hub Title',
      description: 'Description',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'Venue',
      price: 10,
      capacity: 50,
      duration_minutes: 120,
    });

    insertPlatformEvent(db, {
      event_id: event.id,
      platform: 'meetup',
      external_id: 'ext-1',
      external_url: 'https://meetup.com/event/1',
      title: 'Different Title on Meetup',
    });

    const res = await request(app).get(`/api/events/${event.id}/conflicts`);
    expect(res.status).toBe(200);
    expect(res.body.eventTitle).toBe('Hub Title');
    expect(res.body.conflicts.length).toBeGreaterThanOrEqual(1);

    const titleConflict = res.body.conflicts.find((c: { field: string }) => c.field === 'title');
    expect(titleConflict).toBeDefined();
    expect(titleConflict.hubValue).toBe('Hub Title');
    expect(titleConflict.platformValues).toHaveLength(1);
    expect(titleConflict.platformValues[0].platform).toBe('meetup');
    expect(titleConflict.platformValues[0].value).toBe('Different Title on Meetup');
    expect(titleConflict.platformValues[0].externalUrl).toBe('https://meetup.com/event/1');
  });

  it('flags null platform field as conflict when hub has data', async () => {
    const { app, db, eventStore } = createTestApp();
    const event = eventStore.create({
      title: 'Hub Title',
      description: 'Description',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'Ashton Gate Stadium',
      price: 10,
      capacity: 50,
      duration_minutes: 120,
    });

    // Platform event with null venue — hub has venue, so this IS a conflict
    insertPlatformEvent(db, {
      event_id: event.id,
      platform: 'eventbrite',
      external_id: 'ext-2',
      title: 'Hub Title',
      venue: null,
    });

    const res = await request(app).get(`/api/events/${event.id}/conflicts`);
    expect(res.status).toBe(200);
    const venueConflict = res.body.conflicts.find((c: { field: string }) => c.field === 'venue');
    expect(venueConflict).toBeDefined();
    expect(venueConflict.hubValue).toBe('Ashton Gate Stadium');
    expect(venueConflict.platformValues[0].value).toBeNull();
  });

  it('no conflict when both hub and platform are null', async () => {
    const { app, db, eventStore } = createTestApp();
    const event = eventStore.create({
      title: 'Hub Title',
      description: 'Description',
      start_time: '2030-06-01T19:00:00Z',
      venue: '',
      price: 10,
      capacity: 50,
      duration_minutes: 120,
    });

    // Both hub and platform have no venue — not a conflict
    insertPlatformEvent(db, {
      event_id: event.id,
      platform: 'eventbrite',
      external_id: 'ext-2',
      title: 'Hub Title',
      venue: null,
    });

    const res = await request(app).get(`/api/events/${event.id}/conflicts`);
    expect(res.status).toBe(200);
    const venueConflict = res.body.conflicts.find((c: { field: string }) => c.field === 'venue');
    expect(venueConflict).toBeUndefined();
  });

  it('detects conflicts across multiple platforms', async () => {
    const { app, db, eventStore } = createTestApp();
    const event = eventStore.create({
      title: 'Hub Title',
      description: 'Description',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'Venue',
      price: 10,
      capacity: 50,
      duration_minutes: 120,
    });

    insertPlatformEvent(db, {
      event_id: event.id,
      platform: 'meetup',
      external_id: 'ext-1',
      title: 'Meetup Title',
    });

    insertPlatformEvent(db, {
      event_id: event.id,
      platform: 'eventbrite',
      external_id: 'ext-2',
      title: 'Eventbrite Title',
    });

    const res = await request(app).get(`/api/events/${event.id}/conflicts`);
    expect(res.status).toBe(200);
    const titleConflict = res.body.conflicts.find((c: { field: string }) => c.field === 'title');
    expect(titleConflict).toBeDefined();
    expect(titleConflict.platformValues).toHaveLength(2);
    const platforms = titleConflict.platformValues.map((pv: { platform: string }) => pv.platform);
    expect(platforms).toContain('meetup');
    expect(platforms).toContain('eventbrite');
  });

  it('returns platforms list with linked platform events', async () => {
    const { app, db, eventStore } = createTestApp();
    const event = eventStore.create({
      title: 'My Event',
      description: 'D',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'V',
      price: 5,
      capacity: 30,
      duration_minutes: 60,
    });

    insertPlatformEvent(db, {
      event_id: event.id,
      platform: 'headfirst',
      external_id: 'ext-hf',
      external_url: 'https://headfirstbristol.co.uk/event/1',
    });

    const res = await request(app).get(`/api/events/${event.id}/conflicts`);
    expect(res.status).toBe(200);
    expect(res.body.platforms).toHaveLength(1);
    expect(res.body.platforms[0].platform).toBe('headfirst');
    expect(res.body.platforms[0].externalUrl).toBe('https://headfirstbristol.co.uk/event/1');
  });
});

describe('POST /api/events/:id/conflicts/resolve', () => {
  it('updates hub event with provided field values and returns resolved fields', async () => {
    const { app, db, eventStore } = createTestApp();
    const event = eventStore.create({
      title: 'Old Hub Title',
      description: 'Description',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'Venue',
      price: 10,
      capacity: 50,
      duration_minutes: 120,
    });

    insertPlatformEvent(db, {
      event_id: event.id,
      platform: 'meetup',
      external_id: 'ext-1',
      title: 'Platform Title',
    });

    const res = await request(app)
      .post(`/api/events/${event.id}/conflicts/resolve`)
      .send({ updates: { title: 'Platform Title' } });

    expect(res.status).toBe(200);
    expect(res.body.resolved).toContain('title');
    expect(res.body.success).toBe(true);
    expect(res.body.errors).toEqual([]);
  });

  it('returns 404 for nonexistent event', async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post('/api/events/nonexistent-id/conflicts/resolve')
      .send({ updates: { title: 'New Title' } });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Event not found');
  });

  it('returns 400 when updates is empty', async () => {
    const { app, eventStore } = createTestApp();
    const event = eventStore.create({
      title: 'Event',
      description: 'D',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'V',
      price: 5,
      capacity: 20,
      duration_minutes: 60,
    });

    const res = await request(app)
      .post(`/api/events/${event.id}/conflicts/resolve`)
      .send({ updates: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-empty/);
  });

  it('returns 400 when updates is missing', async () => {
    const { app, eventStore } = createTestApp();
    const event = eventStore.create({
      title: 'Event',
      description: 'D',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'V',
      price: 5,
      capacity: 20,
      duration_minutes: 60,
    });

    const res = await request(app)
      .post(`/api/events/${event.id}/conflicts/resolve`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-empty/);
  });

  it('reports remaining conflicts for fields not yet resolved', async () => {
    const { app, db, eventStore } = createTestApp();
    const event = eventStore.create({
      title: 'Hub Title',
      description: 'Hub Description',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'Hub Venue',
      price: 10,
      capacity: 50,
      duration_minutes: 120,
    });

    insertPlatformEvent(db, {
      event_id: event.id,
      platform: 'meetup',
      external_id: 'ext-1',
      title: 'Platform Title',
      venue: 'Platform Venue',
    });

    // Only resolve the title, not the venue
    const res = await request(app)
      .post(`/api/events/${event.id}/conflicts/resolve`)
      .send({ updates: { title: 'Platform Title' } });

    expect(res.status).toBe(200);
    expect(res.body.resolved).toContain('title');
    const venueRemaining = res.body.remaining.find(
      (c: { field: string }) => c.field === 'venue',
    );
    expect(venueRemaining).toBeDefined();
    expect(res.body.success).toBe(false);
  });

  it('sets needsSync when platform events exist', async () => {
    const { app, db, eventStore } = createTestApp();
    const event = eventStore.create({
      title: 'Hub Title',
      description: 'D',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'V',
      price: 5,
      capacity: 20,
      duration_minutes: 60,
    });

    insertPlatformEvent(db, {
      event_id: event.id,
      platform: 'meetup',
      external_id: 'ext-1',
      title: 'Platform Title',
    });

    const res = await request(app)
      .post(`/api/events/${event.id}/conflicts/resolve`)
      .send({ updates: { title: 'Platform Title' } });

    expect(res.status).toBe(200);
    expect(res.body.needsSync).toBe(true);
  });

  it('needsSync is false when no platform events linked', async () => {
    const { app, eventStore } = createTestApp();
    const event = eventStore.create({
      title: 'Hub Title',
      description: 'D',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'V',
      price: 5,
      capacity: 20,
      duration_minutes: 60,
    });

    const res = await request(app)
      .post(`/api/events/${event.id}/conflicts/resolve`)
      .send({ updates: { title: 'New Title' } });

    expect(res.status).toBe(200);
    expect(res.body.needsSync).toBe(false);
  });
});

describe('GET /api/dashboard/conflicts', () => {
  it('returns empty when no events', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/dashboard/conflicts');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('returns empty when no platform events are linked', async () => {
    const { app, eventStore } = createTestApp();
    eventStore.create({
      title: 'Local Only',
      description: 'No platforms',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'V',
      price: 5,
      capacity: 20,
      duration_minutes: 60,
    });

    const res = await request(app).get('/api/dashboard/conflicts');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('returns events with cross-platform field mismatches', async () => {
    const { app, db, eventStore } = createTestApp();
    const event = eventStore.create({
      title: 'Hub Title',
      description: 'D',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'Venue A',
      price: 10,
      capacity: 50,
      duration_minutes: 120,
    });

    insertPlatformEvent(db, {
      event_id: event.id,
      platform: 'meetup',
      external_id: 'ext-1',
      title: 'Different Title',
      venue: 'Different Venue',
    });

    const res = await request(app).get('/api/dashboard/conflicts');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    const item = res.body.data[0];
    expect(item.eventId).toBe(event.id);
    expect(item.eventTitle).toBe('Hub Title');
    expect(item.conflictCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(item.platforms)).toBe(true);
    expect(Array.isArray(item.fields)).toBe(true);
    expect(item.platforms).toContain('meetup');
  });

  it('returns empty when hub and platform data match', async () => {
    const { app, db, eventStore } = createTestApp();
    const event = eventStore.create({
      title: 'Matching Event',
      description: 'Same description',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'Same Venue',
      price: 10,
      capacity: 50,
      duration_minutes: 120,
    });

    insertPlatformEvent(db, {
      event_id: event.id,
      platform: 'meetup',
      external_id: 'ext-1',
      title: 'Matching Event',
      description: 'Same description',
      date: '2030-06-01T19:00:00Z',
      venue: 'Same Venue',
      ticket_price: 10,
      capacity: 50,
    });

    const res = await request(app).get('/api/dashboard/conflicts');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('excludes archived events from conflict detection', async () => {
    const { app, db, eventStore } = createTestApp();
    const event = eventStore.create({
      title: 'Hub Title',
      description: 'D',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'Venue',
      price: 10,
      capacity: 50,
      duration_minutes: 120,
    });
    eventStore.update(event.id, { status: 'archived' } as never);

    insertPlatformEvent(db, {
      event_id: event.id,
      platform: 'meetup',
      external_id: 'ext-1',
      title: 'Different Title',
    });

    const res = await request(app).get('/api/dashboard/conflicts');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });
});
