import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createDatabase, type Database } from '../data/database.js';
import { TemplateStore } from '../data/template-store.js';
import { SqliteEventStore } from '../data/sqlite-event-store.js';
import { createTemplatesRouter } from './templates.js';

function createTestApp() {
  const db = createDatabase(':memory:');
  const templateStore = new TemplateStore(db);
  const eventStore = new SqliteEventStore(db);
  const app = express();
  app.use(express.json());
  app.use('/api/templates', createTemplatesRouter(templateStore, eventStore));
  return { app, db, templateStore, eventStore };
}

describe('Templates routes', () => {
  let db: Database;

  beforeEach(() => {
    // db is created fresh per test via createTestApp
  });

  afterEach(() => {
    if (db) db.close();
  });

  describe('GET /', () => {
    it('returns empty array when no templates exist', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      const res = await request(app).get('/api/templates');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
    });
  });

  describe('POST /', () => {
    it('creates a template with valid input', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      const res = await request(app)
        .post('/api/templates')
        .send({ name: 'Weekly Meetup', title: 'Bristol Tech Meetup' });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toBe('Weekly Meetup');
      expect(res.body.data.title).toBe('Bristol Tech Meetup');
    });

    it('rejects missing name', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      const res = await request(app)
        .post('/api/templates')
        .send({ title: 'Bristol Tech Meetup' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('rejects missing title', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      const res = await request(app)
        .post('/api/templates')
        .send({ name: 'Weekly Meetup' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('rejects when both name and title are missing', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      const res = await request(app)
        .post('/api/templates')
        .send({ description: 'No name or title' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /:id', () => {
    it('returns a template by id', async () => {
      const { app, db: testDb, templateStore } = createTestApp();
      db = testDb;

      const created = templateStore.create({
        name: 'Monthly Social',
        title: 'Monthly Social Event',
        durationMinutes: 120,
        price: 0,
      });

      const res = await request(app).get(`/api/templates/${created.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBe(created.id);
      expect(res.body.data.name).toBe('Monthly Social');
      expect(res.body.data.title).toBe('Monthly Social Event');
    });

    it('returns 404 for a nonexistent template', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      const res = await request(app).get('/api/templates/nonexistent-id');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('PUT /:id', () => {
    it('updates a template', async () => {
      const { app, db: testDb, templateStore } = createTestApp();
      db = testDb;

      const created = templateStore.create({
        name: 'Old Name',
        title: 'Old Title',
        durationMinutes: 60,
        price: 5,
      });

      const res = await request(app)
        .put(`/api/templates/${created.id}`)
        .send({ name: 'New Name', title: 'New Title' });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.name).toBe('New Name');
      expect(res.body.data.title).toBe('New Title');
    });

    it('returns 404 when updating a nonexistent template', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      const res = await request(app)
        .put('/api/templates/nonexistent-id')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('DELETE /:id', () => {
    it('deletes a template', async () => {
      const { app, db: testDb, templateStore } = createTestApp();
      db = testDb;

      const created = templateStore.create({
        name: 'To Delete',
        title: 'Delete This Template',
        durationMinutes: 90,
        price: 0,
      });

      const deleteRes = await request(app).delete(`/api/templates/${created.id}`);
      expect(deleteRes.status).toBe(204);

      // Confirm it's gone
      const getRes = await request(app).get(`/api/templates/${created.id}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 when deleting a nonexistent template', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      const res = await request(app).delete('/api/templates/nonexistent-id');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /:id/create-event', () => {
    it('creates a draft event from template', async () => {
      const { app, db: testDb, templateStore } = createTestApp();
      db = testDb;

      const template = templateStore.create({
        name: 'Regular Meetup',
        title: 'Bristol Developers Meetup',
        description: 'A regular gathering of Bristol developers.',
        venue: 'The Watershed',
        durationMinutes: 120,
        price: 10,
        capacity: 50,
      });

      const res = await request(app).post(`/api/templates/${template.id}/create-event`);
      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();

      const event = res.body.data;
      expect(event.id).toBeDefined();
      expect(event.title).toBe('Bristol Developers Meetup');
      expect(event.description).toBe('A regular gathering of Bristol developers.');
      expect(event.venue).toBe('The Watershed');
    });

    it('returns 404 for a nonexistent template', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      const res = await request(app).post('/api/templates/nonexistent-id/create-event');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it('sets start_time to a future date (next week at 7pm)', async () => {
      const { app, db: testDb, templateStore } = createTestApp();
      db = testDb;

      const template = templateStore.create({
        name: 'Future Event Template',
        title: 'Future Meetup',
        durationMinutes: 90,
        price: 0,
      });

      const before = Date.now();
      const res = await request(app).post(`/api/templates/${template.id}/create-event`);
      expect(res.status).toBe(201);

      const startTime = new Date(res.body.data.start_time);
      const startMs = startTime.getTime();

      // Must be strictly in the future (not current time)
      expect(startMs).toBeGreaterThan(before);

      // Should be approximately 7 days from now (allow ±1 day tolerance)
      const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
      const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
      expect(startMs).toBeGreaterThan(before + sixDaysMs);
      expect(startMs).toBeLessThan(before + eightDaysMs);

      // Hour should be 19 (7pm)
      expect(startTime.getHours()).toBe(19);
      // Minutes and seconds should be 0
      expect(startTime.getMinutes()).toBe(0);
      expect(startTime.getSeconds()).toBe(0);
    });
  });
});
