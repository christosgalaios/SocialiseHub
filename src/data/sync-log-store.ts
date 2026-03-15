import type { Database } from './database.js';
import type { SyncLogEntry, PlatformName, SyncAction } from '../shared/types.js';

interface SyncLogRow {
  id: number;
  platform: string;
  action: string;
  event_id: string | null;
  external_id: string | null;
  status: string;
  message: string | null;
  created_at: string;
}

function rowToEntry(row: SyncLogRow): SyncLogEntry {
  return {
    id: row.id,
    platform: row.platform as PlatformName,
    action: row.action as SyncAction,
    eventId: row.event_id ?? undefined,
    externalId: row.external_id ?? undefined,
    status: row.status as SyncLogEntry['status'],
    message: row.message ?? undefined,
    createdAt: row.created_at,
  };
}

export class SyncLogStore {
  constructor(private readonly db: Database) {}

  log(input: Omit<SyncLogEntry, 'id' | 'createdAt'>): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO sync_log (platform, action, event_id, external_id, status, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.platform,
        input.action,
        input.eventId ?? null,
        input.externalId ?? null,
        input.status,
        input.message ?? null,
        now,
      );
  }

  getRecent(limit = 50): SyncLogEntry[] {
    const rows = this.db
      .prepare<[number], SyncLogRow>(
        'SELECT * FROM sync_log ORDER BY id DESC LIMIT ?',
      )
      .all(limit);
    return rows.map(rowToEntry);
  }

  getByEventId(eventId: string, limit = 50): SyncLogEntry[] {
    const rows = this.db
      .prepare<[string, number], SyncLogRow>(
        'SELECT * FROM sync_log WHERE event_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(eventId, limit);
    return rows.map(rowToEntry);
  }
}
