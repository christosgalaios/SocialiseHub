import type { PlatformEventStore } from '../data/platform-event-store.js';
import type { ScrapedEvent, PlatformName } from '../shared/types.js';

/**
 * MarketAnalyzer — provides market data from synced platform events.
 *
 * Uses real data from the platform_events table (populated by sync/pull).
 * Falls back to demo data only when no events have been synced yet.
 */
export class MarketAnalyzer {
  constructor(private readonly platformEventStore: PlatformEventStore) {}

  /**
   * Get market data from all synced platform events.
   * Returns real events if available, demo data otherwise.
   */
  async analyze(): Promise<ScrapedEvent[]> {
    const allEvents = this.platformEventStore.getAll();

    if (allEvents.length === 0) {
      console.log('[MarketAnalyzer] No synced events — returning demo data');
      return this.getDemoEvents();
    }

    console.log(`[MarketAnalyzer] Using ${allEvents.length} real synced events`);

    // Convert PlatformEvent[] to ScrapedEvent[]
    const results: ScrapedEvent[] = allEvents.map((pe) => ({
      title: pe.title,
      date: pe.date ?? '',
      venue: pe.venue ?? '',
      category: this.inferCategory(pe.title),
      price: undefined,
      attendees: undefined,
      platform: pe.platform,
      url: pe.externalUrl ?? '',
      status: pe.status,
    }));

    // Sort by date ascending
    results.sort((a, b) => a.date.localeCompare(b.date));
    return results;
  }

  /**
   * Simple category inference from event title keywords.
   * Used to enrich synced events that don't have categories.
   */
  private inferCategory(title: string): string {
    const t = title.toLowerCase();
    if (/tech|code|hack|dev|ai|data|software|web/.test(t)) return 'Technology';
    if (/music|dj|jazz|band|gig|concert|live/.test(t)) return 'Music';
    if (/food|drink|wine|beer|cook|tast/.test(t)) return 'Food & Drink';
    if (/art|paint|gallery|craft|creative|design/.test(t)) return 'Arts';
    if (/yoga|wellness|fitness|health|meditation|run/.test(t)) return 'Health';
    if (/comedy|standup|stand-up|improv|laugh/.test(t)) return 'Comedy';
    if (/business|network|entrepreneur|startup|pitch/.test(t)) return 'Business';
    if (/game|quiz|trivia|board|social/.test(t)) return 'Social';
    if (/film|movie|cinema|screen/.test(t)) return 'Film';
    if (/book|read|literature|poetry|writing/.test(t)) return 'Literature';
    return 'Other';
  }

  /**
   * Demo events — only used when no real data has been synced.
   */
  private getDemoEvents(): ScrapedEvent[] {
    const now = new Date();
    const upcoming = (daysOut: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + daysOut);
      return d.toISOString().split('T')[0];
    };

    return [
      {
        title: 'Bristol Tech Talks — AI & Machine Learning',
        date: upcoming(5),
        venue: 'Engine Shed, Bristol',
        category: 'Technology',
        price: 'Free',
        attendees: 85,
        platform: 'meetup',
        url: 'https://meetup.com/bristol-tech-talks/events/example1',
      },
      {
        title: 'Bristol Entrepreneurs Networking Evening',
        date: upcoming(8),
        venue: 'The Watershed, Bristol',
        category: 'Business',
        price: '£5',
        attendees: 120,
        platform: 'meetup',
        url: 'https://meetup.com/bristol-entrepreneurs/events/example2',
      },
      {
        title: 'Live Jazz Night at The Lanes',
        date: upcoming(2),
        venue: 'The Lanes, Bristol',
        category: 'Music',
        price: '£8',
        attendees: 80,
        platform: 'headfirst',
        url: 'https://headfirstbristol.co.uk/whats-on/example8',
      },
    ];
  }
}
