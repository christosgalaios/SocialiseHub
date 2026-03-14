# Events, Generator, Analytics & Optimize Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix events tab to show synced events with sync status, rewrite generator to analyze external market data, add analytics tab with performance charts, and add per-event AI optimization with photo management.

**Architecture:** Four sequential workstreams building on each other. WS1 fixes the data foundation (events ↔ platform_events link). WS2 adds public scrapers and rewrites the generator prompt. WS3 adds analytics with Recharts. WS4 adds AI optimization and photo pipeline. All AI interactions use the existing Claude panel bridge pattern (compose prompt → relay to Claude panel → parse response).

**Tech Stack:** React 19, Express 5, SQLite (better-sqlite3), Electron 40, Recharts (new), Sharp (new), Multer (new), Vitest

**Spec:** `docs/superpowers/specs/2026-03-14-events-generator-analytics-optimize-design.md`

---

## Chunk 1: Database Migration System + WS1 (Events Tab Fix + Sync Status)

### Task 1: Add versioned migration system to database.ts

**Files:**
- Modify: `src/data/database.ts:5-11`
- Test: `src/data/__tests__/database.test.ts` (create)

- [ ] **Step 1: Write failing test for migration versioning**

```typescript
// src/data/__tests__/database.test.ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../database';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

describe('database migrations', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'socialise-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should set user_version after schema creation', () => {
    const db = createDatabase(join(tmpDir, 'test.db'));
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it('should add sync_status column to events table', () => {
    const db = createDatabase(join(tmpDir, 'test.db'));
    const columns = db.prepare("PRAGMA table_info('events')").all() as Array<{ name: string }>;
    expect(columns.some(c => c.name === 'sync_status')).toBe(true);
    db.close();
  });

  it('should handle re-running migrations on existing database', () => {
    const dbPath = join(tmpDir, 'test.db');
    const db1 = createDatabase(dbPath);
    db1.close();
    // Re-open and re-run — should not throw
    const db2 = createDatabase(dbPath);
    const version = db2.pragma('user_version', { simple: true });
    expect(version).toBeGreaterThanOrEqual(1);
    db2.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/__tests__/database.test.ts`
Expected: FAIL — `sync_status` column not found, user_version is 0

- [ ] **Step 3: Implement migration system in database.ts**

Add after the `createSchema(db)` call in `createDatabase()` at line 10, and add a `runMigrations(db)` function:

```typescript
// Add at end of createDatabase(), after createSchema(db) call (line 10):
runMigrations(db);

// Add new function after createSchema():
function runMigrations(db: Database) {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  if (currentVersion < 1) {
    // Migration 1: Add sync_status to events
    try {
      db.exec("ALTER TABLE events ADD COLUMN sync_status TEXT DEFAULT 'local_only'");
    } catch {
      // Column already exists — safe to ignore
    }
    db.pragma('user_version = 1');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/__tests__/database.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/database.ts src/data/__tests__/database.test.ts
git commit -m "feat: add versioned migration system with sync_status column"
```

---

### Task 2: Add sync_status to SocialiseEvent type and event store

**Files:**
- Modify: `src/shared/types.ts:19-34`
- Modify: `src/data/sqlite-event-store.ts:18-32,43-75`

- [ ] **Step 1: Write failing test for sync_status in event store**

```typescript
// Add to src/data/__tests__/database.test.ts
import { SqliteEventStore } from '../sqlite-event-store';

describe('SqliteEventStore sync_status', () => {
  let tmpDir: string;
  let db: Database;
  let store: SqliteEventStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'socialise-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
    store = new SqliteEventStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should default sync_status to local_only for new events', () => {
    const event = store.create({
      title: 'Test Event',
      description: 'A test',
      start_time: new Date().toISOString(),
      duration_minutes: 60,
      venue: 'Test Venue',
      price: 10,
      capacity: 50,
    });
    expect(event.sync_status).toBe('local_only');
  });

  it('should allow updating sync_status', () => {
    const event = store.create({
      title: 'Test Event',
      description: 'A test',
      start_time: new Date().toISOString(),
      duration_minutes: 60,
      venue: 'Test Venue',
      price: 10,
      capacity: 50,
    });
    store.updateSyncStatus(event.id, 'synced');
    const updated = store.getById(event.id);
    expect(updated?.sync_status).toBe('synced');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/__tests__/database.test.ts`
Expected: FAIL — `sync_status` not on SocialiseEvent, `updateSyncStatus` not defined

- [ ] **Step 3: Add sync_status to SocialiseEvent type**

In `src/shared/types.ts`, add to the `SocialiseEvent` interface (after line 33, before closing `}`):

```typescript
  sync_status?: 'synced' | 'modified' | 'local_only';
```

- [ ] **Step 4: Update EventRow and rowToEvent in sqlite-event-store.ts**

In `src/data/sqlite-event-store.ts`:

Add to `EventRow` interface (line 18-32), before closing `}`:
```typescript
  sync_status: string | null;
```

In `rowToEvent()` (around line 43-75), add to the returned object:
```typescript
  sync_status: (row.sync_status || 'local_only') as 'synced' | 'modified' | 'local_only',
```

Add `updateSyncStatus` method to `SqliteEventStore` class (after `delete` method at line 162):
```typescript
  updateSyncStatus(id: string, status: 'synced' | 'modified' | 'local_only'): void {
    this.db.prepare('UPDATE events SET sync_status = ? WHERE id = ?').run(status, id);
  }
```

Also add `sync_status` to the `UPDATABLE_FIELDS` set (line 13-16) if edits should auto-flip status. Instead, modify the `update()` method (line 122-148) to auto-set `sync_status = 'modified'` when a synced event is edited. Add after the existing UPDATE statement:

```typescript
  // Auto-flip sync_status to 'modified' if editing a synced event
  const current = this.getById(id);
  if (current?.sync_status === 'synced') {
    this.db.prepare('UPDATE events SET sync_status = ? WHERE id = ?').run('modified', id);
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/data/__tests__/database.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/data/sqlite-event-store.ts src/data/__tests__/database.test.ts
git commit -m "feat: add sync_status field to SocialiseEvent and event store"
```

---

### Task 3: Update sync pull to upsert into events table

**Files:**
- Modify: `src/routes/sync.ts:37-80`
- Test: `src/routes/__tests__/sync-pull.test.ts` (create)

- [ ] **Step 1: Write failing test for sync pull creating events**

```typescript
// src/routes/__tests__/sync-pull.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../../data/database';
import { SqliteEventStore } from '../../data/sqlite-event-store';
import { PlatformEventStore } from '../../data/platform-event-store';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('sync pull → events upsert', () => {
  let tmpDir: string;
  let db: Database;
  let eventStore: SqliteEventStore;
  let platformEventStore: PlatformEventStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'socialise-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
    eventStore = new SqliteEventStore(db);
    platformEventStore = new PlatformEventStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create an event row when upserting a new platform event', () => {
    // Simulate what sync pull does
    const pe = platformEventStore.upsert({
      platform: 'meetup',
      externalId: 'ext-123',
      title: 'Bristol Meetup',
      date: '2026-04-01T18:00:00.000Z',
      venue: 'The Venue',
      status: 'active',
    });

    // Before linking, events table should be empty
    expect(eventStore.getAll().length).toBe(0);

    // Now call the linking function (to be implemented)
    const { linkPlatformEventToEvent } = require('../../routes/sync');
    linkPlatformEventToEvent(pe, eventStore, platformEventStore);

    // After linking, events table should have 1 event
    const events = eventStore.getAll();
    expect(events.length).toBe(1);
    expect(events[0].title).toBe('Bristol Meetup');
    expect(events[0].sync_status).toBe('synced');
  });

  it('should update existing event when platform event changes', () => {
    const pe = platformEventStore.upsert({
      platform: 'meetup',
      externalId: 'ext-123',
      title: 'Bristol Meetup',
      date: '2026-04-01T18:00:00.000Z',
      venue: 'The Venue',
      status: 'active',
    });

    const { linkPlatformEventToEvent } = require('../../routes/sync');
    linkPlatformEventToEvent(pe, eventStore, platformEventStore);

    // Update platform event title
    const pe2 = platformEventStore.upsert({
      platform: 'meetup',
      externalId: 'ext-123',
      title: 'Bristol Meetup UPDATED',
      date: '2026-04-01T18:00:00.000Z',
      venue: 'The Venue',
      status: 'active',
    });

    linkPlatformEventToEvent(pe2, eventStore, platformEventStore);

    const events = eventStore.getAll();
    expect(events.length).toBe(1);
    expect(events[0].title).toBe('Bristol Meetup UPDATED');
    expect(events[0].sync_status).toBe('synced');
  });

  it('should skip update when event has local modifications', () => {
    const pe = platformEventStore.upsert({
      platform: 'meetup',
      externalId: 'ext-123',
      title: 'Bristol Meetup',
      date: '2026-04-01T18:00:00.000Z',
      venue: 'The Venue',
      status: 'active',
    });

    const { linkPlatformEventToEvent } = require('../../routes/sync');
    linkPlatformEventToEvent(pe, eventStore, platformEventStore);

    // Simulate local edit
    const events = eventStore.getAll();
    eventStore.updateSyncStatus(events[0].id, 'modified');

    // Try to update from platform
    const pe2 = platformEventStore.upsert({
      platform: 'meetup',
      externalId: 'ext-123',
      title: 'Bristol Meetup FROM PLATFORM',
      date: '2026-04-01T18:00:00.000Z',
      venue: 'The Venue',
      status: 'active',
    });

    linkPlatformEventToEvent(pe2, eventStore, platformEventStore);

    // Should keep local title, not platform's
    const updated = eventStore.getAll();
    expect(updated[0].title).toBe('Bristol Meetup');
    expect(updated[0].sync_status).toBe('modified');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/__tests__/sync-pull.test.ts`
Expected: FAIL — `linkPlatformEventToEvent` not exported

- [ ] **Step 3: Implement linkPlatformEventToEvent and integrate into sync pull**

In `src/routes/sync.ts`, add a new exported function and integrate it into the pull endpoint:

```typescript
// Add export at module level (before createSyncRouter):
export function linkPlatformEventToEvent(
  pe: PlatformEvent,
  eventStore: SqliteEventStore,
  platformEventStore: PlatformEventStore
): void {
  if (pe.eventId) {
    // Already linked — check if we should update
    const existingEvent = eventStore.getById(pe.eventId);
    if (existingEvent && existingEvent.sync_status === 'modified') {
      // Skip — user has local changes
      return;
    }
    if (existingEvent) {
      // Update event with latest platform data
      eventStore.update(pe.eventId, {
        title: pe.title,
        description: undefined, // platform_events don't store description
        start_time: pe.date || existingEvent.start_time,
        venue: pe.venue || existingEvent.venue,
      });
      // Reset sync_status back to synced (update() auto-flips to modified)
      eventStore.updateSyncStatus(pe.eventId, 'synced');
    }
  } else {
    // Not linked — create new event and link
    const newEvent = eventStore.create({
      title: pe.title,
      description: '',
      start_time: pe.date || new Date().toISOString(),
      duration_minutes: 60,
      venue: pe.venue || '',
      price: 0,
      capacity: 0,
    });
    eventStore.updateSyncStatus(newEvent.id, 'synced');
    // Link platform_event to new event
    platformEventStore.linkToEvent(pe.id, newEvent.id);
  }
}
```

In the `POST /pull` handler (around line 48-59), after `platformEventStore.upsert(...)`, add:

```typescript
const upserted = platformEventStore.upsert({ ... });
linkPlatformEventToEvent(upserted, eventStore, platformEventStore);
```

- [ ] **Step 4: Add linkToEvent method to PlatformEventStore**

In `src/data/platform-event-store.ts`, add after `getByEventId()` (line 129):

```typescript
  linkToEvent(platformEventId: string, eventId: string): void {
    this.db.prepare('UPDATE platform_events SET event_id = ? WHERE id = ?').run(eventId, platformEventId);
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/routes/__tests__/sync-pull.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/sync.ts src/data/platform-event-store.ts src/routes/__tests__/sync-pull.test.ts
git commit -m "feat: sync pull now creates/updates events table entries"
```

---

### Task 4: Add sync push endpoint

**Files:**
- Modify: `src/routes/sync.ts`

- [ ] **Step 1: Write failing test for push endpoint**

```typescript
// Add to src/routes/__tests__/sync-pull.test.ts (rename file to sync.test.ts)
import express from 'express';
import request from 'supertest';
import { createSyncRouter } from '../../routes/sync';

describe('POST /push', () => {
  it('should return 400 if eventId or platform missing', async () => {
    // ... setup stores with in-memory db ...
    const mockPublishService = { publish: vi.fn() };
    const mockSyncLogStore = { log: vi.fn(), getRecent: vi.fn() };
    const mockServiceStore = { getAll: vi.fn().mockReturnValue([]) };
    const router = createSyncRouter(
      mockSyncLogStore as any,
      platformEventStore,
      mockPublishService as any,
      eventStore,
      mockServiceStore as any
    );
    const app = express();
    app.use(express.json());
    app.use('/api/sync', router);

    const res = await request(app)
      .post('/api/sync/push')
      .send({});
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/__tests__/sync-pull.test.ts`
Expected: FAIL — route not found (404)

- [ ] **Step 3: Implement push endpoint**

In `src/routes/sync.ts`, add after the pull endpoint (after line 80):

```typescript
  // POST /push — push local changes back to platform
  router.post('/push', async (req, res) => {
    const { eventId, platform } = req.body;
    if (!eventId || !platform) {
      return res.status(400).json({ error: 'eventId and platform are required' });
    }

    try {
      const event = eventStore.getById(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
      if (event.sync_status !== 'modified') {
        return res.status(400).json({ error: 'Event is not modified — nothing to push' });
      }

      const result = await publishService.publish(eventId, platform);
      eventStore.updateSyncStatus(eventId, 'synced');

      syncLogStore.log({
        platform,
        action: 'push',
        status: 'success',
        message: `Pushed updates for "${event.title}" to ${platform}`,
        eventCount: 1,
      });

      res.json({ success: true, result });
    } catch (err: any) {
      syncLogStore.log({
        platform,
        action: 'push',
        status: 'error',
        message: err.message,
        eventCount: 0,
      });
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/__tests__/sync-pull.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/sync.ts src/routes/__tests__/sync-pull.test.ts
git commit -m "feat: add POST /api/sync/push endpoint for pushing changes to platforms"
```

---

### Task 5: Add sync status badge and push button to EventCard

**Files:**
- Modify: `client/src/components/EventCard.tsx:6-14,17-91`
- Modify: `client/src/api/events.ts`

- [ ] **Step 1: Add pushEvent API function**

In `client/src/api/events.ts`, add after `syncPull()` (line 176):

```typescript
export async function pushEvent(eventId: string, platform: string): Promise<void> {
  const res = await fetch(`${BASE}/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, platform }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Push failed');
  }
}
```

- [ ] **Step 2: Update EventCard props and component**

In `client/src/components/EventCard.tsx`:

Update props interface (line 6-14) to add:
```typescript
  onPush?: (id: string, platform: string) => void;
```

Add sync status badge inside the card header (after the StatusBadge, around line 36). Add a small colored dot:

```typescript
{/* Sync status indicator */}
{event.sync_status === 'synced' && (
  <span style={styles.syncBadgeSynced} title="In sync">●</span>
)}
{event.sync_status === 'modified' && (
  <span style={styles.syncBadgeModified} title="Needs push">●</span>
)}
```

Add push button in the footer (near delete/duplicate buttons, around line 80):
```typescript
{event.sync_status === 'modified' && event.platforms?.length > 0 && (
  <button
    style={styles.pushButton}
    onClick={(e) => {
      e.stopPropagation();
      onPush?.(event.id, event.platforms[0].platform);
    }}
    title="Push changes to platform"
  >
    Push ↑
  </button>
)}
```

Add styles:
```typescript
syncBadgeSynced: { color: '#4ade80', fontSize: '10px', marginLeft: '6px' } as React.CSSProperties,
syncBadgeModified: { color: '#fb923c', fontSize: '10px', marginLeft: '6px' } as React.CSSProperties,
pushButton: {
  padding: '4px 8px',
  fontSize: '11px',
  background: '#3b82f6',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
} as React.CSSProperties,
```

- [ ] **Step 3: Wire push handler in EventsPage**

In `client/src/pages/EventsPage.tsx`, import `pushEvent` and add handler:

```typescript
import { pushEvent } from '../api/events';

// Inside component:
const handlePush = async (id: string, platform: string) => {
  try {
    await pushEvent(id, platform);
    // Refresh events list
    const data = await getEvents();
    setEvents(data);
  } catch (err: any) {
    setError(err.message);
  }
};

// In the EventCard render, add onPush prop:
<EventCard ... onPush={handlePush} />
```

- [ ] **Step 4: Manually verify in dev mode**

Run: `npm run dev:web`
Verify: Events page loads. Synced events show green dot. Modified events show orange dot + Push button.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/EventCard.tsx client/src/api/events.ts client/src/pages/EventsPage.tsx
git commit -m "feat: add sync status badge and push button to EventCard"
```

---

## Chunk 2: WS2 (Generator Rewrite)

### Task 6: Add public scraper for Meetup Bristol search

**Files:**
- Modify: `src/automation/meetup.ts:177-255`

- [ ] **Step 1: Add meetupPublicScrapeSteps function**

In `src/automation/meetup.ts`, add after `meetupScrapeSteps()` (after line 255):

```typescript
/**
 * Scrape public Bristol events from Meetup search (not the user's own group).
 * Uses a separate session partition to avoid cookie contamination.
 */
export function meetupPublicScrapeSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.meetup.com/find/?location=gb--bristol&source=EVENTS',
      description: 'Navigate to Meetup Bristol public events search',
    },
    {
      action: 'wait',
      timeout: 3000,
      description: 'Wait for search results to load',
    },
    {
      action: 'evaluate',
      expression: `(async () => {
        try {
          // Use Meetup's search API to get public events
          const response = await fetch('https://www.meetup.com/gql2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: \`query {
                rankedEvents(
                  filter: {
                    query: ""
                    lat: 51.4545
                    lon: -2.5879
                    radius: 25
                    startDateRange: "\${new Date().toISOString()}"
                    endDateRange: "\${new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()}"
                  }
                  first: 50
                ) {
                  edges {
                    node {
                      id
                      title
                      dateTime
                      eventUrl
                      venue { name city }
                      group { name }
                      eventType
                      going
                      maxTickets
                    }
                  }
                }
              }\`
            })
          });
          const data = await response.json();
          const events = (data?.data?.rankedEvents?.edges || []).map(e => ({
            id: e.node.id,
            title: e.node.title,
            date: e.node.dateTime,
            venue: e.node.venue?.name || '',
            url: e.node.eventUrl,
            category: e.node.eventType || '',
            group: e.node.group?.name || '',
            going: e.node.going || 0,
            maxTickets: e.node.maxTickets || 0,
          }));
          return JSON.stringify({ success: true, events });
        } catch (err) {
          return JSON.stringify({ success: false, error: err.message });
        }
      })()`,
      description: 'Fetch public Bristol events via GraphQL search',
    },
  ];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/automation/meetup.ts
git commit -m "feat: add meetupPublicScrapeSteps for Bristol public events"
```

---

### Task 7: Add public scrapers for Eventbrite and Headfirst

**Files:**
- Modify: `src/automation/eventbrite.ts:206-274`
- Modify: `src/automation/headfirst.ts:175-258`

- [ ] **Step 1: Add eventbritePublicScrapeSteps**

In `src/automation/eventbrite.ts`, add after `eventbriteScrapeSteps()`:

```typescript
export function eventbritePublicScrapeSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.eventbrite.co.uk/d/united-kingdom--bristol/events/',
      description: 'Navigate to Eventbrite Bristol public events',
    },
    {
      action: 'wait',
      timeout: 3000,
      description: 'Wait for listings to load',
    },
    {
      action: 'evaluate',
      expression: `(async () => {
        try {
          // Eventbrite public search API
          const response = await fetch('https://www.eventbrite.co.uk/api/v3/destination/search/?event_search.dates=current_future&event_search.dedup=listing&event_search.page_size=50&event_search.online_events_only=false&place_id=ChIJYdyzlUiTcUgRNuWMzzKRBNY', {
            headers: { 'Accept': 'application/json' }
          });
          const data = await response.json();
          const events = (data?.events?.results || []).map(e => ({
            id: String(e.id),
            title: e.name,
            date: e.start_date + 'T' + (e.start_time || '00:00:00'),
            venue: e.primary_venue?.name || e.primary_venue?.address?.city || '',
            url: e.url,
            category: e.tags?.[0]?.display_name || '',
            price: e.ticket_availability?.minimum_ticket_price?.display || 'Free',
          }));
          return JSON.stringify({ success: true, events });
        } catch (err) {
          return JSON.stringify({ success: false, error: err.message });
        }
      })()`,
      description: 'Fetch public Bristol events from Eventbrite search API',
    },
  ];
}
```

- [ ] **Step 2: Add headfirstPublicScrapeSteps**

In `src/automation/headfirst.ts`, add after `headfirstScrapeSteps()`:

```typescript
export function headfirstPublicScrapeSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.headfirstbristol.co.uk/whats-on',
      description: 'Navigate to Headfirst Bristol public what\'s on page',
    },
    {
      action: 'wait',
      timeout: 5000,
      description: 'Wait for events to load',
    },
    {
      action: 'evaluate',
      expression: `(async () => {
        try {
          const events = [];
          const cards = document.querySelectorAll('.event-card, .listing-item, [class*="event"]');
          cards.forEach(card => {
            const titleEl = card.querySelector('h2, h3, .event-title, .listing-title');
            const dateEl = card.querySelector('time, .event-date, .listing-date');
            const venueEl = card.querySelector('.venue, .event-venue, .listing-venue');
            const linkEl = card.querySelector('a[href]');
            const priceEl = card.querySelector('.price, .event-price, .listing-price');
            if (titleEl) {
              events.push({
                id: linkEl?.href?.split('/').pop() || String(Math.random()),
                title: titleEl.textContent?.trim() || '',
                date: dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || '',
                venue: venueEl?.textContent?.trim() || '',
                url: linkEl?.href || '',
                category: '',
                price: priceEl?.textContent?.trim() || '',
              });
            }
          });
          return JSON.stringify({ success: true, events });
        } catch (err) {
          return JSON.stringify({ success: false, error: err.message });
        }
      })()`,
      description: 'Scrape public events from Headfirst what\'s on page',
    },
  ];
}
```

- [ ] **Step 3: Commit**

```bash
git add src/automation/eventbrite.ts src/automation/headfirst.ts
git commit -m "feat: add public scraper steps for Eventbrite and Headfirst"
```

---

### Task 8: Create market_events table and rewrite market analyzer

**Files:**
- Modify: `src/data/database.ts`
- Create: `src/data/market-event-store.ts`
- Modify: `src/agents/market-analyzer.ts:10-109`

- [ ] **Step 1: Add migration for market_events table**

In `src/data/database.ts`, in `runMigrations()`, add after migration 1:

```typescript
  if (currentVersion < 2) {
    db.exec(`CREATE TABLE IF NOT EXISTS market_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      start_time TEXT,
      venue TEXT,
      category TEXT,
      price TEXT,
      url TEXT,
      scraped_at TEXT NOT NULL,
      UNIQUE(platform, external_id)
    )`);
    db.pragma('user_version = 2');
  }
```

- [ ] **Step 2: Create MarketEventStore**

```typescript
// src/data/market-event-store.ts
import type { Database } from './database';
import type { ScrapedEvent, PlatformName } from '../shared/types';

export class MarketEventStore {
  constructor(private db: Database) {}

  clearPlatform(platform: PlatformName): void {
    this.db.prepare('DELETE FROM market_events WHERE platform = ?').run(platform);
  }

  upsert(event: {
    platform: PlatformName;
    externalId: string;
    title: string;
    description?: string;
    startTime?: string;
    venue?: string;
    category?: string;
    price?: string;
    url?: string;
  }): void {
    this.db.prepare(`
      INSERT INTO market_events (platform, external_id, title, description, start_time, venue, category, price, url, scraped_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(platform, external_id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        start_time = excluded.start_time,
        venue = excluded.venue,
        category = excluded.category,
        price = excluded.price,
        url = excluded.url,
        scraped_at = excluded.scraped_at
    `).run(
      event.platform,
      event.externalId,
      event.title,
      event.description || null,
      event.startTime || null,
      event.venue || null,
      event.category || null,
      event.price || null,
      event.url || null,
      new Date().toISOString()
    );
  }

  getAll(): ScrapedEvent[] {
    const rows = this.db.prepare('SELECT * FROM market_events ORDER BY start_time ASC').all() as any[];
    return rows.map(row => ({
      title: row.title,
      date: row.start_time || '',
      venue: row.venue || '',
      category: row.category,
      price: row.price,
      platform: row.platform,
      url: row.url || '',
    }));
  }
}
```

- [ ] **Step 3: Rewrite MarketAnalyzer**

Replace the contents of `src/agents/market-analyzer.ts`:

```typescript
import { MarketEventStore } from '../data/market-event-store';
import type { ScrapedEvent, PlatformName } from '../shared/types';

export class MarketAnalyzer {
  constructor(private marketEventStore: MarketEventStore) {}

  /**
   * Store scraped public events into market_events table.
   * Called by the analyze endpoint after automation scraping completes.
   */
  storeResults(platform: PlatformName, events: Array<{
    id: string;
    title: string;
    date?: string;
    venue?: string;
    category?: string;
    price?: string;
    url?: string;
  }>): void {
    this.marketEventStore.clearPlatform(platform);
    for (const event of events) {
      this.marketEventStore.upsert({
        platform,
        externalId: event.id,
        title: event.title,
        startTime: event.date,
        venue: event.venue,
        category: event.category,
        price: event.price,
        url: event.url,
      });
    }
  }

  /**
   * Get all cached market events for prompt composition.
   */
  getMarketData(): ScrapedEvent[] {
    return this.marketEventStore.getAll();
  }

  /**
   * Infer category from event title keywords.
   */
  inferCategory(title: string): string {
    const lower = title.toLowerCase();
    const categories: Record<string, string[]> = {
      'Workshop': ['workshop', 'class', 'course', 'learn', 'masterclass'],
      'Social': ['social', 'mixer', 'networking', 'meetup', 'drinks'],
      'Outdoor': ['walk', 'hike', 'outdoor', 'garden', 'park', 'nature'],
      'Food & Drink': ['food', 'cooking', 'wine', 'tasting', 'dinner', 'brunch'],
      'Arts & Culture': ['art', 'gallery', 'museum', 'theatre', 'music', 'concert'],
      'Wellness': ['yoga', 'meditation', 'wellness', 'fitness', 'mindfulness'],
      'Tech': ['tech', 'coding', 'developer', 'startup', 'AI', 'data'],
      'Sports': ['sport', 'running', 'climbing', 'cycling', 'swim'],
      'Craft': ['craft', 'pottery', 'painting', 'making', 'creative'],
      'Community': ['community', 'volunteer', 'charity', 'fundraiser'],
    };
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(k => lower.includes(k))) return category;
    }
    return 'General';
  }
}
```

- [ ] **Step 4: Update database.test.ts for migration 2**

Add to existing test:
```typescript
  it('should create market_events table', () => {
    const db = createDatabase(join(tmpDir, 'test.db'));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='market_events'").all();
    expect(tables.length).toBe(1);
    db.close();
  });
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/data/__tests__/database.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/data/database.ts src/data/market-event-store.ts src/agents/market-analyzer.ts src/data/__tests__/database.test.ts
git commit -m "feat: add market_events table and rewrite MarketAnalyzer for public events"
```

---

### Task 9: Rewrite generator prompt and update routes

**Files:**
- Modify: `src/routes/generator.ts:26-55,123-302`
- Modify: `src/app.ts:73-74`
- Modify: `client/src/pages/EventGeneratorPage.tsx:45-64`

- [ ] **Step 1: Update app.ts to pass MarketEventStore to MarketAnalyzer**

In `src/app.ts`, change line 74 where `marketAnalyzer` is created:

```typescript
// Before:
const marketAnalyzer = new MarketAnalyzer(platformEventStore);

// After:
import { MarketEventStore } from './data/market-event-store';
const marketEventStore = new MarketEventStore(db);
const marketAnalyzer = new MarketAnalyzer(marketEventStore);
```

- [ ] **Step 2: Rewrite composeClaudePrompt in generator.ts**

Replace the existing `composeClaudePrompt` function (lines 123-184):

```typescript
function composeClaudePrompt(marketData: ScrapedEvent[], pastEvents: SocialiseEvent[]): string {
  const marketSection = marketData.length > 0
    ? marketData.map(e =>
        `- ${e.title} | ${e.date} | ${e.venue} | ${e.category || 'Uncategorized'} | ${e.price || 'Free'}`
      ).join('\n')
    : 'No external event data available — use your knowledge of Bristol events.';

  const pastSection = pastEvents.length > 0
    ? pastEvents.map(e =>
        `- ${e.title} | ${e.start_time} | ${e.venue} | £${e.price}`
      ).join('\n')
    : 'No past events — this is a new organizer.';

  return `You are an event planning advisor for Socialise, a Bristol-based events company that organises social activities for young professionals.

## External Bristol Events Landscape
These are events happening in Bristol from OTHER organisers. Use this to understand what's already happening and avoid date clashes:

${marketSection}

## Calendar & Cultural Context
Consider the following when suggesting dates (use your knowledge):
- UK bank holidays in the next 3 months
- School holidays and university term dates
- Bristol-specific events (Harbour Festival, Balloon Fiesta, Pride, St Paul's Carnival)
- Seasonal factors (weather, daylight hours, indoor vs outdoor suitability)
- Day-of-week patterns (weekends and bank holiday weekends are prime time)

## Socialise's Past Events (for style reference only)
These show what Socialise has done before — use for tone and format reference, NOT as competition:

${pastSection}

## Your Task
Find optimal dates in the next 3 months where event attendance would be highest, then suggest events for those dates.

For each suggestion:
1. **Date & reason** — Why this date is good (bank holiday, gap in market, seasonal fit)
2. **Event idea** — Title, description, suggested venue type, estimated capacity, price point
3. **Category** — Workshop, Social, Outdoor, Food & Drink, Arts & Culture, Wellness, Craft, etc.

Prioritise:
- Bank holidays and long weekends (people are free and looking for plans)
- Gaps where few competing events exist
- Seasonal activities that feel timely (outdoor in summer, cosy crafts in winter)
- Events that have worked well for Socialise before

Respond in JSON format:
{
  "suggestions": [
    {
      "date": "YYYY-MM-DD",
      "dateReason": "Why this date is optimal",
      "title": "Event Title",
      "description": "2-3 sentence description",
      "category": "Category",
      "venue_type": "e.g., outdoor park, cosy pub, studio space",
      "estimated_capacity": 30,
      "suggested_price": 15,
      "confidence": "high|medium|low"
    }
  ]
}`;
}
```

- [ ] **Step 3: Update POST /prompt to read from market_events**

In `src/routes/generator.ts`, update the `/prompt` handler (lines 40-55):

```typescript
  router.post('/prompt', async (req, res) => {
    try {
      // Read market data from market_events table (no longer from request body)
      const marketData = analyzer.getMarketData();
      const pastEvents = eventStore.getAll();
      const prompt = composeClaudePrompt(marketData, pastEvents);
      res.json({ prompt });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 4: Update POST /analyze to trigger public scraping**

In `src/routes/generator.ts`, update the `/analyze` handler (lines 26-33):

```typescript
  router.post('/analyze', async (req, res) => {
    try {
      const marketData = analyzer.getMarketData();
      // If market data is stale or empty, return what we have
      // (actual scraping happens via automation bridge — triggered separately)
      res.json({ events: marketData });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 5: Update EventGeneratorPage.tsx**

In `client/src/pages/EventGeneratorPage.tsx`, update `handleGeneratePrompt` (lines 45-64) to not send marketData in body:

```typescript
  const handleGeneratePrompt = async () => {
    try {
      const res = await fetch(`${BASE}/generator/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // No longer sending marketData
      });
      const data = await res.json();
      if (data.prompt) {
        setPrompt(data.prompt);
        setShowPromptModal(true);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate prompt');
    }
  };
```

- [ ] **Step 6: Commit**

```bash
git add src/routes/generator.ts src/app.ts client/src/pages/EventGeneratorPage.tsx
git commit -m "feat: rewrite generator prompt for external market analysis with calendar context"
```

---

## Chunk 3: WS3 (Analytics Tab)

### Task 10: Add analytics data columns to platform_events

**Files:**
- Modify: `src/data/database.ts`
- Modify: `src/data/platform-event-store.ts:5-18,40-104`

- [ ] **Step 1: Add migration 3 for analytics columns**

In `src/data/database.ts`, in `runMigrations()`:

```typescript
  if (currentVersion < 3) {
    const alterCols = [
      'ALTER TABLE platform_events ADD COLUMN attendance INTEGER',
      'ALTER TABLE platform_events ADD COLUMN capacity INTEGER',
      'ALTER TABLE platform_events ADD COLUMN revenue REAL',
      'ALTER TABLE platform_events ADD COLUMN ticket_price REAL',
    ];
    for (const sql of alterCols) {
      try { db.exec(sql); } catch { /* column exists */ }
    }
    db.pragma('user_version = 3');
  }
```

- [ ] **Step 2: Update PlatformEventRow and upsert in platform-event-store.ts**

In `src/data/platform-event-store.ts`, add to `PlatformEventRow` interface (line 5-18):
```typescript
  attendance: number | null;
  capacity: number | null;
  revenue: number | null;
  ticket_price: number | null;
```

Update `rowToEvent()` (line 20-35) to include new fields. Add to the returned `PlatformEvent`:
```typescript
  attendance: row.attendance ?? undefined,
  capacity: row.capacity ?? undefined,
  revenue: row.revenue ?? undefined,
  ticketPrice: row.ticket_price ?? undefined,
```

Update the `upsert()` method to accept and store these fields in the INSERT/UPDATE SQL.

- [ ] **Step 3: Add analytics fields to PlatformEvent type**

In `src/shared/types.ts`, add to `PlatformEvent` interface (line 126-139):
```typescript
  attendance?: number;
  capacity?: number;
  revenue?: number;
  ticketPrice?: number;
```

- [ ] **Step 4: Run existing tests**

Run: `npx vitest run src/data/__tests__/database.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/database.ts src/data/platform-event-store.ts src/shared/types.ts
git commit -m "feat: add attendance, capacity, revenue columns to platform_events"
```

---

### Task 11: Extend Meetup and Eventbrite scrapers for analytics data

**Files:**
- Modify: `src/automation/meetup.ts` (meetupScrapeSteps)
- Modify: `src/automation/eventbrite.ts` (eventbriteScrapeSteps)

- [ ] **Step 1: Update meetupScrapeSteps GraphQL query**

In `src/automation/meetup.ts`, in the `meetupScrapeSteps` function's GraphQL query (around line 207), add `going` and `maxTickets` fields to the node selection:

```graphql
node {
  id
  title
  dateTime
  eventUrl
  venue { name }
  going
  maxTickets
  status
}
```

Update the result mapping to include:
```javascript
attendance: node.going || 0,
capacity: node.maxTickets || 0,
```

- [ ] **Step 2: Update eventbriteScrapeSteps API call**

In `src/automation/eventbrite.ts`, in the `eventbriteScrapeSteps` function's evaluate block, the API already returns event objects. After fetching events, also fetch ticket info for each event:

Add to the result mapping:
```javascript
attendance: e.summary?.attendees_count || 0,
capacity: e.capacity || 0,
revenue: e.summary?.gross_revenue?.value || 0,
ticket_price: e.ticket_classes?.[0]?.cost?.value || 0,
```

- [ ] **Step 3: Update sync.ts to pass analytics data through to platformEventStore.upsert**

In `src/routes/sync.ts`, in the pull handler, when calling `platformEventStore.upsert()`, include the new fields from the scraped data:

```typescript
platformEventStore.upsert({
  // ... existing fields ...
  attendance: pe.attendance,
  capacity: pe.capacity,
  revenue: pe.revenue,
  ticketPrice: pe.ticket_price,
});
```

- [ ] **Step 4: Commit**

```bash
git add src/automation/meetup.ts src/automation/eventbrite.ts src/routes/sync.ts
git commit -m "feat: extend scrapers to capture attendance, capacity, and revenue data"
```

---

### Task 12: Create analytics API routes

**Files:**
- Create: `src/routes/analytics.ts`
- Modify: `src/app.ts:76-83`

- [ ] **Step 1: Create analytics route file**

```typescript
// src/routes/analytics.ts
import { Router } from 'express';
import type { Database } from '../data/database';

export function createAnalyticsRouter(db: Database): Router {
  const router = Router();

  // GET /summary — aggregate stats
  router.get('/summary', (req, res) => {
    try {
      const stats = db.prepare(`
        SELECT
          COUNT(DISTINCT e.id) as total_events,
          COALESCE(SUM(pe.attendance), 0) as total_attendees,
          COALESCE(SUM(pe.revenue), 0) as total_revenue,
          CASE
            WHEN SUM(pe.capacity) > 0
            THEN ROUND(CAST(SUM(pe.attendance) AS REAL) / SUM(pe.capacity) * 100, 1)
            ELSE 0
          END as avg_fill_rate
        FROM events e
        LEFT JOIN platform_events pe ON pe.event_id = e.id
        WHERE e.sync_status != 'local_only' OR pe.id IS NOT NULL
      `).get() as any;

      res.json({
        totalEvents: stats.total_events,
        totalAttendees: stats.total_attendees,
        totalRevenue: stats.total_revenue,
        avgFillRate: stats.avg_fill_rate,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /trends — time-series data for charts
  router.get('/trends', (req, res) => {
    try {
      const { startDate, endDate, eventType } = req.query;

      let whereClause = 'WHERE 1=1';
      const params: any[] = [];

      if (startDate) {
        whereClause += ' AND e.start_time >= ?';
        params.push(startDate);
      }
      if (endDate) {
        whereClause += ' AND e.start_time <= ?';
        params.push(endDate);
      }

      // Attendance over time (monthly)
      const attendanceByMonth = db.prepare(`
        SELECT
          strftime('%Y-%m', e.start_time) as month,
          SUM(pe.attendance) as attendance,
          SUM(pe.capacity) as capacity
        FROM events e
        LEFT JOIN platform_events pe ON pe.event_id = e.id
        ${whereClause}
        GROUP BY month
        ORDER BY month ASC
      `).all(...params) as any[];

      // Revenue over time (monthly)
      const revenueByMonth = db.prepare(`
        SELECT
          strftime('%Y-%m', e.start_time) as month,
          SUM(pe.revenue) as revenue
        FROM events e
        LEFT JOIN platform_events pe ON pe.event_id = e.id
        ${whereClause}
        GROUP BY month
        ORDER BY month ASC
      `).all(...params) as any[];

      // Fill rate by event type/category
      const fillByType = db.prepare(`
        SELECT
          COALESCE(e.venue, 'Unknown') as category,
          AVG(CASE WHEN pe.capacity > 0
            THEN CAST(pe.attendance AS REAL) / pe.capacity * 100
            ELSE 0
          END) as avg_fill_rate,
          COUNT(*) as event_count
        FROM events e
        LEFT JOIN platform_events pe ON pe.event_id = e.id
        ${whereClause} AND pe.attendance IS NOT NULL
        GROUP BY category
        ORDER BY avg_fill_rate DESC
      `).all(...params) as any[];

      // Best performing days/times (heatmap)
      const timingData = db.prepare(`
        SELECT
          CAST(strftime('%w', e.start_time) AS INTEGER) as day_of_week,
          CAST(strftime('%H', e.start_time) AS INTEGER) as hour,
          AVG(pe.attendance) as avg_attendance,
          COUNT(*) as event_count
        FROM events e
        LEFT JOIN platform_events pe ON pe.event_id = e.id
        ${whereClause} AND pe.attendance IS NOT NULL
        GROUP BY day_of_week, hour
      `).all(...params) as any[];

      res.json({
        attendanceByMonth,
        revenueByMonth,
        fillByType,
        timingData,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /insights — compose AI analysis prompt
  router.post('/insights', (req, res) => {
    try {
      const summary = db.prepare(`
        SELECT
          e.title,
          e.start_time,
          e.venue,
          e.price,
          pe.attendance,
          pe.capacity,
          pe.revenue
        FROM events e
        LEFT JOIN platform_events pe ON pe.event_id = e.id
        WHERE pe.attendance IS NOT NULL
        ORDER BY e.start_time DESC
        LIMIT 50
      `).all() as any[];

      const eventLines = summary.map((e: any) =>
        `- ${e.title} | ${e.start_time} | ${e.venue} | £${e.price} | ${e.attendance}/${e.capacity} attendees | £${e.revenue || 0} revenue`
      ).join('\n');

      const prompt = `You are analysing event performance data for Socialise, a Bristol events company.

## Event Performance Data
${eventLines || 'No performance data available yet.'}

## Your Task
Analyse the data and provide actionable insights:

1. **Top performers** — Which events had the highest fill rates and why?
2. **Underperformers** — Which events struggled and what could explain it?
3. **Timing patterns** — Are certain days/times consistently better?
4. **Pricing insights** — Is there a sweet spot for pricing?
5. **Recommendations** — 3 specific, actionable suggestions for future events

Be specific and reference actual events from the data. Focus on patterns, not individual outliers.`;

      res.json({ prompt });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
```

- [ ] **Step 2: Register analytics routes in app.ts**

In `src/app.ts`, add import and register before the catch-all 404 (line 85):

```typescript
import { createAnalyticsRouter } from './routes/analytics';
// ... after other route registrations (line 83):
app.use('/api/analytics', createAnalyticsRouter(db));
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/analytics.ts src/app.ts
git commit -m "feat: add analytics API routes for summary, trends, and insights"
```

---

### Task 13: Create Analytics page and components

**Files:**
- Create: `client/src/pages/AnalyticsPage.tsx`
- Create: `client/src/components/analytics/SummaryCards.tsx`
- Create: `client/src/components/analytics/AttendanceChart.tsx`
- Create: `client/src/components/analytics/RevenueChart.tsx`
- Create: `client/src/components/analytics/EventTypeChart.tsx`
- Create: `client/src/components/analytics/TimingHeatmap.tsx`
- Create: `client/src/components/analytics/InsightsPanel.tsx`
- Modify: `client/src/App.tsx:1-16,33-45,225-237`
- Modify: `client/src/api/events.ts`

- [ ] **Step 1: Install recharts**

Run: `npm install recharts`

- [ ] **Step 2: Add analytics API client functions**

In `client/src/api/events.ts`, add:

```typescript
export async function getAnalyticsSummary(): Promise<{
  totalEvents: number;
  totalAttendees: number;
  totalRevenue: number;
  avgFillRate: number;
}> {
  const res = await fetch(`${BASE}/analytics/summary`);
  return json(res);
}

export async function getAnalyticsTrends(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<any> {
  const query = new URLSearchParams();
  if (params?.startDate) query.set('startDate', params.startDate);
  if (params?.endDate) query.set('endDate', params.endDate);
  const res = await fetch(`${BASE}/analytics/trends?${query}`);
  return json(res);
}

export async function getAnalyticsInsights(): Promise<{ prompt: string }> {
  const res = await fetch(`${BASE}/analytics/insights`, { method: 'POST' });
  return json(res);
}
```

- [ ] **Step 3: Create SummaryCards component**

```typescript
// client/src/components/analytics/SummaryCards.tsx
import { CSSProperties } from 'react';

interface Props {
  totalEvents: number;
  totalAttendees: number;
  totalRevenue: number;
  avgFillRate: number;
}

export function SummaryCards({ totalEvents, totalAttendees, totalRevenue, avgFillRate }: Props) {
  const cards = [
    { label: 'Total Events', value: totalEvents, color: '#3b82f6' },
    { label: 'Total Attendees', value: totalAttendees.toLocaleString(), color: '#10b981' },
    { label: 'Total Revenue', value: `£${totalRevenue.toLocaleString()}`, color: '#f59e0b' },
    { label: 'Avg Fill Rate', value: `${avgFillRate}%`, color: '#8b5cf6' },
  ];

  return (
    <div style={styles.grid}>
      {cards.map(card => (
        <div key={card.label} style={{ ...styles.card, borderTop: `3px solid ${card.color}` }}>
          <div style={styles.label}>{card.label}</div>
          <div style={styles.value}>{card.value}</div>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' },
  card: { background: '#1e1e2e', borderRadius: '8px', padding: '16px' },
  label: { fontSize: '12px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' },
  value: { fontSize: '24px', fontWeight: 'bold', color: '#fff' },
};
```

- [ ] **Step 4: Create chart components**

```typescript
// client/src/components/analytics/AttendanceChart.tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Props {
  data: Array<{ month: string; attendance: number; capacity: number }>;
}

export function AttendanceChart({ data }: Props) {
  return (
    <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
      <h3 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '14px' }}>Attendance Over Time</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="month" stroke="#888" fontSize={12} />
          <YAxis stroke="#888" fontSize={12} />
          <Tooltip contentStyle={{ background: '#2a2a3e', border: 'none', color: '#fff' }} />
          <Line type="monotone" dataKey="attendance" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
          <Line type="monotone" dataKey="capacity" stroke="#555" strokeWidth={1} strokeDasharray="5 5" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

```typescript
// client/src/components/analytics/RevenueChart.tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Props {
  data: Array<{ month: string; revenue: number }>;
}

export function RevenueChart({ data }: Props) {
  return (
    <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
      <h3 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '14px' }}>Revenue Over Time</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="month" stroke="#888" fontSize={12} />
          <YAxis stroke="#888" fontSize={12} tickFormatter={v => `£${v}`} />
          <Tooltip contentStyle={{ background: '#2a2a3e', border: 'none', color: '#fff' }} formatter={(v: number) => `£${v}`} />
          <Bar dataKey="revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

```typescript
// client/src/components/analytics/EventTypeChart.tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Props {
  data: Array<{ category: string; avg_fill_rate: number; event_count: number }>;
}

export function EventTypeChart({ data }: Props) {
  return (
    <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
      <h3 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '14px' }}>Fill Rate by Event Type</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis type="number" stroke="#888" fontSize={12} tickFormatter={v => `${v}%`} />
          <YAxis type="category" dataKey="category" stroke="#888" fontSize={12} width={120} />
          <Tooltip contentStyle={{ background: '#2a2a3e', border: 'none', color: '#fff' }} formatter={(v: number) => `${v.toFixed(1)}%`} />
          <Bar dataKey="avg_fill_rate" fill="#10b981" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

```typescript
// client/src/components/analytics/TimingHeatmap.tsx
import { CSSProperties } from 'react';

interface Props {
  data: Array<{ day_of_week: number; hour: number; avg_attendance: number; event_count: number }>;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function TimingHeatmap({ data }: Props) {
  const maxAttendance = Math.max(...data.map(d => d.avg_attendance), 1);

  const getCell = (day: number, hour: number) => {
    const entry = data.find(d => d.day_of_week === day && d.hour === hour);
    if (!entry) return { opacity: 0, count: 0, avg: 0 };
    return {
      opacity: entry.avg_attendance / maxAttendance,
      count: entry.event_count,
      avg: Math.round(entry.avg_attendance),
    };
  };

  return (
    <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
      <h3 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '14px' }}>Best Performing Days & Times</h3>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(${HOURS.length}, 1fr)`, gap: '2px' }}>
          <div />
          {HOURS.filter(h => h >= 8 && h <= 22).map(h => (
            <div key={h} style={{ color: '#888', fontSize: '10px', textAlign: 'center' }}>
              {h}:00
            </div>
          ))}
          {DAYS.map((day, dayIdx) => (
            <>
              <div key={`label-${dayIdx}`} style={{ color: '#888', fontSize: '12px', display: 'flex', alignItems: 'center' }}>
                {day}
              </div>
              {HOURS.filter(h => h >= 8 && h <= 22).map(h => {
                const cell = getCell(dayIdx, h);
                return (
                  <div
                    key={`${dayIdx}-${h}`}
                    title={cell.count > 0 ? `${cell.avg} avg attendance (${cell.count} events)` : 'No data'}
                    style={{
                      background: cell.count > 0 ? `rgba(59, 130, 246, ${0.2 + cell.opacity * 0.8})` : '#2a2a3e',
                      borderRadius: '2px',
                      height: '24px',
                    }}
                  />
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}
```

```typescript
// client/src/components/analytics/InsightsPanel.tsx
import { useState, CSSProperties } from 'react';
import { getAnalyticsInsights } from '../../api/events';

declare global {
  interface Window {
    electronAPI?: {
      sendPromptToClaude?: (prompt: string) => Promise<string>;
      focusClaudePanel?: () => void;
    };
  }
}

export function InsightsPanel() {
  const [insights, setInsights] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const { prompt } = await getAnalyticsInsights();
      if (window.electronAPI?.sendPromptToClaude) {
        const response = await window.electronAPI.sendPromptToClaude(prompt);
        setInsights(response);
      } else {
        // Fallback: copy prompt for manual use
        await navigator.clipboard.writeText(prompt);
        setInsights('Prompt copied to clipboard — paste it into Claude for analysis.');
      }
    } catch (err: any) {
      setInsights(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>AI Insights</h3>
        <button onClick={handleAnalyze} disabled={loading} style={styles.button}>
          {loading ? 'Analysing...' : insights ? 'Refresh' : 'Analyse Performance'}
        </button>
      </div>
      {insights && (
        <div style={styles.content}>
          <pre style={styles.pre}>{insights}</pre>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: { background: '#1e1e2e', borderRadius: '8px', padding: '16px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  title: { color: '#fff', margin: 0, fontSize: '14px' },
  button: {
    padding: '6px 12px', fontSize: '12px', background: '#8b5cf6', color: 'white',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
  },
  content: { background: '#2a2a3e', borderRadius: '6px', padding: '12px' },
  pre: { color: '#ccc', fontSize: '13px', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' },
};
```

- [ ] **Step 5: Create AnalyticsPage**

```typescript
// client/src/pages/AnalyticsPage.tsx
import { useState, useEffect, CSSProperties } from 'react';
import { getAnalyticsSummary, getAnalyticsTrends } from '../api/events';
import { SummaryCards } from '../components/analytics/SummaryCards';
import { AttendanceChart } from '../components/analytics/AttendanceChart';
import { RevenueChart } from '../components/analytics/RevenueChart';
import { EventTypeChart } from '../components/analytics/EventTypeChart';
import { TimingHeatmap } from '../components/analytics/TimingHeatmap';
import { InsightsPanel } from '../components/analytics/InsightsPanel';

export function AnalyticsPage() {
  const [summary, setSummary] = useState({ totalEvents: 0, totalAttendees: 0, totalRevenue: 0, avgFillRate: 0 });
  const [trends, setTrends] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, t] = await Promise.all([getAnalyticsSummary(), getAnalyticsTrends()]);
        setSummary(s);
        setTrends(t);
      } catch (err) {
        console.error('Failed to load analytics:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <div style={styles.page}><p style={{ color: '#888' }}>Loading analytics...</p></div>;
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Analytics</h1>

      <SummaryCards {...summary} />

      <div style={styles.chartGrid}>
        <AttendanceChart data={trends.attendanceByMonth || []} />
        <RevenueChart data={trends.revenueByMonth || []} />
      </div>

      <div style={styles.chartGrid}>
        <EventTypeChart data={trends.fillByType || []} />
        <TimingHeatmap data={trends.timingData || []} />
      </div>

      <InsightsPanel />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { padding: '24px', maxWidth: '1200px' },
  heading: { color: '#fff', fontSize: '20px', marginBottom: '20px' },
  chartGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
};
```

- [ ] **Step 6: Add Analytics route and sidebar entry in App.tsx**

In `client/src/App.tsx`:

Add import (line 1-16):
```typescript
import { AnalyticsPage } from './pages/AnalyticsPage';
```

Add to `primaryNav` array (line 33-39), after Calendar:
```typescript
{ name: 'Analytics', path: '/analytics', icon: '📊' },
```

Add route (line 225-237), after the calendar route:
```typescript
<Route path="/analytics" element={<AnalyticsPage />} />
```

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/AnalyticsPage.tsx client/src/components/analytics/ client/src/App.tsx client/src/api/events.ts src/routes/analytics.ts src/app.ts
git commit -m "feat: add Analytics tab with summary cards, charts, and AI insights"
```

---

## Chunk 4: WS4 (Optimize Button)

### Task 14: Add event_snapshots and event_photos tables

**Files:**
- Modify: `src/data/database.ts`

- [ ] **Step 1: Add migration 4 for optimize tables**

In `src/data/database.ts`, in `runMigrations()`:

```typescript
  if (currentVersion < 4) {
    db.exec(`CREATE TABLE IF NOT EXISTS event_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS event_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      photo_path TEXT NOT NULL,
      source TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      is_cover INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (event_id) REFERENCES events(id)
    )`);
    db.pragma('user_version = 4');
  }
```

- [ ] **Step 2: Run migration test**

Run: `npx vitest run src/data/__tests__/database.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/data/database.ts
git commit -m "feat: add event_snapshots and event_photos tables"
```

---

### Task 15: Create optimize API routes

**Files:**
- Create: `src/routes/optimize.ts`
- Create: `src/routes/photos.ts`
- Modify: `src/app.ts`
- Modify: `src/routes/generator.ts` (remove old composeOptimizePrompt)

- [ ] **Step 1: Create optimize route**

```typescript
// src/routes/optimize.ts
import { Router } from 'express';
import type { Database } from '../data/database';
import { SqliteEventStore } from '../data/sqlite-event-store';

export function createOptimizeRouter(db: Database, eventStore: SqliteEventStore): Router {
  const router = Router();

  // POST /api/events/:id/optimize — text optimization
  router.post('/:id/optimize', async (req, res) => {
    try {
      const event = eventStore.getById(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      // Save snapshot (upsert — one per event)
      db.prepare(`
        INSERT INTO event_snapshots (event_id, snapshot_json, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
          snapshot_json = excluded.snapshot_json,
          created_at = excluded.created_at
      `).run(event.id, JSON.stringify(event), new Date().toISOString());

      // Compose optimization prompt
      const prompt = `You are an SEO and event marketing expert. Optimize this event listing for maximum visibility, discoverability, and ticket sales.,

## Current Event
- Title: ${event.title}
- Description: ${event.description}
- Venue: ${event.venue}
- Price: £${event.price}
- Date: ${event.start_time}

## Your Task
1. Rewrite the **title** for SEO — include searchable keywords, make it compelling
2. Rewrite the **description** for engagement — hook in first line, clear value prop, social proof language, call to action
3. Consider platform-specific best practices (Meetup SEO, Eventbrite search ranking)

Respond in JSON format:
{
  "title": "Optimized title",
  "description": "Optimized description"
}`;

      res.json({ prompt, eventId: event.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/events/:id/optimize/undo — restore from snapshot
  router.post('/:id/optimize/undo', (req, res) => {
    try {
      const snapshot = db.prepare(
        'SELECT snapshot_json FROM event_snapshots WHERE event_id = ?'
      ).get(req.params.id) as { snapshot_json: string } | undefined;

      if (!snapshot) return res.status(404).json({ error: 'No snapshot found' });

      const original = JSON.parse(snapshot.snapshot_json);
      eventStore.update(req.params.id, {
        title: original.title,
        description: original.description,
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/events/:id/optimize/photos/generate-prompt
  router.post('/:id/optimize/photos/generate-prompt', (req, res) => {
    try {
      const event = eventStore.getById(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      const prompt = `Create a vibrant, eye-catching promotional image for this event:

Event: ${event.title}
Description: ${event.description}
Venue: ${event.venue}
Date: ${event.start_time}

Style: Professional event promotion, warm and inviting, showing people enjoying the activity.
Aspect ratio: 16:9 for a hero/banner image.
Do not include any text in the image.`;

      res.json({ prompt });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
```

- [ ] **Step 2: Create photos route**

```typescript
// src/routes/photos.ts
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import type { Database } from '../data/database';

const DATA_DIR = path.join(process.cwd(), 'data');

export function createPhotosRouter(db: Database): Router {
  const router = Router();

  // Ensure photos directory exists
  const ensureDir = (eventId: string) => {
    const dir = path.join(DATA_DIR, 'photos', eventId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        cb(null, ensureDir(req.params.id));
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}${ext}`);
      },
    }),
    fileFilter: (_req, file, cb) => {
      const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
      cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
    },
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  });

  // GET /api/events/:id/photos
  router.get('/:id/photos', (req, res) => {
    try {
      const photos = db.prepare(
        'SELECT * FROM event_photos WHERE event_id = ? ORDER BY position ASC'
      ).all(req.params.id);
      res.json(photos);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/events/:id/photos — upload photo
  router.post('/:id/photos', upload.single('photo'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const relativePath = `photos/${req.params.id}/${req.file.filename}`;
      const source = (req.body.source as string) || 'upload';

      // Get max position
      const maxPos = db.prepare(
        'SELECT COALESCE(MAX(position), -1) as max_pos FROM event_photos WHERE event_id = ?'
      ).get(req.params.id) as { max_pos: number };

      const result = db.prepare(`
        INSERT INTO event_photos (event_id, photo_path, source, position, is_cover)
        VALUES (?, ?, ?, ?, ?)
      `).run(req.params.id, relativePath, source, maxPos.max_pos + 1, 0);

      res.json({
        id: result.lastInsertRowid,
        event_id: req.params.id,
        photo_path: relativePath,
        source,
        position: maxPos.max_pos + 1,
        is_cover: 0,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/events/:id/photos/reorder
  router.patch('/:id/photos/reorder', (req, res) => {
    try {
      const { order } = req.body; // Array of photo IDs in new order
      if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });

      const stmt = db.prepare('UPDATE event_photos SET position = ? WHERE id = ? AND event_id = ?');
      const update = db.transaction(() => {
        order.forEach((photoId: number, idx: number) => {
          stmt.run(idx, photoId, req.params.id);
        });
      });
      update();

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/events/:id/photos/:photoId
  router.delete('/:id/photos/:photoId', (req, res) => {
    try {
      const photo = db.prepare(
        'SELECT photo_path FROM event_photos WHERE id = ? AND event_id = ?'
      ).get(req.params.photoId, req.params.id) as { photo_path: string } | undefined;

      if (!photo) return res.status(404).json({ error: 'Photo not found' });

      // Delete file
      const filePath = path.join(DATA_DIR, photo.photo_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      // Delete DB record
      db.prepare('DELETE FROM event_photos WHERE id = ?').run(req.params.photoId);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
```

- [ ] **Step 3: Register routes in app.ts and serve photos statically**

In `src/app.ts`:

```typescript
import { createOptimizeRouter } from './routes/optimize';
import { createPhotosRouter } from './routes/photos';
import path from 'path';

// After other route registrations, before 404 catch-all:
app.use('/api/events', createOptimizeRouter(db, eventStore));
app.use('/api/events', createPhotosRouter(db));

// Serve photos as static files
app.use('/data', express.static(path.join(process.cwd(), 'data')));
```

- [ ] **Step 4: Remove old composeOptimizePrompt from generator.ts**

In `src/routes/generator.ts`, remove:
- The `POST /optimize/:id` route handler (lines 96-116)
- The `composeOptimizePrompt` function (lines 195-302)
- The `SimilarEvent` interface (lines 188-193)

- [ ] **Step 5: Commit**

```bash
git add src/routes/optimize.ts src/routes/photos.ts src/app.ts src/routes/generator.ts src/data/database.ts
git commit -m "feat: add optimize and photos API routes, remove old optimize prompt"
```

---

### Task 16: Add optimize API client functions and update EventCard/EventDetailPage

**Files:**
- Modify: `client/src/api/events.ts`
- Modify: `client/src/components/EventCard.tsx`
- Modify: `client/src/pages/EventDetailPage.tsx`

- [ ] **Step 1: Add optimize API functions to events.ts**

```typescript
export async function optimizeEvent(id: string): Promise<{ prompt: string; eventId: string }> {
  const res = await fetch(`${BASE}/events/${id}/optimize`, { method: 'POST' });
  return json(res);
}

export async function undoOptimize(id: string): Promise<void> {
  const res = await fetch(`${BASE}/events/${id}/optimize/undo`, { method: 'POST' });
  if (!res.ok) throw new Error('Undo failed');
}

export async function getPhotoGenPrompt(id: string): Promise<{ prompt: string }> {
  const res = await fetch(`${BASE}/events/${id}/optimize/photos/generate-prompt`, { method: 'POST' });
  return json(res);
}

export async function getEventPhotos(id: string): Promise<any[]> {
  const res = await fetch(`${BASE}/events/${id}/photos`);
  return json(res);
}

export async function uploadEventPhoto(id: string, file: File, source: string): Promise<any> {
  const form = new FormData();
  form.append('photo', file);
  form.append('source', source);
  const res = await fetch(`${BASE}/events/${id}/photos`, { method: 'POST', body: form });
  return json(res);
}

export async function reorderPhotos(id: string, order: number[]): Promise<void> {
  await fetch(`${BASE}/events/${id}/photos/reorder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  });
}

export async function deletePhoto(id: string, photoId: number): Promise<void> {
  await fetch(`${BASE}/events/${id}/photos/${photoId}`, { method: 'DELETE' });
}
```

- [ ] **Step 2: Add wand icon to EventCard**

In `client/src/components/EventCard.tsx`, add an optimize prop and wand button:

Update props:
```typescript
  onOptimize?: (id: string) => void;
```

Add wand button in the header area, after the title:
```typescript
{onOptimize && (
  <button
    style={styles.wandButton}
    onClick={(e) => { e.stopPropagation(); onOptimize(event.id); }}
    title="Optimize with AI"
  >
    ✦
  </button>
)}
```

Add style:
```typescript
wandButton: {
  background: 'none', border: 'none', color: '#a855f7', cursor: 'pointer',
  fontSize: '16px', padding: '2px 4px', marginLeft: 'auto',
} as React.CSSProperties,
```

- [ ] **Step 3: Replace optimize modal in EventDetailPage**

In `client/src/pages/EventDetailPage.tsx`:

Replace the existing `handleOptimize` (lines 191-211) and optimize modal (lines 569-624) with the new flow:

```typescript
// Replace handleOptimize:
const handleOptimize = async () => {
  if (!id) return;
  setOptimizing(true);
  try {
    const { prompt } = await optimizeEvent(id);
    setOptimizePrompt(prompt);
    setShowOptimizeModal(true);
  } catch (err: any) {
    setError(err.message);
  } finally {
    setOptimizing(false);
  }
};
```

Import `optimizeEvent` and `undoOptimize` from `../api/events`.

The rest of the modal flow (send to Claude, apply changes) stays the same — it already handles the prompt → Claude → parse JSON → apply pattern.

- [ ] **Step 4: Wire optimize handler in EventsPage**

In `client/src/pages/EventsPage.tsx`:

```typescript
const handleOptimize = (id: string) => {
  navigate(`/events/${id}?optimize=true`);
};

// In EventCard render:
<EventCard ... onOptimize={handleOptimize} />
```

In `EventDetailPage.tsx`, check for `?optimize=true` query param and auto-trigger:
```typescript
const [searchParams] = useSearchParams();
useEffect(() => {
  if (searchParams.get('optimize') === 'true' && id && !isNew) {
    handleOptimize();
  }
}, [id]);
```

- [ ] **Step 5: Commit**

```bash
git add client/src/api/events.ts client/src/components/EventCard.tsx client/src/pages/EventDetailPage.tsx client/src/pages/EventsPage.tsx
git commit -m "feat: add optimize wand button to EventCard and replace old optimize modal"
```

---

### Task 17: Install new dependencies and update build tooling

**IMPORTANT:** Run this task BEFORE Tasks 14-16 to ensure imports resolve.

**Files:**
- Modify: `package.json`
- Modify: `SocialiseHub.bat:40-52`

- [ ] **Step 1: Install dependencies**

Run: `npm install recharts multer sharp`
Run: `npm install -D @types/multer`

- [ ] **Step 2: Update SocialiseHub.bat for Sharp rebuild**

In `SocialiseHub.bat`, update the rebuild command (around line 50) to include sharp:

```batch
npx @electron/rebuild -f -w better-sqlite3 -w sharp
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json SocialiseHub.bat
git commit -m "chore: add recharts, multer, sharp dependencies and update rebuild script"
```

---

### Task 18: Wire automation bridge for market analyze endpoint

**Files:**
- Modify: `src/routes/generator.ts` (POST /analyze)
- Modify: `src/agents/market-analyzer.ts`

The analyze endpoint must trigger public scraping via the automation bridge. The bridge is an HTTP endpoint on localhost:39847 that forwards commands to Electron's automation engine.

- [ ] **Step 1: Add bridge-based analyze method to MarketAnalyzer**

In `src/agents/market-analyzer.ts`, add:

```typescript
import { AutomationBridgeClient } from '../automation/bridge';

// In MarketAnalyzer class:
async analyzeExternal(bridgeClient?: AutomationBridgeClient): Promise<ScrapedEvent[]> {
  if (!bridgeClient) {
    // No bridge available (web-only mode) — return cached data
    return this.getMarketData();
  }

  const platforms = [
    { name: 'meetup' as PlatformName, action: 'public-scrape' },
    { name: 'eventbrite' as PlatformName, action: 'public-scrape' },
    { name: 'headfirst' as PlatformName, action: 'public-scrape' },
  ];

  for (const { name, action } of platforms) {
    try {
      const result = await bridgeClient.execute(name, action, {
        sessionPartition: 'persist:public-scrape'
      });
      if (result?.events) {
        this.storeResults(name, result.events);
      }
    } catch (err) {
      console.error(`Failed to scrape public ${name} events:`, err);
      // Continue with other platforms
    }
  }

  return this.getMarketData();
}
```

- [ ] **Step 2: Update POST /analyze to call analyzeExternal**

In `src/routes/generator.ts`, update the `/analyze` handler:

```typescript
router.post('/analyze', async (req, res) => {
  try {
    // Trigger public scraping via automation bridge
    const marketData = await analyzer.analyzeExternal();
    res.json({ events: marketData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Register public-scrape action in automation bridge handler**

In `src/automation/bridge.ts`, add handling for the `public-scrape` action that uses the public scraper steps (`meetupPublicScrapeSteps`, etc.) with the `persist:public-scrape` session partition.

Note: The exact bridge integration depends on the existing bridge handler structure. The implementer should read `src/automation/bridge.ts` to understand the action dispatch pattern and add `public-scrape` alongside existing actions like `scrape` and `connect`.

- [ ] **Step 4: Commit**

```bash
git add src/agents/market-analyzer.ts src/routes/generator.ts src/automation/bridge.ts
git commit -m "feat: wire automation bridge for public market scraping in analyze endpoint"
```

---

### Task 19: Add missing photo source routes (Unsplash search, local folder scan, auto-enhance)

**Files:**
- Modify: `src/routes/optimize.ts`
- Modify: `src/routes/photos.ts`

- [ ] **Step 1: Add Unsplash search route to optimize.ts**

```typescript
// POST /api/events/:id/optimize/photos/search
router.post('/:id/optimize/photos/search', async (req, res) => {
  try {
    const event = eventStore.getById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const query = req.body.query || `${event.title} ${event.venue}`;
    const apiKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!apiKey) return res.status(500).json({ error: 'UNSPLASH_ACCESS_KEY not set' });

    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`;
    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${apiKey}` },
    });
    const data = await response.json() as any;

    const results = (data.results || []).map((photo: any) => ({
      id: photo.id,
      url: photo.urls.regular,
      thumbUrl: photo.urls.small,
      alt: photo.alt_description || '',
      photographer: photo.user.name,
      downloadUrl: photo.links.download_location,
    }));

    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Add local folder scan route to optimize.ts**

```typescript
import fs from 'fs';
import path from 'path';

// POST /api/events/:id/optimize/photos/local
router.post('/:id/optimize/photos/local', (req, res) => {
  try {
    const { folderPath } = req.body;
    if (!folderPath || !fs.existsSync(folderPath)) {
      return res.status(400).json({ error: 'Invalid folder path' });
    }

    const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const files = fs.readdirSync(folderPath)
      .filter(f => imageExts.includes(path.extname(f).toLowerCase()))
      .map(f => ({
        name: f,
        path: path.join(folderPath, f),
        size: fs.statSync(path.join(folderPath, f)).size,
      }));

    res.json({ files });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Add auto-enhance route to photos.ts**

```typescript
import sharp from 'sharp';

// POST /api/events/:id/optimize/photos/enhance
router.post('/:id/photos/enhance', async (req, res) => {
  try {
    const { photoId, profile } = req.body;
    // profile: 'meetup' (1200x675) | 'eventbrite' (2160x1080)

    const photo = db.prepare(
      'SELECT * FROM event_photos WHERE id = ? AND event_id = ?'
    ).get(photoId, req.params.id) as any;
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const filePath = path.join(DATA_DIR, photo.photo_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    // Preserve original
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const dir = path.dirname(filePath);
    const originalPath = path.join(dir, `${baseName}_original${ext}`);
    if (!fs.existsSync(originalPath)) {
      fs.copyFileSync(filePath, originalPath);
    }

    // Platform-specific dimensions
    const profiles: Record<string, { width: number; height: number }> = {
      meetup: { width: 1200, height: 675 },
      eventbrite: { width: 2160, height: 1080 },
      default: { width: 1200, height: 675 },
    };
    const dims = profiles[profile || 'default'] || profiles.default;

    // Enhance: resize, sharpen, auto-level
    await sharp(filePath)
      .resize(dims.width, dims.height, { fit: 'cover' })
      .sharpen()
      .modulate({ brightness: 1.05, saturation: 1.1 })
      .toFile(filePath + '.tmp');

    // Replace original
    fs.renameSync(filePath + '.tmp', filePath);

    res.json({ success: true, enhanced: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/optimize.ts src/routes/photos.ts
git commit -m "feat: add Unsplash search, local folder scan, and auto-enhance photo routes"
```

---

### Task 20: Create OptimizePanel, PhotoGrid, and PhotoSearchModal components

**Files:**
- Create: `client/src/components/OptimizePanel.tsx`
- Create: `client/src/components/PhotoGrid.tsx`
- Create: `client/src/components/PhotoSearchModal.tsx`
- Modify: `client/src/pages/EventDetailPage.tsx`

- [ ] **Step 1: Create PhotoGrid component**

```typescript
// client/src/components/PhotoGrid.tsx
import { useState, CSSProperties } from 'react';
import { deletePhoto, reorderPhotos } from '../api/events';

interface Photo {
  id: number;
  event_id: string;
  photo_path: string;
  source: string;
  position: number;
  is_cover: number;
}

interface Props {
  eventId: string;
  photos: Photo[];
  onRefresh: () => void;
}

export function PhotoGrid({ eventId, photos, onRefresh }: Props) {
  const [dragging, setDragging] = useState<number | null>(null);

  const handleDelete = async (photoId: number) => {
    await deletePhoto(eventId, photoId);
    onRefresh();
  };

  const handleDragStart = (photoId: number) => setDragging(photoId);

  const handleDrop = async (targetIdx: number) => {
    if (dragging === null) return;
    const newOrder = photos.map(p => p.id);
    const dragIdx = newOrder.indexOf(dragging);
    newOrder.splice(dragIdx, 1);
    newOrder.splice(targetIdx, 0, dragging);
    await reorderPhotos(eventId, newOrder);
    setDragging(null);
    onRefresh();
  };

  return (
    <div style={styles.grid}>
      {photos.map((photo, idx) => (
        <div
          key={photo.id}
          style={styles.item}
          draggable
          onDragStart={() => handleDragStart(photo.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(idx)}
        >
          <img src={`/data/${photo.photo_path}`} alt="" style={styles.img} />
          <div style={styles.overlay}>
            <span style={styles.source}>{photo.source}</span>
            <button style={styles.deleteBtn} onClick={() => handleDelete(photo.id)}>×</button>
          </div>
          {photo.position === 0 && <span style={styles.coverBadge}>Cover</span>}
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' },
  item: { position: 'relative', borderRadius: '6px', overflow: 'hidden', cursor: 'grab', aspectRatio: '16/9' },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
  overlay: {
    position: 'absolute', top: 0, right: 0, display: 'flex', gap: '4px', padding: '4px',
  },
  source: {
    fontSize: '9px', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '2px 4px', borderRadius: '3px',
  },
  deleteBtn: {
    background: 'rgba(239,68,68,0.8)', color: '#fff', border: 'none', borderRadius: '3px',
    cursor: 'pointer', fontSize: '14px', width: '20px', height: '20px', lineHeight: '20px',
  },
  coverBadge: {
    position: 'absolute', bottom: '4px', left: '4px', fontSize: '9px',
    background: 'rgba(59,130,246,0.8)', color: '#fff', padding: '2px 6px', borderRadius: '3px',
  },
};
```

- [ ] **Step 2: Create PhotoSearchModal component**

```typescript
// client/src/components/PhotoSearchModal.tsx
import { useState, CSSProperties } from 'react';

interface SearchResult {
  id: string;
  url: string;
  thumbUrl: string;
  alt: string;
  photographer: string;
}

interface Props {
  eventId: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}

export function PhotoSearchModal({ eventId, onSelect, onClose }: Props) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/optimize/photos/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>Search Photos</h3>
        <div style={styles.searchRow}>
          <input
            style={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for images..."
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button style={styles.searchBtn} onClick={handleSearch} disabled={loading}>
            {loading ? '...' : 'Search'}
          </button>
        </div>
        <div style={styles.grid}>
          {results.map((r) => (
            <div key={r.id} style={styles.result} onClick={() => onSelect(r.url)}>
              <img src={r.thumbUrl} alt={r.alt} style={styles.resultImg} />
              <div style={styles.credit}>by {r.photographer}</div>
            </div>
          ))}
        </div>
        <button style={styles.closeBtn} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: { background: '#1e1e2e', borderRadius: '12px', padding: '24px', width: '700px', maxHeight: '80vh', overflow: 'auto' },
  title: { color: '#fff', margin: '0 0 16px 0' },
  searchRow: { display: 'flex', gap: '8px', marginBottom: '16px' },
  input: { flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #333', background: '#2a2a3e', color: '#fff' },
  searchBtn: { padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' },
  result: { cursor: 'pointer', borderRadius: '6px', overflow: 'hidden', border: '2px solid transparent' },
  resultImg: { width: '100%', aspectRatio: '16/9', objectFit: 'cover' },
  credit: { fontSize: '10px', color: '#888', padding: '4px' },
  closeBtn: { marginTop: '16px', padding: '8px 16px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' },
};
```

- [ ] **Step 3: Create OptimizePanel component**

```typescript
// client/src/components/OptimizePanel.tsx
import { useState, useEffect, CSSProperties } from 'react';
import { getEventPhotos, uploadEventPhoto, getPhotoGenPrompt } from '../api/events';
import { PhotoGrid } from './PhotoGrid';
import { PhotoSearchModal } from './PhotoSearchModal';

interface Props {
  eventId: string;
  onClose: () => void;
}

export function OptimizePanel({ eventId, onClose }: Props) {
  const [photos, setPhotos] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const loadPhotos = async () => {
    const data = await getEventPhotos(eventId);
    setPhotos(data);
  };

  useEffect(() => { loadPhotos(); }, [eventId]);

  const handleFileUpload = async (files: FileList) => {
    for (const file of Array.from(files)) {
      await uploadEventPhoto(eventId, file, 'upload');
    }
    loadPhotos();
  };

  const handleSearchSelect = async (url: string) => {
    // Download the URL and upload as a photo
    const response = await fetch(url);
    const blob = await response.blob();
    const file = new File([blob], `unsplash-${Date.now()}.jpg`, { type: blob.type });
    await uploadEventPhoto(eventId, file, 'web');
    setShowSearch(false);
    loadPhotos();
  };

  const handleGeneratePrompt = async () => {
    const { prompt } = await getPhotoGenPrompt(eventId);
    setGenPrompt(prompt);
  };

  const handleLocalFolder = async () => {
    // Use Electron's dialog to pick folder, or prompt for path
    const folderPath = prompt('Enter path to photo folder:');
    if (!folderPath) return;

    const res = await fetch(`/api/events/${eventId}/optimize/photos/local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath }),
    });
    const data = await res.json();
    // Show file picker from the returned list — for now just log
    console.log('Local photos found:', data.files);
    // TODO: Show selection UI for local photos
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h3 style={styles.title}>Photos</h3>
        <button style={styles.closeBtn} onClick={onClose}>×</button>
      </div>

      <PhotoGrid eventId={eventId} photos={photos} onRefresh={loadPhotos} />

      {/* Drop zone */}
      <div
        style={{ ...styles.dropZone, ...(dragOver ? styles.dropZoneActive : {}) }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files); }}
      >
        Drop images here or click to upload
        <input type="file" multiple accept="image/*" style={styles.fileInput}
          onChange={(e) => e.target.files && handleFileUpload(e.target.files)} />
      </div>

      {/* Action buttons */}
      <div style={styles.actions}>
        <button style={styles.actionBtn} onClick={() => setShowSearch(true)}>Search Web</button>
        <button style={styles.actionBtn} onClick={handleLocalFolder}>From Folder</button>
        <button style={styles.actionBtn} onClick={handleGeneratePrompt}>AI Prompt</button>
      </div>

      {/* AI gen prompt display */}
      {genPrompt && (
        <div style={styles.promptBox}>
          <pre style={styles.promptText}>{genPrompt}</pre>
          <button style={styles.copyBtn} onClick={() => navigator.clipboard.writeText(genPrompt)}>
            Copy Prompt
          </button>
        </div>
      )}

      {showSearch && (
        <PhotoSearchModal eventId={eventId} onSelect={handleSearchSelect} onClose={() => setShowSearch(false)} />
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: { background: '#1a1a2e', borderRadius: '8px', padding: '16px', marginTop: '16px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  title: { color: '#fff', margin: 0, fontSize: '14px' },
  closeBtn: { background: 'none', border: 'none', color: '#888', fontSize: '18px', cursor: 'pointer' },
  dropZone: {
    border: '2px dashed #333', borderRadius: '8px', padding: '24px', textAlign: 'center',
    color: '#888', marginTop: '12px', position: 'relative', cursor: 'pointer',
  },
  dropZoneActive: { borderColor: '#3b82f6', background: 'rgba(59,130,246,0.1)' },
  fileInput: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' },
  actions: { display: 'flex', gap: '8px', marginTop: '12px' },
  actionBtn: {
    padding: '6px 12px', fontSize: '12px', background: '#2a2a3e', color: '#fff',
    border: '1px solid #333', borderRadius: '6px', cursor: 'pointer',
  },
  promptBox: { background: '#2a2a3e', borderRadius: '6px', padding: '12px', marginTop: '12px' },
  promptText: { color: '#ccc', fontSize: '12px', whiteSpace: 'pre-wrap', margin: '0 0 8px 0', fontFamily: 'inherit' },
  copyBtn: {
    padding: '4px 10px', fontSize: '11px', background: '#8b5cf6', color: '#fff',
    border: 'none', borderRadius: '4px', cursor: 'pointer',
  },
};
```

- [ ] **Step 4: Wire OptimizePanel into EventDetailPage**

In `client/src/pages/EventDetailPage.tsx`, import and add `OptimizePanel` below the main form. Add state:

```typescript
import { OptimizePanel } from '../components/OptimizePanel';

// Add state:
const [showPhotoPanel, setShowPhotoPanel] = useState(false);

// In JSX, after the form/publish section:
{id && !isNew && (
  <OptimizePanel eventId={id} onClose={() => setShowPhotoPanel(false)} />
)}
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/OptimizePanel.tsx client/src/components/PhotoGrid.tsx client/src/components/PhotoSearchModal.tsx client/src/pages/EventDetailPage.tsx
git commit -m "feat: add OptimizePanel, PhotoGrid, and PhotoSearchModal components"
```

---

### Task 21: Install dependencies early and update build tooling

**Files:**
- Modify: `package.json`
- Modify: `SocialiseHub.bat`

Note: Run this before Tasks 14-20 in practice, or at minimum before running any code that imports sharp/multer/recharts.

- [ ] **Step 1: Install all new dependencies**

Run: `npm install recharts multer sharp`
Run: `npm install -D @types/multer`

- [ ] **Step 2: Update SocialiseHub.bat rebuild step**

In `SocialiseHub.bat`, change the rebuild command (around line 50):

```batch
npx @electron/rebuild -f -w better-sqlite3 -w sharp
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json SocialiseHub.bat
git commit -m "chore: add recharts, multer, sharp dependencies and update rebuild script"
```

---

### Task 22: Final integration test

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Start dev server and verify**

Run: `npm run dev:web`

Verify manually:
1. Events tab shows synced events with sync status badges
2. Modified events show orange dot and Push button
3. Generator analyze uses external Bristol events
4. Analytics tab shows charts (may be empty if no data yet)
5. Wand button on EventCard navigates to optimize flow

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration fixes from manual testing"
```
