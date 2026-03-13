import { describe, it, expect, vi } from 'vitest';
import { MeetupClient } from './meetup.js';
import type { SocialiseEvent } from '../shared/types.js';

const GROUP_URLNAME = 'test-group';
const ACCESS_TOKEN = 'test-token';

function makeClient(mockFetch: typeof globalThis.fetch) {
  return new MeetupClient({
    accessToken: ACCESS_TOKEN,
    groupUrlname: GROUP_URLNAME,
    fetch: mockFetch,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const sampleEvent: SocialiseEvent = {
  id: 'evt-1',
  title: 'Test Event',
  description: '<p>A test event</p>',
  start_time: '2026-04-01T19:00:00Z',
  duration_minutes: 120,
  venue: 'The Venue',
  price: 10,
  capacity: 50,
  status: 'published',
  platforms: [],
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
};

describe('MeetupClient', () => {
  describe('fetchEvents', () => {
    it('maps upcoming and past events from GraphQL response', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({
          data: {
            groupByUrlname: {
              upcomingEvents: {
                edges: [
                  {
                    node: {
                      id: 'mu-1',
                      title: 'Upcoming Event 1',
                      dateTime: '2026-04-10T18:00:00Z',
                      venue: { name: 'Venue A' },
                      eventUrl: 'https://meetup.com/test-group/events/mu-1',
                      status: 'ACTIVE',
                    },
                  },
                  {
                    node: {
                      id: 'mu-2',
                      title: 'Upcoming Event 2',
                      dateTime: '2026-04-20T19:00:00Z',
                      venue: null,
                      eventUrl: 'https://meetup.com/test-group/events/mu-2',
                      status: 'ACTIVE',
                    },
                  },
                ],
              },
              pastEvents: {
                edges: [
                  {
                    node: {
                      id: 'mu-0',
                      title: 'Past Event',
                      dateTime: '2026-01-01T18:00:00Z',
                      venue: { name: 'Old Venue' },
                      eventUrl: 'https://meetup.com/test-group/events/mu-0',
                      status: 'PAST',
                    },
                  },
                ],
              },
            },
          },
        }),
      );

      const client = makeClient(mockFetch);
      const events = await client.fetchEvents();

      expect(events).toHaveLength(3);

      const [e1, e2, e3] = events;

      expect(e1.platform).toBe('meetup');
      expect(e1.externalId).toBe('mu-1');
      expect(e1.title).toBe('Upcoming Event 1');
      expect(e1.date).toBe('2026-04-10T18:00:00Z');
      expect(e1.venue).toBe('Venue A');
      expect(e1.status).toBe('active');
      expect(e1.externalUrl).toBe('https://meetup.com/test-group/events/mu-1');

      expect(e2.externalId).toBe('mu-2');
      expect(e2.venue).toBeUndefined();
      expect(e2.status).toBe('active');

      expect(e3.externalId).toBe('mu-0');
      expect(e3.status).toBe('past');
      expect(e3.venue).toBe('Old Venue');

      // All events should have a syncedAt timestamp
      for (const e of events) {
        expect(e.syncedAt).toBeTruthy();
        expect(e.id).toBe('');
      }
    });

    it('marks events with CANCELLED status as cancelled regardless of bucket', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({
          data: {
            groupByUrlname: {
              upcomingEvents: {
                edges: [
                  {
                    node: {
                      id: 'mu-c',
                      title: 'Cancelled Event',
                      dateTime: '2026-05-01T18:00:00Z',
                      venue: null,
                      eventUrl: 'https://meetup.com/test-group/events/mu-c',
                      status: 'CANCELLED',
                    },
                  },
                ],
              },
              pastEvents: { edges: [] },
            },
          },
        }),
      );

      const client = makeClient(mockFetch);
      const events = await client.fetchEvents();
      expect(events[0].status).toBe('cancelled');
    });

    it('sends correct urlname variable in query', async () => {
      let capturedBody: unknown;
      const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({
          data: {
            groupByUrlname: {
              upcomingEvents: { edges: [] },
              pastEvents: { edges: [] },
            },
          },
        });
      });

      const client = makeClient(mockFetch);
      await client.fetchEvents();

      expect((capturedBody as { variables: { urlname: string } }).variables.urlname).toBe(GROUP_URLNAME);
    });
  });

  describe('createEvent', () => {
    it('sends correct mutation variables and returns result', async () => {
      let capturedBody: unknown;
      const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({
          data: {
            createEvent: {
              event: {
                id: 'new-mu-id',
                eventUrl: 'https://meetup.com/test-group/events/new-mu-id',
              },
            },
          },
        });
      });

      const client = makeClient(mockFetch);
      const result = await client.createEvent(sampleEvent);

      expect(result.platform).toBe('meetup');
      expect(result.success).toBe(true);
      expect(result.externalId).toBe('new-mu-id');
      expect(result.externalUrl).toBe('https://meetup.com/test-group/events/new-mu-id');

      const body = capturedBody as { variables: { input: Record<string, unknown> } };
      expect(body.variables.input.groupUrlname).toBe(GROUP_URLNAME);
      expect(body.variables.input.title).toBe('Test Event');
      expect(body.variables.input.description).toBe('<p>A test event</p>');
      expect(body.variables.input.startDateTime).toBe('2026-04-01T19:00:00Z');
      expect(body.variables.input.duration).toBe('PT120M');
      expect(body.variables.input.rsvpLimit).toBe(50);
      expect(body.variables.input.publishStatus).toBe('PUBLISHED');
    });
  });

  describe('updateEvent', () => {
    it('sends correct mutation variables and returns result', async () => {
      let capturedBody: unknown;
      const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({
          data: {
            editEvent: {
              event: {
                id: 'existing-mu-id',
                eventUrl: 'https://meetup.com/test-group/events/existing-mu-id',
              },
            },
          },
        });
      });

      const client = makeClient(mockFetch);
      const result = await client.updateEvent('existing-mu-id', sampleEvent);

      expect(result.platform).toBe('meetup');
      expect(result.success).toBe(true);
      expect(result.externalId).toBe('existing-mu-id');
      expect(result.externalUrl).toBe('https://meetup.com/test-group/events/existing-mu-id');

      const body = capturedBody as { variables: { input: Record<string, unknown> } };
      expect(body.variables.input.eventId).toBe('existing-mu-id');
      expect(body.variables.input.title).toBe('Test Event');
      expect(body.variables.input.description).toBe('<p>A test event</p>');
      expect(body.variables.input.startDateTime).toBe('2026-04-01T19:00:00Z');
      expect(body.variables.input.duration).toBe('PT120M');
      expect(body.variables.input.rsvpLimit).toBe(50);
    });
  });

  describe('cancelEvent', () => {
    it('sends correct mutation and returns success', async () => {
      let capturedBody: unknown;
      const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({
          data: {
            cancelEvent: { success: true },
          },
        });
      });

      const client = makeClient(mockFetch);
      const result = await client.cancelEvent('mu-cancel-id');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      const body = capturedBody as { variables: { input: { eventId: string } } };
      expect(body.variables.input.eventId).toBe('mu-cancel-id');
    });
  });

  describe('validateConnection', () => {
    it('returns true when self query succeeds', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({
          data: { self: { id: 'user-1', name: 'Test User' } },
        }),
      );

      const client = makeClient(mockFetch);
      const result = await client.validateConnection();

      expect(result).toBe(true);
    });

    it('returns false when API returns 401', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('Unauthorized', { status: 401 }),
      );

      const client = makeClient(mockFetch);
      const result = await client.validateConnection();

      expect(result).toBe(false);
    });

    it('returns false when fetch throws a network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const client = makeClient(mockFetch);
      const result = await client.validateConnection();

      expect(result).toBe(false);
    });
  });

  describe('GraphQL error handling', () => {
    it('throws when response contains GraphQL errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({
          errors: [{ message: 'Group not found' }],
        }),
      );

      const client = makeClient(mockFetch);
      await expect(client.fetchEvents()).rejects.toThrow('Meetup GraphQL error: Group not found');
    });

    it('throws when HTTP status is non-2xx', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('Internal Server Error', { status: 500 }),
      );

      const client = makeClient(mockFetch);
      await expect(client.fetchEvents()).rejects.toThrow('Meetup API error 500');
    });
  });

  describe('Authorization header', () => {
    it('sends Bearer token in Authorization header', async () => {
      let capturedHeaders: Record<string, string> = {};
      const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>;
        return jsonResponse({
          data: { self: { id: 'u1', name: 'User' } },
        });
      });

      const client = makeClient(mockFetch);
      await client.validateConnection();

      expect(capturedHeaders['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });
  });
});
