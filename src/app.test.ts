import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './data/database.js';

function createTestApp() {
  const db = createDatabase(':memory:');
  return createApp({ db });
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

  it('GET /api/sync/dashboard/summary returns stats', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/sync/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.body.data.totalEvents).toBe(0);
    expect(res.body.data.byPlatform).toEqual({ meetup: 0, eventbrite: 0, headfirst: 0 });
  });
});
