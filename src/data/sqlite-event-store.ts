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
  'actual_attendance', 'actual_revenue',
  'short_description', 'doors_open_time', 'age_restriction', 'event_type',
  'online_url', 'parking_info', 'refund_policy', 'allow_guests',
  'rsvp_open', 'rsvp_close', 'organizer_name',
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
  actual_attendance: number | null;
  actual_revenue: number | null;
  short_description: string | null;
  doors_open_time: string | null;
  age_restriction: string | null;
  event_type: string | null;
  online_url: string | null;
  parking_info: string | null;
  refund_policy: string | null;
  allow_guests: number | null;
  rsvp_open: string | null;
  rsvp_close: string | null;
  organizer_name: string | null;
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

    const eventSyncStatus = row.sync_status as string | null;
    const platforms: PlatformPublishStatus[] = platformRows.map((pr) => ({
      platform: pr.platform as PlatformName,
      published: pr.published_at != null || eventSyncStatus === 'synced',
      externalId: pr.external_id,
      externalUrl: pr.external_url ?? undefined,
      publishedAt: pr.published_at ?? undefined,
      syncStatus: eventSyncStatus === 'synced' ? 'synced'
        : eventSyncStatus === 'modified' ? 'modified'
        : undefined,
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
      actual_attendance: row.actual_attendance ?? undefined,
      actual_revenue: row.actual_revenue ?? undefined,
      short_description: row.short_description ?? undefined,
      doors_open_time: row.doors_open_time ?? undefined,
      age_restriction: row.age_restriction ?? undefined,
      event_type: row.event_type ?? undefined,
      online_url: row.online_url ?? undefined,
      parking_info: row.parking_info ?? undefined,
      refund_policy: row.refund_policy ?? undefined,
      allow_guests: row.allow_guests ?? undefined,
      rsvp_open: row.rsvp_open ?? undefined,
      rsvp_close: row.rsvp_close ?? undefined,
      organizer_name: row.organizer_name ?? undefined,
      platforms,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getAll(): SocialiseEvent[] {
    const rows = this.db
      .prepare<[], EventRow>(`SELECT * FROM events ORDER BY start_time DESC`)
      .all();
    if (rows.length === 0) return [];

    // Batch-load all platform events to avoid N+1 queries
    const allPlatformRows = this.db.prepare<[], PlatformEventRow & { event_id: string }>(
      `SELECT event_id, platform, external_id, external_url, published_at
       FROM platform_events WHERE event_id IS NOT NULL`,
    ).all();
    const rawPlatformsByEvent = new Map<string, Array<PlatformEventRow & { event_id: string }>>();
    for (const pr of allPlatformRows) {
      if (!rawPlatformsByEvent.has(pr.event_id)) rawPlatformsByEvent.set(pr.event_id, []);
      rawPlatformsByEvent.get(pr.event_id)!.push(pr);
    }

    // Batch-load all cover photos
    const coverPhotos = new Map<string, string>();
    const photoRows = this.db.prepare<[], { event_id: string; photo_path: string }>(
      'SELECT event_id, photo_path FROM event_photos WHERE is_cover = 1',
    ).all();
    for (const p of photoRows) coverPhotos.set(p.event_id, p.photo_path);

    // Batch-load notes counts
    const notesCounts = new Map<string, number>();
    const notesRows = this.db.prepare<[], { event_id: string; cnt: number }>(
      'SELECT event_id, COUNT(*) as cnt FROM event_notes GROUP BY event_id',
    ).all();
    for (const r of notesRows) notesCounts.set(r.event_id, r.cnt);

    // Batch-load checklist progress
    const checklistProgress = new Map<string, { total: number; done: number }>();
    const checklistRows = this.db.prepare<[], { event_id: string; total: number; done: number }>(
      'SELECT event_id, COUNT(*) as total, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as done FROM event_checklist GROUP BY event_id',
    ).all();
    for (const r of checklistRows) checklistProgress.set(r.event_id, { total: r.total, done: r.done });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? '',
      start_time: row.start_time,
      end_time: row.end_time ?? undefined,
      duration_minutes: row.duration_minutes,
      venue: row.venue ?? '',
      price: row.price,
      capacity: row.capacity ?? 0,
      imageUrl: coverPhotos.get(row.id) ?? (row.image_url || undefined),
      category: row.category ?? undefined,
      status: row.status as EventStatus,
      sync_status: (row.sync_status ?? 'local_only') as 'synced' | 'modified' | 'local_only',
      actual_attendance: row.actual_attendance ?? undefined,
      actual_revenue: row.actual_revenue ?? undefined,
      short_description: row.short_description ?? undefined,
      doors_open_time: row.doors_open_time ?? undefined,
      age_restriction: row.age_restriction ?? undefined,
      event_type: row.event_type ?? undefined,
      online_url: row.online_url ?? undefined,
      parking_info: row.parking_info ?? undefined,
      refund_policy: row.refund_policy ?? undefined,
      allow_guests: row.allow_guests ?? undefined,
      rsvp_open: row.rsvp_open ?? undefined,
      rsvp_close: row.rsvp_close ?? undefined,
      platforms: (rawPlatformsByEvent.get(row.id) ?? []).map((pr) => ({
        platform: pr.platform as PlatformName,
        published: pr.published_at != null || row.sync_status === 'synced',
        externalId: pr.external_id,
        externalUrl: pr.external_url ?? undefined,
        publishedAt: pr.published_at ?? undefined,
        syncStatus: row.sync_status === 'synced' ? 'synced' as const
          : row.sync_status === 'modified' ? 'modified' as const
          : undefined,
      })),
      notesCount: notesCounts.get(row.id) ?? 0,
      checklistTotal: checklistProgress.get(row.id)?.total ?? 0,
      checklistDone: checklistProgress.get(row.id)?.done ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
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
        .prepare<[string], EventRow>(`SELECT * FROM events WHERE substr(start_time, 1, 10) = ?`)
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
            venue, price, capacity, category, status, sync_status,
            short_description, doors_open_time, age_restriction, event_type,
            online_url, parking_info, refund_policy, allow_guests,
            rsvp_open, rsvp_close, organizer_name,
            created_at, updated_at)
         VALUES
           (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'local_only',
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?)`,
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
        input.short_description ?? null,
        input.doors_open_time ?? null,
        input.age_restriction ?? null,
        input.event_type ?? null,
        input.online_url ?? null,
        input.parking_info ?? null,
        input.refund_policy ?? null,
        input.allow_guests ?? null,
        input.rsvp_open ?? null,
        input.rsvp_close ?? null,
        (input as any).organizer_name ?? null,
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

  updateSyncStatus(id: string, syncStatus: 'synced' | 'modified' | 'local_only' | 'platform_changed'): SocialiseEvent | undefined {
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
    // Wrap in transaction for atomicity — all cleanup succeeds or none does
    const deleteAll = this.db.transaction(() => {
      this.db.prepare('DELETE FROM event_sync_snapshots WHERE event_id = ?').run(id);
      this.db.prepare('DELETE FROM event_photos WHERE event_id = ?').run(id);
      this.db.prepare('DELETE FROM event_scores WHERE event_id = ?').run(id);
      this.db.prepare('DELETE FROM event_snapshots WHERE event_id = ?').run(id);
      this.db.prepare('DELETE FROM event_notes WHERE event_id = ?').run(id);
      this.db.prepare('DELETE FROM event_tags WHERE event_id = ?').run(id);
      this.db.prepare('DELETE FROM event_checklist WHERE event_id = ?').run(id);
      this.db.prepare('DELETE FROM sync_log WHERE event_id = ?').run(id);
      this.db.prepare('UPDATE platform_events SET event_id = NULL WHERE event_id = ?').run(id);
      return this.db.prepare('DELETE FROM events WHERE id = ?').run(id);
    });
    const result = deleteAll();
    return result.changes > 0;
  }
}
