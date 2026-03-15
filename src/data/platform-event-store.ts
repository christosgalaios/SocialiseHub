import { randomUUID } from 'node:crypto';
import type { Database } from './database.js';
import type { PlatformEvent, PlatformName } from '../shared/types.js';

interface PlatformEventRow {
  id: string;
  event_id: string | null;
  platform: string;
  external_id: string;
  external_url: string | null;
  title: string | null;
  date: string | null;
  venue: string | null;
  status: string;
  raw_data: string | null;
  synced_at: string;
  published_at: string | null;
  attendance: number | null;
  capacity: number | null;
  revenue: number | null;
  ticket_price: number | null;
  description: string | null;
  image_urls: string | null;
}

function rowToEvent(row: PlatformEventRow): PlatformEvent {
  return {
    id: row.id,
    eventId: row.event_id ?? undefined,
    platform: row.platform as PlatformName,
    externalId: row.external_id,
    externalUrl: row.external_url ?? undefined,
    title: row.title ?? '',
    date: row.date ?? undefined,
    venue: row.venue ?? undefined,
    status: row.status as PlatformEvent['status'],
    rawData: row.raw_data ?? undefined,
    syncedAt: row.synced_at,
    publishedAt: row.published_at ?? undefined,
    attendance: row.attendance ?? undefined,
    capacity: row.capacity ?? undefined,
    revenue: row.revenue ?? undefined,
    ticketPrice: row.ticket_price ?? undefined,
    description: row.description ?? undefined,
    imageUrls: row.image_urls ? (JSON.parse(row.image_urls) as string[]) : undefined,
  };
}

export class PlatformEventStore {
  constructor(private readonly db: Database) {}

  upsert(input: Omit<PlatformEvent, 'id' | 'syncedAt'> & { id?: string; syncedAt?: string }): PlatformEvent {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare<[string, string], PlatformEventRow>(
        'SELECT * FROM platform_events WHERE platform = ? AND external_id = ?',
      )
      .get(input.platform, input.externalId);

    if (existing) {
      this.db
        .prepare(
          `UPDATE platform_events
           SET event_id = ?, external_url = ?, title = ?, date = ?, venue = ?,
               status = ?, raw_data = ?, synced_at = ?, published_at = ?,
               attendance = ?, capacity = ?, revenue = ?, ticket_price = ?,
               description = ?, image_urls = ?
           WHERE platform = ? AND external_id = ?`,
        )
        .run(
          input.eventId ?? existing.event_id ?? null,
          input.externalUrl ?? null,
          input.title,
          input.date ?? null,
          input.venue ?? null,
          input.status,
          input.rawData ?? null,
          now,
          input.publishedAt ?? null,
          input.attendance ?? null,
          input.capacity ?? null,
          input.revenue ?? null,
          input.ticketPrice ?? null,
          input.description ?? null,
          input.imageUrls ? JSON.stringify(input.imageUrls) : null,
          input.platform,
          input.externalId,
        );
      const updated = this.db
        .prepare<[string, string], PlatformEventRow>(
          'SELECT * FROM platform_events WHERE platform = ? AND external_id = ?',
        )
        .get(input.platform, input.externalId)!;
      return rowToEvent(updated);
    }

    const id = input.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO platform_events
           (id, event_id, platform, external_id, external_url, title, date, venue,
            status, raw_data, synced_at, published_at, attendance, capacity, revenue, ticket_price,
            description, image_urls)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.eventId ?? null,
        input.platform,
        input.externalId,
        input.externalUrl ?? null,
        input.title,
        input.date ?? null,
        input.venue ?? null,
        input.status,
        input.rawData ?? null,
        now,
        input.publishedAt ?? null,
        input.attendance ?? null,
        input.capacity ?? null,
        input.revenue ?? null,
        input.ticketPrice ?? null,
        input.description ?? null,
        input.imageUrls ? JSON.stringify(input.imageUrls) : null,
      );

    const inserted = this.db
      .prepare<[string], PlatformEventRow>('SELECT * FROM platform_events WHERE id = ?')
      .get(id)!;
    return rowToEvent(inserted);
  }

  getAll(): PlatformEvent[] {
    const rows = this.db
      .prepare<[], PlatformEventRow>('SELECT * FROM platform_events ORDER BY synced_at DESC')
      .all();
    return rows.map(rowToEvent);
  }

  getByPlatform(platform: PlatformName): PlatformEvent[] {
    const rows = this.db
      .prepare<[string], PlatformEventRow>(
        'SELECT * FROM platform_events WHERE platform = ? ORDER BY synced_at DESC',
      )
      .all(platform);
    return rows.map(rowToEvent);
  }

  getByEventId(eventId: string): PlatformEvent[] {
    const rows = this.db
      .prepare<[string], PlatformEventRow>(
        'SELECT * FROM platform_events WHERE event_id = ? ORDER BY synced_at DESC',
      )
      .all(eventId);
    return rows.map(rowToEvent);
  }

  linkToEvent(platformEventId: string, eventId: string): void {
    this.db
      .prepare('UPDATE platform_events SET event_id = ? WHERE id = ?')
      .run(eventId, platformEventId);
  }

  /**
   * After a successful pull, remove platform_events that weren't in the fresh pull.
   * Called with the set of external_ids that were just pulled.
   * Does NOT delete events — just unlinks stale platform_events.
   *
   * Safety: skips cleanup if the fresh pull returned zero events (likely a failed fetch)
   * or would remove more than 50% of existing events (likely a partial/paginated fetch).
   */
  cleanStale(platform: PlatformName, freshExternalIds: Set<string>): number {
    if (freshExternalIds.size === 0) return 0;

    const existing = this.db.prepare(
      'SELECT id, external_id FROM platform_events WHERE platform = ?'
    ).all(platform) as Array<{ id: string; external_id: string }>;

    if (existing.length === 0) return 0;

    const staleRows = existing.filter(row => !freshExternalIds.has(row.external_id));

    // If we'd remove more than half the existing events, the pull was likely partial — skip cleanup
    if (staleRows.length > existing.length * 0.5 && existing.length > 2) return 0;

    let removed = 0;
    for (const row of staleRows) {
      this.db.prepare('DELETE FROM platform_events WHERE id = ?').run(row.id);
      removed++;
    }
    return removed;
  }
}
