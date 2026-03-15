import type { PlatformClient } from '../tools/platform-client.js';
import type { SocialiseEvent, PlatformEvent, PlatformPublishResult } from '../shared/types.js';
import { requestAutomation } from './bridge.js';

export interface ServiceExtraLookup {
  getExtra(platform: string): Record<string, unknown> | undefined;
}

export class MeetupAutomationClient implements PlatformClient {
  readonly platform = 'meetup' as const;
  private serviceLookup?: ServiceExtraLookup;

  constructor(serviceLookup?: ServiceExtraLookup) {
    this.serviceLookup = serviceLookup;
  }

  private getGroupUrlname(): string {
    const extra = this.serviceLookup?.getExtra('meetup');
    return (extra?.groupUrlname as string) ?? '';
  }

  async validateConnection(): Promise<boolean> {
    const result = await requestAutomation({ platform: 'meetup', action: 'connect' });
    if (!result.success) return false;
    const data = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    return data?.loggedIn === true;
  }

  async createEvent(event: SocialiseEvent): Promise<PlatformPublishResult> {
    const groupUrlname = this.getGroupUrlname();
    if (!groupUrlname) {
      return { platform: 'meetup', success: false, error: 'Not connected — missing groupUrlname. Reconnect Meetup from Services page.' };
    }
    const result = await requestAutomation({ platform: 'meetup', action: 'publish', data: { ...event, groupUrlname } });
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
    const groupUrlname = this.getGroupUrlname();
    if (!groupUrlname) throw new Error('Meetup groupUrlname not configured — reconnect the Meetup service from the Services page');
    const result = await requestAutomation({ platform: 'meetup', action: 'scrape', data: { groupUrlname } });
    if (!result.success) {
      throw new Error(`Meetup scrape failed: ${result.error ?? 'Bridge not available — is the Electron app running?'}`);
    }
    const rawEval = result.data?.lastEvalResult;
    const parsed = typeof rawEval === 'string' ? JSON.parse(rawEval) : rawEval;
    // Handle both raw array and wrapped { success, events } response shapes
    let events: Array<Record<string, unknown>>;
    if (Array.isArray(parsed)) {
      events = parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (parsed.error) throw new Error(`Meetup scrape error: ${parsed.error}`);
      if (Array.isArray(parsed.events)) {
        events = parsed.events;
      } else {
        throw new Error(`Meetup scrape returned unexpected data: ${JSON.stringify(parsed).slice(0, 200)}`);
      }
    } else {
      throw new Error(`Meetup scrape returned null/undefined result`);
    }
    return events.map((e: Record<string, unknown>) => {
      // Normalize date to ISO without timezone offset (SQLite strftime compatibility)
      let dateStr = String(e.date ?? '');
      if (dateStr) {
        try { dateStr = new Date(dateStr).toISOString(); } catch { /* keep original */ }
      }
      return {
        id: '',
        platform: 'meetup' as const,
        externalId: String(e.externalId ?? ''),
        title: String(e.title ?? ''),
        externalUrl: String(e.url ?? ''),
        date: dateStr,
        venue: String(e.venue ?? ''),
        status: (e.status === 'past' ? 'past' : e.status === 'draft' ? 'draft' : e.status === 'cancelled' ? 'cancelled' : 'active') as 'active' | 'draft' | 'cancelled' | 'past',
        syncedAt: new Date().toISOString(),
        attendance: typeof e.going === 'number' ? e.going : undefined,
        capacity: typeof e.maxTickets === 'number' ? e.maxTickets : undefined,
        ticketPrice: typeof e.fee === 'number' ? e.fee : undefined,
        revenue: (typeof e.fee === 'number' && typeof e.going === 'number' && e.fee > 0)
          ? e.fee * e.going : undefined,
        description: typeof e.description === 'string' ? e.description : undefined,
        imageUrls: typeof e.imageUrl === 'string' ? [e.imageUrl] : [],
        organizerName: typeof e.organizerName === 'string' ? e.organizerName : undefined,
      };
    });
  }
}
