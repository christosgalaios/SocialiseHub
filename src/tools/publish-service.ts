import type { PlatformClient } from './platform-client.js';
import type { SocialiseEvent, PlatformName, PlatformPublishResult } from '../shared/types.js';

export class PublishService {
  private clients: Partial<Record<PlatformName, PlatformClient>>;

  constructor(clients: Partial<Record<PlatformName, PlatformClient>>) {
    this.clients = clients;
  }

  async publish(event: SocialiseEvent, platforms: PlatformName[]): Promise<PlatformPublishResult[]> {
    const results = await Promise.allSettled(
      platforms.map(async (p): Promise<PlatformPublishResult> => {
        const client = this.clients[p];
        if (!client) return { platform: p, success: false, error: `${p} not configured` };
        return client.createEvent(event);
      }),
    );
    return results.map((r, i) =>
      r.status === 'fulfilled' ? r.value : { platform: platforms[i], success: false, error: String(r.reason) },
    );
  }

  async update(externalId: string, event: SocialiseEvent, platform: PlatformName): Promise<PlatformPublishResult> {
    const client = this.clients[platform];
    if (!client) return { platform, success: false, error: `${platform} not configured` };
    try { return await client.updateEvent(externalId, event); }
    catch (err) { return { platform, success: false, error: String(err) }; }
  }

  getClient(platform: PlatformName): PlatformClient | undefined {
    return this.clients[platform];
  }
}
