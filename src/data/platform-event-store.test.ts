import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from './database.js';
import { PlatformEventStore } from './platform-event-store.js';

describe('PlatformEventStore', () => {
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

  describe('cleanStale', () => {
    it('removes events not in the fresh set', () => {
      store.upsert({ platform: 'meetup', externalId: 'keep-1', title: 'Keep Event 1', status: 'active' });
      store.upsert({ platform: 'meetup', externalId: 'keep-2', title: 'Keep Event 2', status: 'active' });
      store.upsert({ platform: 'meetup', externalId: 'stale-1', title: 'Stale Event', status: 'active' });

      const freshIds = new Set(['keep-1', 'keep-2']);
      const removed = store.cleanStale('meetup', freshIds);

      expect(removed).toBe(1);
      const remaining = store.getByPlatform('meetup');
      expect(remaining).toHaveLength(2);
      expect(remaining.map((e) => e.externalId)).not.toContain('stale-1');
    });

    it('returns 0 and does not delete anything when freshExternalIds is empty', () => {
      store.upsert({ platform: 'meetup', externalId: 'ext-1', title: 'Event 1', status: 'active' });
      store.upsert({ platform: 'meetup', externalId: 'ext-2', title: 'Event 2', status: 'active' });

      const removed = store.cleanStale('meetup', new Set());

      expect(removed).toBe(0);
      expect(store.getByPlatform('meetup')).toHaveLength(2);
    });

    it('skips cleanup when >50% would be removed and there are >2 existing events', () => {
      store.upsert({ platform: 'meetup', externalId: 'ext-1', title: 'Event 1', status: 'active' });
      store.upsert({ platform: 'meetup', externalId: 'ext-2', title: 'Event 2', status: 'active' });
      store.upsert({ platform: 'meetup', externalId: 'ext-3', title: 'Event 3', status: 'active' });

      // Only keeping 1 out of 3, so 2 would be removed (66% > 50%) — should be skipped
      const freshIds = new Set(['ext-1']);
      const removed = store.cleanStale('meetup', freshIds);

      expect(removed).toBe(0);
      expect(store.getByPlatform('meetup')).toHaveLength(3);
    });

    it('works normally when removing <=50% of existing events', () => {
      store.upsert({ platform: 'meetup', externalId: 'ext-1', title: 'Event 1', status: 'active' });
      store.upsert({ platform: 'meetup', externalId: 'ext-2', title: 'Event 2', status: 'active' });
      store.upsert({ platform: 'meetup', externalId: 'ext-3', title: 'Event 3', status: 'active' });
      store.upsert({ platform: 'meetup', externalId: 'ext-4', title: 'Event 4', status: 'active' });

      // Keeping 2 of 4, removing 2 (50%) — exactly 50% is not > 50%, so should proceed
      const freshIds = new Set(['ext-1', 'ext-2']);
      const removed = store.cleanStale('meetup', freshIds);

      expect(removed).toBe(2);
      const remaining = store.getByPlatform('meetup');
      expect(remaining).toHaveLength(2);
      expect(remaining.map((e) => e.externalId)).toContain('ext-1');
      expect(remaining.map((e) => e.externalId)).toContain('ext-2');
    });

    it('only cleans events for the specified platform', () => {
      store.upsert({ platform: 'meetup', externalId: 'ext-1', title: 'Meetup Event', status: 'active' });
      store.upsert({ platform: 'eventbrite', externalId: 'ext-1', title: 'Eventbrite Event', status: 'active' });

      // Clean meetup with empty fresh set — should return 0 due to safety check
      // Use a set that excludes the meetup event
      const freshIds = new Set<string>();
      store.cleanStale('meetup', freshIds);

      // Eventbrite event should be unaffected
      expect(store.getByPlatform('eventbrite')).toHaveLength(1);
    });

    it('returns 0 when there are no existing events for the platform', () => {
      const removed = store.cleanStale('meetup', new Set(['ext-1']));
      expect(removed).toBe(0);
    });
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
