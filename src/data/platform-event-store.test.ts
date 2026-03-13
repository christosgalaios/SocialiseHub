import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from './database.js';
import { PlatformEventStore } from './platform-event-store.js';

// Skipped: better-sqlite3 native module only works in Electron context
describe.skip('PlatformEventStore', () => {
  let db: Database;
  let store: PlatformEventStore;

  beforeEach(() => {
    db = createDatabase(':memory:');
    store = new PlatformEventStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('upserts and retrieves platform events', () => {
    const event = store.upsert({
      platform: 'meetup',
      externalId: 'ext-001',
      title: 'Bristol Tech Meetup',
      status: 'active',
      externalUrl: 'https://meetup.com/events/ext-001',
    });

    expect(event.id).toBeTruthy();
    expect(event.platform).toBe('meetup');
    expect(event.externalId).toBe('ext-001');
    expect(event.title).toBe('Bristol Tech Meetup');
    expect(event.status).toBe('active');
    expect(event.syncedAt).toBeTruthy();

    const all = store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].externalId).toBe('ext-001');
  });

  it('updates on duplicate platform+externalId', () => {
    store.upsert({
      platform: 'meetup',
      externalId: 'ext-002',
      title: 'Original Title',
      status: 'active',
    });

    const updated = store.upsert({
      platform: 'meetup',
      externalId: 'ext-002',
      title: 'Updated Title',
      status: 'past',
    });

    expect(updated.title).toBe('Updated Title');
    expect(updated.status).toBe('past');

    const all = store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('Updated Title');
  });

  it('filters by platform', () => {
    store.upsert({ platform: 'meetup', externalId: 'm-1', title: 'Meetup Event', status: 'active' });
    store.upsert({ platform: 'eventbrite', externalId: 'e-1', title: 'Eventbrite Event', status: 'active' });
    store.upsert({ platform: 'headfirst', externalId: 'h-1', title: 'Headfirst Event', status: 'active' });

    const meetupEvents = store.getByPlatform('meetup');
    expect(meetupEvents).toHaveLength(1);
    expect(meetupEvents[0].platform).toBe('meetup');

    const eventbriteEvents = store.getByPlatform('eventbrite');
    expect(eventbriteEvents).toHaveLength(1);
    expect(eventbriteEvents[0].platform).toBe('eventbrite');
  });

  it('links to internal event via eventId', () => {
    const internalEventId = 'internal-uuid-123';
    // Insert a real event row so the FK constraint is satisfied
    db.prepare(
      `INSERT INTO events (id, title, description, start_time, duration_minutes, venue, price, capacity, status, created_at, updated_at)
       VALUES (?, 'Test Event', '', '2026-06-01T19:00:00Z', 120, 'Bristol', 0, 50, 'published', '2026-01-01', '2026-01-01')`,
    ).run(internalEventId);

    store.upsert({
      platform: 'meetup',
      externalId: 'ext-003',
      title: 'Linked Event',
      status: 'active',
      eventId: internalEventId,
    });

    store.upsert({
      platform: 'eventbrite',
      externalId: 'ext-004',
      title: 'Also Linked',
      status: 'active',
      eventId: internalEventId,
    });

    store.upsert({
      platform: 'headfirst',
      externalId: 'ext-005',
      title: 'Unlinked',
      status: 'active',
    });

    const linked = store.getByEventId(internalEventId);
    expect(linked).toHaveLength(2);
    expect(linked.every((e) => e.eventId === internalEventId)).toBe(true);
  });
});
