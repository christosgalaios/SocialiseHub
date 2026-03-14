import { randomUUID } from 'node:crypto';
import type { Database } from './database.js';
import type {
  SocialiseEvent,
  EventStatus,
  PlatformPublishStatus,
  PlatformName,
  CreateEventInput,
  UpdateEventInput,
} from '../shared/types.js';

/** Fields the public API is allowed to update via update(). */
const UPDATABLE_FIELDS = new Set([
  'title', 'description', 'start_time', 'end_time', 'duration_minutes',
  'venue', 'price', 'capacity',
]);

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  duration_minutes: number;
  venue: string | null;
  price: number;
  capacity: number | null;
  status: string;
  sync_status: string | null;
  created_at: string;
  updated_at: string;
}

interface PlatformEventRow {
  platform: string;
  external_id: string;
  published_at: string | null;
}

export class SqliteEventStore {
  constructor(private readonly db: Database) {}

  private rowToEvent(row: EventRow): SocialiseEvent {
    const platformRows = this.db
      .prepare<[string], PlatformEventRow>(
        `SELECT platform, external_id, published_at
         FROM platform_events
         WHERE event_id = ?`,
      )
      .all(row.id);

    const platforms: PlatformPublishStatus[] = platformRows.map((pr) => ({
      platform: pr.platform as PlatformName,
      published: pr.published_at != null,
      externalId: pr.external_id,
      publishedAt: pr.published_at ?? undefined,
    }));

    return {
      id: row.id,
      title: row.title,
      description: row.description ?? '',
      start_time: row.start_time,
      end_time: row.end_time ?? undefined,
      duration_minutes: row.duration_minutes,
      venue: row.venue ?? '',
      price: row.price,
      capacity: row.capacity ?? 0,
      status: row.status as EventStatus,
      sync_status: (row.sync_status ?? 'local_only') as 'synced' | 'modified' | 'local_only',
      platforms,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getAll(): SocialiseEvent[] {
    const rows = this.db
      .prepare<[], EventRow>(`SELECT * FROM events ORDER BY start_time DESC`)
      .all();
    return rows.map((row) => this.rowToEvent(row));
  }

  getById(id: string): SocialiseEvent | undefined {
    const row = this.db
      .prepare<[string], EventRow>(`SELECT * FROM events WHERE id = ?`)
      .get(id);
    if (!row) return undefined;
    return this.rowToEvent(row);
  }

  create(input: CreateEventInput): SocialiseEvent {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO events
           (id, title, description, start_time, end_time, duration_minutes,
            venue, price, capacity, status, sync_status, created_at, updated_at)
         VALUES
           (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'local_only', ?, ?)`,
      )
      .run(
        id,
        input.title,
        input.description ?? null,
        input.start_time,
        input.end_time ?? null,
        input.duration_minutes ?? 120,
        input.venue ?? null,
        input.price ?? 0,
        input.capacity ?? null,
        now,
        now,
      );

    return this.getById(id)!;
  }

  update(id: string, input: UpdateEventInput): SocialiseEvent | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (UPDATABLE_FIELDS.has(k)) safe[k] = v;
    }

    if (Object.keys(safe).length === 0) return existing;

    const columnMap: Record<string, string> = {};
    const now = new Date().toISOString();

    const setClauses = Object.keys(safe)
      .map((k) => `${columnMap[k] ?? k} = ?`)
      .join(', ');

    // Auto-flip sync_status from 'synced' to 'modified' when a synced event is edited
    const autoFlip = existing.sync_status === 'synced';
    const syncStatusClause = autoFlip ? ', sync_status = ?' : '';
    const values = autoFlip
      ? [...Object.values(safe), 'modified', now, id]
      : [...Object.values(safe), now, id];

    this.db
      .prepare(`UPDATE events SET ${setClauses}${syncStatusClause}, updated_at = ? WHERE id = ?`)
      .run(...values);

    return this.getById(id);
  }

  updateSyncStatus(id: string, syncStatus: 'synced' | 'modified' | 'local_only'): SocialiseEvent | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE events SET sync_status = ?, updated_at = ? WHERE id = ?`)
      .run(syncStatus, now, id);

    return this.getById(id);
  }

  updateStatus(id: string, status: EventStatus): SocialiseEvent | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE events SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, now, id);

    return this.getById(id);
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM events WHERE id = ?`)
      .run(id);
    return result.changes > 0;
  }
}
