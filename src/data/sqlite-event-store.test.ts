import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { createDatabase } from './database.js';
import type { Database } from './database.js';
import { SqliteEventStore } from './sqlite-event-store.js';
import type { SocialiseEvent } from '../shared/types.js';

const validInput = {
  title: 'Test Event',
  description: 'A test',
  start_time: '2026-04-01T19:00:00+01:00',
  duration_minutes: 120,
  venue: 'The Lanes',
  price: 10,
  capacity: 100,
};

describe('SqliteEventStore', () => {
  let db: Database;
  let store: SqliteEventStore;

  beforeEach(() => {
    db = createDatabase(':memory:');
    store = new SqliteEventStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates and retrieves an event', () => {
    const created = store.create(validInput);

    expect(created.id).toBeTruthy();
    expect(created.title).toBe('Test Event');
    expect(created.description).toBe('A test');
    expect(created.start_time).toBe('2026-04-01T19:00:00+01:00');
    expect(created.duration_minutes).toBe(120);
    expect(created.venue).toBe('The Lanes');
    expect(created.price).toBe(10);
    expect(created.capacity).toBe(100);
    expect(created.status).toBe('draft');
    expect(created.platforms).toEqual([]);
    expect(created.createdAt).toBeTruthy();
    expect(created.updatedAt).toBeTruthy();

    const fetched = store.getById(created.id);
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.title).toBe('Test Event');
  });

  it('lists all events', () => {
    store.create(validInput);
    store.create({ ...validInput, title: 'Second Event', start_time: '2026-05-01T19:00:00+01:00' });

    const all = store.getAll();
    expect(all).toHaveLength(2);
    // ordered by start_time DESC — second event has later date
    expect(all[0].title).toBe('Second Event');
    expect(all[1].title).toBe('Test Event');
  });

  it('updates an event partially', () => {
    const created = store.create(validInput);

    const updated = store.update(created.id, { title: 'Updated Title', price: 15 });

    expect(updated).toBeDefined();
    expect(updated?.title).toBe('Updated Title');
    expect(updated?.price).toBe(15);
    // unchanged fields remain
    expect(updated?.description).toBe('A test');
    expect(updated?.venue).toBe('The Lanes');
    expect(updated?.capacity).toBe(100);
    // updatedAt should have changed (or at minimum be set)
    expect(updated?.updatedAt).toBeTruthy();
  });

  it('deletes an event', () => {
    const created = store.create(validInput);
    expect(store.getById(created.id)).toBeDefined();

    const result = store.delete(created.id);
    expect(result).toBe(true);
    expect(store.getById(created.id)).toBeUndefined();

    // deleting again returns false
    expect(store.delete(created.id)).toBe(false);
  });

  it('returns undefined for a non-existent event', () => {
    const result = store.getById('non-existent-id');
    expect(result).toBeUndefined();
  });

  it('new events default to sync_status local_only', () => {
    const created = store.create(validInput);
    expect(created.sync_status).toBe('local_only');
  });

  it('updateSyncStatus changes the status', () => {
    const created = store.create(validInput);
    expect(created.sync_status).toBe('local_only');

    const updated = store.updateSyncStatus(created.id, 'synced');
    expect(updated?.sync_status).toBe('synced');

    const again = store.updateSyncStatus(created.id, 'modified');
    expect(again?.sync_status).toBe('modified');
  });

  it('updateSyncStatus returns undefined for non-existent event', () => {
    const result = store.updateSyncStatus('non-existent-id', 'synced');
    expect(result).toBeUndefined();
  });

  it('editing a synced event auto-flips sync_status to modified', () => {
    const created = store.create(validInput);
    store.updateSyncStatus(created.id, 'synced');

    const updated = store.update(created.id, { title: 'New Title' });
    expect(updated?.sync_status).toBe('modified');
  });

  it('editing a local_only event keeps sync_status as local_only', () => {
    const created = store.create(validInput);
    expect(created.sync_status).toBe('local_only');

    const updated = store.update(created.id, { title: 'New Title' });
    expect(updated?.sync_status).toBe('local_only');
  });

  describe('findMatch', () => {
    it('returns exact title match after normalization', () => {
      const created = store.create({ ...validInput, title: 'Bristol Tech Meetup!' });
      // Normalized: "bristol tech meetup" (special chars stripped)
      const result = store.findMatch('Bristol Tech Meetup!');
      expect(result).toBeDefined();
      expect(result?.id).toBe(created.id);
    });

    it('returns match when normalization differs (punctuation/case)', () => {
      const created = store.create({ ...validInput, title: 'Bristol Tech Meetup' });
      // Querying with different casing and punctuation should still match
      const result = store.findMatch('BRISTOL TECH MEETUP!!!');
      expect(result).toBeDefined();
      expect(result?.id).toBe(created.id);
    });

    it('returns match for substring when shorter is >= 60% of longer length', () => {
      // "antisocial" (10 chars) vs "antisocial networking night" (27 chars)
      // Shorter = 10, Longer = 27, 10 >= 27*0.6 = 16.2 → false, won't match
      // Use a case where shorter IS >= 60%:
      // "bristol tech meetup" (19) vs "bristol tech meetup 2026" (24)
      // 19 >= 24*0.6 = 14.4 → true, and longer includes shorter → match
      const created = store.create({ ...validInput, title: 'Bristol Tech Meetup 2026' });
      const result = store.findMatch('Bristol Tech Meetup');
      expect(result).toBeDefined();
      expect(result?.id).toBe(created.id);
    });

    it('does NOT match when shorter string is < 60% of longer string length', () => {
      // "social" (6 chars) vs "antisocial networking night" (27 chars)
      // 6 >= 27*0.6 = 16.2 → false → no match
      store.create({ ...validInput, title: 'Antisocial Networking Night' });
      const result = store.findMatch('social');
      expect(result).toBeUndefined();
    });

    it('filters by date — only matches events on the same day', () => {
      const eventApril = store.create({ ...validInput, title: 'Same Title Event', start_time: '2026-04-01T19:00:00+01:00' });
      store.create({ ...validInput, title: 'Same Title Event', start_time: '2026-05-01T19:00:00+01:00' });

      const result = store.findMatch('Same Title Event', '2026-04-01');
      expect(result).toBeDefined();
      expect(result?.id).toBe(eventApril.id);
    });

    it('returns undefined when date does not match any event', () => {
      store.create({ ...validInput, title: 'Test Event', start_time: '2026-04-01T19:00:00+01:00' });
      const result = store.findMatch('Test Event', '2026-06-15');
      expect(result).toBeUndefined();
    });

    it('returns undefined when no events match the title', () => {
      store.create({ ...validInput, title: 'Completely Different Event' });
      const result = store.findMatch('No Match Here');
      expect(result).toBeUndefined();
    });

    it('returns undefined for empty title', () => {
      store.create(validInput);
      const result = store.findMatch('');
      expect(result).toBeUndefined();
    });

    it('returns undefined when store is empty', () => {
      const result = store.findMatch('Some Event');
      expect(result).toBeUndefined();
    });
  });
});
