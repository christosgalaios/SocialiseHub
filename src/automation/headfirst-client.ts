// src/automation/headfirst-client.ts
import type { PlatformClient } from '../tools/platform-client.js';
import type { SocialiseEvent, PlatformEvent, PlatformPublishResult } from '../shared/types.js';
import { requestAutomation } from './bridge.js';

export class HeadfirstAutomationClient implements PlatformClient {
  readonly platform = 'headfirst' as const;

  async validateConnection(): Promise<boolean> {
    const result = await requestAutomation({ platform: 'headfirst', action: 'connect' });
    if (!result.success) return false;
    const data = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    return data?.loggedIn === true;
  }

  async createEvent(event: SocialiseEvent): Promise<PlatformPublishResult> {
    const result = await requestAutomation({ platform: 'headfirst', action: 'publish', data: event });
    if (!result.success) {
      return { platform: 'headfirst', success: false, error: result.error ?? 'Publish failed' };
    }
    const data = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    return {
      platform: 'headfirst',
      success: true,
      externalId: data?.externalId ?? undefined,
      externalUrl: data?.externalUrl ?? undefined,
    };
  }

  async updateEvent(externalId: string, event: SocialiseEvent): Promise<PlatformPublishResult> {
    const result = await requestAutomation({ platform: 'headfirst', action: 'update', data: event, externalId });
    if (!result.success) {
      return { platform: 'headfirst', success: false, error: result.error ?? 'Update failed' };
    }
    return { platform: 'headfirst', success: true, externalId };
  }

  async cancelEvent(externalId: string): Promise<{ success: boolean; error?: string }> {
    const result = await requestAutomation({ platform: 'headfirst', action: 'cancel', externalId });
    return { success: result.success, error: result.error };
  }

  async fetchEvents(): Promise<PlatformEvent[]> {
    const result = await requestAutomation({ platform: 'headfirst', action: 'scrape' });
    if (!result.success) return [];
    const parsed = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    if (!Array.isArray(parsed)) {
      if (parsed?.error) throw new Error(parsed.error);
      return [];
    }
    const events = parsed;
    return events.map((e: Record<string, unknown>) => ({
      id: '',
      platform: 'headfirst' as const,
      externalId: String(e.externalId ?? ''),
      title: String(e.title ?? ''),
      externalUrl: String(e.url ?? ''),
      date: String(e.date ?? ''),
      venue: String(e.venue ?? ''),
      status: 'active' as const,
      syncedAt: new Date().toISOString(),
    }));
  }
}
