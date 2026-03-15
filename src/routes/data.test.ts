import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createDatabase, type Database } from '../data/database.js';
import { createDataRouter } from './data.js';

function createTestApp() {
  const db = createDatabase(':memory:');
  const app = express();
  app.use(express.json());
  app.use('/api/data', createDataRouter(db));
  return { app, db };
}

describe('Data routes', () => {
  let db: Database;

  afterEach(() => {
    if (db) db.close();
  });

  describe('DELETE /api/data/all', () => {
    it('clears all tables and returns cleared list', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      // Seed data across all table groups
      db.prepare("INSERT INTO events (id, title, start_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run('e1', 'Test', '2026-04-01T10:00:00Z', 'draft', '2026-01-01', '2026-01-01');
      db.prepare("INSERT INTO event_photos (event_id, photo_path, source, position, is_cover) VALUES (?, ?, ?, ?, ?)").run('e1', '/img.jpg', 'local', 0, 1);
      db.prepare("INSERT INTO event_notes (event_id, content, author, created_at) VALUES (?, ?, ?, ?)").run('e1', 'note', 'me', '2026-01-01');
      db.prepare("INSERT INTO event_tags (event_id, tag) VALUES (?, ?)").run('e1', 'social');
      db.prepare("INSERT INTO templates (id, name, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run('t1', 'Tmpl', 'Title', '2026-01-01', '2026-01-01');
      db.prepare("INSERT INTO event_ideas (title, short_description, category, confidence, used, created_at) VALUES (?, ?, ?, ?, ?, ?)").run('Idea', 'desc', 'cat', 0.5, 0, '2026-01-01');
      db.prepare("INSERT INTO market_events (platform, external_id, title, scraped_at) VALUES (?, ?, ?, ?)").run('meetup', 'ext1', 'Mkt', '2026-01-01');
      db.prepare("INSERT OR REPLACE INTO dashboard_suggestions (id, suggestions_json, generated_at) VALUES (1, ?, ?)").run('[]', '2026-01-01');

      const res = await request(app).delete('/api/data/all');
      expect(res.status).toBe(200);
      expect(res.body.cleared).toContain('events');
      expect(res.body.cleared).toContain('templates');
      expect(res.body.message).toBeTruthy();

      // Verify all tables are empty
      expect(db.prepare('SELECT COUNT(*) as c FROM events').get()).toEqual({ c: 0 });
      expect(db.prepare('SELECT COUNT(*) as c FROM event_photos').get()).toEqual({ c: 0 });
      expect(db.prepare('SELECT COUNT(*) as c FROM event_notes').get()).toEqual({ c: 0 });
      expect(db.prepare('SELECT COUNT(*) as c FROM event_tags').get()).toEqual({ c: 0 });
      expect(db.prepare('SELECT COUNT(*) as c FROM templates').get()).toEqual({ c: 0 });
      expect(db.prepare('SELECT COUNT(*) as c FROM event_ideas').get()).toEqual({ c: 0 });
      expect(db.prepare('SELECT COUNT(*) as c FROM market_events').get()).toEqual({ c: 0 });
      expect(db.prepare('SELECT COUNT(*) as c FROM dashboard_suggestions').get()).toEqual({ c: 0 });

      // Services should still have 3 seed rows but be disconnected
      const svc = db.prepare('SELECT COUNT(*) as c FROM services').get() as { c: number };
      expect(svc.c).toBe(3);
      const meetup = db.prepare("SELECT connected, access_token FROM services WHERE platform = 'meetup'").get() as { connected: number; access_token: string | null };
      expect(meetup.connected).toBe(0);
      expect(meetup.access_token).toBeNull();
    });
  });

  describe('DELETE /api/data/:category', () => {
    it('clears events and related tables only', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      // Seed event + all child tables
      db.prepare("INSERT INTO events (id, title, start_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run('e1', 'Test', '2026-04-01T10:00:00Z', 'draft', '2026-01-01', '2026-01-01');
      db.prepare("INSERT INTO event_photos (event_id, photo_path, source, position, is_cover) VALUES (?, ?, ?, ?, ?)").run('e1', '/img.jpg', 'local', 0, 1);
      db.prepare("INSERT INTO event_notes (event_id, content, author, created_at) VALUES (?, ?, ?, ?)").run('e1', 'note', 'me', '2026-01-01');
      db.prepare("INSERT INTO event_tags (event_id, tag) VALUES (?, ?)").run('e1', 'social');
      db.prepare("INSERT INTO event_checklist (event_id, label, completed, sort_order, created_at) VALUES (?, ?, ?, ?, ?)").run('e1', 'task', 0, 0, '2026-01-01');
      db.prepare("INSERT INTO event_scores (event_id, overall, breakdown_json, suggestions_json, scored_at) VALUES (?, ?, ?, ?, ?)").run('e1', 80, '{}', '[]', '2026-01-01');
      db.prepare("INSERT INTO sync_log (platform, action, event_id, status, message, created_at) VALUES (?, ?, ?, ?, ?, ?)").run('meetup', 'pull', 'e1', 'ok', 'done', '2026-01-01');
      db.prepare("INSERT INTO platform_events (id, event_id, platform, external_id, title, date, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run('pe1', 'e1', 'meetup', 'ext1', 'Test', '2026-04-01', '2026-01-01');
      db.prepare("INSERT INTO templates (id, name, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run('t1', 'Tmpl', 'Title', '2026-01-01', '2026-01-01');

      const res = await request(app).delete('/api/data/events');
      expect(res.status).toBe(200);
      expect(res.body.cleared).toContain('events');
      expect(res.body.cleared).toContain('event_notes');
      expect(res.body.cleared).toContain('event_tags');

      // All event-related tables gone
      expect(db.prepare('SELECT COUNT(*) as c FROM events').get()).toEqual({ c: 0 });
      expect(db.prepare('SELECT COUNT(*) as c FROM event_photos').get()).toEqual({ c: 0 });
      expect(db.prepare('SELECT COUNT(*) as c FROM event_notes').get()).toEqual({ c: 0 });
      expect(db.prepare('SELECT COUNT(*) as c FROM event_tags').get()).toEqual({ c: 0 });
      expect(db.prepare('SELECT COUNT(*) as c FROM event_checklist').get()).toEqual({ c: 0 });
      expect(db.prepare('SELECT COUNT(*) as c FROM event_scores').get()).toEqual({ c: 0 });
      expect(db.prepare('SELECT COUNT(*) as c FROM sync_log').get()).toEqual({ c: 0 });
      expect(db.prepare('SELECT COUNT(*) as c FROM platform_events').get()).toEqual({ c: 0 });

      // Templates untouched
      expect(db.prepare('SELECT COUNT(*) as c FROM templates').get()).toEqual({ c: 1 });
    });

    it('clears platforms — resets services, deletes platform_events and sync snapshots', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      db.prepare("UPDATE services SET connected = 1, access_token = 'tok' WHERE platform = 'meetup'").run();
      // Seed event and platform data
      db.prepare("INSERT INTO events (id, title, start_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run('e1', 'Test', '2026-04-01T10:00:00Z', 'draft', '2026-01-01', '2026-01-01');
      db.prepare("INSERT INTO platform_events (id, event_id, platform, external_id, title, date, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run('pe1', 'e1', 'meetup', 'ext1', 'Test', '2026-04-01', '2026-01-01');
      db.prepare("INSERT INTO event_sync_snapshots (event_id, platform, snapshot_hash, synced_at) VALUES (?, ?, ?, ?)").run('e1', 'meetup', 'abc123', '2026-01-01');

      const res = await request(app).delete('/api/data/platforms');
      expect(res.status).toBe(200);

      // Services reset but preserved
      const meetup = db.prepare("SELECT connected, access_token FROM services WHERE platform = 'meetup'").get() as { connected: number; access_token: string | null };
      expect(meetup.connected).toBe(0);
      expect(meetup.access_token).toBeNull();
      expect((db.prepare('SELECT COUNT(*) as c FROM services').get() as { c: number }).c).toBe(3);

      // Platform data cleared
      expect(db.prepare('SELECT COUNT(*) as c FROM platform_events').get()).toEqual({ c: 0 });
      expect(db.prepare('SELECT COUNT(*) as c FROM event_sync_snapshots').get()).toEqual({ c: 0 });

      // Events still intact
      expect(db.prepare('SELECT COUNT(*) as c FROM events').get()).toEqual({ c: 1 });
    });

    it('clears templates only', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      db.prepare("INSERT INTO templates (id, name, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run('t1', 'Tmpl', 'Title', '2026-01-01', '2026-01-01');
      db.prepare("INSERT INTO events (id, title, start_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run('e1', 'Test', '2026-04-01T10:00:00Z', 'draft', '2026-01-01', '2026-01-01');

      const res = await request(app).delete('/api/data/templates');
      expect(res.status).toBe(200);

      expect(db.prepare('SELECT COUNT(*) as c FROM templates').get()).toEqual({ c: 0 });
      expect(db.prepare('SELECT COUNT(*) as c FROM events').get()).toEqual({ c: 1 }); // untouched
    });

    it('clears ideas only', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      db.prepare("INSERT INTO event_ideas (title, short_description, category, confidence, used, created_at) VALUES (?, ?, ?, ?, ?, ?)").run('Idea', 'desc', 'cat', 0.5, 0, '2026-01-01');

      const res = await request(app).delete('/api/data/ideas');
      expect(res.status).toBe(200);
      expect(db.prepare('SELECT COUNT(*) as c FROM event_ideas').get()).toEqual({ c: 0 });
    });

    it('clears market data only', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      db.prepare("INSERT INTO market_events (platform, external_id, title, scraped_at) VALUES (?, ?, ?, ?)").run('meetup', 'ext1', 'Market Event', '2026-01-01');

      const res = await request(app).delete('/api/data/market');
      expect(res.status).toBe(200);
      expect(db.prepare('SELECT COUNT(*) as c FROM market_events').get()).toEqual({ c: 0 });
    });

    it('clears dashboard cache only', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      db.prepare("INSERT OR REPLACE INTO dashboard_suggestions (id, suggestions_json, generated_at) VALUES (1, ?, ?)").run('[]', '2026-01-01');

      const res = await request(app).delete('/api/data/dashboard');
      expect(res.status).toBe(200);
      expect(db.prepare('SELECT COUNT(*) as c FROM dashboard_suggestions').get()).toEqual({ c: 0 });
    });

    it('returns 400 for invalid category', async () => {
      const { app, db: testDb } = createTestApp();
      db = testDb;

      const res = await request(app).delete('/api/data/invalid');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid category/);
    });
  });
});
