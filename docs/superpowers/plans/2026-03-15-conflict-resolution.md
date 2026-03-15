# Cross-Platform Conflict Resolution — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated page for detecting and resolving cross-platform field mismatches for events published to multiple platforms.

**Architecture:** New backend endpoint compares hub event fields against linked platform_events. New frontend page at `/conflicts/:eventId` shows field diffs and lets users edit hub values, then push to all platforms with post-push verification. Dashboard and event detail page link into the resolution page.

**Tech Stack:** Express 5 route, SQLite queries, React page with inline styles (matching existing patterns), existing automation bridge for push/pull.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/routes/conflicts.ts` | Create | New Express router — conflict detection + resolve endpoints |
| `src/routes/conflicts.test.ts` | Create | Tests for conflict detection and resolve endpoints |
| `src/app.ts` | Modify | Register conflicts router |
| `client/src/api/conflicts.ts` | Create | Frontend API client for conflict endpoints |
| `client/src/pages/ConflictResolutionPage.tsx` | Create | Full resolution page UI |
| `client/src/components/dashboard/ConflictsSection.tsx` | Modify | Change from scheduling overlap to cross-platform conflicts |
| `client/src/api/dashboard.ts` | Modify | Update Conflict type to new shape |
| `client/src/pages/EventDetailPage.tsx` | Modify | Add conflict warning banner |
| `client/src/App.tsx` | Modify | Add `/conflicts/:id` route |

---

## Chunk 1: Backend — Conflict Detection

### Task 1: Create conflict detection route with tests

**Files:**
- Create: `src/routes/conflicts.ts`
- Create: `src/routes/conflicts.test.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Write the failing test for `GET /api/events/:id/conflicts`**

Create `src/routes/conflicts.test.ts`. Follow the pattern from `src/app.test.ts` — use the full test app with supertest. Test that an event linked to a platform_event with different title returns a conflict.

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './data/database.js';

describe('Conflicts API', () => {
  let app: ReturnType<typeof createApp>;
  let db: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    db = createDatabase(':memory:');
    app = createApp(db);
  });

  describe('GET /api/events/:id/conflicts', () => {
    it('detects field conflicts between hub and platform events', async () => {
      // Create hub event
      const createRes = await request(app).post('/api/events').send({
        title: 'Hub Title',
        description: 'Hub description',
        start_time: '2026-04-01T19:00:00.000Z',
        duration_minutes: 120,
        venue: 'Hub Venue',
        price: 10,
        capacity: 50,
      });
      const eventId = createRes.body.data.id;

      // Insert platform event with different title and venue
      db.prepare(`INSERT INTO platform_events (id, event_id, platform, external_id, title, venue, date, description, status, synced_at, ticket_price, capacity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'pe-1', eventId, 'meetup', 'ext-1', 'Meetup Title', 'Meetup Venue',
        '2026-04-01T19:00:00.000Z', 'Hub description', 'active', new Date().toISOString(), 10, 50
      );

      const res = await request(app).get(`/api/events/${eventId}/conflicts`);
      expect(res.status).toBe(200);
      expect(res.body.eventId).toBe(eventId);
      expect(res.body.conflicts.length).toBe(2); // title + venue differ
      expect(res.body.conflicts.map((c: any) => c.field).sort()).toEqual(['title', 'venue']);
      expect(res.body.conflicts[0].hubValue).toBeDefined();
      expect(res.body.conflicts[0].platformValues).toBeInstanceOf(Array);
    });

    it('returns empty conflicts when all fields match', async () => {
      const createRes = await request(app).post('/api/events').send({
        title: 'Same Title',
        description: 'Same desc',
        start_time: '2026-04-01T19:00:00.000Z',
        duration_minutes: 120,
        venue: 'Same Venue',
        price: 10,
        capacity: 50,
      });
      const eventId = createRes.body.data.id;

      db.prepare(`INSERT INTO platform_events (id, event_id, platform, external_id, title, venue, date, description, status, synced_at, ticket_price, capacity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'pe-1', eventId, 'meetup', 'ext-1', 'Same Title', 'Same Venue',
        '2026-04-01T19:00:00.000Z', 'Same desc', 'active', new Date().toISOString(), 10, 50
      );

      const res = await request(app).get(`/api/events/${eventId}/conflicts`);
      expect(res.status).toBe(200);
      expect(res.body.conflicts).toEqual([]);
    });

    it('returns 404 for nonexistent event', async () => {
      const res = await request(app).get('/api/events/nonexistent/conflicts');
      expect(res.status).toBe(404);
    });

    it('ignores null platform fields (not a conflict)', async () => {
      const createRes = await request(app).post('/api/events').send({
        title: 'My Event',
        description: 'Desc',
        start_time: '2026-04-01T19:00:00.000Z',
        duration_minutes: 120,
        venue: 'Venue',
        price: 10,
        capacity: 50,
      });
      const eventId = createRes.body.data.id;

      // Platform event with null venue — should not count as conflict
      db.prepare(`INSERT INTO platform_events (id, event_id, platform, external_id, title, venue, date, description, status, synced_at, ticket_price, capacity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'pe-1', eventId, 'meetup', 'ext-1', 'My Event', null,
        '2026-04-01T19:00:00.000Z', 'Desc', 'active', new Date().toISOString(), 10, 50
      );

      const res = await request(app).get(`/api/events/${eventId}/conflicts`);
      expect(res.status).toBe(200);
      // venue is null on platform = not present = not a conflict
      expect(res.body.conflicts).toEqual([]);
    });

    it('detects conflicts across multiple platforms', async () => {
      const createRes = await request(app).post('/api/events').send({
        title: 'Hub Title',
        description: 'Hub desc',
        start_time: '2026-04-01T19:00:00.000Z',
        duration_minutes: 120,
        venue: 'Hub Venue',
        price: 10,
        capacity: 50,
      });
      const eventId = createRes.body.data.id;

      // Meetup has different title
      db.prepare(`INSERT INTO platform_events (id, event_id, platform, external_id, title, venue, date, description, status, synced_at, ticket_price, capacity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'pe-1', eventId, 'meetup', 'ext-1', 'Meetup Title', 'Hub Venue',
        '2026-04-01T19:00:00.000Z', 'Hub desc', 'active', new Date().toISOString(), 10, 50
      );
      // Eventbrite has different venue
      db.prepare(`INSERT INTO platform_events (id, event_id, platform, external_id, title, venue, date, description, status, synced_at, ticket_price, capacity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'pe-2', eventId, 'eventbrite', 'ext-2', 'Hub Title', 'EB Venue',
        '2026-04-01T19:00:00.000Z', 'Hub desc', 'active', new Date().toISOString(), 10, 50
      );

      const res = await request(app).get(`/api/events/${eventId}/conflicts`);
      expect(res.status).toBe(200);
      // title conflict (meetup differs), venue conflict (eventbrite differs)
      expect(res.body.conflicts.length).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/routes/conflicts.test.ts`
Expected: FAIL — module `./app.js` exists but no `/api/events/:id/conflicts` route.

- [ ] **Step 3: Implement the conflicts route**

Create `src/routes/conflicts.ts`:

```typescript
import { Router } from 'express';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';
import type { PlatformEventStore } from '../data/platform-event-store.js';
import type { PlatformName } from '../shared/types.js';

/** Fields compared between hub events and platform events. */
const COMPARABLE_FIELDS: Array<{
  field: string;
  hubKey: string;
  platformKey: string;
  type: 'string' | 'number';
}> = [
  { field: 'title', hubKey: 'title', platformKey: 'title', type: 'string' },
  { field: 'description', hubKey: 'description', platformKey: 'description', type: 'string' },
  { field: 'start_time', hubKey: 'start_time', platformKey: 'date', type: 'string' },
  { field: 'venue', hubKey: 'venue', platformKey: 'venue', type: 'string' },
  { field: 'price', hubKey: 'price', platformKey: 'ticketPrice', type: 'number' },
  { field: 'capacity', hubKey: 'capacity', platformKey: 'capacity', type: 'number' },
];

interface FieldConflict {
  field: string;
  hubValue: string | number | null;
  platformValues: Array<{
    platform: PlatformName;
    value: string | number | null;
    externalUrl?: string;
  }>;
}

function normalizeString(v: string | null | undefined): string | null {
  if (v == null || v === '') return null;
  return v.trim();
}

function valuesMatch(a: string | number | null, b: string | number | null, type: 'string' | 'number'): boolean {
  if (a == null || b == null) return true; // null = not present on platform, not a conflict
  if (type === 'number') return Number(a) === Number(b);
  return normalizeString(String(a)) === normalizeString(String(b));
}

export function createConflictsRouter(
  eventStore: SqliteEventStore,
  platformEventStore: PlatformEventStore,
): Router {
  const router = Router();

  // GET /api/events/:id/conflicts
  router.get('/:id/conflicts', (req, res, next) => {
    try {
      const event = eventStore.getById(req.params.id);
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }

      const platformEvents = platformEventStore.getByEventId(req.params.id);
      if (platformEvents.length === 0) {
        res.json({ eventId: event.id, eventTitle: event.title, conflicts: [], platforms: [] });
        return;
      }

      const conflicts: FieldConflict[] = [];

      for (const fieldDef of COMPARABLE_FIELDS) {
        const hubRaw = (event as any)[fieldDef.hubKey];
        const hubValue = fieldDef.type === 'number' ? (hubRaw ?? null) : normalizeString(hubRaw != null ? String(hubRaw) : null);

        const differing: FieldConflict['platformValues'] = [];

        for (const pe of platformEvents) {
          const platRaw = (pe as any)[fieldDef.platformKey];
          const platValue = fieldDef.type === 'number' ? (platRaw ?? null) : normalizeString(platRaw != null ? String(platRaw) : null);

          if (!valuesMatch(hubValue, platValue, fieldDef.type)) {
            differing.push({
              platform: pe.platform,
              value: platValue,
              externalUrl: pe.externalUrl,
            });
          }
        }

        if (differing.length > 0) {
          conflicts.push({ field: fieldDef.field, hubValue, platformValues: differing });
        }
      }

      const platforms = platformEvents.map(pe => ({
        platform: pe.platform,
        externalId: pe.externalId,
        externalUrl: pe.externalUrl,
        lastSyncedAt: pe.syncedAt,
      }));

      res.json({ eventId: event.id, eventTitle: event.title, conflicts, platforms });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 4: Register the conflicts router in `src/app.ts`**

In `src/app.ts`, import and mount the router. Find where other routers are registered (events, dashboard, sync, etc.) and add:

```typescript
import { createConflictsRouter } from './routes/conflicts.js';
// ... in createApp():
const conflictsRouter = createConflictsRouter(eventStore, platformEventStore);
app.use('/api/events', conflictsRouter);
```

Note: this mounts under `/api/events` so the route becomes `/api/events/:id/conflicts` — consistent with existing event routes.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/routes/conflicts.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/conflicts.ts src/routes/conflicts.test.ts src/app.ts
git commit -m "feat: add cross-platform conflict detection endpoint"
```

---

### Task 2: Dashboard conflicts endpoint — switch to cross-platform

**Files:**
- Modify: `src/routes/dashboard.ts:777-822`
- Modify: `src/app.test.ts` (conflict tests)

- [ ] **Step 1: Write failing tests for updated dashboard conflicts**

Add tests in `src/routes/conflicts.test.ts` (extending the file from Task 1):

```typescript
describe('GET /api/dashboard/conflicts', () => {
  it('returns events with cross-platform field mismatches', async () => {
    const createRes = await request(app).post('/api/events').send({
      title: 'Hub Title',
      description: 'Desc',
      start_time: '2026-04-01T19:00:00.000Z',
      duration_minutes: 120,
      venue: 'Venue',
      price: 10,
      capacity: 50,
    });
    const eventId = createRes.body.data.id;

    db.prepare(`INSERT INTO platform_events (id, event_id, platform, external_id, title, venue, date, description, status, synced_at, ticket_price, capacity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'pe-1', eventId, 'meetup', 'ext-1', 'Different Title', 'Venue',
      '2026-04-01T19:00:00.000Z', 'Desc', 'active', new Date().toISOString(), 10, 50
    );

    const res = await request(app).get('/api/dashboard/conflicts');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].eventId).toBe(eventId);
    expect(res.body.data[0].conflictCount).toBe(1);
    expect(res.body.data[0].fields).toContain('title');
  });

  it('returns empty when no platform mismatches exist', async () => {
    const createRes = await request(app).post('/api/events').send({
      title: 'Same',
      description: 'Same',
      start_time: '2026-04-01T19:00:00.000Z',
      duration_minutes: 120,
      venue: 'Same',
      price: 10,
      capacity: 50,
    });
    const eventId = createRes.body.data.id;

    db.prepare(`INSERT INTO platform_events (id, event_id, platform, external_id, title, venue, date, description, status, synced_at, ticket_price, capacity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'pe-1', eventId, 'meetup', 'ext-1', 'Same', 'Same',
      '2026-04-01T19:00:00.000Z', 'Same', 'active', new Date().toISOString(), 10, 50
    );

    const res = await request(app).get('/api/dashboard/conflicts');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/routes/conflicts.test.ts`
Expected: FAIL — dashboard endpoint still returns old scheduling-overlap format.

- [ ] **Step 3: Replace dashboard conflicts endpoint**

In `src/routes/dashboard.ts` lines 777–822, replace the scheduling-overlap logic with cross-platform comparison. Import `PlatformEventStore` and use the same `COMPARABLE_FIELDS` comparison logic (extract to a shared utility if needed, or inline).

The new endpoint iterates all events that have linked platform_events, runs the field comparison, and returns the summary format:

```typescript
router.get('/conflicts', (_req, res, next) => {
  try {
    const allEvents = eventStore.getAll().filter(e => e.status !== 'archived');
    const results: Array<{
      eventId: string;
      eventTitle: string;
      conflictCount: number;
      platforms: string[];
      fields: string[];
    }> = [];

    for (const event of allEvents) {
      const platformEvents = platformEventStore.getByEventId(event.id);
      if (platformEvents.length === 0) continue;

      const conflictFields: string[] = [];
      const involvedPlatforms = new Set<string>();

      for (const fieldDef of COMPARABLE_FIELDS) {
        // same comparison logic as conflicts.ts
        // if any platform differs, add field to conflictFields and platform to involvedPlatforms
      }

      if (conflictFields.length > 0) {
        results.push({
          eventId: event.id,
          eventTitle: event.title,
          conflictCount: conflictFields.length,
          platforms: [...involvedPlatforms],
          fields: conflictFields,
        });
      }
    }

    res.json({ data: results, total: results.length });
  } catch (err) {
    next(err);
  }
});
```

**Important:** Extract the comparison functions (`normalizeString`, `valuesMatch`, `COMPARABLE_FIELDS`) into a shared file `src/routes/conflict-utils.ts` so both `conflicts.ts` and `dashboard.ts` use the same logic. Update Task 1's `conflicts.ts` to import from the shared file.

- [ ] **Step 4: Update old conflict tests in `src/app.test.ts`**

The old scheduling-overlap tests (lines ~2978–3009, ~4348–4377, ~5050–5121) test the old endpoint shape. Either:
- Remove them and rely on the new tests in `conflicts.test.ts`, or
- Update them to test the new cross-platform format

Recommended: remove old tests that tested scheduling overlaps since that feature is being replaced. Keep any that test the route wiring (404s, error handling).

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass. Old scheduling-overlap tests removed/updated.

- [ ] **Step 6: Commit**

```bash
git add src/routes/conflicts.ts src/routes/conflict-utils.ts src/routes/dashboard.ts src/routes/conflicts.test.ts src/app.test.ts
git commit -m "feat: replace scheduling-overlap conflicts with cross-platform field detection"
```

---

## Chunk 2: Backend — Resolve Endpoint

### Task 3: Resolve + verify endpoint

**Files:**
- Modify: `src/routes/conflicts.ts`
- Modify: `src/routes/conflicts.test.ts`

- [ ] **Step 1: Write failing test for resolve endpoint**

```typescript
describe('POST /api/events/:id/conflicts/resolve', () => {
  it('updates hub event with provided field values', async () => {
    const createRes = await request(app).post('/api/events').send({
      title: 'Old Title',
      description: 'Desc',
      start_time: '2026-04-01T19:00:00.000Z',
      duration_minutes: 120,
      venue: 'Venue',
      price: 10,
      capacity: 50,
    });
    const eventId = createRes.body.data.id;

    const res = await request(app)
      .post(`/api/events/${eventId}/conflicts/resolve`)
      .send({ updates: { title: 'New Title' } });

    expect(res.status).toBe(200);
    expect(res.body.resolved).toContain('title');

    // Verify hub event was updated
    const eventRes = await request(app).get(`/api/events/${eventId}`);
    expect(eventRes.body.data.title).toBe('New Title');
  });

  it('returns 404 for nonexistent event', async () => {
    const res = await request(app)
      .post('/api/events/nonexistent/conflicts/resolve')
      .send({ updates: { title: 'X' } });
    expect(res.status).toBe(404);
  });

  it('returns 400 when no updates provided', async () => {
    const createRes = await request(app).post('/api/events').send({
      title: 'T', description: 'D', start_time: '2026-04-01T19:00:00.000Z',
      duration_minutes: 120, venue: 'V', price: 10, capacity: 50,
    });
    const res = await request(app)
      .post(`/api/events/${createRes.body.data.id}/conflicts/resolve`)
      .send({ updates: {} });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/routes/conflicts.test.ts`
Expected: FAIL — no POST route exists.

- [ ] **Step 3: Implement resolve endpoint**

In `src/routes/conflicts.ts`, add the resolve route. The full push-pull-verify cycle involves automation (which won't work in tests), so split the logic:

1. **Update hub event** — always works (SQLite update)
2. **Push to platforms** — call existing `/api/sync/push` logic per platform (async, may fail)
3. **Re-check conflicts** — re-run field comparison after push

For the test environment (no automation bridge), the endpoint should at minimum update the hub and report what it would push. The push + verify is best-effort.

```typescript
// POST /:id/conflicts/resolve
router.post('/:id/conflicts/resolve', async (req, res, next) => {
  try {
    const { updates } = req.body as { updates?: Record<string, string | number> };
    if (!updates || Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'updates object is required and must be non-empty' });
      return;
    }

    const event = eventStore.getById(req.params.id);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // 1. Update hub event
    const updatedEvent = eventStore.update(req.params.id, updates);
    if (!updatedEvent) {
      res.status(500).json({ error: 'Failed to update event' });
      return;
    }

    // 2. Attempt push to each linked platform
    const platformEvents = platformEventStore.getByEventId(req.params.id);
    const errors: Array<{ platform: string; error: string }> = [];

    // Push is async and uses automation — wrap in try/catch per platform
    // The actual push will use the same logic as sync/push
    // For now, mark sync_status as 'modified' so the push endpoint accepts it
    if (platformEvents.length > 0) {
      eventStore.updateSyncStatus(req.params.id, 'modified');
    }

    // 3. Re-check conflicts after hub update
    const resolvedFields: string[] = [];
    const remaining: FieldConflict[] = [];

    for (const fieldDef of COMPARABLE_FIELDS) {
      const hubRaw = (updatedEvent as any)[fieldDef.hubKey];
      const hubValue = fieldDef.type === 'number' ? (hubRaw ?? null) : normalizeString(hubRaw != null ? String(hubRaw) : null);
      const differing: FieldConflict['platformValues'] = [];

      for (const pe of platformEvents) {
        const platRaw = (pe as any)[fieldDef.platformKey];
        const platValue = fieldDef.type === 'number' ? (platRaw ?? null) : normalizeString(platRaw != null ? String(platRaw) : null);
        if (!valuesMatch(hubValue, platValue, fieldDef.type)) {
          differing.push({ platform: pe.platform, value: platValue, externalUrl: pe.externalUrl });
        }
      }

      if (differing.length > 0) {
        remaining.push({ field: fieldDef.field, hubValue, platformValues: differing });
      } else if (Object.keys(updates).includes(fieldDef.field) || Object.keys(updates).includes(fieldDef.hubKey)) {
        resolvedFields.push(fieldDef.field);
      }
    }

    res.json({
      success: remaining.length === 0,
      resolved: resolvedFields,
      remaining,
      errors,
      needsSync: platformEvents.length > 0,
    });
  } catch (err) {
    next(err);
  }
});
```

Note: The actual platform push (automation) is triggered separately by the frontend calling `POST /api/sync/push` for each platform after the resolve endpoint returns `needsSync: true`. This keeps the resolve endpoint fast and testable.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/routes/conflicts.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/conflicts.ts src/routes/conflicts.test.ts
git commit -m "feat: add conflict resolve endpoint with hub update and re-check"
```

---

## Chunk 3: Frontend — API Client + Resolution Page

### Task 4: Frontend API client

**Files:**
- Create: `client/src/api/conflicts.ts`

- [ ] **Step 1: Create the conflicts API client**

```typescript
import type { PlatformName } from '../../../src/shared/types';

const BASE = '/api/events';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export interface FieldConflict {
  field: string;
  hubValue: string | number | null;
  platformValues: Array<{
    platform: PlatformName;
    value: string | number | null;
    externalUrl?: string;
  }>;
}

export interface ConflictResponse {
  eventId: string;
  eventTitle: string;
  conflicts: FieldConflict[];
  platforms: Array<{
    platform: PlatformName;
    externalId: string;
    externalUrl?: string;
    lastSyncedAt: string;
  }>;
}

export interface ResolveResult {
  success: boolean;
  resolved: string[];
  remaining: FieldConflict[];
  errors: Array<{ platform: string; error: string }>;
  needsSync: boolean;
}

export interface DashboardConflict {
  eventId: string;
  eventTitle: string;
  conflictCount: number;
  platforms: PlatformName[];
  fields: string[];
}

export async function getEventConflicts(eventId: string): Promise<ConflictResponse> {
  const res = await fetch(`${BASE}/${eventId}/conflicts`);
  return json<ConflictResponse>(res);
}

export async function resolveConflicts(
  eventId: string,
  updates: Record<string, string | number>,
): Promise<ResolveResult> {
  const res = await fetch(`${BASE}/${eventId}/conflicts/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  return json<ResolveResult>(res);
}

export async function pushToplatform(eventId: string, platform: string): Promise<any> {
  const res = await fetch('/api/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, platform }),
  });
  return json<any>(res);
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/api/conflicts.ts
git commit -m "feat: add conflicts API client"
```

---

### Task 5: Conflict Resolution Page

**Files:**
- Create: `client/src/pages/ConflictResolutionPage.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create the resolution page component**

Create `client/src/pages/ConflictResolutionPage.tsx`. Follow existing patterns:
- Inline `styles` object (like EventDetailPage)
- `useEffect` with cancelled-flag cleanup
- `useParams()` for event ID, `useNavigate()` for navigation

Page structure:
1. **Header**: event title + back link to `/events/:id`
2. **Status bar**: "X conflicts across Y platforms" (red) or "All synced" (green)
3. **Conflict cards**: one per conflicting field, showing:
   - Field name label
   - Hub value in an editable input
   - Each platform's value with platform icon/label and "Use this" button
   - Visual indicator: red border when conflicting, green when resolved
4. **Synced fields section**: collapsed/minimal list of fields that already match
5. **Footer**: "Sync to All Platforms" button

States: loading → conflicts → syncing → verifying → resolved/partially-resolved

The page should:
- Call `getEventConflicts(id)` on mount
- Track edited values in local state (`editedFields: Record<string, string | number>`)
- On "Sync All": call `resolveConflicts(id, editedFields)`, then if `needsSync`, call `pushToplatform` for each platform, then re-fetch conflicts to verify
- Show clear success/failure after verification

Key UI details:
- Each field card shows the hub value as an editable text input (or textarea for description)
- Platform values shown as read-only chips below the input
- Clicking a platform value copies it into the hub input
- Edited fields get an amber "pending" indicator
- After resolve: green checkmark for resolved fields, red for remaining

- [ ] **Step 2: Register the route in App.tsx**

In `client/src/App.tsx`, add the route before the `/events/:id` route (order matters for React Router):

```typescript
import { ConflictResolutionPage } from './pages/ConflictResolutionPage';
// In the Routes:
<Route path="/conflicts/:id" element={<ConflictResolutionPage />} />
```

Add it after the `/events/:id` route — since these are different path prefixes (`/conflicts` vs `/events`), order doesn't matter here.

- [ ] **Step 3: Verify the page renders**

Run: `npm run dev:web`
Navigate to `/conflicts/some-event-id` — should show loading then error (no real event). Confirms routing works.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/ConflictResolutionPage.tsx client/src/App.tsx
git commit -m "feat: add conflict resolution page with field comparison UI"
```

---

## Chunk 4: Frontend — Dashboard + EventDetail Integration

### Task 6: Update ConflictsSection for cross-platform conflicts

**Files:**
- Modify: `client/src/components/dashboard/ConflictsSection.tsx`
- Modify: `client/src/api/dashboard.ts`

- [ ] **Step 1: Update the dashboard Conflict type**

In `client/src/api/dashboard.ts`, replace the old `Conflict` interface:

```typescript
export interface Conflict {
  eventId: string;
  eventTitle: string;
  conflictCount: number;
  platforms: string[];
  fields: string[];
}
```

The `getConflicts` function stays the same (same URL).

- [ ] **Step 2: Update ConflictsSection component**

Rewrite `client/src/components/dashboard/ConflictsSection.tsx` to:
- Display each conflict as a card with: event title, "N field conflicts", platform badges, list of conflicting field names
- Click navigates to `/conflicts/:eventId` (not `/events/:eventId`)
- Keep the same section styling and "Scheduling Conflicts (N)" header — rename to "Platform Conflicts (N)"

- [ ] **Step 3: Verify in browser**

Run: `npm run dev:web`
Check dashboard — conflicts section should show cross-platform conflicts (or be empty if no test data).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/dashboard/ConflictsSection.tsx client/src/api/dashboard.ts
git commit -m "feat: update dashboard conflicts to show cross-platform mismatches"
```

---

### Task 7: Add conflict banner to EventDetailPage

**Files:**
- Modify: `client/src/pages/EventDetailPage.tsx`

- [ ] **Step 1: Add conflict detection to EventDetailPage**

After the event loads (in the existing `useEffect`), also call `getEventConflicts(id)`. Store result in state. If conflicts exist, render a warning banner between the header and the form (line ~652 area):

```typescript
// New state
const [conflictCount, setConflictCount] = useState(0);
const [conflictPlatforms, setConflictPlatforms] = useState<string[]>([]);

// In useEffect after event loads:
if (id) {
  getEventConflicts(id)
    .then(res => {
      if (!cancelled) {
        setConflictCount(res.conflicts.length);
        setConflictPlatforms([...new Set(res.conflicts.flatMap(c => c.platformValues.map(p => p.platform)))]);
      }
    })
    .catch(() => {}); // silent — conflict check is non-critical
}

// In render, after error banner:
{conflictCount > 0 && (
  <div style={styles.conflictBanner}>
    <span>{conflictCount} field conflict{conflictCount > 1 ? 's' : ''} across {conflictPlatforms.join(', ')}</span>
    <button onClick={() => nav(`/conflicts/${id}`)} style={styles.conflictResolveBtn}>
      Resolve
    </button>
  </div>
)}
```

Style the banner with amber/warning colors (similar to the red error banner but amber).

- [ ] **Step 2: Test in browser**

Navigate to an event that has platform events with different data. Verify the banner appears and the "Resolve" button navigates to `/conflicts/:id`.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/EventDetailPage.tsx
git commit -m "feat: add conflict warning banner to event detail page"
```

---

## Chunk 5: Integration Test + Polish

### Task 8: Full integration verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All 730+ existing tests pass, plus new conflict tests.

- [ ] **Step 2: Manual end-to-end test**

1. Start app with `npm run dev:web`
2. Create an event
3. Manually insert a platform_event row with different title (via SQLite or test endpoint)
4. Check dashboard — conflict should appear
5. Click conflict → should navigate to `/conflicts/:id`
6. Edit the hub title
7. Click "Sync to All Platforms" → should update hub and show verification result
8. Check event detail page — conflict banner should appear with "Resolve" button

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: polish conflict resolution integration"
```
