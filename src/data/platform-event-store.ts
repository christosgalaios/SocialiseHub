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
               attendance = ?, capacity = ?, revenue = ?, ticket_price = ?
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
            status, raw_data, synced_at, published_at, attendance, capacity, revenue, ticket_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
   * Clear all platform_events for a platform and delete orphaned synced events.
   * Preserves events shared with other platforms and locally modified events.
   */
  clearPlatform(platform: PlatformName, eventStore?: { delete(id: string): void; getById(id: string): { sync_status?: string } | undefined }): void {
    // Find events ONLY linked to this platform (not shared with others)
    const onlyThisPlatform = this.db.prepare(`
      SELECT pe.event_id FROM platform_events pe
      WHERE pe.platform = ? AND pe.event_id IS NOT NULL
        AND pe.event_id NOT IN (
          SELECT event_id FROM platform_events
          WHERE platform != ? AND event_id IS NOT NULL
        )
    `).all(platform, platform) as Array<{ event_id: string }>;

    // Delete platform_events for this platform
    this.db.prepare('DELETE FROM platform_events WHERE platform = ?').run(platform);

    // Delete orphaned events that were only on this platform and are synced
    if (eventStore) {
      for (const { event_id } of onlyThisPlatform) {
        const ev = eventStore.getById(event_id);
        if (ev && ev.sync_status === 'synced') {
          eventStore.delete(event_id);
        }
      }
    }
  }
}
