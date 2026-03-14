import type { MarketEventStore } from '../data/market-event-store.js';
import type { ScrapedEvent } from '../shared/types.js';

/**
 * MarketAnalyzer — stores and retrieves market event data from market_events table.
 *
 * Scrapers write to this store via storeResults().
 * Generator reads from it via getMarketData().
 */
export class MarketAnalyzer {
  constructor(private readonly marketEventStore: MarketEventStore) {}

  /**
   * Store scrape results for a platform — clears existing data first, then upserts.
   */
  storeResults(platform: string, events: ScrapedEvent[]): void {
    this.marketEventStore.clearPlatform(platform);
    for (const event of events) {
      this.marketEventStore.upsert({
        platform: event.platform,
        external_id: event.url || `${platform}-${event.title}-${event.date}`,
        title: event.title,
        start_time: event.date,
        venue: event.venue,
        category: event.category ?? this.inferCategory(event.title),
        price: event.price,
        url: event.url,
      });
    }
  }

  /**
   * Return all cached market events from the database.
   */
  getMarketData(): ScrapedEvent[] {
    return this.marketEventStore.getAll();
  }

  /**
   * Simple category inference from event title keywords.
   */
  inferCategory(title: string): string {
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
}
