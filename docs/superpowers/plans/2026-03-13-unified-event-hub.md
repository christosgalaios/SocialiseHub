# Unified Event Hub Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stub platform integrations with real OAuth flows and API calls for Meetup, Eventbrite, and Headfirst Bristol, migrate from JSON to SQLite storage, and build a unified dashboard showing all events across platforms.

**Architecture:** Express backend with SQLite (better-sqlite3) storage, platform client layer implementing a shared interface, React frontend with unified dashboard. OAuth2 for Meetup/Eventbrite, credentials for Headfirst. PublishService orchestrates multi-platform publishing.

**Tech Stack:** Node.js 20, TypeScript, Express 5, React 19, Vite 7, better-sqlite3, Vitest

**Spec:** `docs/superpowers/specs/2026-03-13-unified-event-hub-design.md`

---

## File Structure

### New Files (Backend)
| File | Responsibility |
|------|---------------|
| `src/data/database.ts` | SQLite connection, schema creation, migration runner |
| `src/data/crypto.ts` | AES-256-GCM encrypt/decrypt for credentials |
| `src/data/sqlite-event-store.ts` | Event CRUD against SQLite `events` table |
| `src/data/sqlite-service-store.ts` | Service connection CRUD against SQLite `services` table |
| `src/data/platform-event-store.ts` | CRUD for `platform_events` table |
| `src/data/sync-log-store.ts` | Insert/query `sync_log` table |
| `src/data/migrate-json.ts` | One-time JSON → SQLite migration script |
| `src/tools/platform-client.ts` | `PlatformClient` interface + `PlatformPublishResult` type |
| `src/tools/publish-service.ts` | Multi-platform publish orchestration (replaces EventCreator) |
| `src/routes/sync.ts` | Sync pull, sync log, dashboard summary endpoints |

### New Files (Frontend)
| File | Responsibility |
|------|---------------|
| `client/src/pages/DashboardPage.tsx` | Unified event dashboard with summary cards + timeline |
| `client/src/pages/SyncLogPage.tsx` | Sync audit log table |
| `client/src/components/DashboardSummary.tsx` | Stats cards (total, this week, by platform) |
| `client/src/components/EventTimeline.tsx` | Unified event list with filters |
| `client/src/components/PlatformSelector.tsx` | Multi-platform checkbox group |
| `client/src/components/CredentialsForm.tsx` | Headfirst email/password form |

### Modified Files
| File | Changes |
|------|---------|
| `package.json` | Add `better-sqlite3`, `@types/better-sqlite3` |
| `src/shared/types.ts` | New types: `PlatformEvent`, `SyncLogEntry`, `DashboardSummary`, update `SocialiseEvent` fields |
| `src/tools/meetup.ts` | Implement `PlatformClient` with real GraphQL API |
| `src/tools/eventbrite.ts` | Implement `PlatformClient` with real REST v3 API |
| `src/tools/headfirst.ts` | Implement `PlatformClient` with web scraping |
| `src/routes/events.ts` | Use SQLite store, integrate PublishService |
| `src/routes/services.ts` | Use SQLite service store, add setup endpoint |
| `src/routes/auth.ts` | Add token refresh, HTML-escape error messages |
| `src/app.ts` | Wire SQLite stores, remove EventCreator, add sync routes |
| `src/lib/validate.ts` | Update for new `start_time`/`end_time` fields |
| `client/src/App.tsx` | Add Dashboard + SyncLog routes, update nav |
| `client/src/api/events.ts` | Add dashboard, sync, and setup API functions |
| `client/src/pages/EventDetailPage.tsx` | Platform selector, publish status panel |
| `client/src/pages/ServicesPage.tsx` | OAuth buttons, credentials form |

### Removed Files
| File | Reason |
|------|--------|
| `src/data/store.ts` | Replaced by SQLite stores |
| `src/agents/event-creator.ts` | Replaced by PublishService |

---

## Chunk 1: Database Layer + Types

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install better-sqlite3**

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

- [ ] **Step 2: Verify install**

```bash
node -e "require('better-sqlite3')"
```
Expected: no error

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add better-sqlite3 dependency"
```

---

### Task 2: Update shared types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Update SocialiseEvent to use start_time/end_time**

Replace the existing `SocialiseEvent` interface and related types. The `date` and `time` fields become `start_time` and `end_time` (ISO 8601 with timezone). Add `duration_minutes` as fallback.

```typescript
// In src/shared/types.ts — replace the Events section:

export interface SocialiseEvent {
  id: string;
  title: string;
  description: string;
  start_time: string;        // ISO 8601 with timezone (Europe/London)
  end_time?: string;          // ISO 8601 with timezone
  duration_minutes: number;   // Fallback if no end_time (default 120)
  venue: string;
  price: number;
  capacity: number;
  imageUrl?: string;
  status: EventStatus;
  platforms: PlatformPublishStatus[];
  createdAt: string;
  updatedAt: string;
}

export type CreateEventInput = Omit<
  SocialiseEvent,
  'id' | 'createdAt' | 'updatedAt' | 'platforms' | 'status'
> & {
  platforms?: PlatformName[];
};
```

- [ ] **Step 2: Add new types for platform events, sync log, dashboard**

Append to `src/shared/types.ts`:

```typescript
// ── Platform Events (from sync) ────────────────────────

export interface PlatformEvent {
  id: string;
  eventId?: string;           // FK to events.id, null if external
  platform: PlatformName;
  externalId: string;
  externalUrl?: string;
  title: string;
  date?: string;
  venue?: string;
  status: 'active' | 'cancelled' | 'past';
  rawData?: string;           // JSON blob
  syncedAt: string;
  publishedAt?: string;
}

export interface PlatformPublishResult {
  platform: PlatformName;
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  error?: string;
}

// ── Sync Log ───────────────────────────────────────────

export type SyncAction = 'pull' | 'push' | 'publish' | 'update';

export interface SyncLogEntry {
  id: number;
  platform: PlatformName;
  action: SyncAction;
  eventId?: string;
  externalId?: string;
  status: 'success' | 'error';
  message?: string;
  createdAt: string;
}

// ── Dashboard ──────────────────────────────────────────

export interface DashboardSummary {
  totalEvents: number;
  eventsThisWeek: number;
  eventsThisMonth: number;
  byPlatform: Record<PlatformName, number>;
}

// ── Unified Event (for dashboard display) ──────────────

export interface UnifiedEvent {
  id: string;
  title: string;
  date: string;
  venue?: string;
  status: string;
  platforms: PlatformName[];
  source: 'internal' | 'external';
  internalEventId?: string;
  externalUrl?: string;
}
```

- [ ] **Step 3: Run lint to verify**

```bash
npm run lint
```
Expected: no errors in types.ts

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: update types for SQLite schema — start_time, PlatformEvent, SyncLogEntry, DashboardSummary"
```

---

### Task 3: Encryption utility

**Files:**
- Create: `src/data/crypto.ts`
- Create: `src/data/crypto.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/crypto.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto.js';

describe('crypto', () => {
  it('encrypts and decrypts a string', () => {
    const plaintext = 'my-secret-token-12345';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(':'); // iv:authTag:ciphertext format
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('returns empty string for empty input', () => {
    expect(encrypt('')).toBe('');
    expect(decrypt('')).toBe('');
  });

  it('produces different ciphertext for same input (random IV)', () => {
    const a = encrypt('same-value');
    const b = encrypt('same-value');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('same-value');
    expect(decrypt(b)).toBe('same-value');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/data/crypto.test.ts
```
Expected: FAIL — cannot find module

- [ ] **Step 3: Write implementation**

Create `src/data/crypto.ts`:

```typescript
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'node:crypto';
import { hostname, userInfo } from 'node:os';

const ALGORITHM = 'aes-256-gcm';
const SALT = 'socialisehub-credential-salt-v1';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const machine = `${hostname()}:${userInfo().username}`;
  cachedKey = pbkdf2Sync(machine, SALT, 100_000, 32, 'sha256');
  return cachedKey;
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return '';
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return '';
  const key = deriveKey();
  const [ivHex, authTagHex, encHex] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/data/crypto.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/crypto.ts src/data/crypto.test.ts
git commit -m "feat: add AES-256-GCM encryption utility for credential storage"
```

---

### Task 4: SQLite database setup

**Files:**
- Create: `src/data/database.ts`
- Create: `src/data/database.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/database.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { createDatabase, type Database } from './database.js';

describe('database', () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  it('creates all tables in-memory', () => {
    db = createDatabase(':memory:');
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('events');
    expect(names).toContain('platform_events');
    expect(names).toContain('services');
    expect(names).toContain('sync_log');
  });

  it('enforces unique constraint on platform_events(platform, external_id)', () => {
    db = createDatabase(':memory:');
    db.prepare(`INSERT INTO platform_events (id, platform, external_id, title, status, synced_at)
      VALUES ('a', 'meetup', 'ext-1', 'Test', 'active', '2026-01-01')`).run();
    expect(() => {
      db.prepare(`INSERT INTO platform_events (id, platform, external_id, title, status, synced_at)
        VALUES ('b', 'meetup', 'ext-1', 'Dupe', 'active', '2026-01-01')`).run();
    }).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/data/database.test.ts
```
Expected: FAIL — cannot find module

- [ ] **Step 3: Write implementation**

Create `src/data/database.ts`:

```typescript
import BetterSqlite3 from 'better-sqlite3';

export type Database = BetterSqlite3.Database;

export function createDatabase(path: string): Database {
  const db = new BetterSqlite3(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema(db);
  return db;
}

function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_minutes INTEGER DEFAULT 120,
      venue TEXT,
      price REAL DEFAULT 0,
      capacity INTEGER,
      image_url TEXT,
      status TEXT DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_events (
      id TEXT PRIMARY KEY,
      event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
      platform TEXT NOT NULL,
      external_id TEXT NOT NULL,
      external_url TEXT,
      title TEXT,
      date TEXT,
      venue TEXT,
      status TEXT DEFAULT 'active',
      raw_data TEXT,
      synced_at TEXT NOT NULL,
      published_at TEXT,
      UNIQUE(platform, external_id)
    );

    CREATE TABLE IF NOT EXISTS services (
      platform TEXT PRIMARY KEY,
      connected INTEGER DEFAULT 0,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TEXT,
      extra TEXT,
      connected_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      action TEXT NOT NULL,
      event_id TEXT,
      external_id TEXT,
      status TEXT NOT NULL,
      message TEXT,
      created_at TEXT NOT NULL
    );

    -- Seed default service rows if empty
    INSERT OR IGNORE INTO services (platform, connected) VALUES ('meetup', 0);
    INSERT OR IGNORE INTO services (platform, connected) VALUES ('eventbrite', 0);
    INSERT OR IGNORE INTO services (platform, connected) VALUES ('headfirst', 0);
  `);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/data/database.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/database.ts src/data/database.test.ts
git commit -m "feat: add SQLite database setup with schema for events, platform_events, services, sync_log"
```

---

### Task 5: SQLite Event Store

**Files:**
- Create: `src/data/sqlite-event-store.ts`
- Create: `src/data/sqlite-event-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/sqlite-event-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from './database.js';
import { SqliteEventStore } from './sqlite-event-store.js';

describe('SqliteEventStore', () => {
  let db: Database;
  let store: SqliteEventStore;

  beforeEach(() => {
    db = createDatabase(':memory:');
    store = new SqliteEventStore(db);
  });

  afterEach(() => db.close());

  const validInput = {
    title: 'Test Event',
    description: 'A test',
    start_time: '2026-04-01T19:00:00+01:00',
    duration_minutes: 120,
    venue: 'The Lanes',
    price: 10,
    capacity: 100,
  };

  it('creates and retrieves an event', () => {
    const event = store.create(validInput);
    expect(event.id).toBeTruthy();
    expect(event.title).toBe('Test Event');
    expect(event.status).toBe('draft');
    expect(event.platforms).toEqual([]);

    const fetched = store.getById(event.id);
    expect(fetched).toEqual(event);
  });

  it('lists all events', () => {
    store.create(validInput);
    store.create({ ...validInput, title: 'Second' });
    const all = store.getAll();
    expect(all).toHaveLength(2);
  });

  it('updates an event', () => {
    const event = store.create(validInput);
    const updated = store.update(event.id, { title: 'Updated Title' });
    expect(updated?.title).toBe('Updated Title');
    expect(updated?.venue).toBe('The Lanes'); // unchanged
  });

  it('deletes an event', () => {
    const event = store.create(validInput);
    expect(store.delete(event.id)).toBe(true);
    expect(store.getById(event.id)).toBeUndefined();
  });

  it('returns undefined for non-existent event', () => {
    expect(store.getById('no-such-id')).toBeUndefined();
    expect(store.update('no-such-id', { title: 'x' })).toBeUndefined();
    expect(store.delete('no-such-id')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/data/sqlite-event-store.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write implementation**

Create `src/data/sqlite-event-store.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import type { Database } from './database.js';
import type { SocialiseEvent, CreateEventInput, PlatformPublishStatus } from '../shared/types.js';

type EventRow = {
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
  status: string;
  created_at: string;
  updated_at: string;
};

export class SqliteEventStore {
  constructor(private readonly db: Database) {}

  private rowToEvent(row: EventRow): SocialiseEvent {
    // Fetch platform statuses from platform_events table
    const platformRows = this.db.prepare(
      'SELECT platform, external_id, published_at FROM platform_events WHERE event_id = ?'
    ).all(row.id) as { platform: string; external_id: string; published_at: string | null }[];

    const platforms: PlatformPublishStatus[] = platformRows.map((p) => ({
      platform: p.platform as SocialiseEvent['platforms'][number]['platform'],
      published: true,
      externalId: p.external_id,
      publishedAt: p.published_at ?? undefined,
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
      imageUrl: row.image_url ?? undefined,
      status: row.status as SocialiseEvent['status'],
      platforms,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getAll(): SocialiseEvent[] {
    const rows = this.db.prepare('SELECT * FROM events ORDER BY start_time DESC').all() as EventRow[];
    return rows.map((r) => this.rowToEvent(r));
  }

  getById(id: string): SocialiseEvent | undefined {
    const row = this.db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
    if (!row) return undefined;
    return this.rowToEvent(row);
  }

  create(input: Omit<CreateEventInput, 'platforms'>): SocialiseEvent {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO events (id, title, description, start_time, end_time, duration_minutes, venue, price, capacity, image_url, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
    `).run(
      id,
      input.title,
      input.description ?? null,
      input.start_time,
      input.end_time ?? null,
      input.duration_minutes ?? 120,
      input.venue ?? null,
      input.price ?? 0,
      input.capacity ?? null,
      input.imageUrl ?? null,
      now,
      now,
    );
    return this.getById(id)!;
  }

  update(id: string, input: Partial<CreateEventInput>): SocialiseEvent | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const fields: string[] = [];
    const values: unknown[] = [];

    const mapping: Record<string, string> = {
      title: 'title',
      description: 'description',
      start_time: 'start_time',
      end_time: 'end_time',
      duration_minutes: 'duration_minutes',
      venue: 'venue',
      price: 'price',
      capacity: 'capacity',
      imageUrl: 'image_url',
    };

    for (const [key, col] of Object.entries(mapping)) {
      if (key in input) {
        fields.push(`${col} = ?`);
        values.push((input as Record<string, unknown>)[key] ?? null);
      }
    }

    if (fields.length === 0) return existing;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  updateStatus(id: string, status: SocialiseEvent['status']): SocialiseEvent | undefined {
    const result = this.db.prepare(
      'UPDATE events SET status = ?, updated_at = ? WHERE id = ?'
    ).run(status, new Date().toISOString(), id);
    if (result.changes === 0) return undefined;
    return this.getById(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM events WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/data/sqlite-event-store.test.ts
```
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/sqlite-event-store.ts src/data/sqlite-event-store.test.ts
git commit -m "feat: add SQLite event store with CRUD operations"
```

---

### Task 6: SQLite Service Store

**Files:**
- Create: `src/data/sqlite-service-store.ts`
- Create: `src/data/sqlite-service-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/sqlite-service-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from './database.js';
import { SqliteServiceStore } from './sqlite-service-store.js';

describe('SqliteServiceStore', () => {
  let db: Database;
  let store: SqliteServiceStore;

  beforeEach(() => {
    db = createDatabase(':memory:');
    store = new SqliteServiceStore(db);
  });

  afterEach(() => db.close());

  it('lists all services without credentials', () => {
    const services = store.getAll();
    expect(services).toHaveLength(3);
    expect(services[0].platform).toBe('meetup');
    expect(services[0].connected).toBe(false);
    // No access_token field in response
    expect('access_token' in services[0]).toBe(false);
  });

  it('connects a service with encrypted credentials', () => {
    const service = store.connect('meetup', { accessToken: 'tok-123', refreshToken: 'ref-456' });
    expect(service).toBeDefined();
    expect(service!.connected).toBe(true);
    expect(service!.connectedAt).toBeTruthy();

    // Verify credentials are stored (encrypted) in DB
    const row = db.prepare('SELECT access_token FROM services WHERE platform = ?').get('meetup') as { access_token: string };
    expect(row.access_token).not.toBe('tok-123'); // encrypted
    expect(row.access_token).toContain(':'); // iv:tag:cipher format
  });

  it('disconnects a service and clears credentials', () => {
    store.connect('eventbrite', { accessToken: 'tok' });
    const service = store.disconnect('eventbrite');
    expect(service!.connected).toBe(false);

    const row = db.prepare('SELECT access_token FROM services WHERE platform = ?').get('eventbrite') as { access_token: string | null };
    expect(row.access_token).toBeNull();
  });

  it('getService returns full credentials for internal use', () => {
    store.connect('meetup', { accessToken: 'my-token' });
    const svc = store.getService('meetup');
    expect(svc?.credentials?.accessToken).toBe('my-token');
  });

  it('returns undefined for invalid platform', () => {
    expect(store.getService('invalid' as never)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/data/sqlite-service-store.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write implementation**

Create `src/data/sqlite-service-store.ts`:

```typescript
import type { Database } from './database.js';
import type { PlatformName, ServiceConnection } from '../shared/types.js';
import { encrypt, decrypt } from './crypto.js';

type ServiceRow = {
  platform: string;
  connected: number;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  extra: string | null;
  connected_at: string | null;
};

const LABELS: Record<PlatformName, { label: string; description: string }> = {
  meetup: { label: 'Meetup', description: 'Publish events to Meetup.com groups' },
  eventbrite: { label: 'Eventbrite', description: 'List events on Eventbrite for ticket sales' },
  headfirst: { label: 'Headfirst Bristol', description: "List events on Bristol's what's on guide" },
};

export class SqliteServiceStore {
  constructor(private readonly db: Database) {}

  getAll(): ServiceConnection[] {
    const rows = this.db.prepare('SELECT platform, connected, connected_at FROM services').all() as Pick<ServiceRow, 'platform' | 'connected' | 'connected_at'>[];
    return rows.map((r) => ({
      platform: r.platform as PlatformName,
      connected: r.connected === 1,
      ...LABELS[r.platform as PlatformName],
      connectedAt: r.connected_at ?? undefined,
    }));
  }

  getService(platform: PlatformName): (ServiceConnection & { credentials?: Record<string, string>; extra?: Record<string, unknown> }) | undefined {
    const row = this.db.prepare('SELECT * FROM services WHERE platform = ?').get(platform) as ServiceRow | undefined;
    if (!row) return undefined;

    const credentials: Record<string, string> = {};
    if (row.access_token) credentials.accessToken = decrypt(row.access_token);
    if (row.refresh_token) credentials.refreshToken = decrypt(row.refresh_token);
    if (row.token_expires_at) credentials.expiresAt = row.token_expires_at;

    return {
      platform: row.platform as PlatformName,
      connected: row.connected === 1,
      ...LABELS[row.platform as PlatformName],
      connectedAt: row.connected_at ?? undefined,
      credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
      extra: row.extra ? JSON.parse(row.extra) : undefined,
    };
  }

  connect(platform: PlatformName, credentials: Record<string, string>): ServiceConnection | undefined {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE services SET
        connected = 1,
        access_token = ?,
        refresh_token = ?,
        token_expires_at = ?,
        connected_at = ?
      WHERE platform = ?
    `).run(
      credentials.accessToken ? encrypt(credentials.accessToken) : null,
      credentials.refreshToken ? encrypt(credentials.refreshToken) : null,
      credentials.expiresAt ?? null,
      now,
      platform,
    );
    if (result.changes === 0) return undefined;
    return {
      platform,
      connected: true,
      ...LABELS[platform],
      connectedAt: now,
    };
  }

  disconnect(platform: PlatformName): ServiceConnection | undefined {
    const result = this.db.prepare(`
      UPDATE services SET connected = 0, access_token = NULL, refresh_token = NULL, token_expires_at = NULL, extra = NULL, connected_at = NULL
      WHERE platform = ?
    `).run(platform);
    if (result.changes === 0) return undefined;
    return {
      platform,
      connected: false,
      ...LABELS[platform],
    };
  }

  updateExtra(platform: PlatformName, extra: Record<string, unknown>): void {
    this.db.prepare('UPDATE services SET extra = ? WHERE platform = ?').run(JSON.stringify(extra), platform);
  }

  updateTokens(platform: PlatformName, accessToken: string, refreshToken?: string, expiresAt?: string): void {
    this.db.prepare(`
      UPDATE services SET access_token = ?, refresh_token = COALESCE(?, refresh_token), token_expires_at = ?
      WHERE platform = ?
    `).run(
      encrypt(accessToken),
      refreshToken ? encrypt(refreshToken) : null,
      expiresAt ?? null,
      platform,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/data/sqlite-service-store.test.ts
```
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/sqlite-service-store.ts src/data/sqlite-service-store.test.ts
git commit -m "feat: add SQLite service store with encrypted credential storage"
```

---

### Task 7: Platform Event Store + Sync Log Store

**Files:**
- Create: `src/data/platform-event-store.ts`
- Create: `src/data/sync-log-store.ts`
- Create: `src/data/platform-event-store.test.ts`
- Create: `src/data/sync-log-store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/data/platform-event-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from './database.js';
import { PlatformEventStore } from './platform-event-store.js';

describe('PlatformEventStore', () => {
  let db: Database;
  let store: PlatformEventStore;

  beforeEach(() => {
    db = createDatabase(':memory:');
    store = new PlatformEventStore(db);
  });
  afterEach(() => db.close());

  it('upserts and retrieves platform events', () => {
    store.upsert({
      platform: 'meetup',
      externalId: 'ext-1',
      title: 'Meetup Event',
      status: 'active',
    });
    const events = store.getAll();
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Meetup Event');
  });

  it('updates on duplicate platform+externalId', () => {
    store.upsert({ platform: 'meetup', externalId: 'ext-1', title: 'V1', status: 'active' });
    store.upsert({ platform: 'meetup', externalId: 'ext-1', title: 'V2', status: 'active' });
    const events = store.getAll();
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('V2');
  });

  it('filters by platform', () => {
    store.upsert({ platform: 'meetup', externalId: 'a', title: 'A', status: 'active' });
    store.upsert({ platform: 'eventbrite', externalId: 'b', title: 'B', status: 'active' });
    expect(store.getByPlatform('meetup')).toHaveLength(1);
  });

  it('links to internal event', () => {
    store.upsert({ platform: 'meetup', externalId: 'ext-1', title: 'T', status: 'active', eventId: 'int-1' });
    const events = store.getByEventId('int-1');
    expect(events).toHaveLength(1);
  });
});
```

Create `src/data/sync-log-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from './database.js';
import { SyncLogStore } from './sync-log-store.js';

describe('SyncLogStore', () => {
  let db: Database;
  let store: SyncLogStore;

  beforeEach(() => {
    db = createDatabase(':memory:');
    store = new SyncLogStore(db);
  });
  afterEach(() => db.close());

  it('logs and retrieves entries', () => {
    store.log({ platform: 'meetup', action: 'pull', status: 'success', message: 'Pulled 5 events' });
    store.log({ platform: 'eventbrite', action: 'publish', status: 'error', message: 'Token expired' });
    const entries = store.getRecent(10);
    expect(entries).toHaveLength(2);
    expect(entries[0].platform).toBe('eventbrite'); // most recent first
  });

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      store.log({ platform: 'meetup', action: 'pull', status: 'success' });
    }
    expect(store.getRecent(3)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/data/platform-event-store.test.ts src/data/sync-log-store.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write implementations**

Create `src/data/platform-event-store.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import type { Database } from './database.js';
import type { PlatformEvent, PlatformName } from '../shared/types.js';

interface UpsertInput {
  eventId?: string;
  platform: PlatformName;
  externalId: string;
  externalUrl?: string;
  title: string;
  date?: string;
  venue?: string;
  status: PlatformEvent['status'];
  rawData?: string;
  publishedAt?: string;
}

type PlatformEventRow = {
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
};

export class PlatformEventStore {
  constructor(private readonly db: Database) {}

  private rowToEvent(row: PlatformEventRow): PlatformEvent {
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
    };
  }

  upsert(input: UpsertInput): PlatformEvent {
    const now = new Date().toISOString();
    const existing = this.db.prepare(
      'SELECT id FROM platform_events WHERE platform = ? AND external_id = ?'
    ).get(input.platform, input.externalId) as { id: string } | undefined;

    if (existing) {
      this.db.prepare(`
        UPDATE platform_events SET event_id = ?, external_url = ?, title = ?, date = ?, venue = ?, status = ?, raw_data = ?, synced_at = ?, published_at = COALESCE(?, published_at)
        WHERE id = ?
      `).run(
        input.eventId ?? null, input.externalUrl ?? null, input.title, input.date ?? null,
        input.venue ?? null, input.status, input.rawData ?? null, now, input.publishedAt ?? null,
        existing.id,
      );
      return this.rowToEvent(this.db.prepare('SELECT * FROM platform_events WHERE id = ?').get(existing.id) as PlatformEventRow);
    }

    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO platform_events (id, event_id, platform, external_id, external_url, title, date, venue, status, raw_data, synced_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.eventId ?? null, input.platform, input.externalId,
      input.externalUrl ?? null, input.title, input.date ?? null,
      input.venue ?? null, input.status, input.rawData ?? null, now,
      input.publishedAt ?? null,
    );
    return this.rowToEvent(this.db.prepare('SELECT * FROM platform_events WHERE id = ?').get(id) as PlatformEventRow);
  }

  getAll(): PlatformEvent[] {
    return (this.db.prepare('SELECT * FROM platform_events ORDER BY synced_at DESC').all() as PlatformEventRow[]).map((r) => this.rowToEvent(r));
  }

  getByPlatform(platform: PlatformName): PlatformEvent[] {
    return (this.db.prepare('SELECT * FROM platform_events WHERE platform = ? ORDER BY date DESC').all(platform) as PlatformEventRow[]).map((r) => this.rowToEvent(r));
  }

  getByEventId(eventId: string): PlatformEvent[] {
    return (this.db.prepare('SELECT * FROM platform_events WHERE event_id = ?').all(eventId) as PlatformEventRow[]).map((r) => this.rowToEvent(r));
  }
}
```

Create `src/data/sync-log-store.ts`:

```typescript
import type { Database } from './database.js';
import type { PlatformName, SyncAction, SyncLogEntry } from '../shared/types.js';

interface LogInput {
  platform: PlatformName;
  action: SyncAction;
  eventId?: string;
  externalId?: string;
  status: 'success' | 'error';
  message?: string;
}

export class SyncLogStore {
  constructor(private readonly db: Database) {}

  log(input: LogInput): void {
    this.db.prepare(`
      INSERT INTO sync_log (platform, action, event_id, external_id, status, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.platform, input.action, input.eventId ?? null,
      input.externalId ?? null, input.status, input.message ?? null,
      new Date().toISOString(),
    );
  }

  getRecent(limit: number = 50): SyncLogEntry[] {
    return this.db.prepare(
      'SELECT * FROM sync_log ORDER BY id DESC LIMIT ?'
    ).all(limit) as SyncLogEntry[];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/data/platform-event-store.test.ts src/data/sync-log-store.test.ts
```
Expected: PASS (6 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/data/platform-event-store.ts src/data/platform-event-store.test.ts src/data/sync-log-store.ts src/data/sync-log-store.test.ts
git commit -m "feat: add platform event store and sync log store"
```

---

### Task 8: Update validation for new fields

**Files:**
- Modify: `src/lib/validate.ts`
- Modify: `src/lib/validate.test.ts`

- [ ] **Step 1: Update the validator**

In `src/lib/validate.ts`, replace `date`/`time` checks with `start_time`:

```typescript
import type { CreateEventInput } from '../shared/types.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCreateEventInput(
  input: Partial<CreateEventInput>,
): ValidationResult {
  const errors: string[] = [];

  if (!input.title?.trim()) errors.push('title is required');
  if (!input.description?.trim()) errors.push('description is required');
  if (!input.start_time?.trim()) errors.push('start_time is required');
  if (!input.venue?.trim()) errors.push('venue is required');
  if (input.price == null || input.price < 0)
    errors.push('price must be 0 or greater');
  if (!input.capacity || input.capacity < 1)
    errors.push('capacity must be at least 1');

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 2: Update tests**

Update `src/lib/validate.test.ts` to use `start_time` instead of `date`/`time`.

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/lib/validate.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/validate.ts src/lib/validate.test.ts
git commit -m "refactor: update validation for start_time/end_time schema"
```

---

## Chunk 2: Platform Client Interface + App Wiring

### Task 9: Platform client interface

**Files:**
- Create: `src/tools/platform-client.ts`

- [ ] **Step 1: Create the interface file**

```typescript
import type { SocialiseEvent, PlatformEvent, PlatformPublishResult, PlatformName } from '../shared/types.js';

export interface PlatformClient {
  readonly platform: PlatformName;

  /** Fetch all events from the connected account */
  fetchEvents(): Promise<PlatformEvent[]>;

  /** Create a new event on the platform */
  createEvent(event: SocialiseEvent): Promise<PlatformPublishResult>;

  /** Update an existing event on the platform */
  updateEvent(externalId: string, event: SocialiseEvent): Promise<PlatformPublishResult>;

  /** Cancel/delete an event on the platform */
  cancelEvent(externalId: string): Promise<{ success: boolean; error?: string }>;

  /** Check if the stored credentials are still valid */
  validateConnection(): Promise<boolean>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tools/platform-client.ts
git commit -m "feat: add PlatformClient interface"
```

---

### Task 10: Publish Service

**Files:**
- Create: `src/tools/publish-service.ts`
- Create: `src/tools/publish-service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tools/publish-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublishService } from './publish-service.js';
import type { PlatformClient } from './platform-client.js';
import type { SocialiseEvent, PlatformName } from '../shared/types.js';

function mockClient(platform: PlatformName): PlatformClient {
  return {
    platform,
    fetchEvents: vi.fn().mockResolvedValue([]),
    createEvent: vi.fn().mockResolvedValue({ platform, success: true, externalId: `${platform}-123` }),
    updateEvent: vi.fn().mockResolvedValue({ platform, success: true, externalId: `${platform}-123` }),
    cancelEvent: vi.fn().mockResolvedValue({ success: true }),
    validateConnection: vi.fn().mockResolvedValue(true),
  };
}

const mockEvent: SocialiseEvent = {
  id: 'test-id',
  title: 'Test Event',
  description: 'A test',
  start_time: '2026-04-01T19:00:00+01:00',
  duration_minutes: 120,
  venue: 'The Lanes',
  price: 10,
  capacity: 100,
  status: 'draft',
  platforms: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('PublishService', () => {
  let meetup: PlatformClient;
  let eventbrite: PlatformClient;
  let service: PublishService;

  beforeEach(() => {
    meetup = mockClient('meetup');
    eventbrite = mockClient('eventbrite');
    service = new PublishService({ meetup, eventbrite });
  });

  it('publishes to multiple platforms in parallel', async () => {
    const results = await service.publish(mockEvent, ['meetup', 'eventbrite']);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('returns error for unconfigured platform', async () => {
    const results = await service.publish(mockEvent, ['headfirst']);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('not configured');
  });

  it('handles platform failure gracefully', async () => {
    (meetup.createEvent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API down'));
    const results = await service.publish(mockEvent, ['meetup']);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('API down');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/tools/publish-service.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write implementation**

Create `src/tools/publish-service.ts`:

```typescript
import type { PlatformClient } from './platform-client.js';
import type { SocialiseEvent, PlatformName, PlatformPublishResult } from '../shared/types.js';

export class PublishService {
  private clients: Partial<Record<PlatformName, PlatformClient>>;

  constructor(clients: Partial<Record<PlatformName, PlatformClient>>) {
    this.clients = clients;
  }

  async publish(event: SocialiseEvent, platforms: PlatformName[]): Promise<PlatformPublishResult[]> {
    const results = await Promise.allSettled(
      platforms.map(async (p): Promise<PlatformPublishResult> => {
        const client = this.clients[p];
        if (!client) {
          return { platform: p, success: false, error: `${p} not configured` };
        }
        return client.createEvent(event);
      }),
    );

    return results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { platform: platforms[i], success: false, error: String(r.reason) },
    );
  }

  async update(externalId: string, event: SocialiseEvent, platform: PlatformName): Promise<PlatformPublishResult> {
    const client = this.clients[platform];
    if (!client) {
      return { platform, success: false, error: `${platform} not configured` };
    }
    try {
      return await client.updateEvent(externalId, event);
    } catch (err) {
      return { platform, success: false, error: String(err) };
    }
  }

  getClient(platform: PlatformName): PlatformClient | undefined {
    return this.clients[platform];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/tools/publish-service.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/publish-service.ts src/tools/publish-service.test.ts
git commit -m "feat: add PublishService for multi-platform event publishing"
```

---

### Task 11: Wire SQLite into app.ts

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Update app.ts to use SQLite stores**

Replace `src/app.ts` contents:

```typescript
import express, { type Request, type Response, type NextFunction } from 'express';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createDatabase, type Database } from './data/database.js';
import { SqliteEventStore } from './data/sqlite-event-store.js';
import { SqliteServiceStore } from './data/sqlite-service-store.js';
import { PlatformEventStore } from './data/platform-event-store.js';
import { SyncLogStore } from './data/sync-log-store.js';
import { MeetupClient } from './tools/meetup.js';
import { EventbriteClient } from './tools/eventbrite.js';
import { HeadfirstClient } from './tools/headfirst.js';
import { PublishService } from './tools/publish-service.js';
import { createEventsRouter } from './routes/events.js';
import { createServicesRouter } from './routes/services.js';
import { createAuthRouter } from './routes/auth.js';
import { createGeneratorRouter } from './routes/generator.js';
import { createSyncRouter } from './routes/sync.js';
import { MarketAnalyzer } from './agents/market-analyzer.js';

export const VERSION = '0.1.0';

export interface AppDeps {
  db?: Database;
}

export function createApp(deps?: AppDeps): express.Express {
  const dataDir = join(process.cwd(), 'data');
  const db = deps?.db ?? createDatabase(join(dataDir, 'socialise.db'));

  const eventStore = new SqliteEventStore(db);
  const serviceStore = new SqliteServiceStore(db);
  const platformEventStore = new PlatformEventStore(db);
  const syncLogStore = new SyncLogStore(db);

  // Platform clients — will be upgraded to real implementations
  const meetup = new MeetupClient();
  const eventbrite = new EventbriteClient();
  const headfirst = new HeadfirstClient();
  const publishService = new PublishService({ meetup, eventbrite, headfirst });

  const app = express();

  // Middleware
  app.use(express.json());

  // CORS for dev (Vite on 5173 -> Express on 3000)
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  // API routes
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: VERSION });
  });

  const port = Number(process.env.PORT) || 3000;
  const marketAnalyzer = new MarketAnalyzer(serviceStore as never);

  app.use('/api/events', createEventsRouter(eventStore, publishService, platformEventStore, syncLogStore));
  app.use('/api/services', createServicesRouter(serviceStore));
  app.use('/api/generator', createGeneratorRouter(eventStore as never, marketAnalyzer));
  app.use('/api/sync', createSyncRouter(platformEventStore, syncLogStore, publishService, eventStore));
  app.use('/auth', createAuthRouter(serviceStore as never, port));

  // Serve built frontend
  const clientDir = join(process.cwd(), 'dist-client');
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get('/{*path}', (_req, res) => {
      res.sendFile(join(clientDir, 'index.html'));
    });
  }

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message });
  });

  return app;
}
```

**Note:** The `as never` casts are temporary — the generator and auth routes still expect the old store types. They'll be updated in later tasks. The important thing is that the app compiles and the event/service/sync routes work with the new stores.

- [ ] **Step 2: Update events router signature**

In `src/routes/events.ts`, update the imports and function signature:

```typescript
import { Router } from 'express';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';
import type { PublishService } from '../tools/publish-service.js';
import type { PlatformEventStore } from '../data/platform-event-store.js';
import type { SyncLogStore } from '../data/sync-log-store.js';
import type { PlatformName } from '../shared/types.js';
import { validateCreateEventInput } from '../lib/validate.js';

export function createEventsRouter(
  store: SqliteEventStore,
  publishService: PublishService,
  platformEventStore: PlatformEventStore,
  syncLogStore: SyncLogStore,
): Router {
  const router = Router();

  router.get('/', (_req, res, next) => {
    try {
      const events = store.getAll();
      res.json({ data: events, total: events.length });
    } catch (err) { next(err); }
  });

  router.get('/:id', (req, res, next) => {
    try {
      const event = store.getById(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });
      res.json({ data: event });
    } catch (err) { next(err); }
  });

  router.post('/', (req, res, next) => {
    try {
      const validation = validateCreateEventInput(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: `Validation failed: ${validation.errors.join(', ')}` });
      }
      const event = store.create(req.body);
      res.status(201).json({ data: event });
    } catch (err) { next(err); }
  });

  router.put('/:id', (req, res, next) => {
    try {
      const event = store.update(req.params.id, req.body);
      if (!event) return res.status(404).json({ error: 'Event not found' });
      res.json({ data: event });
    } catch (err) { next(err); }
  });

  router.delete('/:id', (req, res, next) => {
    try {
      const deleted = store.delete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Event not found' });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  router.post('/:id/publish', async (req, res, next) => {
    try {
      const platforms = req.body.platforms as PlatformName[] | undefined;
      if (!platforms?.length) {
        return res.status(400).json({ error: 'No platforms specified' });
      }
      const event = store.getById(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      const results = await publishService.publish(event, platforms);

      // Record platform events and sync log
      for (const result of results) {
        if (result.success && result.externalId) {
          platformEventStore.upsert({
            eventId: event.id,
            platform: result.platform,
            externalId: result.externalId,
            externalUrl: result.externalUrl,
            title: event.title,
            date: event.start_time,
            status: 'active',
            publishedAt: new Date().toISOString(),
          });
        }
        syncLogStore.log({
          platform: result.platform,
          action: 'publish',
          eventId: event.id,
          externalId: result.externalId,
          status: result.success ? 'success' : 'error',
          message: result.error,
        });
      }

      // Update event status if any publish succeeded
      if (results.some((r) => r.success)) {
        store.updateStatus(event.id, 'published');
      }

      res.json({ data: results });
    } catch (err) { next(err); }
  });

  return router;
}
```

- [ ] **Step 3: Create sync router stub**

Create `src/routes/sync.ts`:

```typescript
import { Router } from 'express';
import type { PlatformEventStore } from '../data/platform-event-store.js';
import type { SyncLogStore } from '../data/sync-log-store.js';
import type { PublishService } from '../tools/publish-service.js';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';

export function createSyncRouter(
  platformEventStore: PlatformEventStore,
  syncLogStore: SyncLogStore,
  _publishService: PublishService,
  _eventStore: SqliteEventStore,
): Router {
  const router = Router();

  // GET /api/sync/log — recent sync entries
  router.get('/log', (_req, res, next) => {
    try {
      const limit = Number(_req.query.limit) || 50;
      const entries = syncLogStore.getRecent(limit);
      res.json({ data: entries });
    } catch (err) { next(err); }
  });

  // POST /api/sync/pull — pull events from all connected platforms
  router.post('/pull', async (_req, res, next) => {
    try {
      // TODO: implement real pull from platform clients
      res.json({ data: { pulled: 0 } });
    } catch (err) { next(err); }
  });

  // GET /api/dashboard/summary
  router.get('/dashboard/summary', (_req, res, next) => {
    try {
      const allPlatformEvents = platformEventStore.getAll();
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const byPlatform = { meetup: 0, eventbrite: 0, headfirst: 0 };
      let eventsThisWeek = 0;
      let eventsThisMonth = 0;

      for (const pe of allPlatformEvents) {
        byPlatform[pe.platform as keyof typeof byPlatform]++;
        if (pe.date) {
          const d = new Date(pe.date);
          if (d >= now && d <= weekFromNow) eventsThisWeek++;
          if (d >= now && d <= monthFromNow) eventsThisMonth++;
        }
      }

      res.json({
        data: {
          totalEvents: allPlatformEvents.length,
          eventsThisWeek,
          eventsThisMonth,
          byPlatform,
        },
      });
    } catch (err) { next(err); }
  });

  return router;
}
```

- [ ] **Step 4: Update services router to use SqliteServiceStore**

Minimal update to `src/routes/services.ts` — change import from `'../data/store.js'` to `'../data/sqlite-service-store.js'`:

```typescript
import { Router } from 'express';
import type { SqliteServiceStore } from '../data/sqlite-service-store.js';
import { VALID_PLATFORMS } from '../shared/types.js';
import type { PlatformName } from '../shared/types.js';

function isValidPlatform(value: string): value is PlatformName {
  return VALID_PLATFORMS.includes(value as PlatformName);
}

export function createServicesRouter(serviceStore: SqliteServiceStore): Router {
  const router = Router();

  router.get('/', (_req, res, next) => {
    try {
      const services = serviceStore.getAll();
      res.json({ data: services });
    } catch (err) { next(err); }
  });

  router.post('/:platform/connect', (req, res, next) => {
    try {
      if (!isValidPlatform(req.params.platform)) {
        return res.status(400).json({ error: 'Invalid platform' });
      }
      const credentials = req.body as Record<string, string>;
      const service = serviceStore.connect(req.params.platform, credentials);
      if (!service) return res.status(404).json({ error: 'Platform not found' });
      res.json({ data: service });
    } catch (err) { next(err); }
  });

  router.post('/:platform/disconnect', (req, res, next) => {
    try {
      if (!isValidPlatform(req.params.platform)) {
        return res.status(400).json({ error: 'Invalid platform' });
      }
      const service = serviceStore.disconnect(req.params.platform);
      if (!service) return res.status(404).json({ error: 'Platform not found' });
      res.json({ data: service });
    } catch (err) { next(err); }
  });

  // POST /api/services/:platform/setup — post-OAuth setup (group/org selection)
  router.post('/:platform/setup', (req, res, next) => {
    try {
      if (!isValidPlatform(req.params.platform)) {
        return res.status(400).json({ error: 'Invalid platform' });
      }
      serviceStore.updateExtra(req.params.platform, req.body);
      res.json({ data: { success: true } });
    } catch (err) { next(err); }
  });

  return router;
}
```

- [ ] **Step 5: Run lint and tests**

```bash
npm run lint && npx vitest run
```
Expected: lint passes, existing tests may need updates for new signatures

- [ ] **Step 6: Update app.test.ts for new store types**

Update `src/app.test.ts` to create an in-memory SQLite database and pass it via `deps.db`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './data/database.js';

describe('app', () => {
  const db = createDatabase(':memory:');
  const app = createApp({ db });

  afterEach(() => {
    // Clean events between tests
    db.prepare('DELETE FROM events').run();
  });

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /api/events creates event', async () => {
    const res = await request(app)
      .post('/api/events')
      .send({
        title: 'Test',
        description: 'Desc',
        start_time: '2026-04-01T19:00:00+01:00',
        duration_minutes: 120,
        venue: 'Venue',
        price: 0,
        capacity: 50,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Test');
  });

  it('GET /api/events lists events', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/services lists platforms', async () => {
    const res = await request(app).get('/api/services');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
  });

  it('GET /api/sync/log returns entries', async () => {
    const res = await request(app).get('/api/sync/log');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
```

- [ ] **Step 7: Run all tests**

```bash
npx vitest run
```
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add src/app.ts src/app.test.ts src/routes/events.ts src/routes/services.ts src/routes/sync.ts src/tools/platform-client.ts
git commit -m "feat: wire SQLite stores into Express app, add sync router, update event/service routes"
```

---

## Chunk 3: Real Platform Client Implementations

### Task 12: Meetup GraphQL Client

**Files:**
- Modify: `src/tools/meetup.ts`
- Create: `src/tools/meetup.test.ts`

- [ ] **Step 1: Write failing test with mocked fetch**

Create `src/tools/meetup.test.ts` with tests for `fetchEvents`, `createEvent`, `validateConnection` using mocked `fetch`. Test that the client:
- Sends correct GraphQL mutations/queries
- Maps response to `PlatformEvent[]` / `PlatformPublishResult`
- Handles error responses

- [ ] **Step 2: Implement MeetupClient implementing PlatformClient**

Rewrite `src/tools/meetup.ts` to use Meetup's GraphQL API at `https://api.meetup.com/gql`. The client takes an access token and group URL name in its constructor. Implements all `PlatformClient` methods.

- [ ] **Step 3: Run tests, iterate until passing**

```bash
npx vitest run src/tools/meetup.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/tools/meetup.ts src/tools/meetup.test.ts
git commit -m "feat: implement real Meetup GraphQL client"
```

---

### Task 13: Eventbrite REST Client

**Files:**
- Modify: `src/tools/eventbrite.ts`
- Create: `src/tools/eventbrite.test.ts`

- [ ] **Step 1: Write failing test with mocked fetch**

Test the three-step publish flow: create event → create ticket class → publish. Test `fetchEvents` returns mapped events. Test error handling.

- [ ] **Step 2: Implement EventbriteClient implementing PlatformClient**

Rewrite `src/tools/eventbrite.ts`. Uses REST v3 API. Takes access token and organization ID. Handles field mapping per spec (name.html, start.utc, ticket_classes, etc.).

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/tools/eventbrite.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/tools/eventbrite.ts src/tools/eventbrite.test.ts
git commit -m "feat: implement real Eventbrite REST v3 client with 3-step publish"
```

---

### Task 14: Headfirst Bristol Web Client

**Files:**
- Modify: `src/tools/headfirst.ts`
- Create: `src/tools/headfirst.test.ts`

- [ ] **Step 1: Write failing test with mocked fetch**

Test CSRF token extraction from form page. Test form submission with correct fields. Test login validation.

- [ ] **Step 2: Implement HeadfirstClient implementing PlatformClient**

Rewrite `src/tools/headfirst.ts`. Uses fetch to GET the submission form, parse HTML for CSRF tokens and hidden fields, then POST event data. Maintains cookies across requests.

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/tools/headfirst.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/tools/headfirst.ts src/tools/headfirst.test.ts
git commit -m "feat: implement Headfirst Bristol web scraping client"
```

---

## Chunk 4: Auth Enhancements + Sync Engine

### Task 15: Token refresh in auth router

**Files:**
- Modify: `src/routes/auth.ts`

- [ ] **Step 1: Add HTML escaping for error messages**

Add a simple `escapeHtml()` function and use it in `errorPage()`:

```typescript
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

- [ ] **Step 2: Update auth router to use SqliteServiceStore**

Change import from `ServiceStore` to `SqliteServiceStore`. The SSE status endpoint uses `serviceStore.getService()` instead of the old method.

- [ ] **Step 3: Run existing auth tests (if any), update as needed**

- [ ] **Step 4: Commit**

```bash
git add src/routes/auth.ts
git commit -m "fix: HTML-escape OAuth error messages, update auth to use SQLite service store"
```

---

### Task 16: Sync pull implementation

**Files:**
- Modify: `src/routes/sync.ts`

- [ ] **Step 1: Implement POST /api/sync/pull**

Update the sync router's pull endpoint to iterate connected platforms, call `fetchEvents()` on each client, upsert results into `platformEventStore`, and log to `syncLogStore`.

- [ ] **Step 2: Test with mock platform clients**

- [ ] **Step 3: Commit**

```bash
git add src/routes/sync.ts
git commit -m "feat: implement sync pull — fetch events from all connected platforms"
```

---

## Chunk 5: Frontend — Dashboard + Enhanced Pages

### Task 17: Update frontend API client

**Files:**
- Modify: `client/src/api/events.ts`

- [ ] **Step 1: Add new API functions**

Add: `getDashboardSummary()`, `getAllEvents()`, `syncPull()`, `getSyncLog()`, `setupService()`.
Update existing functions to use `start_time` instead of `date`/`time`.

- [ ] **Step 2: Commit**

```bash
git add client/src/api/events.ts
git commit -m "feat: add dashboard, sync, and setup API client functions"
```

---

### Task 18: Dashboard page

**Files:**
- Create: `client/src/components/DashboardSummary.tsx`
- Create: `client/src/components/EventTimeline.tsx`
- Create: `client/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Build DashboardSummary component**

Stats cards showing total events, this week, this month, per-platform counts. Uses the `DashboardSummary` type from the API.

- [ ] **Step 2: Build EventTimeline component**

Sorted list of all events (internal + external) with platform badges, status, date, venue. Filter bar for platform/status/date range. External events marked with subtle "external" indicator.

- [ ] **Step 3: Build DashboardPage**

Combines summary + timeline. Calls `getDashboardSummary()` and `getAllEvents()` on mount. Add loading and empty states.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/DashboardSummary.tsx client/src/components/EventTimeline.tsx client/src/pages/DashboardPage.tsx
git commit -m "feat: add unified dashboard page with summary cards and event timeline"
```

---

### Task 19: Update App routing and navigation

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Add Dashboard as default route, add SyncLog route**

Update `navItems` to include Dashboard (home) and Sync Log. Import `DashboardPage` and `SyncLogPage`. Update `<Routes>`:

```tsx
<Route path="/" element={<DashboardPage />} />
<Route path="/events" element={<EventsPage />} />
<Route path="/events/new" element={<EventDetailPage />} />
<Route path="/events/:id" element={<EventDetailPage />} />
<Route path="/generator" element={<EventGeneratorPage />} />
<Route path="/services" element={<ServicesPage />} />
<Route path="/sync-log" element={<SyncLogPage />} />
<Route path="/tester" element={<AppTesterPage />} />
```

- [ ] **Step 2: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: add dashboard as default route, add sync log navigation"
```

---

### Task 20: Enhanced Services page

**Files:**
- Create: `client/src/components/CredentialsForm.tsx`
- Modify: `client/src/pages/ServicesPage.tsx`

- [ ] **Step 1: Build CredentialsForm for Headfirst**

Simple form with email/password fields, submit button, error display.

- [ ] **Step 2: Update ServicesPage**

Show OAuth connect buttons for Meetup/Eventbrite (using existing `startOAuth`), credentials form for Headfirst, connection status with last synced time, disconnect buttons.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/CredentialsForm.tsx client/src/pages/ServicesPage.tsx
git commit -m "feat: enhance services page with OAuth buttons and Headfirst credentials form"
```

---

### Task 21: Enhanced Event Detail page

**Files:**
- Create: `client/src/components/PlatformSelector.tsx`
- Modify: `client/src/pages/EventDetailPage.tsx`

- [ ] **Step 1: Build PlatformSelector component**

Checkbox group for selecting target platforms. Shows connection status per platform.

- [ ] **Step 2: Update EventDetailPage**

Add platform selector, publish status panel showing per-platform status, publish button, sync button. Update form fields to use `start_time`/`end_time`/`duration_minutes`.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/PlatformSelector.tsx client/src/pages/EventDetailPage.tsx
git commit -m "feat: enhance event detail page with platform selector and publish status"
```

---

### Task 22: Sync Log page

**Files:**
- Create: `client/src/pages/SyncLogPage.tsx`

- [ ] **Step 1: Build SyncLogPage**

Table showing recent sync operations: timestamp, platform, action, event title, status, error message. Calls `getSyncLog()` on mount.

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/SyncLogPage.tsx
git commit -m "feat: add sync log page for audit trail"
```

---

## Chunk 6: Cleanup + Final Verification

### Task 23: JSON to SQLite migration script

**Files:**
- Create: `src/data/migrate-json.ts`

- [ ] **Step 1: Write migration script**

Reads `data/events.json` and `data/services.json`, maps old `date`/`time` fields to `start_time`, inserts into SQLite tables.

- [ ] **Step 2: Commit**

```bash
git add src/data/migrate-json.ts
git commit -m "feat: add one-time JSON to SQLite migration script"
```

---

### Task 24: Remove old stores and EventCreator

**Files:**
- Remove: `src/data/store.ts`
- Remove: `src/agents/event-creator.ts`

- [ ] **Step 1: Delete old files**

```bash
rm src/data/store.ts src/agents/event-creator.ts
```

- [ ] **Step 2: Update any remaining imports**

Search for imports of `store.js` or `event-creator.js` and remove/replace them. The generator route may still reference the old `EventStore` — update to use `SqliteEventStore`.

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```
Expected: all PASS

- [ ] **Step 4: Run lint**

```bash
npm run lint
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove old JSON stores and EventCreator agent — replaced by SQLite"
```

---

### Task 25: Update CLAUDE.md and README

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Update CLAUDE.md**

Add SQLite, `better-sqlite3`, sync routes, dashboard page to the project description. Update conventions section if needed.

- [ ] **Step 2: Update README.md**

Document new setup requirements (SQLite auto-created), environment variables for Meetup/Eventbrite OAuth, how to run in web mode, new features (dashboard, sync, multi-platform publishing).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update CLAUDE.md and README for Phase 1 unified event hub"
```

---

### Task 26: Start local server and verify in Chrome

- [ ] **Step 1: Start the dev server**

```bash
npm run dev:web
```
Expected: Express on port 3000, Vite on port 5173

- [ ] **Step 2: Open Chrome and verify**

Navigate to `http://localhost:5173/`. Verify:
- Dashboard loads with summary cards
- Services page shows 3 platforms with connect buttons
- Create event form uses start_time/end_time
- Sync log page shows empty table
- Navigation between pages works

- [ ] **Step 3: Run full test suite one final time**

```bash
npx vitest run
```
Expected: all PASS

- [ ] **Step 4: Final commit if any fixes needed**
