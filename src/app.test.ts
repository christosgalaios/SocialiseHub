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
});
