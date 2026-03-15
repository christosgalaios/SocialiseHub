import type { Database } from './database.js';
import type { QueuedIdea } from '../shared/types.js';

interface IdeaRow {
  id: number;
  title: string;
  short_description: string | null;
  category: string | null;
  suggested_date: string | null;
  date_reason: string | null;
  confidence: string | null;
  used: number;
  created_at: string;
}

function rowToIdea(row: IdeaRow): QueuedIdea {
  return {
    id: row.id,
    title: row.title,
    shortDescription: row.short_description ?? '',
    category: row.category ?? '',
    suggestedDate: row.suggested_date ?? '',
    dateReason: row.date_reason ?? '',
    confidence: (row.confidence as 'high' | 'medium' | 'low') ?? 'medium',
    used: row.used === 1,
    createdAt: row.created_at,
  };
}

export class IdeaStore {
  constructor(private readonly db: Database) {}

  getNextUnused(): QueuedIdea | undefined {
    const row = this.db
      .prepare<[], IdeaRow>(
        `SELECT * FROM event_ideas WHERE used = 0 ORDER BY id ASC LIMIT 1`,
      )
      .get();
    return row ? rowToIdea(row) : undefined;
  }

  countUnused(): number {
    const result = this.db
      .prepare<[], { count: number }>(
        `SELECT COUNT(*) AS count FROM event_ideas WHERE used = 0`,
      )
      .get();
    return result?.count ?? 0;
  }

  markUsed(id: number): boolean {
    const result = this.db
      .prepare(`UPDATE event_ideas SET used = 1 WHERE id = ?`)
      .run(id);
    return result.changes > 0;
  }

  insertBatch(ideas: Omit<QueuedIdea, 'id' | 'used' | 'createdAt'>[]): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      `INSERT INTO event_ideas
         (title, short_description, category, suggested_date, date_reason, confidence, used, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    );
    const insertAll = this.db.transaction(() => {
      for (const idea of ideas) {
        stmt.run(
          idea.title,
          idea.shortDescription || null,
          idea.category || null,
          idea.suggestedDate || null,
          idea.dateReason || null,
          idea.confidence ?? 'medium',
          now,
        );
      }
    });
    insertAll();
  }

  getById(id: number): QueuedIdea | undefined {
    const row = this.db
      .prepare<[number], IdeaRow>(
        `SELECT * FROM event_ideas WHERE id = ?`,
      )
      .get(id);
    return row ? rowToIdea(row) : undefined;
  }
}
