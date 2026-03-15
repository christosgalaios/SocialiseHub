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
    expect(lines[0]).toBe('id,title,description,start_time,end_time,duration_minutes,venue,price,capacity,status,sync_status,createdAt,updatedAt');
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
});
