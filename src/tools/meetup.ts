import type { PlatformClient } from './platform-client.js';
import type { SocialiseEvent, PlatformEvent, PlatformPublishResult } from '../shared/types.js';

export interface MeetupClientOptions {
  accessToken: string;
  groupUrlname: string;
  fetch?: typeof globalThis.fetch;
}

const GQL_URL = 'https://api.meetup.com/gql';

export class MeetupClient implements PlatformClient {
  readonly platform = 'meetup' as const;
  private readonly token: string;
  private readonly groupUrlname: string;
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: MeetupClientOptions) {
    this.token = options.accessToken;
    this.groupUrlname = options.groupUrlname;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  private async gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await this.fetch(GQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Meetup API error ${res.status}: ${text}`);
    }
    const body = await res.json() as { data?: T; errors?: { message: string }[] };
    if (body.errors?.length) {
      throw new Error(`Meetup GraphQL error: ${body.errors[0].message}`);
    }
    return body.data as T;
  }

  async fetchEvents(): Promise<PlatformEvent[]> {
    const query = `
      query($urlname: String!) {
        groupByUrlname(urlname: $urlname) {
          upcomingEvents(input: { first: 50 }) {
            edges {
              node {
                id
                title
                dateTime
                venue { name }
                eventUrl
                status
              }
            }
          }
          pastEvents(input: { first: 20 }) {
            edges {
              node {
                id
                title
                dateTime
                venue { name }
                eventUrl
                status
              }
            }
          }
        }
      }
    `;
    const data = await this.gql<{
      groupByUrlname: {
        upcomingEvents: { edges: { node: MeetupEventNode }[] };
        pastEvents: { edges: { node: MeetupEventNode }[] };
      };
    }>(query, { urlname: this.groupUrlname });

    const group = data.groupByUrlname;
    const upcoming = group.upcomingEvents.edges.map((e) => this.nodeToEvent(e.node, 'active'));
    const past = group.pastEvents.edges.map((e) => this.nodeToEvent(e.node, 'past'));
    return [...upcoming, ...past];
  }

  async createEvent(event: SocialiseEvent): Promise<PlatformPublishResult> {
    const query = `
      mutation($input: CreateEventInput!) {
        createEvent(input: $input) {
          event {
            id
            eventUrl
          }
        }
      }
    `;
    const duration = `PT${event.duration_minutes}M`;
    const data = await this.gql<{
      createEvent: { event: { id: string; eventUrl: string } };
    }>(query, {
      input: {
        groupUrlname: this.groupUrlname,
        title: event.title,
        description: event.description,
        startDateTime: event.start_time,
        duration,
        rsvpLimit: event.capacity,
        publishStatus: 'PUBLISHED',
      },
    });
    return {
      platform: 'meetup',
      success: true,
      externalId: data.createEvent.event.id,
      externalUrl: data.createEvent.event.eventUrl,
    };
  }

  async updateEvent(externalId: string, event: SocialiseEvent): Promise<PlatformPublishResult> {
    const query = `
      mutation($input: EditEventInput!) {
        editEvent(input: $input) {
          event {
            id
            eventUrl
          }
        }
      }
    `;
    const data = await this.gql<{
      editEvent: { event: { id: string; eventUrl: string } };
    }>(query, {
      input: {
        eventId: externalId,
        title: event.title,
        description: event.description,
        startDateTime: event.start_time,
        duration: `PT${event.duration_minutes}M`,
        rsvpLimit: event.capacity,
      },
    });
    return {
      platform: 'meetup',
      success: true,
      externalId: data.editEvent.event.id,
      externalUrl: data.editEvent.event.eventUrl,
    };
  }

  async cancelEvent(externalId: string): Promise<{ success: boolean; error?: string }> {
    const query = `
      mutation($input: CancelEventInput!) {
        cancelEvent(input: $input) {
          success
        }
      }
    `;
    await this.gql(query, { input: { eventId: externalId } });
    return { success: true };
  }

  async validateConnection(): Promise<boolean> {
    try {
      const query = `query { self { id name } }`;
      await this.gql(query);
      return true;
    } catch {
      return false;
    }
  }

  private nodeToEvent(node: MeetupEventNode, status: PlatformEvent['status']): PlatformEvent {
    return {
      id: '',
      platform: 'meetup',
      externalId: node.id,
      externalUrl: node.eventUrl,
      title: node.title,
      date: node.dateTime,
      venue: node.venue?.name,
      status: node.status === 'CANCELLED' ? 'cancelled' : status,
      syncedAt: new Date().toISOString(),
    };
  }
}

interface MeetupEventNode {
  id: string;
  title: string;
  dateTime: string;
  venue?: { name: string };
  eventUrl: string;
  status: string;
}
