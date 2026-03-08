import type { SocialiseEvent, PublishResult } from '../shared/types.js';

export interface HeadfirstClientOptions {
  fetch?: typeof globalThis.fetch;
  credentials?: { email?: string; password?: string };
}

export class HeadfirstClient {
  constructor(private readonly _options?: HeadfirstClientOptions) {}

  async publish(event: SocialiseEvent): Promise<PublishResult> {
    // TODO: Implement Headfirst Bristol form submission
    // Headfirst uses web form submission, not a documented API
    console.log(`[Headfirst] Publishing: ${event.title}`);
    return {
      platform: 'headfirst',
      success: true,
      externalId: `hf-${event.id.slice(0, 8)}`,
    };
  }
}
