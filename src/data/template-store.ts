import { randomUUID } from 'node:crypto';
import type { Database } from './database.js';
import type { Template, CreateTemplateInput, PlatformName } from '../shared/types.js';

function safeJsonParse<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; }
  catch { return fallback; }
}

interface TemplateRow {
  id: string;
  name: string;
  title: string;
  description: string | null;
  venue: string | null;
  duration_minutes: number;
  price: number;
  capacity: number | null;
  image_url: string | null;
  platforms: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    description: row.description ?? '',
    venue: row.venue ?? '',
    durationMinutes: row.duration_minutes,
    price: row.price,
    capacity: row.capacity ?? 0,
    imageUrl: row.image_url ?? undefined,
    platforms: row.platforms ? safeJsonParse<PlatformName[]>(row.platforms, []) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TemplateStore {
  constructor(private readonly db: Database) {}

  getAll(): Template[] {
    const rows = this.db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all() as TemplateRow[];
    return rows.map(rowToTemplate);
  }

  getById(id: string): Template | undefined {
    const row = this.db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as TemplateRow | undefined;
    return row ? rowToTemplate(row) : undefined;
  }

  create(input: CreateTemplateInput): Template {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO templates (id, name, title, description, venue, duration_minutes, price, capacity, image_url, platforms, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.name,
      input.title,
      input.description || null,
      input.venue || null,
      input.durationMinutes,
      input.price,
      input.capacity || null,
      input.imageUrl || null,
      JSON.stringify(input.platforms ?? []),
      now,
      now,
    );
    return this.getById(id)!;
  }

  update(id: string, input: Partial<CreateTemplateInput>): Template | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const fields: string[] = [];
    const values: unknown[] = [];

    const map: Record<string, [string, unknown]> = {
      name: ['name', input.name],
      title: ['title', input.title],
      description: ['description', input.description],
      venue: ['venue', input.venue],
      durationMinutes: ['duration_minutes', input.durationMinutes],
      price: ['price', input.price],
      capacity: ['capacity', input.capacity],
      imageUrl: ['image_url', input.imageUrl],
      platforms: ['platforms', input.platforms ? JSON.stringify(input.platforms) : undefined],
    };

    for (const [key, [col, val]] of Object.entries(map)) {
      if (key in input && val !== undefined) {
        fields.push(`${col} = ?`);
        values.push(val);
      }
    }

    if (fields.length === 0) return existing;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE templates SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM templates WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
