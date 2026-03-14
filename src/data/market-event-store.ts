import type { Database } from './database.js';
import type { ScrapedEvent } from '../shared/types.js';

interface MarketEventRow {
  id: number;
  platform: string;
  external_id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  venue: string | null;
  category: string | null;
  price: string | null;
  url: string | null;
  scraped_at: string;
}

function rowToScrapedEvent(row: MarketEventRow): ScrapedEvent {
  return {
    title: row.title,
    date: row.start_time ?? '',
    venue: row.venue ?? '',
    category: row.category ?? undefined,
    price: row.price ?? undefined,
    attendees: undefined,
    platform: row.platform as ScrapedEvent['platform'],
    url: row.url ?? '',
    status: undefined,
  };
}

export class MarketEventStore {
  constructor(private readonly db: Database) {}

  clearPlatform(platform: string): void {
    this.db
      .prepare('DELETE FROM market_events WHERE platform = ?')
      .run(platform);
  }

  upsert(event: {
    platform: string;
    external_id: string;
    title: string;
    description?: string;
    start_time?: string;
    venue?: string;
    category?: string;
    price?: string;
    url?: string;
  }): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO market_events
           (platform, external_id, title, description, start_time, venue, category, price, url, scraped_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(platform, external_id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           start_time = excluded.start_time,
           venue = excluded.venue,
           category = excluded.category,
           price = excluded.price,
           url = excluded.url,
           scraped_at = excluded.scraped_at`,
      )
      .run(
        event.platform,
        event.external_id,
        event.title,
        event.description ?? null,
        event.start_time ?? null,
        event.venue ?? null,
        event.category ?? null,
        event.price ?? null,
        event.url ?? null,
        now,
      );
  }

  getAll(): ScrapedEvent[] {
    const rows = this.db
      .prepare<[], MarketEventRow>(
        'SELECT * FROM market_events ORDER BY start_time ASC',
      )
      .all();
    return rows.map(rowToScrapedEvent);
  }
}
