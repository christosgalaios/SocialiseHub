// src/automation/headfirst-client.ts
import type { PlatformClient } from '../tools/platform-client.js';
import type { SocialiseEvent, PlatformEvent, PlatformPublishResult } from '../shared/types.js';
import { requestAutomation } from './bridge.js';

interface ServiceExtraLookup {
  getExtra(platform: string): Record<string, unknown> | undefined;
}

export class HeadfirstAutomationClient implements PlatformClient {
  readonly platform = 'headfirst' as const;
  private serviceLookup?: ServiceExtraLookup;

  constructor(serviceLookup?: ServiceExtraLookup) {
    this.serviceLookup = serviceLookup;
  }

  async validateConnection(): Promise<boolean> {
    const result = await requestAutomation({ platform: 'headfirst', action: 'connect' });
    if (!result.success) return false;
    const data = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    return data?.loggedIn === true;
  }

  async createEvent(event: SocialiseEvent): Promise<PlatformPublishResult> {
    const extra = this.serviceLookup?.getExtra('headfirst');
    if (!extra?.organizationId) {
      return { platform: 'headfirst', success: false, error: 'Not connected — missing Headfirst organization. Reconnect from Services page.' };
    }
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
    if (!result.success) {
      throw new Error(`Headfirst scrape failed: ${result.error ?? 'Bridge not available'}`);
    }
    const parsed = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    if (!Array.isArray(parsed)) {
      if (parsed?.error) throw new Error(parsed.error);
      return [];
    }
    const events = parsed;
    return events.map((e: Record<string, unknown>) => {
      // Normalize date to ISO 8601 — Headfirst scrape may return human-readable formats
      let dateStr = String(e.date ?? '');
      if (dateStr) {
        try {
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) dateStr = parsed.toISOString();
        } catch { /* keep original */ }
      }
      return {
      id: '',
      platform: 'headfirst' as const,
      externalId: String(e.externalId ?? ''),
      title: String(e.title ?? ''),
      externalUrl: String(e.url ?? ''),
      date: dateStr,
      venue: String(e.venue ?? ''),
      status: (e.status === 'past' ? 'past' : 'active') as 'active' | 'past',
      syncedAt: new Date().toISOString(),
    };
    });
  }
}
