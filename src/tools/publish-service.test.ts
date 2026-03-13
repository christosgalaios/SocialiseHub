import { describe, it, expect, vi } from 'vitest';
import { PublishService } from './publish-service.js';
import type { PlatformClient } from './platform-client.js';
import type { SocialiseEvent, PlatformName } from '../shared/types.js';

function makeEvent(overrides: Partial<SocialiseEvent> = {}): SocialiseEvent {
  return {
    id: 'evt-1',
    title: 'Test Event',
    description: 'A test event',
    start_time: '2026-04-15T19:00:00Z',
    duration_minutes: 120,
    venue: 'Test Venue',
    price: 10,
    capacity: 50,
    status: 'draft',
    platforms: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeMockClient(platform: PlatformName, result: { success: boolean; externalId?: string; error?: string }): PlatformClient {
  return {
    platform,
    fetchEvents: vi.fn().mockResolvedValue([]),
    createEvent: vi.fn().mockResolvedValue({ platform, ...result }),
    updateEvent: vi.fn().mockResolvedValue({ platform, ...result }),
    cancelEvent: vi.fn().mockResolvedValue({ success: true }),
    validateConnection: vi.fn().mockResolvedValue(true),
  };
}

describe('PublishService', () => {
  it('publishes to multiple platforms in parallel', async () => {
    const meetupClient = makeMockClient('meetup', { success: true, externalId: 'mtup-123' });
    const eventbriteClient = makeMockClient('eventbrite', { success: true, externalId: 'eb-456' });

    const service = new PublishService({ meetup: meetupClient, eventbrite: eventbriteClient });
    const event = makeEvent();

    const results = await service.publish(event, ['meetup', 'eventbrite']);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ platform: 'meetup', success: true, externalId: 'mtup-123' });
    expect(results[1]).toEqual({ platform: 'eventbrite', success: true, externalId: 'eb-456' });
    expect(meetupClient.createEvent).toHaveBeenCalledWith(event);
    expect(eventbriteClient.createEvent).toHaveBeenCalledWith(event);
  });

  it('returns error result for unconfigured platform', async () => {
    const service = new PublishService({});
    const event = makeEvent();

    const results = await service.publish(event, ['headfirst']);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      platform: 'headfirst',
      success: false,
      error: 'headfirst not configured',
    });
  });

  it('handles platform failure gracefully', async () => {
    const failingClient: PlatformClient = {
      platform: 'meetup',
      fetchEvents: vi.fn().mockResolvedValue([]),
      createEvent: vi.fn().mockRejectedValue(new Error('API timeout')),
      updateEvent: vi.fn().mockResolvedValue({ platform: 'meetup', success: false }),
      cancelEvent: vi.fn().mockResolvedValue({ success: false }),
      validateConnection: vi.fn().mockResolvedValue(false),
    };

    const service = new PublishService({ meetup: failingClient });
    const event = makeEvent();

    const results = await service.publish(event, ['meetup']);

    expect(results).toHaveLength(1);
    expect(results[0].platform).toBe('meetup');
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('API timeout');
  });

  it('returns error from update() when platform not configured', async () => {
    const service = new PublishService({});
    const event = makeEvent();

    const result = await service.update('ext-123', event, 'meetup');

    expect(result).toEqual({ platform: 'meetup', success: false, error: 'meetup not configured' });
  });

  it('returns client from getClient()', () => {
    const client = makeMockClient('meetup', { success: true });
    const service = new PublishService({ meetup: client });

    expect(service.getClient('meetup')).toBe(client);
    expect(service.getClient('headfirst')).toBeUndefined();
  });
});
