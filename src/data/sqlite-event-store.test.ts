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
});
