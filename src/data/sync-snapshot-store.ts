import { createHash } from 'node:crypto';
import type { Database } from './database.js';

export interface SyncSnapshot {
  eventId: string;
  platform: string;
  title: string;
  description: string;
  startTime: string;
  venue: string;
  price: number;
  capacity: number;
  photosJson: string;
  snapshotHash: string;
  syncedAt: string;
}

interface SyncSnapshotRow {
  id: number;
  event_id: string;
  platform: string;
  title: string | null;
  description: string | null;
  start_time: string | null;
  venue: string | null;
  price: number | null;
  capacity: number | null;
  photos_json: string | null;
  snapshot_hash: string;
  synced_at: string;
}

export function computeSyncHash(data: {
  title: string;
  description: string;
  startTime: string;
  venue: string;
  price: number;
  capacity: number;
  photos: string[];
}): string {
  const raw = [
    data.title ?? '',
    data.description ?? '',
    data.startTime ?? '',
    data.venue ?? '',
    String(data.price ?? 0),
    String(data.capacity ?? 0),
    JSON.stringify([...data.photos].sort()),
  ].join('|');
  return createHash('md5').update(raw).digest('hex');
}

function rowToSnapshot(row: SyncSnapshotRow): SyncSnapshot {
  return {
    eventId: row.event_id,
    platform: row.platform,
    title: row.title ?? '',
    description: row.description ?? '',
    startTime: row.start_time ?? '',
    venue: row.venue ?? '',
    price: row.price ?? 0,
    capacity: row.capacity ?? 0,
    photosJson: row.photos_json ?? '[]',
    snapshotHash: row.snapshot_hash,
    syncedAt: row.synced_at,
  };
}

export class SyncSnapshotStore {
  constructor(private readonly db: Database) {}

  get(eventId: string, platform: string): SyncSnapshot | null {
    const row = this.db
      .prepare<[string, string], SyncSnapshotRow>(
        'SELECT * FROM event_sync_snapshots WHERE event_id = ? AND platform = ?',
      )
      .get(eventId, platform);
    return row ? rowToSnapshot(row) : null;
  }

  upsert(snapshot: Omit<SyncSnapshot, 'syncedAt'>): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO event_sync_snapshots
           (event_id, platform, title, description, start_time, venue, price, capacity, photos_json, snapshot_hash, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(event_id, platform) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           start_time = excluded.start_time,
           venue = excluded.venue,
           price = excluded.price,
           capacity = excluded.capacity,
           photos_json = excluded.photos_json,
           snapshot_hash = excluded.snapshot_hash,
           synced_at = excluded.synced_at`,
      )
      .run(
        snapshot.eventId,
        snapshot.platform,
        snapshot.title,
        snapshot.description,
        snapshot.startTime,
        snapshot.venue,
        snapshot.price,
        snapshot.capacity,
        snapshot.photosJson,
        snapshot.snapshotHash,
        now,
      );
  }

  delete(eventId: string, platform: string): void {
    this.db
      .prepare('DELETE FROM event_sync_snapshots WHERE event_id = ? AND platform = ?')
      .run(eventId, platform);
  }
}
