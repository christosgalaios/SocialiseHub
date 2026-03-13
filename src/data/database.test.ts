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
});
