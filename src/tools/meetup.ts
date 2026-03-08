import type { SocialiseEvent, PublishResult } from '../shared/types.js';

export interface MeetupClientOptions {
  fetch?: typeof globalThis.fetch;
  apiKey?: string;
}

export class MeetupClient {
  private readonly apiKey: string;

  constructor(options?: MeetupClientOptions) {
    this.apiKey = options?.apiKey ?? process.env.MEETUP_API_KEY ?? '';
  }

  async publish(event: SocialiseEvent): Promise<PublishResult> {
    // TODO: Implement real Meetup GraphQL API call
    // POST https://api.meetup.com/gql with mutation createEvent
    console.log(`[Meetup] Publishing: ${event.title}`);
    return {
      platform: 'meetup',
      success: true,
      externalId: `meetup-${event.id.slice(0, 8)}`,
    };
  }
}
