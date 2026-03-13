import type { PlatformClient } from './platform-client.js';
import type { SocialiseEvent, PlatformName, PlatformPublishResult } from '../shared/types.js';

export class PublishService {
  private clients: Partial<Record<PlatformName, PlatformClient>>;

  constructor(clients: Partial<Record<PlatformName, PlatformClient>>) {
    this.clients = clients;
  }

  async publish(event: SocialiseEvent, platforms: PlatformName[]): Promise<PlatformPublishResult[]> {
    // Sequential execution — browser automation can only run one platform at a time
    const results: PlatformPublishResult[] = [];
    for (const p of platforms) {
      const client = this.clients[p];
      if (!client) {
        results.push({ platform: p, success: false, error: `${p} not configured` });
        continue;
      }
      try {
        results.push(await client.createEvent(event));
      } catch (err) {
        results.push({ platform: p, success: false, error: String(err) });
      }
    }
    return results;
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
