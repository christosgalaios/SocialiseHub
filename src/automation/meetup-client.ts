import type { PlatformClient } from '../tools/platform-client.js';
import type { SocialiseEvent, PlatformEvent, PlatformPublishResult } from '../shared/types.js';
import { requestAutomation } from './bridge.js';

export class MeetupAutomationClient implements PlatformClient {
  readonly platform = 'meetup' as const;
  private groupUrlname: string;

  constructor(groupUrlname = '') {
    this.groupUrlname = groupUrlname;
  }

  async validateConnection(): Promise<boolean> {
    const result = await requestAutomation({ platform: 'meetup', action: 'connect' });
    if (!result.success) return false;
    const data = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    return data?.loggedIn === true;
  }

  async createEvent(event: SocialiseEvent): Promise<PlatformPublishResult> {
    const result = await requestAutomation({ platform: 'meetup', action: 'publish', data: event });
    if (!result.success) {
      return { platform: 'meetup', success: false, error: result.error ?? 'Publish failed' };
    }
    const data = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    return {
      platform: 'meetup',
      success: true,
      externalId: data?.externalId ?? undefined,
      externalUrl: data?.externalUrl ?? undefined,
    };
  }

  async updateEvent(externalId: string, event: SocialiseEvent): Promise<PlatformPublishResult> {
    const result = await requestAutomation({ platform: 'meetup', action: 'update', data: event, externalId });
    if (!result.success) {
      return { platform: 'meetup', success: false, error: result.error ?? 'Update failed' };
    }
    return { platform: 'meetup', success: true, externalId };
  }

  async cancelEvent(externalId: string): Promise<{ success: boolean; error?: string }> {
    const result = await requestAutomation({ platform: 'meetup', action: 'cancel', externalId });
    return { success: result.success, error: result.error };
  }

  async fetchEvents(): Promise<PlatformEvent[]> {
    const result = await requestAutomation({ platform: 'meetup', action: 'scrape' });
    if (!result.success) return [];
    const events = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : [];
    return events.map((e: Record<string, unknown>) => ({
      id: '',
      platform: 'meetup' as const,
      externalId: String(e.externalId ?? ''),
      title: String(e.title ?? ''),
      externalUrl: String(e.url ?? ''),
      startTime: String(e.date ?? ''),
      venue: String(e.venue ?? ''),
      syncedAt: new Date().toISOString(),
    }));
  }
}
