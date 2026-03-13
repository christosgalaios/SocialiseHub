import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventbriteClient } from './eventbrite.js';
import type { SocialiseEvent } from '../shared/types.js';

function makeEvent(overrides: Partial<SocialiseEvent> = {}): SocialiseEvent {
  return {
    id: 'evt-1',
    title: 'Bristol Tech Meetup',
    description: '<p>A tech meetup in Bristol</p>',
    start_time: '2026-04-15T19:00:00Z',
    duration_minutes: 120,
    venue: 'The Watershed',
    price: 10,
    capacity: 50,
    status: 'draft',
    platforms: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function makeErrorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeClient(mockFetch: ReturnType<typeof vi.fn>): EventbriteClient {
  return new EventbriteClient({
    accessToken: 'test-token',
    organizationId: 'org-123',
    fetch: mockFetch as typeof globalThis.fetch,
  });
}

describe('EventbriteClient', () => {
  describe('fetchEvents', () => {
    it('maps Eventbrite events to PlatformEvent[]', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        makeOkResponse({
          events: [
            {
              id: 'eb-001',
              url: 'https://eventbrite.com/e/eb-001',
              name: { text: 'Tech Night', html: '<b>Tech Night</b>' },
              start: { utc: '2026-05-01T18:00:00Z', timezone: 'Europe/London' },
              end: { utc: '2026-05-01T20:00:00Z', timezone: 'Europe/London' },
              status: 'live',
              venue: { name: 'The Watershed' },
            },
            {
              id: 'eb-002',
              url: 'https://eventbrite.com/e/eb-002',
              name: { text: 'Old Event' },
              start: { utc: '2020-01-01T18:00:00Z', timezone: 'Europe/London' },
              end: { utc: '2020-01-01T20:00:00Z', timezone: 'Europe/London' },
              status: 'ended',
              venue: { address: { localized_address_display: '1 Bristol Street' } },
            },
            {
              id: 'eb-003',
              url: 'https://eventbrite.com/e/eb-003',
              name: { html: '<b>Cancelled Event</b>' },
              start: { utc: '2026-06-01T18:00:00Z', timezone: 'Europe/London' },
              end: { utc: '2026-06-01T20:00:00Z', timezone: 'Europe/London' },
              status: 'cancelled',
            },
          ],
        }),
      );

      const client = makeClient(mockFetch);
      const events = await client.fetchEvents();

      expect(events).toHaveLength(3);

      expect(events[0]).toMatchObject({
        platform: 'eventbrite',
        externalId: 'eb-001',
        externalUrl: 'https://eventbrite.com/e/eb-001',
        title: 'Tech Night',
        date: '2026-05-01T18:00:00Z',
        venue: 'The Watershed',
        status: 'active',
      });

      expect(events[1]).toMatchObject({
        externalId: 'eb-002',
        venue: '1 Bristol Street',
        status: 'past',
      });

      expect(events[2]).toMatchObject({
        externalId: 'eb-003',
        title: '<b>Cancelled Event</b>',
        status: 'cancelled',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.eventbriteapi.com/v3/organizations/org-123/events/?status=live,draft,ended&expand=venue',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        }),
      );
    });
  });

  describe('createEvent (3-step publish flow)', () => {
    it('makes three sequential API calls for a paid event', async () => {
      const calls: { url: string; options: RequestInit }[] = [];
      const mockFetch = vi.fn().mockImplementation((url: string, options: RequestInit) => {
        calls.push({ url, options });
        if (url.includes('/events/') && url.endsWith('/ticket_classes/')) {
          return Promise.resolve(makeOkResponse({ id: 'tc-1' }));
        }
        if (url.includes('/events/') && url.endsWith('/publish/')) {
          return Promise.resolve(makeOkResponse({ published: true }));
        }
        // Create event call
        return Promise.resolve(
          makeOkResponse({ id: 'eb-new', url: 'https://eventbrite.com/e/eb-new' }),
        );
      });

      const client = makeClient(mockFetch);
      const event = makeEvent({ price: 15, capacity: 100 });
      const result = await client.createEvent(event);

      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Step 1: Create event
      const [createCall, ticketCall, publishCall] = calls;
      expect(createCall.url).toBe(
        'https://www.eventbriteapi.com/v3/organizations/org-123/events/',
      );
      expect(createCall.options.method).toBe('POST');
      const createBody = JSON.parse(createCall.options.body as string);
      expect(createBody.event.name.html).toBe('Bristol Tech Meetup');
      expect(createBody.event.description.html).toBe('<p>A tech meetup in Bristol</p>');
      expect(createBody.event.start.utc).toBe('2026-04-15T19:00:00Z');
      expect(createBody.event.start.timezone).toBe('Europe/London');
      expect(createBody.event.currency).toBe('GBP');
      expect(createBody.event.capacity).toBe(100);

      // Step 2: Create ticket class
      expect(ticketCall.url).toBe(
        'https://www.eventbriteapi.com/v3/events/eb-new/ticket_classes/',
      );
      expect(ticketCall.options.method).toBe('POST');
      const ticketBody = JSON.parse(ticketCall.options.body as string);
      expect(ticketBody.ticket_class.name).toBe('General Admission');
      expect(ticketBody.ticket_class.quantity_total).toBe(100);
      expect(ticketBody.ticket_class.cost).toBe('GBP,1500');
      expect(ticketBody.ticket_class.free).toBeUndefined();

      // Step 3: Publish
      expect(publishCall.url).toBe(
        'https://www.eventbriteapi.com/v3/events/eb-new/publish/',
      );
      expect(publishCall.options.method).toBe('POST');

      // Result
      expect(result).toEqual({
        platform: 'eventbrite',
        success: true,
        externalId: 'eb-new',
        externalUrl: 'https://eventbrite.com/e/eb-new',
      });
    });

    it('computes end_time from duration_minutes when end_time is absent', async () => {
      const calls: { url: string; options: RequestInit }[] = [];
      const mockFetch = vi.fn().mockImplementation((url: string, options: RequestInit) => {
        calls.push({ url, options });
        return Promise.resolve(
          makeOkResponse({ id: 'eb-x', url: 'https://eventbrite.com/e/eb-x' }),
        );
      });

      const client = makeClient(mockFetch);
      const event = makeEvent({ start_time: '2026-04-15T19:00:00Z', duration_minutes: 90 });
      delete (event as Partial<SocialiseEvent>).end_time;
      await client.createEvent(event);

      const createBody = JSON.parse(calls[0].options.body as string);
      // 19:00 + 90 min = 20:30
      expect(createBody.event.end.utc).toBe('2026-04-15T20:30:00Z');
    });
  });

  describe('createEvent free event', () => {
    it('creates a free ticket class when price is 0', async () => {
      const calls: { url: string; options: RequestInit }[] = [];
      const mockFetch = vi.fn().mockImplementation((url: string, options: RequestInit) => {
        calls.push({ url, options });
        return Promise.resolve(
          makeOkResponse({ id: 'eb-free', url: 'https://eventbrite.com/e/eb-free' }),
        );
      });

      const client = makeClient(mockFetch);
      const event = makeEvent({ price: 0 });
      await client.createEvent(event);

      const ticketCall = calls[1];
      const ticketBody = JSON.parse(ticketCall.options.body as string);
      expect(ticketBody.ticket_class.free).toBe(true);
      expect(ticketBody.ticket_class.name).toBe('Free Ticket');
      expect(ticketBody.ticket_class.cost).toBeUndefined();
    });
  });

  describe('updateEvent', () => {
    it('sends a POST request with updated event fields', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        makeOkResponse({ id: 'eb-456', url: 'https://eventbrite.com/e/eb-456' }),
      );

      const client = makeClient(mockFetch);
      const event = makeEvent({ title: 'Updated Title', capacity: 75 });
      const result = await client.updateEvent('eb-456', event);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://www.eventbriteapi.com/v3/events/eb-456/');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string);
      expect(body.event.name.html).toBe('Updated Title');
      expect(body.event.capacity).toBe(75);
      expect(body.event.start.timezone).toBe('Europe/London');

      expect(result).toEqual({
        platform: 'eventbrite',
        success: true,
        externalId: 'eb-456',
        externalUrl: 'https://eventbrite.com/e/eb-456',
      });
    });
  });

  describe('cancelEvent', () => {
    it('POSTs to the cancel endpoint and returns success', async () => {
      const mockFetch = vi.fn().mockResolvedValue(makeOkResponse({ cancelled: true }));

      const client = makeClient(mockFetch);
      const result = await client.cancelEvent('eb-789');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.eventbriteapi.com/v3/events/eb-789/cancel/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('validateConnection', () => {
    it('returns true when /users/me/ responds with 200', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        makeOkResponse({ id: 'user-1', name: 'Test User' }),
      );

      const client = makeClient(mockFetch);
      const valid = await client.validateConnection();

      expect(valid).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.eventbriteapi.com/v3/users/me/',
        expect.any(Object),
      );
    });

    it('returns false on 401 Unauthorized', async () => {
      const mockFetch = vi.fn().mockResolvedValue(makeErrorResponse(401, 'Unauthorized'));

      const client = makeClient(mockFetch);
      const valid = await client.validateConnection();

      expect(valid).toBe(false);
    });
  });

  describe('API error handling', () => {
    it('throws a descriptive error on non-200 response', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        makeErrorResponse(422, '{"error":"INVALID_EVENT","error_description":"Start time is required"}'),
      );

      const client = makeClient(mockFetch);
      const event = makeEvent();

      await expect(client.createEvent(event)).rejects.toThrow(
        'Eventbrite API error 422',
      );
    });

    it('includes the response body in the error message', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        makeErrorResponse(404, 'EVENT_NOT_FOUND'),
      );

      const client = makeClient(mockFetch);

      await expect(client.cancelEvent('nonexistent')).rejects.toThrow('EVENT_NOT_FOUND');
    });
  });
});
