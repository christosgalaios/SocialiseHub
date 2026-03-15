import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from './database.js';
import { SyncSnapshotStore, computeSyncHash } from './sync-snapshot-store.js';
import { SqliteEventStore } from './sqlite-event-store.js';

describe('SyncSnapshotStore', () => {
  let db: Database;
  let store: SyncSnapshotStore;
  let eventStore: SqliteEventStore;

  beforeEach(() => {
    db = createDatabase(':memory:');
    store = new SyncSnapshotStore(db);
    eventStore = new SqliteEventStore(db);
  });

  afterEach(() => {
    db.close();
  });

  function createEvent() {
    return eventStore.create({
      title: 'Test Event',
      description: 'Desc',
      start_time: '2030-01-01T19:00:00Z',
      duration_minutes: 120,
      venue: 'Bristol',
      price: 10,
      capacity: 50,
    });
  }

  it('returns null for non-existent snapshot', () => {
    const result = store.get('no-event', 'meetup');
    expect(result).toBeNull();
  });

  it('upserts and retrieves a snapshot', () => {
    const event = createEvent();
    const hash = computeSyncHash({
      title: 'Test Event', description: 'Desc',
      startTime: '2030-01-01T19:00:00Z', venue: 'Bristol',
      price: 10, capacity: 50, photos: [],
    });

    store.upsert({
      eventId: event.id, platform: 'meetup',
      title: 'Test Event', description: 'Desc',
      startTime: '2030-01-01T19:00:00Z', venue: 'Bristol',
      price: 10, capacity: 50,
      photosJson: '[]', snapshotHash: hash,
    });

    const snapshot = store.get(event.id, 'meetup');
    expect(snapshot).not.toBeNull();
    expect(snapshot!.title).toBe('Test Event');
    expect(snapshot!.snapshotHash).toBe(hash);
    expect(snapshot!.syncedAt).toBeTruthy();
  });

  it('upserts overwrites existing snapshot for same event+platform', () => {
    const event = createEvent();
    const hash1 = computeSyncHash({
      title: 'Old', description: '', startTime: '', venue: '',
      price: 0, capacity: 0, photos: [],
    });
    const hash2 = computeSyncHash({
      title: 'New', description: '', startTime: '', venue: '',
      price: 0, capacity: 0, photos: [],
    });

    store.upsert({
      eventId: event.id, platform: 'meetup',
      title: 'Old', description: '', startTime: '', venue: '',
      price: 0, capacity: 0, photosJson: '[]', snapshotHash: hash1,
    });
    store.upsert({
      eventId: event.id, platform: 'meetup',
      title: 'New', description: '', startTime: '', venue: '',
      price: 0, capacity: 0, photosJson: '[]', snapshotHash: hash2,
    });

    const snapshot = store.get(event.id, 'meetup');
    expect(snapshot!.title).toBe('New');
    expect(snapshot!.snapshotHash).toBe(hash2);
  });

  it('stores separate snapshots per platform', () => {
    const event = createEvent();
    const hash = computeSyncHash({
      title: 'Test', description: '', startTime: '', venue: '',
      price: 0, capacity: 0, photos: [],
    });

    store.upsert({
      eventId: event.id, platform: 'meetup',
      title: 'Meetup Version', description: '', startTime: '', venue: '',
      price: 0, capacity: 0, photosJson: '[]', snapshotHash: hash,
    });
    store.upsert({
      eventId: event.id, platform: 'eventbrite',
      title: 'Eventbrite Version', description: '', startTime: '', venue: '',
      price: 0, capacity: 0, photosJson: '[]', snapshotHash: hash,
    });

    const meetup = store.get(event.id, 'meetup');
    const eb = store.get(event.id, 'eventbrite');
    expect(meetup!.title).toBe('Meetup Version');
    expect(eb!.title).toBe('Eventbrite Version');
  });

  it('deletes a snapshot', () => {
    const event = createEvent();
    store.upsert({
      eventId: event.id, platform: 'meetup',
      title: 'X', description: '', startTime: '', venue: '',
      price: 0, capacity: 0, photosJson: '[]', snapshotHash: 'abc',
    });
    expect(store.get(event.id, 'meetup')).not.toBeNull();

    store.delete(event.id, 'meetup');
    expect(store.get(event.id, 'meetup')).toBeNull();
  });
});

describe('computeSyncHash', () => {
  it('produces consistent hash for same data', () => {
    const data = {
      title: 'Test', description: 'Desc',
      startTime: '2030-01-01', venue: 'V',
      price: 10, capacity: 50, photos: ['a.jpg'],
    };
    const hash1 = computeSyncHash(data);
    const hash2 = computeSyncHash(data);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(32); // MD5 hex
  });

  it('produces different hash for different data', () => {
    const hash1 = computeSyncHash({
      title: 'A', description: '', startTime: '', venue: '',
      price: 0, capacity: 0, photos: [],
    });
    const hash2 = computeSyncHash({
      title: 'B', description: '', startTime: '', venue: '',
      price: 0, capacity: 0, photos: [],
    });
    expect(hash1).not.toBe(hash2);
  });

  it('sorts photos array before hashing', () => {
    const hash1 = computeSyncHash({
      title: '', description: '', startTime: '', venue: '',
      price: 0, capacity: 0, photos: ['b.jpg', 'a.jpg'],
    });
    const hash2 = computeSyncHash({
      title: '', description: '', startTime: '', venue: '',
      price: 0, capacity: 0, photos: ['a.jpg', 'b.jpg'],
    });
    expect(hash1).toBe(hash2);
  });
});
