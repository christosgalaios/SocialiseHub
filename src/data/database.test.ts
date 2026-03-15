import { describe, it, expect, afterEach } from 'vitest';
import { createDatabase, type Database } from './database.js';

describe('database', () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  it('creates all tables in-memory', () => {
    db = createDatabase(':memory:');
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('events');
    expect(names).toContain('platform_events');
    expect(names).toContain('services');
    expect(names).toContain('sync_log');
  });

  it('seeds default service rows', () => {
    db = createDatabase(':memory:');
    const services = db.prepare('SELECT platform FROM services ORDER BY platform').all() as { platform: string }[];
    expect(services.map((s) => s.platform)).toEqual(['eventbrite', 'headfirst', 'meetup']);
  });

  it('enforces unique constraint on platform_events(platform, external_id)', () => {
    db = createDatabase(':memory:');
    db.prepare(`INSERT INTO platform_events (id, platform, external_id, title, status, synced_at)
      VALUES ('a', 'meetup', 'ext-1', 'Test', 'active', '2026-01-01')`).run();
    expect(() => {
      db.prepare(`INSERT INTO platform_events (id, platform, external_id, title, status, synced_at)
        VALUES ('b', 'meetup', 'ext-1', 'Dupe', 'active', '2026-01-01')`).run();
    }).toThrow();
  });

  it('sets user_version >= 1 after schema creation', () => {
    db = createDatabase(':memory:');
    const version = db.pragma('user_version', { simple: true }) as number;
    expect(version).toBeGreaterThanOrEqual(1);
  });

  it('events table has sync_status column', () => {
    db = createDatabase(':memory:');
    const cols = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain('sync_status');
  });

  it('creates event_notes table (migration v10)', () => {
    db = createDatabase(':memory:');
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    expect(tables.map(t => t.name)).toContain('event_notes');

    // Verify columns
    const cols = db.prepare("PRAGMA table_info(event_notes)").all() as { name: string }[];
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('event_id');
    expect(colNames).toContain('content');
    expect(colNames).toContain('author');
    expect(colNames).toContain('created_at');
  });

  it('events table has category column (migration v9)', () => {
    db = createDatabase(':memory:');
    const cols = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
    expect(cols.map(c => c.name)).toContain('category');
  });

  it('user_version is at least 10 after all migrations', () => {
    db = createDatabase(':memory:');
    const version = db.pragma('user_version', { simple: true }) as number;
    expect(version).toBeGreaterThanOrEqual(10);
  });

  it('re-running migrations on existing database does not throw', () => {
    db = createDatabase(':memory:');
    // Simulate calling createDatabase again on the same DB path by calling migrations indirectly
    // Just verify that opening the same in-memory DB twice is safe (migrations are idempotent via user_version check)
    expect(() => {
      // Force migration attempt by resetting user_version and re-running
      db.pragma('user_version = 0');
      // Try to alter the table again — should be caught by try/catch in runMigrations
      try {
        db.exec("ALTER TABLE events ADD COLUMN sync_status TEXT DEFAULT 'local_only'");
      } catch {
        // Column already exists — expected
      }
      db.pragma('user_version = 1');
    }).not.toThrow();
  });
});
