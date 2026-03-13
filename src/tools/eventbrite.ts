import type { PlatformClient } from './platform-client.js';
import type { SocialiseEvent, PlatformEvent, PlatformPublishResult } from '../shared/types.js';

export interface EventbriteClientOptions {
  accessToken: string;
  organizationId: string;
  fetch?: typeof globalThis.fetch;
}

const BASE_URL = 'https://www.eventbriteapi.com/v3';

export class EventbriteClient implements PlatformClient {
  readonly platform = 'eventbrite' as const;
  private readonly token: string;
  private readonly orgId: string;
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: EventbriteClientOptions) {
    this.token = options.accessToken;
    this.orgId = options.organizationId;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  private async api<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const res = await this.fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Eventbrite API error ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async fetchEvents(): Promise<PlatformEvent[]> {
    const data = await this.api<{
      events: EventbriteEventResponse[];
    }>(`/organizations/${this.orgId}/events/?status=live,draft,ended&expand=venue`);

    return data.events.map((e) => this.responseToEvent(e));
  }

  async createEvent(event: SocialiseEvent): Promise<PlatformPublishResult> {
    // Step 1: Create event as draft
    const endTime = event.end_time ?? this.computeEndTime(event.start_time, event.duration_minutes);
    const created = await this.api<{ id: string; url: string }>(
      `/organizations/${this.orgId}/events/`,
      {
        method: 'POST',
        body: JSON.stringify({
          event: {
            name: { html: event.title },
            description: { html: event.description },
            start: { utc: this.toUtc(event.start_time), timezone: 'Europe/London' },
            end: { utc: this.toUtc(endTime), timezone: 'Europe/London' },
            currency: 'GBP',
            capacity: event.capacity,
            listed: true,
          },
        }),
      },
    );

    // Step 2: Create ticket class
    const ticketBody = event.price > 0
      ? { ticket_class: { name: 'General Admission', quantity_total: event.capacity, cost: `GBP,${Math.round(event.price * 100)}` } }
      : { ticket_class: { name: 'Free Ticket', quantity_total: event.capacity, free: true } };

    await this.api(`/events/${created.id}/ticket_classes/`, {
      method: 'POST',
      body: JSON.stringify(ticketBody),
    });

    // Step 3: Publish
    await this.api(`/events/${created.id}/publish/`, { method: 'POST' });

    return {
      platform: 'eventbrite',
      success: true,
      externalId: created.id,
      externalUrl: created.url,
    };
  }

  async updateEvent(externalId: string, event: SocialiseEvent): Promise<PlatformPublishResult> {
    const endTime = event.end_time ?? this.computeEndTime(event.start_time, event.duration_minutes);
    const updated = await this.api<{ id: string; url: string }>(
      `/events/${externalId}/`,
      {
        method: 'POST',
        body: JSON.stringify({
          event: {
            name: { html: event.title },
            description: { html: event.description },
            start: { utc: this.toUtc(event.start_time), timezone: 'Europe/London' },
            end: { utc: this.toUtc(endTime), timezone: 'Europe/London' },
            capacity: event.capacity,
          },
        }),
      },
    );
    return {
      platform: 'eventbrite',
      success: true,
      externalId: updated.id,
      externalUrl: updated.url,
    };
  }

  async cancelEvent(externalId: string): Promise<{ success: boolean; error?: string }> {
    await this.api(`/events/${externalId}/cancel/`, { method: 'POST' });
    return { success: true };
  }

  async validateConnection(): Promise<boolean> {
    try {
      await this.api('/users/me/');
      return true;
    } catch {
      return false;
    }
  }

  private toUtc(isoDateTime: string): string {
    const d = new Date(isoDateTime);
    return d.toISOString().replace('.000Z', 'Z');
  }

  private computeEndTime(startTime: string, durationMinutes: number): string {
    const d = new Date(startTime);
    d.setMinutes(d.getMinutes() + durationMinutes);
    return d.toISOString();
  }

  private responseToEvent(e: EventbriteEventResponse): PlatformEvent {
    const now = new Date();
    const eventDate = e.start?.utc ? new Date(e.start.utc) : null;
    let status: PlatformEvent['status'] = 'active';
    if (e.status === 'canceled' || e.status === 'cancelled') status = 'cancelled';
    else if (eventDate && eventDate < now) status = 'past';

    return {
      id: '',
      platform: 'eventbrite',
      externalId: e.id,
      externalUrl: e.url,
      title: e.name?.text ?? e.name?.html ?? '',
      date: e.start?.utc,
      venue: e.venue?.name ?? e.venue?.address?.localized_address_display,
      status,
      rawData: JSON.stringify(e),
      syncedAt: new Date().toISOString(),
    };
  }
}

interface EventbriteEventResponse {
  id: string;
  url: string;
  name: { text?: string; html?: string };
  start: { utc: string; timezone: string };
  end: { utc: string; timezone: string };
  status: string;
  venue?: { name?: string; address?: { localized_address_display?: string } };
}
