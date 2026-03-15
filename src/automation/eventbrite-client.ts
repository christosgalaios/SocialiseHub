// src/automation/eventbrite-client.ts
import type { PlatformClient } from '../tools/platform-client.js';
import type { SocialiseEvent, PlatformEvent, PlatformPublishResult } from '../shared/types.js';
import { requestAutomation } from './bridge.js';

interface ServiceExtraLookup {
  getExtra(platform: string): Record<string, unknown> | undefined;
}

export class EventbriteAutomationClient implements PlatformClient {
  readonly platform = 'eventbrite' as const;
  private serviceLookup?: ServiceExtraLookup;

  constructor(serviceLookup?: ServiceExtraLookup) {
    this.serviceLookup = serviceLookup;
  }

  async validateConnection(): Promise<boolean> {
    const result = await requestAutomation({ platform: 'eventbrite', action: 'connect' });
    if (!result.success) return false;
    const data = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    return data?.loggedIn === true;
  }

  async createEvent(event: SocialiseEvent): Promise<PlatformPublishResult> {
    const extra = this.serviceLookup?.getExtra('eventbrite');
    if (!extra?.organizationId) {
      return { platform: 'eventbrite', success: false, error: 'Not connected — missing Eventbrite organization. Reconnect from Services page.' };
    }
    const result = await requestAutomation({ platform: 'eventbrite', action: 'publish', data: event });
    if (!result.success) {
      return { platform: 'eventbrite', success: false, error: result.error ?? 'Publish failed' };
    }
    const data = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    return {
      platform: 'eventbrite',
      success: true,
      externalId: data?.externalId ?? undefined,
      externalUrl: data?.externalUrl ?? undefined,
    };
  }

  async updateEvent(externalId: string, event: SocialiseEvent): Promise<PlatformPublishResult> {
    const result = await requestAutomation({ platform: 'eventbrite', action: 'update', data: event, externalId });
    if (!result.success) {
      return { platform: 'eventbrite', success: false, error: result.error ?? 'Update failed' };
    }
    return { platform: 'eventbrite', success: true, externalId };
  }

  async cancelEvent(externalId: string): Promise<{ success: boolean; error?: string }> {
    const result = await requestAutomation({ platform: 'eventbrite', action: 'cancel', externalId });
    return { success: result.success, error: result.error };
  }

  async fetchEvents(): Promise<PlatformEvent[]> {
    const result = await requestAutomation({ platform: 'eventbrite', action: 'scrape' });
    if (!result.success) {
      throw new Error(`Eventbrite scrape failed: ${result.error ?? 'Bridge not available'}`);
    }
    const parsed = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    if (!Array.isArray(parsed)) {
      if (parsed?.error) throw new Error(parsed.error);
      return [];
    }
    const events = parsed;
    return events.map((e: Record<string, unknown>) => ({
      id: '',
      platform: 'eventbrite' as const,
      externalId: String(e.externalId ?? ''),
      title: String(e.title ?? ''),
      externalUrl: String(e.url ?? ''),
      date: String(e.date ?? ''),
      venue: '',
      status: (e.status === 'past' ? 'past' : 'active') as 'active' | 'past',
      syncedAt: new Date().toISOString(),
    }));
  }
}
