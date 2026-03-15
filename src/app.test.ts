import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase, type Database } from './data/database.js';

function createTestApp() {
  const db = createDatabase(':memory:');
  return createApp({ db });
}

function createTestAppWithDb() {
  const db = createDatabase(':memory:');
  return { app: createApp({ db }), db };
}

describe('App', () => {
  it('GET /health returns ok', async () => {
    const app = createTestApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', version: '0.1.0' });
  });

  it('GET /api/events returns empty array', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], total: 0 });
  });

  it('POST /api/events creates an event', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/events')
      .send({
        title: 'Test Event',
        description: 'A test event',
        start_time: '2026-04-15T19:00:00Z',
        venue: 'Test Venue',
        price: 10,
        capacity: 50,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Test Event');
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe('draft');
  });

  it('POST /api/events returns 400 for invalid input', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/events').send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Validation');
  });

  it('GET /api/events/:id returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/events/nonexistent');
    expect(res.status).toBe(404);
  });

  it('GET /api/services returns default services', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/services');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0].platform).toBe('eventbrite');
    expect(res.body.data[0].connected).toBe(false);
  });

  it('POST /api/services/:platform/connect connects a service', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/services/meetup/connect')
      .send({ apiKey: 'test-key' });
    expect(res.status).toBe(200);
    expect(res.body.data.connected).toBe(true);
    expect(res.body.data.connectedAt).toBeDefined();
  });

  it('GET /api/sync/log returns empty log', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/sync/log');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  // ── Single Event CRUD ──────────────────────────────────

  it('PUT /api/events/:id updates an event', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Original', description: 'Desc', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 5, capacity: 20,
    });
    const res = await request(app)
      .put(`/api/events/${created.body.data.id}`)
      .send({ title: 'Updated', price: 15 });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated');
    expect(res.body.data.price).toBe(15);
    expect(res.body.data.description).toBe('Desc'); // unchanged
  });

  it('PUT /api/events/:id returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).put('/api/events/nonexistent').send({ title: 'X' });
    expect(res.status).toBe(404);
  });

  it('PUT /api/events/:id returns 400 for invalid input', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Test', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app)
      .put(`/api/events/${created.body.data.id}`)
      .send({ price: -5 });
    expect(res.status).toBe(400);
  });

  it('DELETE /api/events/:id removes an event', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'ToDelete', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).delete(`/api/events/${created.body.data.id}`);
    expect(res.status).toBe(204);
    const check = await request(app).get(`/api/events/${created.body.data.id}`);
    expect(check.status).toBe(404);
  });

  it('DELETE /api/events/:id returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).delete('/api/events/nonexistent');
    expect(res.status).toBe(404);
  });

  it('POST /api/events/:id/duplicate clones an event', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Original', description: 'Desc', start_time: '2030-01-01T19:00:00Z',
      venue: 'Hall', price: 10, capacity: 50,
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/duplicate`);
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Copy of Original');
    expect(res.body.data.id).not.toBe(created.body.data.id);
    expect(res.body.data.venue).toBe('Hall');
    expect(res.body.data.status).toBe('draft');
  });

  it('POST /api/events/:id/duplicate copies category', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Cat Event', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10, category: 'Social',
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/duplicate`);
    expect(res.status).toBe(201);
    expect(res.body.data.category).toBe('Social');
    expect(res.body.data.title).toBe('Copy of Cat Event');
  });

  it('POST /api/events/:id/duplicate returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/events/nonexistent/duplicate');
    expect(res.status).toBe(404);
  });

  // ── Services ──────────────────────────────────────────

  it('POST /api/services/:platform/disconnect disconnects a service', async () => {
    const app = createTestApp();
    // First connect
    await request(app).post('/api/services/meetup/connect').send({ apiKey: 'key' });
    // Then disconnect
    const res = await request(app).post('/api/services/meetup/disconnect');
    expect(res.status).toBe(200);
    expect(res.body.data.connected).toBe(false);
    expect(res.body.data.connectedAt).toBeUndefined();
  });

  it('POST /api/services/:platform/connect returns 400 for invalid platform', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/services/fakebook/connect').send({ apiKey: 'key' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid platform');
  });

  it('POST /api/services/:platform/disconnect returns 400 for invalid platform', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/services/fakebook/disconnect');
    expect(res.status).toBe(400);
  });

  it('POST /api/services/:platform/setup stores extra data', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/services/meetup/setup')
      .send({ groupUrlname: 'my-group' });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(true);
  });

  it('POST /api/services/:platform/setup returns 400 for invalid platform', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/services/fakebook/setup')
      .send({ key: 'val' });
    expect(res.status).toBe(400);
  });

  it('POST /api/services/:platform/disconnect cleans up synced events', async () => {
    const { app, db } = createTestAppWithDb();
    // Connect meetup
    await request(app).post('/api/services/meetup/connect').send({});
    // Create an event and link it as a platform event
    const created = await request(app).post('/api/events').send({
      title: 'Synced Event', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const eventId = created.body.data.id;
    // Simulate: set sync_status to synced and create a platform_event link
    db.prepare("UPDATE events SET sync_status = 'synced' WHERE id = ?").run(eventId);
    db.prepare("INSERT INTO platform_events (id, event_id, platform, external_id, status, synced_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      'pe-test', eventId, 'meetup', 'ext-1', 'active', new Date().toISOString()
    );
    // Disconnect should clean up the synced event
    const res = await request(app).post('/api/services/meetup/disconnect');
    expect(res.status).toBe(200);
    // Event should be deleted (it was synced with no other platform links)
    const check = await request(app).get(`/api/events/${eventId}`);
    expect(check.status).toBe(404);
  });

  it('POST /api/services/:platform/disconnect resets modified events to local_only', async () => {
    const { app, db } = createTestAppWithDb();
    await request(app).post('/api/services/meetup/connect').send({});
    const created = await request(app).post('/api/events').send({
      title: 'Modified Event', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const eventId = created.body.data.id;
    db.prepare("UPDATE events SET sync_status = 'modified' WHERE id = ?").run(eventId);
    db.prepare("INSERT INTO platform_events (id, event_id, platform, external_id, status, synced_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      'pe-test2', eventId, 'meetup', 'ext-2', 'active', new Date().toISOString()
    );
    await request(app).post('/api/services/meetup/disconnect');
    // Event should NOT be deleted (was modified), but should be reset to local_only
    const check = await request(app).get(`/api/events/${eventId}`);
    expect(check.status).toBe(200);
    expect(check.body.data.sync_status).toBe('local_only');
  });

  // ── Scores ────────────────────────────────────────────

  it('GET /api/events/:id/score returns null for unscored event', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Test', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).get(`/api/events/${created.body.data.id}/score`);
    expect(res.status).toBe(200);
    expect(res.body.score).toBeNull();
  });

  it('POST /api/events/:id/score returns a prompt', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Score Me', description: 'Great event', start_time: '2030-01-01T19:00:00Z',
      venue: 'Bristol', price: 10, capacity: 50,
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/score`);
    expect(res.status).toBe(200);
    expect(res.body.prompt).toContain('Score Me');
    expect(res.body.eventId).toBe(created.body.data.id);
  });

  it('POST /api/events/:id/score returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/events/nonexistent/score');
    expect(res.status).toBe(404);
  });

  it('POST /api/events/:id/score/save persists score', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Scored', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const saveRes = await request(app)
      .post(`/api/events/${created.body.data.id}/score/save`)
      .send({ overall: 75, breakdown: { seo: 80, timing: 70 }, suggestions: [] });
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.success).toBe(true);

    // Verify it's retrievable
    const getRes = await request(app).get(`/api/events/${created.body.data.id}/score`);
    expect(getRes.body.score.overall).toBe(75);
    expect(getRes.body.score.breakdown.seo).toBe(80);
  });

  it('POST /api/events/:id/score/save returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/events/nonexistent/score/save')
      .send({ overall: 50, breakdown: {}, suggestions: [] });
    expect(res.status).toBe(404);
  });

  it('POST /api/events/:id/score/save returns 400 for invalid overall', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Test', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app)
      .post(`/api/events/${created.body.data.id}/score/save`)
      .send({ overall: 'not-a-number', breakdown: {}, suggestions: [] });
    expect(res.status).toBe(400);
  });

  // ── Filters ───────────────────────────────────────────

  it('GET /api/events?status=draft filters by status', async () => {
    const app = createTestApp();
    // Create an event (defaults to draft)
    await request(app).post('/api/events').send({
      title: 'Draft Event', description: 'Desc', start_time: '2030-01-01T19:00:00Z',
      venue: 'Venue', price: 0, capacity: 10,
    });
    const res = await request(app).get('/api/events?status=draft');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const resPublished = await request(app).get('/api/events?status=published');
    expect(resPublished.body.data).toHaveLength(0);
  });

  it('GET /api/events?search=xyz filters by title', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Board Game Night', description: 'Fun', start_time: '2030-01-01T19:00:00Z',
      venue: 'Pub', price: 5, capacity: 20,
    });
    await request(app).post('/api/events').send({
      title: 'Yoga Session', description: 'Calm', start_time: '2030-01-02T19:00:00Z',
      venue: 'Studio', price: 10, capacity: 15,
    });
    const res = await request(app).get('/api/events?search=board');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Board Game Night');
  });

  it('GET /api/events?search=calm also searches descriptions', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Evening Walk', description: 'A calm relaxing stroll', start_time: '2030-01-01T19:00:00Z',
      venue: 'Park', price: 0, capacity: 20,
    });
    await request(app).post('/api/events').send({
      title: 'Punk Show', description: 'Loud music', start_time: '2030-01-02T19:00:00Z',
      venue: 'Venue', price: 10, capacity: 50,
    });
    const res = await request(app).get('/api/events?search=calm');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Evening Walk');
  });

  it('GET /api/events?upcoming=true filters to future events', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Past Event', description: 'Done', start_time: '2020-01-01T19:00:00Z',
      venue: 'Gone', price: 0, capacity: 10,
    });
    await request(app).post('/api/events').send({
      title: 'Future Event', description: 'Coming', start_time: '2030-06-01T19:00:00Z',
      venue: 'Soon', price: 0, capacity: 10,
    });
    const res = await request(app).get('/api/events?upcoming=true');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Future Event');
  });

  it('GET /api/events?venue=studio filters by venue', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Yoga', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'Yoga Studio', price: 5, capacity: 20,
    });
    await request(app).post('/api/events').send({
      title: 'Pub Quiz', description: 'D', start_time: '2030-01-02T19:00:00Z',
      venue: 'The Lanes', price: 0, capacity: 50,
    });
    const res = await request(app).get('/api/events?venue=studio');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Yoga');
  });

  it('GET /api/events?start_after=...&start_before=... filters by date range', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Early', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    await request(app).post('/api/events').send({
      title: 'Mid', description: 'D', start_time: '2030-03-15T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    await request(app).post('/api/events').send({
      title: 'Late', description: 'D', start_time: '2030-06-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).get('/api/events?start_after=2030-02-01T00:00:00Z&start_before=2030-04-01T00:00:00Z');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Mid');
  });

  it('GET /api/events?category=social filters by category', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Social Event', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10, category: 'Social',
    });
    await request(app).post('/api/events').send({
      title: 'Tech Meetup', description: 'D', start_time: '2030-01-02T19:00:00Z',
      venue: 'V', price: 0, capacity: 10, category: 'Tech',
    });
    await request(app).post('/api/events').send({
      title: 'No Category', description: 'D', start_time: '2030-01-03T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).get('/api/events?category=social');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Social Event');
    expect(res.body.data[0].category).toBe('Social');
  });

  it('POST /api/events creates event with category', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/events').send({
      title: 'Categorized', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10, category: 'Food & Drink',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.category).toBe('Food & Drink');
  });

  it('PUT /api/events/:id updates category', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Update Cat', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app)
      .put(`/api/events/${created.body.data.id}`)
      .send({ category: 'Wellness' });
    expect(res.status).toBe(200);
    expect(res.body.data.category).toBe('Wellness');
  });

  it('GET /api/events?start_after=... filters events after date', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Old', description: 'D', start_time: '2020-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    await request(app).post('/api/events').send({
      title: 'New', description: 'D', start_time: '2030-06-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).get('/api/events?start_after=2025-01-01T00:00:00Z');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('New');
  });

  it('GET /api/sync/dashboard/summary returns stats', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/sync/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.body.data.totalEvents).toBe(0);
    expect(res.body.data.byPlatform).toEqual({ meetup: 0, eventbrite: 0, headfirst: 0 });
  });

  // ── Sorting ───────────────────────────────────────────

  it('GET /api/events?sort_by=title&order=asc sorts alphabetically', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Zebra Night', description: 'Z', start_time: '2030-01-01T19:00:00Z',
      venue: 'Zoo', price: 5, capacity: 20,
    });
    await request(app).post('/api/events').send({
      title: 'Alpha Party', description: 'A', start_time: '2030-01-02T19:00:00Z',
      venue: 'Club', price: 10, capacity: 30,
    });
    const res = await request(app).get('/api/events?sort_by=title&order=asc');
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].title).toBe('Alpha Party');
    expect(res.body.data[1].title).toBe('Zebra Night');
  });

  it('GET /api/events?sort_by=price&order=desc sorts by price descending', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Cheap', description: 'C', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 5, capacity: 20,
    });
    await request(app).post('/api/events').send({
      title: 'Expensive', description: 'E', start_time: '2030-01-02T19:00:00Z',
      venue: 'V', price: 50, capacity: 20,
    });
    const res = await request(app).get('/api/events?sort_by=price&order=desc');
    expect(res.body.data[0].title).toBe('Expensive');
    expect(res.body.data[1].title).toBe('Cheap');
  });

  it('GET /api/events?sort_by=created_at&order=asc sorts by creation date', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'First Created', description: 'D', start_time: '2030-06-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    await request(app).post('/api/events').send({
      title: 'Second Created', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).get('/api/events?sort_by=created_at&order=asc');
    expect(res.body.data[0].title).toBe('First Created');
    expect(res.body.data[1].title).toBe('Second Created');
  });

  it('GET /api/events?sort_by=invalid ignores invalid sort field', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Event', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).get('/api/events?sort_by=hacked');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  // ── Pagination ────────────────────────────────────────

  it('GET /api/events?per_page=1&page=1 returns first page', async () => {
    const app = createTestApp();
    for (let i = 1; i <= 3; i++) {
      await request(app).post('/api/events').send({
        title: `Event ${i}`, description: 'D', start_time: `2030-01-0${i}T19:00:00Z`,
        venue: 'V', price: 0, capacity: 10,
      });
    }
    const res = await request(app).get('/api/events?per_page=1&page=1');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(1);
    expect(res.body.per_page).toBe(1);
  });

  it('GET /api/events?per_page=2&page=2 returns second page', async () => {
    const app = createTestApp();
    for (let i = 1; i <= 5; i++) {
      await request(app).post('/api/events').send({
        title: `Event ${i}`, description: 'D', start_time: `2030-01-0${i}T19:00:00Z`,
        venue: 'V', price: 0, capacity: 10,
      });
    }
    const res = await request(app).get('/api/events?per_page=2&page=2&sort_by=start_time&order=asc');
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(5);
    expect(res.body.page).toBe(2);
  });

  it('GET /api/events?per_page=10&page=99 returns empty for out-of-range page', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Solo', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).get('/api/events?per_page=10&page=99');
    expect(res.body.data).toHaveLength(0);
    expect(res.body.total).toBe(1);
  });

  // ── Batch Status ──────────────────────────────────────

  it('PATCH /api/events/batch/status updates multiple events', async () => {
    const app = createTestApp();
    const e1 = await request(app).post('/api/events').send({
      title: 'Batch 1', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const e2 = await request(app).post('/api/events').send({
      title: 'Batch 2', description: 'D', start_time: '2030-01-02T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app)
      .patch('/api/events/batch/status')
      .send({ ids: [e1.body.data.id, e2.body.data.id], status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((r: { success: boolean }) => r.success)).toBe(true);

    // Verify the status changed
    const check = await request(app).get(`/api/events/${e1.body.data.id}`);
    expect(check.body.data.status).toBe('cancelled');
  });

  it('PATCH /api/events/batch/status returns 400 for empty ids', async () => {
    const app = createTestApp();
    const res = await request(app).patch('/api/events/batch/status').send({ ids: [], status: 'draft' });
    expect(res.status).toBe(400);
  });

  it('PATCH /api/events/batch/status returns 400 for non-string ids', async () => {
    const app = createTestApp();
    const res = await request(app)
      .patch('/api/events/batch/status')
      .send({ ids: [null, 123], status: 'draft' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('non-empty string');
  });

  it('PATCH /api/events/batch/status returns 400 for invalid status', async () => {
    const app = createTestApp();
    const res = await request(app).patch('/api/events/batch/status').send({ ids: ['x'], status: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('PATCH /api/events/batch/status handles missing events gracefully', async () => {
    const app = createTestApp();
    const e1 = await request(app).post('/api/events').send({
      title: 'Real', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app)
      .patch('/api/events/batch/status')
      .send({ ids: [e1.body.data.id, 'nonexistent'], status: 'published' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
    expect(res.body.data[1].success).toBe(false);
    expect(res.body.data[1].error).toBe('Not found');
  });

  // ── Batch Category ───────────────────────────────────

  it('PATCH /api/events/batch/category updates category for multiple events', async () => {
    const app = createTestApp();
    const e1 = await request(app).post('/api/events').send({
      title: 'Cat 1', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const e2 = await request(app).post('/api/events').send({
      title: 'Cat 2', description: 'D', start_time: '2030-01-02T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app)
      .patch('/api/events/batch/category')
      .send({ ids: [e1.body.data.id, e2.body.data.id], category: 'Social' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
    // Verify
    const check1 = await request(app).get(`/api/events/${e1.body.data.id}`);
    expect(check1.body.data.category).toBe('Social');
  });

  it('PATCH /api/events/batch/category returns 400 for missing category', async () => {
    const app = createTestApp();
    const res = await request(app).patch('/api/events/batch/category').send({ ids: ['x'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('category');
  });

  // ── Batch Delete ──────────────────────────────────────

  it('DELETE /api/events/batch deletes multiple events', async () => {
    const app = createTestApp();
    const e1 = await request(app).post('/api/events').send({
      title: 'Del 1', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const e2 = await request(app).post('/api/events').send({
      title: 'Del 2', description: 'D', start_time: '2030-01-02T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app)
      .delete('/api/events/batch')
      .send({ ids: [e1.body.data.id, e2.body.data.id] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);

    // Verify they're gone
    const list = await request(app).get('/api/events');
    expect(list.body.data).toHaveLength(0);
  });

  it('DELETE /api/events/batch returns 400 for empty ids', async () => {
    const app = createTestApp();
    const res = await request(app).delete('/api/events/batch').send({ ids: [] });
    expect(res.status).toBe(400);
  });

  it('DELETE /api/events/batch handles missing events gracefully', async () => {
    const app = createTestApp();
    const e1 = await request(app).post('/api/events').send({
      title: 'Keep', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app)
      .delete('/api/events/batch')
      .send({ ids: [e1.body.data.id, 'ghost'] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(1);
    expect(res.body.data[1].success).toBe(false);
  });

  // ── CSV Export ────────────────────────────────────────

  it('GET /api/events/export/csv returns CSV content', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'CSV Event', description: 'For export', start_time: '2030-01-01T19:00:00Z',
      venue: 'Hall', price: 15, capacity: 100,
    });
    const res = await request(app).get('/api/events/export/csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('events.csv');
    const lines = res.text.split('\n');
    expect(lines[0]).toBe('id,title,description,start_time,end_time,duration_minutes,venue,price,capacity,category,status,sync_status,createdAt,updatedAt');
    expect(lines).toHaveLength(2); // header + 1 event
    expect(lines[1]).toContain('CSV Event');
  });

  it('GET /api/events/export/csv escapes commas in fields', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Event, with comma', description: 'Desc', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).get('/api/events/export/csv');
    expect(res.text).toContain('"Event, with comma"');
  });

  it('GET /api/events/export/csv?status=draft filters exported events', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Draft One', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).get('/api/events/export/csv?status=draft');
    const lines = res.text.split('\n');
    expect(lines).toHaveLength(2);
    const resPublished = await request(app).get('/api/events/export/csv?status=published');
    const pubLines = resPublished.text.split('\n');
    expect(pubLines).toHaveLength(1); // header only
  });

  it('GET /api/events/export/csv returns empty CSV for no events', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/events/export/csv');
    expect(res.status).toBe(200);
    const lines = res.text.split('\n');
    expect(lines).toHaveLength(1); // header only
  });

  // ── Calendar ──────────────────────────────────────────

  it('GET /api/events/calendar returns events grouped by date', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Morning', description: 'D', start_time: '2030-03-15T10:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    await request(app).post('/api/events').send({
      title: 'Evening', description: 'D', start_time: '2030-03-15T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    await request(app).post('/api/events').send({
      title: 'Next Day', description: 'D', start_time: '2030-03-16T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).get('/api/events/calendar');
    expect(res.status).toBe(200);
    expect(res.body.totalDays).toBe(2);
    expect(res.body.totalEvents).toBe(3);
    expect(res.body.data[0].date).toBe('2030-03-15');
    expect(res.body.data[0].events).toHaveLength(2);
    expect(res.body.data[1].date).toBe('2030-03-16');
    expect(res.body.data[1].events).toHaveLength(1);
  });

  it('GET /api/events/calendar?month=2030-03 filters by month', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'March', description: 'D', start_time: '2030-03-15T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    await request(app).post('/api/events').send({
      title: 'April', description: 'D', start_time: '2030-04-15T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).get('/api/events/calendar?month=2030-03');
    expect(res.body.totalEvents).toBe(1);
    expect(res.body.data[0].events[0].title).toBe('March');
  });

  it('GET /api/events/calendar returns empty for no events', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/events/calendar');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.totalDays).toBe(0);
    expect(res.body.totalEvents).toBe(0);
  });

  // ── Stats ─────────────────────────────────────────────

  it('GET /api/events/stats returns zeroes when empty', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/events/stats');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.byStatus).toEqual({ draft: 0, published: 0, cancelled: 0 });
    expect(res.body.data.bySyncStatus).toEqual({ synced: 0, modified: 0, local_only: 0 });
    expect(res.body.data.byCategory).toEqual({});
    expect(res.body.data.upcoming).toBe(0);
    expect(res.body.data.past).toBe(0);
  });

  it('GET /api/events/stats aggregates correctly', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Future Draft', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10, category: 'Social',
    });
    await request(app).post('/api/events').send({
      title: 'Past Draft', description: 'D', start_time: '2020-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10, category: 'Social',
    });
    await request(app).post('/api/events').send({
      title: 'Tech Event', description: 'D', start_time: '2030-02-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10, category: 'Tech',
    });
    const res = await request(app).get('/api/events/stats');
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.byStatus.draft).toBe(3);
    expect(res.body.data.upcoming).toBe(2);
    expect(res.body.data.past).toBe(1);
    expect(res.body.data.bySyncStatus.local_only).toBe(3);
    expect(res.body.data.byCategory).toEqual({ Social: 2, Tech: 1 });
  });

  // ── Photos ────────────────────────────────────────────

  it('GET /api/events/:id/photos returns empty array for new event', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Photo Test', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).get(`/api/events/${created.body.data.id}/photos`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('GET /api/events/:id/photos returns inserted photos', async () => {
    const { app, db } = createTestAppWithDb();
    const created = await request(app).post('/api/events').send({
      title: 'With Photos', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const eventId = created.body.data.id;
    // Insert photos directly into DB
    db.prepare('INSERT INTO event_photos (event_id, photo_path, source, position, is_cover) VALUES (?, ?, ?, ?, ?)').run(eventId, '/data/photos/test1.jpg', 'upload', 0, 1);
    db.prepare('INSERT INTO event_photos (event_id, photo_path, source, position, is_cover) VALUES (?, ?, ?, ?, ?)').run(eventId, '/data/photos/test2.jpg', 'unsplash', 1, 0);

    const res = await request(app).get(`/api/events/${eventId}/photos`);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].url).toBe('/data/photos/test1.jpg');
    expect(res.body.data[0].isCover).toBe(true);
    expect(res.body.data[0].position).toBe(0);
    expect(res.body.data[1].url).toBe('/data/photos/test2.jpg');
    expect(res.body.data[1].isCover).toBe(false);
  });

  it('PATCH /api/events/:id/photos/reorder changes photo order', async () => {
    const { app, db } = createTestAppWithDb();
    const created = await request(app).post('/api/events').send({
      title: 'Reorder', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const eventId = created.body.data.id;
    db.prepare('INSERT INTO event_photos (event_id, photo_path, source, position, is_cover) VALUES (?, ?, ?, ?, ?)').run(eventId, '/photos/a.jpg', 'upload', 0, 1);
    db.prepare('INSERT INTO event_photos (event_id, photo_path, source, position, is_cover) VALUES (?, ?, ?, ?, ?)').run(eventId, '/photos/b.jpg', 'upload', 1, 0);

    // Get photo IDs
    const photos = await request(app).get(`/api/events/${eventId}/photos`);
    const [p1, p2] = photos.body.data;

    // Reverse order
    const res = await request(app)
      .patch(`/api/events/${eventId}/photos/reorder`)
      .send({ order: [p2.id, p1.id] });
    expect(res.status).toBe(200);
    expect(res.body.data[0].id).toBe(p2.id);
    expect(res.body.data[0].isCover).toBe(true); // first is now cover
    expect(res.body.data[1].id).toBe(p1.id);
    expect(res.body.data[1].isCover).toBe(false);
  });

  it('PATCH /api/events/:id/photos/reorder returns 400 for missing order', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Bad Reorder', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app)
      .patch(`/api/events/${created.body.data.id}/photos/reorder`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('DELETE /api/events/:id/photos/:photoId removes a photo', async () => {
    const { app, db } = createTestAppWithDb();
    const created = await request(app).post('/api/events').send({
      title: 'Delete Photo', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const eventId = created.body.data.id;
    db.prepare('INSERT INTO event_photos (event_id, photo_path, source, position, is_cover) VALUES (?, ?, ?, ?, ?)').run(eventId, '/photos/del.jpg', 'upload', 0, 1);

    const photos = await request(app).get(`/api/events/${eventId}/photos`);
    const photoId = photos.body.data[0].id;

    const res = await request(app).delete(`/api/events/${eventId}/photos/${photoId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify it's gone
    const after = await request(app).get(`/api/events/${eventId}/photos`);
    expect(after.body.data).toHaveLength(0);
  });

  it('DELETE /api/events/:id/photos/:photoId returns 404 for missing photo', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'No Photo', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).delete(`/api/events/${created.body.data.id}/photos/99999`);
    expect(res.status).toBe(404);
  });

  it('DELETE /api/events/:id/photos/:photoId returns 400 for non-numeric id', async () => {
    const app = createTestApp();
    const res = await request(app).delete('/api/events/someEvent/photos/notANumber');
    expect(res.status).toBe(400);
  });

  // ── Optimize ──────────────────────────────────────────

  it('POST /api/events/:id/optimize returns prompt and saves snapshot', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Optimize Me', description: 'A great event', start_time: '2030-01-01T19:00:00Z',
      venue: 'Bristol', price: 10, capacity: 50,
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/optimize`);
    expect(res.status).toBe(200);
    expect(res.body.prompt).toContain('Optimize Me');
    expect(res.body.eventId).toBe(created.body.data.id);
  });

  it('POST /api/events/:id/optimize returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/events/nonexistent/optimize');
    expect(res.status).toBe(404);
  });

  it('POST /api/events/:id/optimize/undo restores snapshot', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Original Title', description: 'Original desc', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const id = created.body.data.id;
    // Create snapshot
    await request(app).post(`/api/events/${id}/optimize`);
    // Modify the event
    await request(app).put(`/api/events/${id}`).send({ title: 'Optimized Title', description: 'Better desc' });
    // Undo
    const res = await request(app).post(`/api/events/${id}/optimize/undo`);
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Original Title');
    expect(res.body.data.description).toBe('Original desc');
  });

  it('POST /api/events/:id/optimize/undo returns 404 with no snapshot', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'No Snapshot', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/optimize/undo`);
    expect(res.status).toBe(404);
  });

  it('POST /api/events/:id/magic-fill returns a prompt', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Magic Me', description: 'Fill me', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 5, capacity: 30,
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/magic-fill`);
    expect(res.status).toBe(200);
    expect(res.body.prompt).toContain('Magic Me');
    expect(res.body.eventId).toBe(created.body.data.id);
  });

  it('POST /api/events/:id/magic-fill returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/events/nonexistent/magic-fill');
    expect(res.status).toBe(404);
  });

  it('POST /api/events/:id/optimize/photos/generate-prompt returns a prompt', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Photo Prompt', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'Bristol Hall', price: 0, capacity: 10,
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/optimize/photos/generate-prompt`);
    expect(res.status).toBe(200);
    expect(res.body.prompt).toContain('Photo Prompt');
    expect(res.body.prompt).toContain('Bristol');
  });

  // ── Event Readiness ──────────────────────────────────

  it('GET /api/events/:id/readiness returns readiness checks', async () => {
    const app = createTestApp();
    const longDesc = 'A'.repeat(101); // passes 100+ char check
    const created = await request(app).post('/api/events').send({
      title: 'Ready Event Fully Prepared', description: longDesc, start_time: '2030-06-01T19:00:00Z',
      venue: 'The Lanes', price: 10, capacity: 50,
    });
    const res = await request(app).get(`/api/events/${created.body.data.id}/readiness`);
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(100);
    expect(res.body.data.ready).toBe(true);
    expect(res.body.data.checks).toHaveLength(7);
  });

  it('GET /api/events/:id/readiness shows failing checks for past event', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Past Event Test', description: 'Short desc', start_time: '2020-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).get(`/api/events/${created.body.data.id}/readiness`);
    expect(res.status).toBe(200);
    expect(res.body.data.ready).toBe(false); // start_time is in the past
    expect(res.body.data.score).toBeLessThan(100);
    const failedChecks = res.body.data.checks.filter((c: any) => !c.passed);
    expect(failedChecks.length).toBeGreaterThan(0);
  });

  it('GET /api/events/:id/readiness returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/events/nonexistent/readiness');
    expect(res.status).toBe(404);
  });

  // ── Event Recurrence ─────────────────────────────────

  it('POST /api/events/:id/recur creates weekly recurring events', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Weekly Quiz', description: 'Fun quiz', start_time: '2030-03-01T19:00:00Z',
      venue: 'The Lanes', price: 5, capacity: 40,
    });
    const res = await request(app)
      .post(`/api/events/${created.body.data.id}/recur`)
      .send({ frequency: 'weekly', count: 3 });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.count).toBe(3);
    // All should have the same title and venue
    for (const ev of res.body.data) {
      expect(ev.title).toBe('Weekly Quiz');
      expect(ev.venue).toBe('The Lanes');
      expect(ev.price).toBe(5);
    }
    // Dates should be 1, 2, 3 weeks after original
    const d1 = new Date(res.body.data[0].start_time);
    const d2 = new Date(res.body.data[1].start_time);
    expect(d2.getTime() - d1.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('POST /api/events/:id/recur creates monthly recurring events', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Monthly Social', description: 'D', start_time: '2030-01-15T19:00:00Z',
      venue: 'V', price: 0, capacity: 30,
    });
    const res = await request(app)
      .post(`/api/events/${created.body.data.id}/recur`)
      .send({ frequency: 'monthly', count: 2 });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(2);
    // First recurrence should be Feb 15, second March 15
    expect(res.body.data[0].start_time).toContain('2030-02-15');
    expect(res.body.data[1].start_time).toContain('2030-03-15');
  });

  it('POST /api/events/:id/recur returns 400 for invalid frequency', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Bad Recur', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app)
      .post(`/api/events/${created.body.data.id}/recur`)
      .send({ frequency: 'daily', count: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('frequency');
  });

  it('POST /api/events/:id/recur returns 400 for invalid count', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Bad Count', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app)
      .post(`/api/events/${created.body.data.id}/recur`)
      .send({ frequency: 'weekly', count: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('count');
  });

  it('POST /api/events/:id/recur returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/events/nonexistent/recur')
      .send({ frequency: 'weekly', count: 2 });
    expect(res.status).toBe(404);
  });

  // ── Event Platforms ────────────────────────────────────

  it('GET /api/events/:id/platforms returns empty for new event', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Platforms Test', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).get(`/api/events/${created.body.data.id}/platforms`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('GET /api/events/:id/platforms returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/events/nonexistent/platforms');
    expect(res.status).toBe(404);
  });

  // ── Event Log ──────────────────────────────────────────

  it('GET /api/events/:id/log returns empty log for new event', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Log Test', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).get(`/api/events/${created.body.data.id}/log`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('GET /api/events/:id/log returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/events/nonexistent/log');
    expect(res.status).toBe(404);
  });

  it('POST /api/events/:id/optimize/photos/search returns 503 without API key', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Search Photos', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app)
      .post(`/api/events/${created.body.data.id}/optimize/photos/search`)
      .send({ query: 'test' });
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('UNSPLASH_ACCESS_KEY');
  });

  // ── Sync Push Validation ────────────────────────────────

  it('POST /api/sync/push returns 400 without eventId', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/sync/push').send({ platform: 'meetup' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('eventId');
  });

  it('POST /api/sync/push returns 400 without platform', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/sync/push').send({ eventId: 'some-id' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('platform');
  });

  it('POST /api/sync/push returns 400 for invalid platform', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/sync/push').send({ eventId: 'some-id', platform: 'twitter' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid platform');
  });

  it('POST /api/sync/push returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/sync/push').send({ eventId: 'nonexistent', platform: 'meetup' });
    expect(res.status).toBe(404);
  });

  it('POST /api/sync/push returns 400 if event is not modified', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Not Modified', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).post('/api/sync/push').send({
      eventId: created.body.data.id, platform: 'meetup',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('local_only');
  });

  // ── Sync Push-All Validation ────────────────────────────

  it('POST /api/sync/push-all returns 400 without eventId', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/sync/push-all').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('eventId');
  });

  it('POST /api/sync/push-all returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/sync/push-all').send({ eventId: 'nonexistent' });
    expect(res.status).toBe(404);
  });

  it('POST /api/sync/push-all returns 400 if no platform events linked', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'No Links', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).post('/api/sync/push-all').send({ eventId: created.body.data.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No platform events');
  });

  // ── Sync Pull-Event Validation ──────────────────────────

  it('POST /api/sync/pull-event returns 400 without eventId', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/sync/pull-event').send({ platform: 'meetup' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('eventId');
  });

  it('POST /api/sync/pull-event returns 400 without platform', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/sync/pull-event').send({ eventId: 'some-id' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('platform');
  });

  it('POST /api/sync/pull-event returns 400 for invalid platform', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/sync/pull-event').send({ eventId: 'x', platform: 'twitter' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid platform');
  });

  it('POST /api/sync/pull-event returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/sync/pull-event').send({ eventId: 'nonexistent', platform: 'meetup' });
    expect(res.status).toBe(404);
  });

  it('POST /api/sync/pull-event returns 404 if no platform event for that platform', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'No PE', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).post('/api/sync/pull-event').send({
      eventId: created.body.data.id, platform: 'meetup',
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('No platform event');
  });

  // ── Publish Validation ──────────────────────────────────

  it('POST /api/events/:id/publish returns 400 without platforms', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Pub Test', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/publish`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No platforms');
  });

  it('POST /api/events/:id/publish returns 400 for empty platforms array', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Pub Test 2', description: 'D', start_time: '2030-01-01T19:00:00Z',
      venue: 'V', price: 0, capacity: 10,
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/publish`).send({ platforms: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No platforms');
  });

  it('POST /api/events/:id/publish returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/events/nonexistent/publish').send({ platforms: ['meetup'] });
    expect(res.status).toBe(404);
  });

  // ── Sync Log ────────────────────────────────────────────

  it('GET /api/sync/log returns empty log initially', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/sync/log');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('GET /api/sync/log?limit=5 respects limit parameter', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/sync/log?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  // ── Sync Pull (no connected services) ───────────────────

  it('POST /api/sync/pull returns zero pulled when no services connected', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/sync/pull');
    expect(res.status).toBe(200);
    expect(res.body.data.pulled).toBe(0);
    expect(res.body.data.updated).toBe(0);
    expect(res.body.data.conflicts).toEqual([]);
  });

  // ── Dashboard Routes ────────────────────────────────────

  it('GET /api/dashboard/attention returns items array', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/dashboard/attention');
    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.count).toBe('number');
  });

  it('GET /api/dashboard/attention flags missing description', async () => {
    const { app, db } = createTestAppWithDb();
    // Insert event directly with short description and future date
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    db.prepare(`INSERT INTO events (id, title, description, start_time, venue, price, capacity, status, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'attn-1', 'Test Event', 'Short', futureDate.toISOString(), 'Venue', 10, 50, 'draft', 'local_only',
      new Date().toISOString(), new Date().toISOString()
    );
    const res = await request(app).get('/api/dashboard/attention');
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    const problems = res.body.items.flatMap((i: { problems: Array<{ problem: string }> }) => i.problems.map((p: { problem: string }) => p.problem));
    expect(problems).toContain('missing_description');
  });

  it('GET /api/dashboard/attention flags no photos', async () => {
    const { app, db } = createTestAppWithDb();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    db.prepare(`INSERT INTO events (id, title, description, start_time, venue, price, capacity, status, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'attn-2', 'Photo Test', 'A sufficiently long description for testing purposes here it is', futureDate.toISOString(), 'Venue', 10, 50, 'draft', 'local_only',
      new Date().toISOString(), new Date().toISOString()
    );
    const res = await request(app).get('/api/dashboard/attention');
    expect(res.status).toBe(200);
    const problems = res.body.items.flatMap((i: { problems: Array<{ problem: string }> }) => i.problems.map((p: { problem: string }) => p.problem));
    expect(problems).toContain('no_photos');
  });

  it('GET /api/dashboard/upcoming returns events array', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/dashboard/upcoming');
    expect(res.status).toBe(200);
    expect(res.body.events).toBeDefined();
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  it('GET /api/dashboard/upcoming includes readiness info', async () => {
    const app = createTestApp();
    // Create a future event
    await request(app).post('/api/events').send({
      title: 'Upcoming Test',
      description: 'A great event with sufficient description length for the readiness check to pass',
      start_time: '2030-06-01T19:00:00Z',
      venue: 'Bristol Pub',
      price: 15,
      capacity: 30,
    });
    const res = await request(app).get('/api/dashboard/upcoming');
    expect(res.status).toBe(200);
    expect(res.body.events.length).toBeGreaterThanOrEqual(1);
    const ev = res.body.events[0];
    expect(typeof ev.readiness).toBe('number');
    expect(ev.passed).toBeDefined();
    expect(ev.total).toBe(7);
    expect(ev.missing).toBeDefined();
    expect(ev.timeUntil).toBeDefined();
  });

  it('GET /api/dashboard/performance returns stats', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/dashboard/performance');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(typeof res.body.data.upcomingCount).toBe('number');
    expect(typeof res.body.data.attendeesLast30).toBe('number');
    expect(['up', 'down', 'flat']).toContain(res.body.data.attendeesTrend);
    expect(typeof res.body.data.revenueLast30).toBe('number');
    expect(['up', 'down', 'flat']).toContain(res.body.data.revenueTrend);
  });

  it('POST /api/dashboard/suggestions returns a prompt', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/dashboard/suggestions');
    expect(res.status).toBe(200);
    expect(typeof res.body.prompt).toBe('string');
    expect(res.body.prompt).toContain('Socialise');
  });

  it('PUT /api/dashboard/suggestions stores and GET retrieves them', async () => {
    const app = createTestApp();
    const suggestions = [
      { title: 'Add more events', body: 'You need more events in March', priority: 'high' },
    ];
    const putRes = await request(app).put('/api/dashboard/suggestions').send({ suggestions });
    expect(putRes.status).toBe(200);
    expect(putRes.body.ok).toBe(true);

    const getRes = await request(app).get('/api/dashboard/suggestions');
    expect(getRes.status).toBe(200);
    expect(getRes.body.suggestions).toEqual(suggestions);
    expect(getRes.body.generatedAt).toBeDefined();
  });

  it('PUT /api/dashboard/suggestions returns 400 for non-array', async () => {
    const app = createTestApp();
    const res = await request(app).put('/api/dashboard/suggestions').send({ suggestions: 'not an array' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('array');
  });

  it('GET /api/dashboard/suggestions returns null when none stored', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/dashboard/suggestions');
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toBeNull();
  });

  // ── Analytics Routes ────────────────────────────────────

  it('GET /api/analytics/summary returns aggregate stats', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/analytics/summary');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(typeof res.body.data.total_events).toBe('number');
    expect(typeof res.body.data.total_attendees).toBe('number');
    expect(typeof res.body.data.total_revenue).toBe('number');
    expect(typeof res.body.data.avg_fill_rate).toBe('number');
  });

  it('GET /api/analytics/summary reflects created events', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Analytics Event', description: 'Test', start_time: '2030-01-01T19:00:00Z',
      venue: 'Venue', price: 10, capacity: 50,
    });
    const res = await request(app).get('/api/analytics/summary');
    expect(res.status).toBe(200);
    expect(res.body.data.total_events).toBe(1);
  });

  it('GET /api/analytics/trends returns chart data', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/analytics/trends');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.attendanceByMonth)).toBe(true);
    expect(Array.isArray(res.body.data.revenueByMonth)).toBe(true);
    expect(Array.isArray(res.body.data.fillByType)).toBe(true);
    expect(Array.isArray(res.body.data.timingData)).toBe(true);
  });

  it('GET /api/analytics/trends accepts date range params', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/analytics/trends?startDate=2025-01-01&endDate=2025-12-31');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it('POST /api/analytics/insights returns a prompt', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/analytics/insights');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(typeof res.body.data.prompt).toBe('string');
    expect(res.body.data.prompt).toContain('Socialise');
  });

  // ── Template Routes ─────────────────────────────────────

  it('GET /api/templates returns empty array initially', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/templates');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('POST /api/templates creates a template', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/templates').send({
      name: 'Weekly Quiz',
      title: 'Pub Quiz Night',
      description: 'Weekly quiz at the local pub',
      venue: 'The Crown',
      durationMinutes: 120,
      price: 5,
      capacity: 40,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Weekly Quiz');
    expect(res.body.data.title).toBe('Pub Quiz Night');
    expect(res.body.data.id).toBeDefined();
  });

  it('POST /api/templates returns 400 without name', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/templates').send({
      title: 'No Name Template',
      durationMinutes: 60,
      price: 0,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Name');
  });

  it('POST /api/templates returns 400 without title', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/templates').send({
      name: 'No Title',
      durationMinutes: 60,
      price: 0,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('title');
  });

  it('GET /api/templates/:id returns a template', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/templates').send({
      name: 'Fetch Me', title: 'Fetchable Template',
      durationMinutes: 90, price: 10,
    });
    const res = await request(app).get(`/api/templates/${created.body.data.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Fetch Me');
  });

  it('GET /api/templates/:id returns 404 for missing template', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/templates/nonexistent');
    expect(res.status).toBe(404);
  });

  it('PUT /api/templates/:id updates a template', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/templates').send({
      name: 'Original', title: 'Original Title',
      durationMinutes: 60, price: 5,
    });
    const res = await request(app)
      .put(`/api/templates/${created.body.data.id}`)
      .send({ name: 'Updated', price: 15 });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated');
    expect(res.body.data.price).toBe(15);
    expect(res.body.data.title).toBe('Original Title'); // unchanged
  });

  it('PUT /api/templates/:id returns 404 for missing template', async () => {
    const app = createTestApp();
    const res = await request(app).put('/api/templates/nonexistent').send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  it('DELETE /api/templates/:id deletes a template', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/templates').send({
      name: 'Delete Me', title: 'To Be Deleted',
      durationMinutes: 60, price: 0,
    });
    const id = created.body.data.id;
    const res = await request(app).delete(`/api/templates/${id}`);
    expect(res.status).toBe(204);

    // Verify it's gone
    const getRes = await request(app).get(`/api/templates/${id}`);
    expect(getRes.status).toBe(404);
  });

  it('DELETE /api/templates/:id returns 404 for missing template', async () => {
    const app = createTestApp();
    const res = await request(app).delete('/api/templates/nonexistent');
    expect(res.status).toBe(404);
  });

  it('POST /api/templates/:id/create-event creates event from template', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/templates').send({
      name: 'Event Template', title: 'Template Event Title',
      description: 'A template description',
      venue: 'Template Venue',
      durationMinutes: 120, price: 10, capacity: 30,
    });
    const res = await request(app).post(`/api/templates/${created.body.data.id}/create-event`);
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Template Event Title');
    expect(res.body.data.description).toBe('A template description');
    expect(res.body.data.venue).toBe('Template Venue');
    expect(res.body.data.price).toBe(10);
    expect(res.body.data.capacity).toBe(30);
    expect(res.body.data.status).toBe('draft');
  });

  it('POST /api/templates/:id/create-event returns 404 for missing template', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/templates/nonexistent/create-event');
    expect(res.status).toBe(404);
  });

  // ── Score Routes ────────────────────────────────────────

  it('GET /api/events/:id/score returns null when no score exists', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Unscored Event', description: 'No score yet',
      start_time: '2030-01-01T19:00:00Z', venue: 'Pub', price: 5, capacity: 20,
    });
    const res = await request(app).get(`/api/events/${created.body.data.id}/score`);
    expect(res.status).toBe(200);
    expect(res.body.score).toBeNull();
  });

  it('POST /api/events/:id/score returns prompt', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Scorable Event', description: 'A great event to score',
      start_time: '2030-06-01T19:00:00Z', venue: 'Bristol Pub', price: 10, capacity: 40,
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/score`);
    expect(res.status).toBe(200);
    expect(typeof res.body.prompt).toBe('string');
    expect(res.body.eventId).toBe(created.body.data.id);
    expect(res.body.prompt).toContain('Scorable Event');
  });

  it('POST /api/events/:id/score returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/events/nonexistent/score');
    expect(res.status).toBe(404);
  });

  it('POST /api/events/:id/score/save stores score and GET retrieves it', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Score Save Test', description: 'Test event for scoring',
      start_time: '2030-06-01T19:00:00Z', venue: 'Bristol', price: 10, capacity: 40,
    });
    const id = created.body.data.id;

    const saveRes = await request(app).post(`/api/events/${id}/score/save`).send({
      overall: 72,
      breakdown: { seo: 60, timing: 80, pricing: 75, description: 70, photos: 65 },
      suggestions: [{ field: 'seo', current_issue: 'Title too generic', suggestion: 'Add location', impact: 10 }],
    });
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.success).toBe(true);

    const getRes = await request(app).get(`/api/events/${id}/score`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.score.overall).toBe(72);
    expect(getRes.body.score.breakdown.seo).toBe(60);
    expect(getRes.body.score.suggestions).toHaveLength(1);
  });

  it('POST /api/events/:id/score/save returns 400 for non-numeric overall', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Bad Score Test', description: 'Test',
      start_time: '2030-06-01T19:00:00Z', venue: 'V', price: 5, capacity: 20,
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/score/save`).send({
      overall: 'not a number',
      breakdown: {},
      suggestions: [],
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/events/:id/score/save returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/events/nonexistent/score/save').send({
      overall: 50, breakdown: {}, suggestions: [],
    });
    expect(res.status).toBe(404);
  });

  // ── Archive (soft-delete) ───────────────────────────────

  it('POST /api/events/batch/archive archives events', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Archive Me', description: 'Will be archived',
      start_time: '2030-01-01T19:00:00Z', venue: 'Pub', price: 5, capacity: 20,
    });
    const id = created.body.data.id;
    const res = await request(app).post('/api/events/batch/archive').send({ ids: [id] });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);

    // Archived events excluded from default list
    const listRes = await request(app).get('/api/events');
    expect(listRes.body.data.find((e: { id: string }) => e.id === id)).toBeUndefined();

    // But visible with include_archived=true
    const archivedRes = await request(app).get('/api/events?include_archived=true');
    const found = archivedRes.body.data.find((e: { id: string }) => e.id === id);
    expect(found).toBeDefined();
    expect(found.status).toBe('archived');
  });

  it('POST /api/events/batch/archive unarchives events', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Unarchive Me', description: 'Will be unarchived',
      start_time: '2030-01-01T19:00:00Z', venue: 'Pub', price: 5, capacity: 20,
    });
    const id = created.body.data.id;
    // Archive first
    await request(app).post('/api/events/batch/archive').send({ ids: [id] });
    // Unarchive
    const res = await request(app).post('/api/events/batch/archive').send({ ids: [id], unarchive: true });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);

    // Now visible in default list again
    const listRes = await request(app).get('/api/events');
    const found = listRes.body.data.find((e: { id: string }) => e.id === id);
    expect(found).toBeDefined();
    expect(found.status).toBe('draft');
  });

  it('POST /api/events/batch/archive returns 400 without ids', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/events/batch/archive').send({});
    expect(res.status).toBe(400);
  });

  it('GET /api/events?status=archived only returns archived events', async () => {
    const app = createTestApp();
    const c1 = await request(app).post('/api/events').send({
      title: 'Active Event', description: 'Still active',
      start_time: '2030-01-01T19:00:00Z', venue: 'V', price: 5, capacity: 20,
    });
    const c2 = await request(app).post('/api/events').send({
      title: 'Archived Event', description: 'Gone',
      start_time: '2030-01-02T19:00:00Z', venue: 'V', price: 5, capacity: 20,
    });
    await request(app).post('/api/events/batch/archive').send({ ids: [c2.body.data.id] });

    const res = await request(app).get('/api/events?status=archived&include_archived=true');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Archived Event');
  });

  // ── Generator Routes ────────────────────────────────────

  it('POST /api/generator/analyze returns events array', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/generator/analyze');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  it('POST /api/generator/prompt returns a prompt string', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/generator/prompt');
    expect(res.status).toBe(200);
    expect(typeof res.body.prompt).toBe('string');
    expect(res.body.prompt).toContain('Socialise');
  });

  it('POST /api/generator/save creates event from idea', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/generator/save').send({
      title: 'Generated Event',
      description: 'AI-generated description',
      venue: 'Cool Venue',
      date: '2030-06-15',
      category: 'Social',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Generated Event');
    expect(res.body.data.category).toBe('Social');
    expect(res.body.data.status).toBe('draft');
  });

  it('POST /api/generator/save returns 400 without title', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/generator/save').send({
      description: 'No title provided',
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/generator/save returns 400 for invalid date format', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/generator/save').send({
      title: 'Bad Date Event',
      description: 'Has an invalid date',
      date: 'not-a-date',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('YYYY-MM-DD');
  });

  it('GET /api/generator/ideas returns idea and remaining count', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/generator/ideas');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('remaining');
    expect(typeof res.body.remaining).toBe('number');
  });

  it('POST /api/generator/ideas/generate returns a prompt', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/generator/ideas/generate');
    expect(res.status).toBe(200);
    expect(typeof res.body.prompt).toBe('string');
    expect(res.body.prompt).toContain('12');
  });

  it('POST /api/generator/ideas/store stores and retrieves ideas', async () => {
    const app = createTestApp();
    const storeRes = await request(app).post('/api/generator/ideas/store').send({
      ideas: [
        { title: 'Quiz Night', shortDescription: 'Fun pub quiz', category: 'Social', suggestedDate: '2030-07-01', confidence: 'high' },
        { title: 'Yoga Morning', shortDescription: 'Morning yoga', category: 'Wellness', suggestedDate: '2030-07-05', confidence: 'medium' },
      ],
    });
    expect(storeRes.status).toBe(200);
    expect(storeRes.body.stored).toBe(2);

    // Retrieve next idea
    const ideaRes = await request(app).get('/api/generator/ideas');
    expect(ideaRes.status).toBe(200);
    expect(ideaRes.body.idea).toBeDefined();
    expect(ideaRes.body.idea.title).toBe('Quiz Night');
    expect(ideaRes.body.remaining).toBe(2);
  });

  it('POST /api/generator/ideas/store returns 400 for empty array', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/generator/ideas/store').send({ ideas: [] });
    expect(res.status).toBe(400);
  });

  it('POST /api/generator/ideas/store returns 400 for ideas without titles', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/generator/ideas/store').send({
      ideas: [{ title: '', shortDescription: 'No title' }],
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/generator/ideas/:id/accept creates event from idea', async () => {
    const app = createTestApp();
    // Store an idea first
    await request(app).post('/api/generator/ideas/store').send({
      ideas: [{ title: 'Accept Me', shortDescription: 'Event from idea', category: 'Comedy', suggestedDate: '2030-08-01', confidence: 'high' }],
    });
    const ideaRes = await request(app).get('/api/generator/ideas');
    const ideaId = ideaRes.body.idea.id;

    const res = await request(app).post(`/api/generator/ideas/${ideaId}/accept`);
    expect(res.status).toBe(201);
    expect(res.body.eventId).toBeDefined();

    // Idea should now be marked as used
    const nextRes = await request(app).get('/api/generator/ideas');
    expect(nextRes.body.remaining).toBe(0);
  });

  it('POST /api/generator/ideas/:id/accept returns 404 for missing idea', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/generator/ideas/99999/accept');
    expect(res.status).toBe(404);
  });

  it('POST /api/generator/ideas/:id/accept returns 400 for invalid id', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/generator/ideas/abc/accept');
    expect(res.status).toBe(400);
  });

  // ── Optimize Routes ─────────────────────────────────────

  it('POST /api/events/:id/optimize returns prompt and creates snapshot', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Optimize Me', description: 'Needs optimization',
      start_time: '2030-06-01T19:00:00Z', venue: 'Old Pub', price: 5, capacity: 20,
    });
    const id = created.body.data.id;
    const res = await request(app).post(`/api/events/${id}/optimize`);
    expect(res.status).toBe(200);
    expect(typeof res.body.prompt).toBe('string');
    expect(res.body.eventId).toBe(id);
    expect(res.body.prompt).toContain('Optimize Me');
  });

  it('POST /api/events/:id/optimize returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/events/nonexistent/optimize');
    expect(res.status).toBe(404);
  });

  it('POST /api/events/:id/optimize/undo restores snapshot', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Original Title', description: 'Original description',
      start_time: '2030-06-01T19:00:00Z', venue: 'Pub', price: 5, capacity: 20,
    });
    const id = created.body.data.id;

    // Create snapshot via optimize
    await request(app).post(`/api/events/${id}/optimize`);

    // Modify the event
    await request(app).put(`/api/events/${id}`).send({
      title: 'Changed Title', description: 'Changed description',
    });

    // Undo should restore original
    const undoRes = await request(app).post(`/api/events/${id}/optimize/undo`);
    expect(undoRes.status).toBe(200);
    expect(undoRes.body.data.title).toBe('Original Title');
    expect(undoRes.body.data.description).toBe('Original description');
  });

  it('POST /api/events/:id/optimize/undo returns 404 when no snapshot', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'No Snapshot', description: 'Test',
      start_time: '2030-06-01T19:00:00Z', venue: 'V', price: 5, capacity: 20,
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/optimize/undo`);
    expect(res.status).toBe(404);
  });

  it('POST /api/events/:id/magic-fill returns a prompt', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Magic Fill Event', description: 'Basic description',
      start_time: '2030-06-01T19:00:00Z', venue: 'Bristol', price: 10, capacity: 30,
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/magic-fill`);
    expect(res.status).toBe(200);
    expect(typeof res.body.prompt).toBe('string');
    expect(res.body.prompt).toContain('Magic Fill Event');
  });

  it('POST /api/events/:id/magic-fill returns 404 for missing event', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/events/nonexistent/magic-fill');
    expect(res.status).toBe(404);
  });

  it('POST /api/events/:id/optimize/photos/search returns 503 without API key', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Photo Search', description: 'Test',
      start_time: '2030-06-01T19:00:00Z', venue: 'V', price: 5, capacity: 20,
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/optimize/photos/search`).send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('UNSPLASH');
  });

  it('POST /api/events/:id/optimize/photos/local returns 400 without folderPath', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Local Photos', description: 'Test',
      start_time: '2030-06-01T19:00:00Z', venue: 'V', price: 5, capacity: 20,
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/optimize/photos/local`).send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/events/:id/optimize/photos/generate-prompt returns prompt', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Image Gen Event', description: 'Needs banner',
      start_time: '2030-06-01T19:00:00Z', venue: 'Gallery', price: 15, capacity: 50,
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/optimize/photos/generate-prompt`);
    expect(res.status).toBe(200);
    expect(typeof res.body.prompt).toBe('string');
    expect(res.body.prompt).toContain('Image Gen Event');
  });

  // ── Photo Routes ────────────────────────────────────────

  it('GET /api/events/:id/photos returns empty array initially', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'No Photos', description: 'Test',
      start_time: '2030-06-01T19:00:00Z', venue: 'V', price: 5, capacity: 20,
    });
    const res = await request(app).get(`/api/events/${created.body.data.id}/photos`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('PATCH /api/events/:id/photos/reorder reorders photos', async () => {
    const { app, db } = createTestAppWithDb();
    const created = await request(app).post('/api/events').send({
      title: 'Reorder Test', description: 'Test',
      start_time: '2030-06-01T19:00:00Z', venue: 'V', price: 5, capacity: 20,
    });
    const eventId = created.body.data.id;

    // Insert 3 photos directly
    const insert = db.prepare('INSERT INTO event_photos (event_id, photo_path, source, position, is_cover) VALUES (?, ?, ?, ?, ?)');
    insert.run(eventId, '/data/photos/1.jpg', 'upload', 0, 1);
    insert.run(eventId, '/data/photos/2.jpg', 'upload', 1, 0);
    insert.run(eventId, '/data/photos/3.jpg', 'upload', 2, 0);

    // Get photo IDs
    const photosRes = await request(app).get(`/api/events/${eventId}/photos`);
    const ids = photosRes.body.data.map((p: { id: number }) => p.id);
    expect(ids).toHaveLength(3);

    // Reorder: reverse
    const reversed = [...ids].reverse();
    const reorderRes = await request(app).patch(`/api/events/${eventId}/photos/reorder`).send({ order: reversed });
    expect(reorderRes.status).toBe(200);
    expect(reorderRes.body.data[0].id).toBe(reversed[0]);
    expect(reorderRes.body.data[0].isCover).toBe(true);
    expect(reorderRes.body.data[2].isCover).toBe(false);
  });

  it('PATCH /api/events/:id/photos/reorder returns 400 without order', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Bad Reorder', description: 'Test',
      start_time: '2030-06-01T19:00:00Z', venue: 'V', price: 5, capacity: 20,
    });
    const res = await request(app).patch(`/api/events/${created.body.data.id}/photos/reorder`).send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/events/:id/photos/auto returns 503 without API key', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Auto Photos', description: 'Test',
      start_time: '2030-06-01T19:00:00Z', venue: 'V', price: 5, capacity: 20,
    });
    const res = await request(app).post(`/api/events/${created.body.data.id}/photos/auto`);
    expect(res.status).toBe(503);
  });

  // ── JSON Export ─────────────────────────────────────────

  it('GET /api/events/export/json returns all events as JSON', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Export Event 1', description: 'First',
      start_time: '2030-01-01T19:00:00Z', venue: 'V', price: 5, capacity: 20,
    });
    await request(app).post('/api/events').send({
      title: 'Export Event 2', description: 'Second',
      start_time: '2030-01-02T19:00:00Z', venue: 'V', price: 10, capacity: 30,
    });
    const res = await request(app).get('/api/events/export/json');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.exported_at).toBeDefined();
  });

  it('GET /api/events/export/json?status=draft filters by status', async () => {
    const app = createTestApp();
    await request(app).post('/api/events').send({
      title: 'Draft Event', description: 'Test',
      start_time: '2030-01-01T19:00:00Z', venue: 'V', price: 5, capacity: 20,
    });
    const res = await request(app).get('/api/events/export/json?status=draft');
    expect(res.status).toBe(200);
    expect(res.body.data.every((e: { status: string }) => e.status === 'draft')).toBe(true);
  });

  it('GET /api/events/export/json excludes archived by default', async () => {
    const app = createTestApp();
    const created = await request(app).post('/api/events').send({
      title: 'Will Archive', description: 'Test',
      start_time: '2030-01-01T19:00:00Z', venue: 'V', price: 5, capacity: 20,
    });
    await request(app).post('/api/events/batch/archive').send({ ids: [created.body.data.id] });

    const res = await request(app).get('/api/events/export/json');
    expect(res.body.data).toHaveLength(0);
  });

  // ── JSON Import ─────────────────────────────────────────

  it('POST /api/events/import/json imports multiple events', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/events/import/json').send({
      events: [
        { title: 'Import Event 1', start_time: '2030-01-01T19:00:00Z', venue: 'Pub', price: 5, capacity: 20 },
        { title: 'Import Event 2', start_time: '2030-01-02T19:00:00Z', venue: 'Bar', price: 10, capacity: 30, category: 'Social' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(2);
    expect(res.body.total).toBe(2);
    expect(res.body.data.every((r: { success: boolean }) => r.success)).toBe(true);

    // Verify events exist
    const listRes = await request(app).get('/api/events');
    expect(listRes.body.data).toHaveLength(2);
  });

  it('POST /api/events/import/json skips invalid events', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/events/import/json').send({
      events: [
        { title: 'Valid Event', start_time: '2030-01-01T19:00:00Z' },
        { description: 'Missing title and start_time' },
        { title: 'Another Valid', start_time: '2030-01-02T19:00:00Z' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(2);
    expect(res.body.data[1].success).toBe(false);
    expect(res.body.data[1].error).toContain('title');
  });

  it('POST /api/events/import/json returns 400 for empty array', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/events/import/json').send({ events: [] });
    expect(res.status).toBe(400);
  });

  it('POST /api/events/import/json returns 400 without events field', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/events/import/json').send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/events/import/json returns 400 when over 200 events', async () => {
    const app = createTestApp();
    const tooMany = Array.from({ length: 201 }, (_, i) => ({
      title: `Event ${i}`, start_time: '2030-01-01T19:00:00Z',
    }));
    const res = await request(app).post('/api/events/import/json').send({ events: tooMany });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('200');
  });

  // ── Calendar excludes archived ──────────────────────────

  it('GET /api/events/calendar excludes archived events', async () => {
    const app = createTestApp();
    const c1 = await request(app).post('/api/events').send({
      title: 'Active Calendar', description: 'Visible',
      start_time: '2030-06-01T19:00:00Z', venue: 'V', price: 5, capacity: 20,
    });
    const c2 = await request(app).post('/api/events').send({
      title: 'Archived Calendar', description: 'Hidden',
      start_time: '2030-06-01T20:00:00Z', venue: 'V', price: 5, capacity: 20,
    });
    await request(app).post('/api/events/batch/archive').send({ ids: [c2.body.data.id] });

    const res = await request(app).get('/api/events/calendar?month=2030-06');
    expect(res.status).toBe(200);
    expect(res.body.totalEvents).toBe(1);
  });
});
