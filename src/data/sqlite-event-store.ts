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
  'venue', 'price', 'capacity', 'image_url', 'category',
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
  image_url: string | null;
  category: string | null;
  status: string;
  sync_status: string | null;
  created_at: string;
  updated_at: string;
}

interface PlatformEventRow {
  platform: string;
  external_id: string;
  external_url: string | null;
  published_at: string | null;
}

export class SqliteEventStore {
  constructor(private readonly db: Database) {}

  private rowToEvent(row: EventRow): SocialiseEvent {
    const platformRows = this.db
      .prepare<[string], PlatformEventRow>(
        `SELECT platform, external_id, external_url, published_at
         FROM platform_events
         WHERE event_id = ?`,
      )
      .all(row.id);

    const platforms: PlatformPublishStatus[] = platformRows.map((pr) => ({
      platform: pr.platform as PlatformName,
      published: pr.published_at != null,
      externalId: pr.external_id,
      externalUrl: pr.external_url ?? undefined,
      publishedAt: pr.published_at ?? undefined,
    }));

    // Get cover photo URL
    const coverPhoto = this.db
      .prepare<[string], { photo_path: string }>(
        'SELECT photo_path FROM event_photos WHERE event_id = ? AND is_cover = 1 LIMIT 1'
      )
      .get(row.id);

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
      imageUrl: coverPhoto?.photo_path ?? (row.image_url || undefined),
      category: row.category ?? undefined,
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

  /**
   * Find an existing event that matches by normalized title + same date.
   * Used for cross-platform deduplication during sync.
   */
  findMatch(title: string, date?: string): SocialiseEvent | undefined {
    if (!title) return undefined;
    // Normalize: lowercase, strip emojis/special chars, collapse whitespace
    const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    const normalizedTitle = normalize(title);
    if (!normalizedTitle) return undefined;

    // Search by date first (narrows candidates), then fuzzy match title
    let candidates: EventRow[];
    if (date) {
      // Match events on the same day
      const datePrefix = date.slice(0, 10); // YYYY-MM-DD
      candidates = this.db
        .prepare<[string], EventRow>(`SELECT * FROM events WHERE start_time LIKE ? || '%'`)
        .all(datePrefix);
    } else {
      // No date — search all (expensive, but rare)
      candidates = this.db.prepare<[], EventRow>('SELECT * FROM events').all();
    }

    for (const row of candidates) {
      const candidateTitle = normalize(row.title);
      // Exact match after normalization
      if (candidateTitle === normalizedTitle) return this.rowToEvent(row);
      // Substring match only when the shorter string is at least 60% of the longer string.
      // This prevents false matches like "social" matching "antisocial networking night".
      const shorter = candidateTitle.length <= normalizedTitle.length ? candidateTitle : normalizedTitle;
      const longer = candidateTitle.length > normalizedTitle.length ? candidateTitle : normalizedTitle;
      if (shorter.length >= longer.length * 0.6 && longer.includes(shorter)) {
        return this.rowToEvent(row);
      }
    }
    return undefined;
  }

  create(input: CreateEventInput): SocialiseEvent {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO events
           (id, title, description, start_time, end_time, duration_minutes,
            venue, price, capacity, category, status, sync_status, created_at, updated_at)
         VALUES
           (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'local_only', ?, ?)`,
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
        input.category ?? null,
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

    const now = new Date().toISOString();

    const setClauses = Object.keys(safe)
      .map((k) => `${k} = ?`)
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
    // Clean up FK references before deleting
    this.db.prepare('DELETE FROM event_sync_snapshots WHERE event_id = ?').run(id);
    this.db.prepare('DELETE FROM event_photos WHERE event_id = ?').run(id);
    this.db.prepare('DELETE FROM event_scores WHERE event_id = ?').run(id);
    this.db.prepare('DELETE FROM event_snapshots WHERE event_id = ?').run(id);
    this.db.prepare('DELETE FROM event_notes WHERE event_id = ?').run(id);
    this.db.prepare('DELETE FROM event_tags WHERE event_id = ?').run(id);
    this.db.prepare('UPDATE platform_events SET event_id = NULL WHERE event_id = ?').run(id);
    const result = this.db
      .prepare('DELETE FROM events WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }
}
