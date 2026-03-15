import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from '../data/database.js';
import { SqliteEventStore } from '../data/sqlite-event-store.js';
import { PlatformEventStore } from '../data/platform-event-store.js';
import { linkPlatformEventToEvent } from './sync.js';
import type { PlatformEvent } from '../shared/types.js';

describe('linkPlatformEventToEvent', () => {
  let db: Database;
  let eventStore: SqliteEventStore;
  let platformEventStore: PlatformEventStore;

  beforeEach(() => {
    db = createDatabase(':memory:');
    eventStore = new SqliteEventStore(db);
    platformEventStore = new PlatformEventStore(db);
  });

  afterEach(() => {
    db.close();
  });

  function makePlatformEvent(overrides: Partial<PlatformEvent> = {}): PlatformEvent {
    return {
      id: 'pe-1',
      platform: 'meetup',
      externalId: 'ext-1',
      title: 'Test Event',
      date: '2026-04-01T19:00:00Z',
      venue: 'The Lanes',
      status: 'active',
      syncedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it('creates a new local event when platform event has no eventId and no match exists', async () => {
    const pe = makePlatformEvent();
    // Insert the platform event first (no eventId)
    const inserted = platformEventStore.upsert(pe);
    expect(inserted.eventId).toBeUndefined();

    await linkPlatformEventToEvent(inserted, eventStore, platformEventStore);

    const allEvents = eventStore.getAll();
    expect(allEvents).toHaveLength(1);
    expect(allEvents[0].title).toBe('Test Event');
    expect(allEvents[0].venue).toBe('The Lanes');
    expect(allEvents[0].sync_status).toBe('synced');

    // The platform event should now be linked to the new event
    const linkedPe = platformEventStore.getByPlatform('meetup');
    expect(linkedPe).toHaveLength(1);
    expect(linkedPe[0].eventId).toBe(allEvents[0].id);
  });

  it('links to existing event when findMatch finds a match (same title + date)', async () => {
    // Create a local event manually that should be matched
    const localEvent = eventStore.create({
      title: 'Test Event',
      description: 'Local event',
      start_time: '2026-04-01T19:00:00Z',
      duration_minutes: 120,
      venue: 'The Lanes',
      price: 0,
      capacity: 50,
    });

    const pe = makePlatformEvent();
    const inserted = platformEventStore.upsert(pe);
    expect(inserted.eventId).toBeUndefined();

    await linkPlatformEventToEvent(inserted, eventStore, platformEventStore);

    // No new event should have been created — still just 1
    const allEvents = eventStore.getAll();
    expect(allEvents).toHaveLength(1);

    // The platform event should now be linked to the existing local event
    const linkedPe = platformEventStore.getByPlatform('meetup');
    expect(linkedPe).toHaveLength(1);
    expect(linkedPe[0].eventId).toBe(localEvent.id);
  });

  it('does NOT update a locally-modified event (sync_status === "modified")', async () => {
    // Create a local event
    const localEvent = eventStore.create({
      title: 'Original Title',
      description: 'Original desc',
      start_time: '2026-04-01T19:00:00Z',
      duration_minutes: 120,
      venue: 'Original Venue',
      price: 5,
      capacity: 30,
    });

    // Mark it as synced first, then modified (simulating a local edit after sync)
    eventStore.updateSyncStatus(localEvent.id, 'synced');
    eventStore.update(localEvent.id, { title: 'Locally Modified Title' });

    // Verify it's now modified
    const modifiedEvent = eventStore.getById(localEvent.id)!;
    expect(modifiedEvent.sync_status).toBe('modified');

    // Insert a platform event that is already linked to this event
    const pe = makePlatformEvent({
      title: 'Platform Title',
      venue: 'Platform Venue',
      eventId: localEvent.id,
    });
    platformEventStore.upsert(pe);

    const linked = platformEventStore.getByPlatform('meetup')[0];
    await linkPlatformEventToEvent(linked, eventStore, platformEventStore);

    // Local event should NOT have been overwritten with platform data
    const afterEvent = eventStore.getById(localEvent.id)!;
    expect(afterEvent.title).toBe('Locally Modified Title');
    expect(afterEvent.sync_status).toBe('modified');
  });

  it('re-creates event if linked event was deleted (stale link)', async () => {
    // Create a local event and link a platform event to it
    const localEvent = eventStore.create({
      title: 'Test Event',
      description: '',
      start_time: '2026-04-01T19:00:00Z',
      duration_minutes: 120,
      venue: 'The Lanes',
      price: 0,
      capacity: 0,
    });
    const pe = makePlatformEvent({ eventId: localEvent.id });
    platformEventStore.upsert(pe);

    // Simulate a stale link: delete the event row, then manually restore the
    // event_id on the platform_event (ON DELETE SET NULL clears it during delete).
    // Must disable FK checks to write a dangling reference.
    eventStore.delete(localEvent.id);
    expect(eventStore.getById(localEvent.id)).toBeUndefined();
    db.pragma('foreign_keys = OFF');
    db.prepare('UPDATE platform_events SET event_id = ? WHERE id = ?').run(localEvent.id, 'pe-1');
    db.pragma('foreign_keys = ON');

    const stale = platformEventStore.getByPlatform('meetup')[0];
    expect(stale.eventId).toBe(localEvent.id);

    await linkPlatformEventToEvent(stale, eventStore, platformEventStore);

    // A new event should have been created
    const allEvents = eventStore.getAll();
    expect(allEvents).toHaveLength(1);
    expect(allEvents[0].title).toBe('Test Event');
    expect(allEvents[0].id).not.toBe(localEvent.id);
    expect(allEvents[0].sync_status).toBe('synced');

    // The platform event should now link to the new event
    const relinked = platformEventStore.getByPlatform('meetup')[0];
    expect(relinked.eventId).toBe(allEvents[0].id);
  });

  it('does not create duplicate links when same platform already linked', async () => {
    // Create a local event
    const localEvent = eventStore.create({
      title: 'Test Event',
      description: '',
      start_time: '2026-04-01T19:00:00Z',
      duration_minutes: 120,
      venue: 'The Lanes',
      price: 0,
      capacity: 0,
    });

    // Insert a meetup platform event already linked
    const pe1 = makePlatformEvent({
      id: 'pe-1',
      externalId: 'ext-1',
      platform: 'meetup',
      eventId: localEvent.id,
    });
    platformEventStore.upsert(pe1);

    // Now a second meetup platform event with the same title/date comes in (no eventId yet)
    const pe2 = makePlatformEvent({
      id: 'pe-2',
      externalId: 'ext-2',
      platform: 'meetup',
    });
    const inserted2 = platformEventStore.upsert(pe2);
    expect(inserted2.eventId).toBeUndefined();

    await linkPlatformEventToEvent(inserted2, eventStore, platformEventStore);

    // A new event should have been created (not linked to the existing one)
    const allEvents = eventStore.getAll();
    expect(allEvents).toHaveLength(2);

    // pe-2 should link to the new event, not to localEvent
    const pe2Updated = platformEventStore.getByPlatform('meetup').find((p) => p.externalId === 'ext-2')!;
    expect(pe2Updated.eventId).not.toBe(localEvent.id);
    expect(pe2Updated.eventId).toBeTruthy();
  });

  it('updates existing linked event with platform data when not modified', async () => {
    // Create a local event and link it
    const localEvent = eventStore.create({
      title: 'Old Title',
      description: 'Old desc',
      start_time: '2026-04-01T18:00:00Z',
      duration_minutes: 120,
      venue: 'Old Venue',
      price: 5,
      capacity: 30,
    });
    eventStore.updateSyncStatus(localEvent.id, 'synced');

    const pe = makePlatformEvent({
      eventId: localEvent.id,
      title: 'Updated Title',
      date: '2026-04-01T19:00:00Z',
      venue: 'New Venue',
      description: 'New desc',
      ticketPrice: 10,
      capacity: 50,
      status: 'active',
    });
    platformEventStore.upsert(pe);

    const linked = platformEventStore.getByPlatform('meetup')[0];
    await linkPlatformEventToEvent(linked, eventStore, platformEventStore);

    const updated = eventStore.getById(localEvent.id)!;
    expect(updated.title).toBe('Updated Title');
    expect(updated.venue).toBe('New Venue');
    expect(updated.description).toBe('New desc');
    expect(updated.price).toBe(10);
    expect(updated.capacity).toBe(50);
    // After update, sync_status should remain 'synced' (not flipped to 'modified')
    expect(updated.sync_status).toBe('synced');
    // Status should reflect the platform status
    expect(updated.status).toBe('published');
  });
});
