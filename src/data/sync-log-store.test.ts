import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from './database.js';
import { SyncLogStore } from './sync-log-store.js';

// Skipped: better-sqlite3 native module only works in Electron context
describe.skip('SyncLogStore', () => {
  let db: Database;
  let store: SyncLogStore;

  beforeEach(() => {
    db = createDatabase(':memory:');
    store = new SyncLogStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('logs and retrieves entries (most recent first)', () => {
    store.log({ platform: 'meetup', action: 'pull', status: 'success', message: 'Pulled 5 events' });
    store.log({ platform: 'eventbrite', action: 'publish', status: 'error', message: 'Auth failed' });
    store.log({ platform: 'headfirst', action: 'push', status: 'success', externalId: 'ext-42' });

    const entries = store.getRecent();
    expect(entries).toHaveLength(3);

    // Most recent first — headfirst push was last inserted
    expect(entries[0].platform).toBe('headfirst');
    expect(entries[0].action).toBe('push');
    expect(entries[0].status).toBe('success');
    expect(entries[0].externalId).toBe('ext-42');
    expect(entries[0].createdAt).toBeTruthy();
    expect(entries[0].id).toBeTypeOf('number');

    expect(entries[1].platform).toBe('eventbrite');
    expect(entries[1].message).toBe('Auth failed');

    expect(entries[2].platform).toBe('meetup');
    expect(entries[2].message).toBe('Pulled 5 events');
  });

  it('respects limit', () => {
    for (let i = 0; i < 10; i++) {
      store.log({ platform: 'meetup', action: 'pull', status: 'success', message: `Entry ${i}` });
    }

    const limited = store.getRecent(3);
    expect(limited).toHaveLength(3);

    // Should be the 3 most recently inserted (highest ids)
    expect(limited[0].message).toBe('Entry 9');
    expect(limited[1].message).toBe('Entry 8');
    expect(limited[2].message).toBe('Entry 7');
  });
});
