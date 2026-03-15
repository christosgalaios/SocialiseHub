import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from './database.js';
import { SyncLogStore } from './sync-log-store.js';

describe('SyncLogStore', () => {
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

  it('stores eventId on log entries', () => {
    store.log({ platform: 'meetup', action: 'publish', status: 'success', eventId: 'evt-1' });
    const entries = store.getRecent();
    expect(entries[0].eventId).toBe('evt-1');
  });

  it('getByEventId returns only entries for that event', () => {
    store.log({ platform: 'meetup', action: 'pull', status: 'success', eventId: 'evt-1' });
    store.log({ platform: 'meetup', action: 'publish', status: 'success', eventId: 'evt-2' });
    store.log({ platform: 'eventbrite', action: 'push', status: 'error', eventId: 'evt-1', message: 'Push failed' });

    const entries = store.getByEventId('evt-1');
    expect(entries).toHaveLength(2);
    expect(entries.every(e => e.eventId === 'evt-1')).toBe(true);
    // Most recent first
    expect(entries[0].platform).toBe('eventbrite');
    expect(entries[1].platform).toBe('meetup');
  });

  it('getByEventId returns empty for unknown event', () => {
    store.log({ platform: 'meetup', action: 'pull', status: 'success', eventId: 'evt-1' });
    const entries = store.getByEventId('no-such-event');
    expect(entries).toHaveLength(0);
  });

  it('getByEventId respects limit', () => {
    for (let i = 0; i < 10; i++) {
      store.log({ platform: 'meetup', action: 'pull', status: 'success', eventId: 'evt-1', message: `E${i}` });
    }
    const entries = store.getByEventId('evt-1', 3);
    expect(entries).toHaveLength(3);
    expect(entries[0].message).toBe('E9');
  });
});
