import type { SocialiseEvent, PublishResult } from '../shared/types.js';

export interface EventbriteClientOptions {
  fetch?: typeof globalThis.fetch;
  token?: string;
}

export class EventbriteClient {
  private readonly token: string;

  constructor(options?: EventbriteClientOptions) {
    this.token = options?.token ?? process.env.EVENTBRITE_TOKEN ?? '';
  }

  async publish(event: SocialiseEvent): Promise<PublishResult> {
    // TODO: Implement real Eventbrite REST API call
    // POST https://www.eventbriteapi.com/v3/organizations/:id/events/
    console.log(`[Eventbrite] Publishing: ${event.title}`);
    return {
      platform: 'eventbrite',
      success: true,
      externalId: `eb-${event.id.slice(0, 8)}`,
    };
  }
}
