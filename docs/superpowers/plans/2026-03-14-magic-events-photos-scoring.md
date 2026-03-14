# Magic Events, Photo System & Event Scoring Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add magic event creation with AI idea queue, replace imageUrl with multi-photo system, and add event scoring with actionable suggestions.

**Architecture:** Three features building on existing infrastructure. Magic events uses the Claude bridge to generate idea batches stored in SQLite, then deep-fills accepted events. Photo system replaces the imageUrl text field with the existing PhotoGrid/event_photos system. Event scoring composes prompts via Claude bridge and caches results. All AI interactions use the existing Claude panel bridge pattern.

**Tech Stack:** React 19, Express 5, SQLite (better-sqlite3), Electron 40, Vitest

**Spec:** `docs/superpowers/specs/2026-03-14-magic-events-photos-scoring-design.md`

---

## Chunk 1: Database Migrations & Data Layer

### Task 1: Add migration v5 (event_ideas + event_scores tables)

**Files:**
- Modify: `src/data/database.ts:53-72`

- [ ] **Step 1: Add migration v5 to runMigrations**

After migration 4 (line ~70), add:

```typescript
if (currentVersion < 5) {
  db.exec(`CREATE TABLE IF NOT EXISTS event_ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    short_description TEXT,
    category TEXT,
    suggested_date TEXT,
    date_reason TEXT,
    confidence TEXT DEFAULT 'medium',
    used INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS event_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    overall INTEGER NOT NULL,
    breakdown_json TEXT NOT NULL,
    suggestions_json TEXT NOT NULL,
    scored_at TEXT NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(id)
  )`);
  db.pragma('user_version = 5');
}
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/data`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/data/database.ts
git commit -m "feat: add event_ideas and event_scores tables (migration v5)"
```

---

### Task 2: Create IdeaStore

**Files:**
- Create: `src/data/idea-store.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add QueuedIdea type**

In `src/shared/types.ts`, add after `EventIdea` (line 94):

```typescript
export interface QueuedIdea {
  id: number;
  title: string;
  shortDescription: string;
  category: string;
  suggestedDate: string;
  dateReason: string;
  confidence: 'high' | 'medium' | 'low';
  used: boolean;
  createdAt: string;
}
```

- [ ] **Step 2: Create IdeaStore**

```typescript
// src/data/idea-store.ts
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

  getNextUnused(): QueuedIdea | null {
    const row = this.db
      .prepare<[], IdeaRow>('SELECT * FROM event_ideas WHERE used = 0 ORDER BY id ASC LIMIT 1')
      .get();
    return row ? rowToIdea(row) : null;
  }

  countUnused(): number {
    const row = this.db
      .prepare<[], { cnt: number }>('SELECT COUNT(*) as cnt FROM event_ideas WHERE used = 0')
      .get();
    return row?.cnt ?? 0;
  }

  markUsed(id: number): void {
    this.db.prepare('UPDATE event_ideas SET used = 1 WHERE id = ?').run(id);
  }

  insertBatch(ideas: Array<{
    title: string;
    shortDescription?: string;
    category?: string;
    suggestedDate?: string;
    dateReason?: string;
    confidence?: string;
  }>): number {
    const stmt = this.db.prepare(
      `INSERT INTO event_ideas (title, short_description, category, suggested_date, date_reason, confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const now = new Date().toISOString();
    const insert = this.db.transaction(() => {
      for (const idea of ideas) {
        stmt.run(
          idea.title,
          idea.shortDescription ?? null,
          idea.category ?? null,
          idea.suggestedDate ?? null,
          idea.dateReason ?? null,
          idea.confidence ?? 'medium',
          now,
        );
      }
    });
    insert();
    return ideas.length;
  }

  getById(id: number): QueuedIdea | null {
    const row = this.db
      .prepare<[number], IdeaRow>('SELECT * FROM event_ideas WHERE id = ?')
      .get(id);
    return row ? rowToIdea(row) : null;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/data/idea-store.ts src/shared/types.ts
git commit -m "feat: add IdeaStore and QueuedIdea type"
```

---

### Task 3: Remove imageUrl from events data layer

**Files:**
- Modify: `src/shared/types.ts:19-35`
- Modify: `src/data/sqlite-event-store.ts:13-16,18-33,70,94-122,124-155`

- [ ] **Step 1: Remove imageUrl from types**

In `src/shared/types.ts`:
- Remove `imageUrl?: string;` from `SocialiseEvent` (line 29)

Since `CreateEventInput` is derived from `SocialiseEvent` via `Omit`, `imageUrl` will automatically be removed.

- [ ] **Step 2: Remove imageUrl from SqliteEventStore**

In `src/data/sqlite-event-store.ts`:
- Remove `'imageUrl'` from `UPDATABLE_FIELDS` set (line 13-16)
- Remove `image_url: string | null;` from `EventRow` interface (line 28)
- Remove `imageUrl: row.image_url ?? undefined,` from `rowToEvent()` (line 70)
- Remove `image_url` from the INSERT column list and VALUES in `create()` (lines 102, 116)
- Remove `imageUrl: 'image_url'` from `columnMap` in `update()` (line 136)

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: PASS (some tests may reference imageUrl — fix if needed)

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/data/sqlite-event-store.ts
git commit -m "refactor: remove imageUrl from events data layer"
```

---

## Chunk 2: Feature 1 — Magic New Event (Idea Queue)

### Task 4: Add idea queue endpoints to generator routes

**Files:**
- Modify: `src/routes/generator.ts:15-100`
- Modify: `src/app.ts:74` (IdeaStore instantiation)

- [ ] **Step 1: Instantiate IdeaStore in app.ts**

In `src/app.ts`, after `marketAnalyzer` instantiation (around line 78):

```typescript
import { IdeaStore } from './data/idea-store.js';
const ideaStore = new IdeaStore(db);
```

Update `createGeneratorRouter` call to pass `ideaStore`:

```typescript
app.use('/api/generator', createGeneratorRouter(eventStore, marketAnalyzer, platformEventStore, ideaStore));
```

- [ ] **Step 2: Update createGeneratorRouter signature and add idea endpoints**

In `src/routes/generator.ts`, update the function signature to accept `ideaStore`:

```typescript
export function createGeneratorRouter(
  eventStore: SqliteEventStore,
  analyzer: MarketAnalyzer,
  platformEventStore?: PlatformEventStore,
  ideaStore?: IdeaStore,
): Router {
```

Add the following endpoints before `return router`:

```typescript
  // GET /api/generator/ideas — return next unused idea
  router.get('/ideas', (_req, res, next) => {
    try {
      if (!ideaStore) return res.status(503).json({ error: 'Idea store not available' });
      const idea = ideaStore.getNextUnused();
      const remaining = ideaStore.countUnused();
      res.json({ idea, remaining });
    } catch (err) { next(err); }
  });

  // POST /api/generator/ideas/generate — generate batch of ideas via Claude bridge
  router.post('/ideas/generate', async (req, res, next) => {
    try {
      if (!ideaStore) return res.status(503).json({ error: 'Idea store not available' });

      // Gather context for idea generation
      const pastEvents = eventStore.getAll();
      const marketData = analyzer.getMarketData();

      const pastSummary = pastEvents.slice(0, 20).map(e =>
        `- ${e.title} | ${e.start_time} | ${e.venue} | £${e.price} | ${e.capacity} cap`
      ).join('\n');

      const marketSummary = marketData.slice(0, 20).map(e =>
        `- ${e.title} | ${e.date} | ${e.venue} | ${e.category ?? ''}`
      ).join('\n');

      const prompt = `You are an event planning advisor for Socialise, a Bristol-based events company organising social activities for young professionals.

## Socialise's Past Events (for reference)
${pastSummary || 'No past events yet — this is a new organizer.'}

## Bristol Events Landscape
${marketSummary || 'No external data available.'}

## Calendar Context
Use your knowledge of:
- UK bank holidays in the next 3 months
- Bristol festivals and cultural events
- Seasonal activities and weather
- Cultural dates (Valentine's Day, St Patrick's Day, etc.)

## Your Task
Generate 12 event ideas that would have the highest chance of selling out. Prioritize:
1. Low effort, high reward events
2. Events tied to upcoming important dates or holidays
3. Categories that perform well for social/young professional audiences
4. Gaps in the current Bristol events landscape

For each idea, respond in JSON array format:
[
  {
    "title": "Event Title",
    "shortDescription": "One engaging sentence",
    "category": "Workshop|Social|Outdoor|Food & Drink|Arts & Culture|Wellness|Craft|Sport|Community",
    "suggestedDate": "YYYY-MM-DD",
    "dateReason": "Why this date is optimal",
    "confidence": "high|medium|low"
  }
]

Return ONLY the JSON array, no other text.`;

      res.json({ prompt });
    } catch (err) { next(err); }
  });

  // POST /api/generator/ideas/store — store generated ideas (called by client after Claude response)
  router.post('/ideas/store', (req, res, next) => {
    try {
      if (!ideaStore) return res.status(503).json({ error: 'Idea store not available' });
      const { ideas } = req.body;
      if (!Array.isArray(ideas)) return res.status(400).json({ error: 'ideas must be an array' });
      const count = ideaStore.insertBatch(ideas);
      res.json({ stored: count });
    } catch (err) { next(err); }
  });

  // POST /api/generator/ideas/:id/accept — mark idea as used, create event, return event ID
  router.post('/ideas/:id/accept', (req, res, next) => {
    try {
      if (!ideaStore) return res.status(503).json({ error: 'Idea store not available' });
      const idea = ideaStore.getById(Number(req.params.id));
      if (!idea) return res.status(404).json({ error: 'Idea not found' });

      ideaStore.markUsed(idea.id);

      const event = eventStore.create({
        title: idea.title,
        description: idea.shortDescription,
        start_time: idea.suggestedDate ? new Date(idea.suggestedDate).toISOString() : new Date().toISOString(),
        duration_minutes: 120,
        venue: '',
        price: 0,
        capacity: 30,
      });

      res.json({ eventId: event.id });
    } catch (err) { next(err); }
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/generator.ts src/app.ts
git commit -m "feat: add idea queue endpoints (get, generate, store, accept)"
```

---

### Task 5: Add magic-fill endpoint

**Files:**
- Modify: `src/routes/optimize.ts:138-150`

- [ ] **Step 1: Add magic-fill endpoint**

In `src/routes/optimize.ts`, before `return router` (around line 150), add:

```typescript
  // POST /:id/magic-fill — deep research: compose optimization prompt + auto-fill photos
  router.post('/:id/magic-fill', async (req, res, next) => {
    try {
      const event = eventStore.getById(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      // Compose deep optimization prompt
      const prompt = `You are an expert event marketer for Socialise, a Bristol events company for young professionals.

## Event to Optimize
- Title: ${event.title}
- Description: ${event.description}
- Date: ${event.start_time}
- Venue: ${event.venue || 'Not set'}
- Price: £${event.price}
- Capacity: ${event.capacity}

## Your Task
Fully optimize this event for maximum ticket sales. Return a JSON object with:
{
  "title": "SEO-optimized title with location keyword",
  "description": "Compelling 2-3 paragraph description with hook, value prop, and CTA",
  "venue": "Suggested venue type or specific Bristol venue",
  "price": 15,
  "capacity": 30,
  "duration_minutes": 120
}

Make the title searchable. Make the description engaging — first line is the hook. Include 'Bristol' for local SEO. Return ONLY JSON.`;

      res.json({ prompt, eventId: event.id });
    } catch (err) { next(err); }
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/optimize.ts
git commit -m "feat: add magic-fill endpoint for deep event optimization"
```

---

### Task 6: Add photos/auto endpoint

**Files:**
- Modify: `src/routes/photos.ts:116-138`

- [ ] **Step 1: Add photos/auto endpoint**

In `src/routes/photos.ts`, before `return router` (around line 138), add:

```typescript
  // POST /:id/photos/auto — auto-fill 4 photos from Unsplash
  router.post('/:id/photos/auto', async (req, res, next) => {
    try {
      const event = db.prepare('SELECT title, description FROM events WHERE id = ?').get(req.params.id) as
        { title: string; description: string } | undefined;
      if (!event) return res.status(404).json({ error: 'Event not found' });

      const apiKey = process.env.UNSPLASH_ACCESS_KEY;
      if (!apiKey) return res.status(503).json({ error: 'UNSPLASH_ACCESS_KEY not set' });

      // Search for 4 images matching event theme
      const query = `${event.title} ${event.description}`.slice(0, 100);
      const searchUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=4&orientation=landscape`;
      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Client-ID ${apiKey}` },
      });
      const searchData = await searchRes.json() as any;
      const results = searchData?.results || [];

      if (results.length === 0) return res.json({ photos: [], message: 'No photos found' });

      // Download each photo and save locally
      const eventDir = path.join(DATA_DIR, 'photos', req.params.id);
      fs.mkdirSync(eventDir, { recursive: true });

      const created: any[] = [];
      for (let i = 0; i < Math.min(results.length, 4); i++) {
        const photo = results[i];
        const imgRes = await fetch(photo.urls.regular);
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const filename = `auto-${Date.now()}-${i}.jpg`;
        const filePath = path.join(eventDir, filename);
        fs.writeFileSync(filePath, buffer);

        const relativePath = `photos/${req.params.id}/${filename}`;
        const maxPos = (db.prepare(
          'SELECT COALESCE(MAX(position), -1) as p FROM event_photos WHERE event_id = ?'
        ).get(req.params.id) as { p: number }).p;

        const result = db.prepare(
          `INSERT INTO event_photos (event_id, photo_path, source, position, is_cover)
           VALUES (?, ?, 'web', ?, ?)`
        ).run(req.params.id, relativePath, maxPos + 1, i === 0 ? 1 : 0);

        created.push({
          id: result.lastInsertRowid,
          photo_path: relativePath,
          source: 'web',
          position: maxPos + 1,
          is_cover: i === 0 ? 1 : 0,
        });
      }

      res.json({ photos: created });
    } catch (err) { next(err); }
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/photos.ts
git commit -m "feat: add photos/auto endpoint for Unsplash auto-fill"
```

---

### Task 7: Create IdeaCardModal component

**Files:**
- Create: `client/src/components/IdeaCardModal.tsx`

- [ ] **Step 1: Create modal component**

```typescript
// client/src/components/IdeaCardModal.tsx
import { useState, type CSSProperties } from 'react';
import type { QueuedIdea } from '@shared/types';

interface Props {
  idea: QueuedIdea | null;
  loading: boolean;
  onAccept: (id: number) => void;
  onNext: () => void;
  onClose: () => void;
}

export function IdeaCardModal({ idea, loading, onAccept, onNext, onClose }: Props) {
  if (!idea && !loading) return null;

  const confidenceColor = idea?.confidence === 'high' ? '#22c55e'
    : idea?.confidence === 'medium' ? '#f59e0b' : '#ef4444';

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Magic Event Idea</h2>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div style={styles.loadingBody}>
            <div style={styles.spinner} />
            <p style={{ color: '#888', marginTop: 12 }}>Generating ideas...</p>
          </div>
        ) : idea ? (
          <>
            <div style={styles.body}>
              <div style={styles.category}>
                <span style={{ ...styles.badge, background: confidenceColor }}>{idea.confidence}</span>
                <span style={styles.badge}>{idea.category}</span>
              </div>
              <h3 style={styles.ideaTitle}>{idea.title}</h3>
              <p style={styles.description}>{idea.shortDescription}</p>
              <div style={styles.meta}>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>Suggested Date</span>
                  <span style={styles.metaValue}>
                    {idea.suggestedDate ? new Date(idea.suggestedDate).toLocaleDateString('en-GB', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                    }) : 'Flexible'}
                  </span>
                </div>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>Why This Date</span>
                  <span style={styles.metaValue}>{idea.dateReason}</span>
                </div>
              </div>
            </div>
            <div style={styles.footer}>
              <button style={styles.nextBtn} onClick={onNext}>Next Idea →</button>
              <button style={styles.acceptBtn} onClick={() => onAccept(idea.id)}>
                Yes — Create This ✦
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 24px', borderBottom: '1px solid #eee',
  },
  title: { fontSize: 18, fontWeight: 700, color: '#080810', margin: 0, fontFamily: "'Outfit', sans-serif" },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, color: '#999', cursor: 'pointer' },
  loadingBody: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: 60,
  },
  spinner: {
    width: 32, height: 32, border: '3px solid #eee', borderTopColor: '#E2725B',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
  body: { padding: '24px' },
  category: { display: 'flex', gap: 8, marginBottom: 12 },
  badge: {
    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
    background: '#f0f0f0', color: '#555', textTransform: 'uppercase',
  },
  ideaTitle: { fontSize: 22, fontWeight: 700, color: '#080810', margin: '0 0 8px', fontFamily: "'Outfit', sans-serif" },
  description: { fontSize: 15, color: '#555', lineHeight: 1.6, margin: '0 0 20px' },
  meta: { display: 'flex', flexDirection: 'column', gap: 12 },
  metaItem: { display: 'flex', flexDirection: 'column', gap: 2 },
  metaLabel: { fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase' },
  metaValue: { fontSize: 14, color: '#333' },
  footer: {
    display: 'flex', justifyContent: 'space-between', padding: '16px 24px',
    borderTop: '1px solid #eee', gap: 12,
  },
  nextBtn: {
    padding: '10px 20px', borderRadius: 10, border: '1.5px solid #ddd',
    background: '#fff', color: '#555', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
  },
  acceptBtn: {
    padding: '10px 24px', borderRadius: 10, border: 'none',
    background: '#E2725B', color: '#fff', fontSize: 14, fontWeight: 700,
    cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/IdeaCardModal.tsx
git commit -m "feat: add IdeaCardModal component for magic event ideas"
```

---

### Task 8: Add idea API client functions and wire Magic button into EventsPage

**Files:**
- Modify: `client/src/api/events.ts`
- Modify: `client/src/pages/EventsPage.tsx:1-7,113-149`

- [ ] **Step 1: Add API client functions**

In `client/src/api/events.ts`, add after the optimize section:

```typescript
// ── Magic Ideas ──────────────────────────────────────────

export async function getNextIdea(): Promise<{ idea: QueuedIdea | null; remaining: number }> {
  const res = await fetch(`${BASE}/generator/ideas`);
  return json(res);
}

export async function generateIdeasPrompt(): Promise<{ prompt: string }> {
  const res = await fetch(`${BASE}/generator/ideas/generate`, { method: 'POST' });
  return json(res);
}

export async function storeIdeas(ideas: any[]): Promise<{ stored: number }> {
  const res = await fetch(`${BASE}/generator/ideas/store`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ideas }),
  });
  return json(res);
}

export async function acceptIdea(ideaId: number): Promise<{ eventId: string }> {
  const res = await fetch(`${BASE}/generator/ideas/${ideaId}/accept`, { method: 'POST' });
  return json(res);
}

export async function magicFill(eventId: string): Promise<{ prompt: string; eventId: string }> {
  const res = await fetch(`${BASE}/events/${eventId}/magic-fill`, { method: 'POST' });
  return json(res);
}

export async function autoFillPhotos(eventId: string): Promise<{ photos: any[] }> {
  const res = await fetch(`${BASE}/events/${eventId}/photos/auto`, { method: 'POST' });
  return json(res);
}
```

Import `QueuedIdea` at the top of the file:
```typescript
import type { ..., QueuedIdea } from '@shared/types';
```

- [ ] **Step 2: Update EventsPage with Magic button and IdeaCardModal**

In `client/src/pages/EventsPage.tsx`:

Add imports:
```typescript
import { IdeaCardModal } from '../components/IdeaCardModal';
import { getNextIdea, generateIdeasPrompt, storeIdeas, acceptIdea } from '../api/events';
import type { QueuedIdea } from '@shared/types';
```

Add state inside the component:
```typescript
const [showIdeaModal, setShowIdeaModal] = useState(false);
const [currentIdea, setCurrentIdea] = useState<QueuedIdea | null>(null);
const [ideaLoading, setIdeaLoading] = useState(false);
```

Add handlers:
```typescript
const handleMagicNew = async () => {
  setShowIdeaModal(true);
  setIdeaLoading(true);
  try {
    const { idea, remaining } = await getNextIdea();
    if (idea) {
      setCurrentIdea(idea);
    } else {
      // No ideas — generate a batch
      const { prompt } = await generateIdeasPrompt();
      // Send to Claude via electronAPI or fallback
      const w = window as any;
      if (w.electronAPI?.sendPromptToClaude) {
        const result = await w.electronAPI.sendPromptToClaude(prompt);
        if (result.response) {
          const parsed = JSON.parse(result.response);
          await storeIdeas(Array.isArray(parsed) ? parsed : []);
          const { idea: newIdea } = await getNextIdea();
          setCurrentIdea(newIdea);
        }
      } else {
        // Fallback: copy prompt for manual use
        await navigator.clipboard.writeText(prompt);
        setError('Idea prompt copied — paste into Claude, then use the Generator page to store results');
      }
    }
  } catch (err: any) {
    setError(err.message);
  } finally {
    setIdeaLoading(false);
  }
};

const handleNextIdea = async () => {
  setIdeaLoading(true);
  try {
    const { idea } = await getNextIdea();
    setCurrentIdea(idea);
    if (!idea) {
      // Queue exhausted — generate more
      handleMagicNew();
    }
  } catch (err: any) {
    setError(err.message);
  } finally {
    setIdeaLoading(false);
  }
};

const handleAcceptIdea = async (ideaId: number) => {
  try {
    const { eventId } = await acceptIdea(ideaId);
    setShowIdeaModal(false);
    nav(`/events/${eventId}?magic=true`);
  } catch (err: any) {
    setError(err.message);
  }
};
```

Replace the "New Event" button (line 145) with a dropdown:
```tsx
<div style={{ position: 'relative', display: 'flex', gap: 8 }}>
  <button style={styles.createBtn} onClick={() => nav('/events/new')}>+ New Event</button>
  <button
    style={{ ...styles.createBtn, background: '#a855f7' }}
    onClick={handleMagicNew}
  >
    ✦ Magic
  </button>
</div>
```

Add the modal at the end of the JSX (before closing `</div>`):
```tsx
<IdeaCardModal
  idea={currentIdea}
  loading={ideaLoading}
  onAccept={handleAcceptIdea}
  onNext={handleNextIdea}
  onClose={() => setShowIdeaModal(false)}
/>
```

- [ ] **Step 3: Commit**

```bash
git add client/src/api/events.ts client/src/pages/EventsPage.tsx
git commit -m "feat: wire Magic button and idea queue into EventsPage"
```

---

### Task 9: Handle magic=true in EventDetailPage

**Files:**
- Modify: `client/src/pages/EventDetailPage.tsx`

- [ ] **Step 1: Add magic-fill trigger on mount**

In `EventDetailPage.tsx`, in the existing `useEffect` that handles `?optimize=true` query param, extend it to also handle `?magic=true`:

```typescript
useEffect(() => {
  if (!id || isNew) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('optimize') === 'true') {
    handleOptimize();
  }
  if (params.get('magic') === 'true') {
    handleMagicFill();
  }
}, [id]);
```

Add the `handleMagicFill` function:
```typescript
const handleMagicFill = async () => {
  if (!id) return;
  setOptimizing(true);
  try {
    // Step 1: Get optimization prompt
    const { prompt } = await magicFill(id);

    // Step 2: Send to Claude for deep optimization
    const w = window as any;
    if (w.electronAPI?.sendPromptToClaude) {
      const result = await w.electronAPI.sendPromptToClaude(prompt);
      if (result.response) {
        // Parse JSON from response
        const jsonMatch = result.response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const optimized = JSON.parse(jsonMatch[0]);
          if (optimized.title) setTitle(optimized.title);
          if (optimized.description) setDescription(optimized.description);
          if (optimized.venue) setVenue(optimized.venue);
          if (optimized.price != null) setPrice(optimized.price);
          if (optimized.capacity != null) setCapacity(optimized.capacity);
          if (optimized.duration_minutes) setDurationMinutes(optimized.duration_minutes);

          // Auto-save the optimized fields
          await updateEvent(id, optimized);
        }
      }
    }

    // Step 3: Auto-fill photos
    await autoFillPhotos(id);

    showToast('Event optimized with AI', 'success');
  } catch (err: any) {
    setError(err.message || 'Magic fill failed');
  } finally {
    setOptimizing(false);
  }
};
```

Import `magicFill` and `autoFillPhotos` from `../api/events`.

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/EventDetailPage.tsx
git commit -m "feat: handle magic=true param for auto-fill on EventDetailPage"
```

---

## Chunk 3: Feature 2 — Photo System in Event Form

### Task 10: Replace imageUrl input with PhotoGrid in EventDetailPage

**Files:**
- Modify: `client/src/pages/EventDetailPage.tsx:63,109,437-455`

- [ ] **Step 1: Remove imageUrl state and input**

In `EventDetailPage.tsx`:
- Remove `const [imageUrl, setImageUrl] = useState('');` (line 63)
- Remove `setImageUrl(ev.imageUrl ?? '')` from the load effect (line 109)
- Remove `imageUrl` from `buildInput()` return object
- Replace the imageUrl label + input + preview block (lines 437-455) with:

```tsx
{/* Photos */}
<div style={styles.formGroup}>
  <label style={styles.label}>Photos</label>
  {id && !isNew ? (
    <OptimizePanel eventId={id} eventTitle={title} />
  ) : (
    <p style={{ color: '#999', fontSize: 13 }}>Save the event first to add photos</p>
  )}
</div>
```

The `OptimizePanel` is already imported and renders the PhotoGrid with search/upload/AI prompt functionality.

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/EventDetailPage.tsx
git commit -m "feat: replace imageUrl input with PhotoGrid in event form"
```

---

## Chunk 4: Feature 3 — Event Score

### Task 11: Create score API route

**Files:**
- Create: `src/routes/score.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Create score route**

```typescript
// src/routes/score.ts
import { Router } from 'express';
import type { Database } from '../data/database.js';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';

export function createScoreRouter(db: Database, eventStore: SqliteEventStore): Router {
  const router = Router();

  // GET /:id/score — return cached score
  router.get('/:id/score', (req, res, next) => {
    try {
      const cached = db.prepare(
        'SELECT * FROM event_scores WHERE event_id = ?'
      ).get(req.params.id) as any;

      if (!cached) return res.json({ score: null });

      res.json({
        score: {
          overall: cached.overall,
          breakdown: JSON.parse(cached.breakdown_json),
          suggestions: JSON.parse(cached.suggestions_json),
          scoredAt: cached.scored_at,
        },
      });
    } catch (err) { next(err); }
  });

  // POST /:id/score — compose scoring prompt
  router.post('/:id/score', async (req, res, next) => {
    try {
      const event = eventStore.getById(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      const photoCount = (db.prepare(
        'SELECT COUNT(*) as cnt FROM event_photos WHERE event_id = ?'
      ).get(req.params.id) as { cnt: number }).cnt;

      // Get past performance context
      const perfData = db.prepare(`
        SELECT AVG(CASE WHEN capacity > 0 THEN CAST(attendance AS REAL) / capacity END) as avg_fill,
               AVG(attendance) as avg_attendance
        FROM platform_events
        WHERE attendance IS NOT NULL
      `).get() as { avg_fill: number | null; avg_attendance: number | null };

      const prompt = `You are an event listing optimization expert. Score this event listing on a scale of 0-100 and provide specific improvement suggestions.

## Event to Score
- Title: ${event.title}
- Description: ${event.description || '(empty)'}
- Date: ${event.start_time}
- Venue: ${event.venue || '(not set)'}
- Price: £${event.price}
- Capacity: ${event.capacity}
- Photos: ${photoCount} of 4 target

## Historical Performance Context
- Average fill rate across past events: ${perfData.avg_fill ? Math.round(perfData.avg_fill * 100) + '%' : 'No data'}
- Average attendance: ${perfData.avg_attendance ? Math.round(perfData.avg_attendance) : 'No data'}

## Scoring Criteria
1. **SEO** (0-100): Title includes location keywords, searchable terms, compelling hook
2. **Timing** (0-100): Day of week, time, proximity to holidays/events, seasonal fit
3. **Pricing** (0-100): Appropriate for category, competitive, value perception
4. **Description** (0-100): Hook in first line, clear value prop, social proof language, CTA
5. **Photos** (0-100): Number of photos (4 is ideal), relevance, quality indicators

Return ONLY this JSON:
{
  "overall": 72,
  "breakdown": { "seo": 65, "timing": 80, "pricing": 70, "description": 60, "photos": 85 },
  "suggestions": [
    { "field": "title", "current_issue": "What's wrong", "suggestion": "How to fix it", "impact": 8, "suggested_value": "New Title Here" },
    { "field": "description", "current_issue": "What's wrong", "suggestion": "How to fix it", "impact": 12, "suggested_value": "New description..." }
  ]
}

For suggestions where a specific replacement makes sense (title, description, venue), include "suggested_value". For timing/photos suggestions, set "suggested_value" to null. Sort suggestions by impact (highest first). Include 3-5 suggestions.`;

      res.json({ prompt, eventId: event.id });
    } catch (err) { next(err); }
  });

  // POST /:id/score/save — store score from client after Claude response
  router.post('/:id/score/save', (req, res, next) => {
    try {
      const { overall, breakdown, suggestions } = req.body;
      if (typeof overall !== 'number') return res.status(400).json({ error: 'overall required' });

      db.prepare(`
        INSERT INTO event_scores (event_id, overall, breakdown_json, suggestions_json, scored_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
          overall = excluded.overall,
          breakdown_json = excluded.breakdown_json,
          suggestions_json = excluded.suggestions_json,
          scored_at = excluded.scored_at
      `).run(
        req.params.id,
        overall,
        JSON.stringify(breakdown || {}),
        JSON.stringify(suggestions || []),
        new Date().toISOString(),
      );

      res.json({ success: true });
    } catch (err) { next(err); }
  });

  return router;
}
```

- [ ] **Step 2: Register in app.ts**

In `src/app.ts`, before the 404 catch-all (line 93):

```typescript
import { createScoreRouter } from './routes/score.js';
app.use('/api/events', createScoreRouter(db, eventStore));
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/score.ts src/app.ts
git commit -m "feat: add event score API routes"
```

---

### Task 12: Create ScorePanel component

**Files:**
- Create: `client/src/components/ScorePanel.tsx`

- [ ] **Step 1: Create ScorePanel**

```typescript
// client/src/components/ScorePanel.tsx
import { type CSSProperties } from 'react';
import { updateEvent } from '../api/events';

interface ScoreBreakdown {
  seo: number;
  timing: number;
  pricing: number;
  description: number;
  photos: number;
}

interface Suggestion {
  field: string;
  current_issue: string;
  suggestion: string;
  impact: number;
  suggested_value: string | null;
}

interface Props {
  eventId: string;
  overall: number;
  breakdown: ScoreBreakdown;
  suggestions: Suggestion[];
  onApply: (field: string, value: string) => void;
  onRescore: () => void;
}

function ScoreGauge({ score }: { score: number }) {
  const color = score < 40 ? '#ef4444' : score < 70 ? '#f59e0b' : '#22c55e';
  const circumference = 2 * Math.PI * 45;
  const dashoffset = circumference * (1 - score / 100);

  return (
    <div style={{ textAlign: 'center', marginBottom: 20 }}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="45" fill="none" stroke="#e5e5e5" strokeWidth="8" />
        <circle cx="60" cy="60" r="45" fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashoffset}
          transform="rotate(-90 60 60)" style={{ transition: 'stroke-dashoffset 0.5s' }} />
        <text x="60" y="55" textAnchor="middle" fontSize="28" fontWeight="bold" fill={color}>{score}</text>
        <text x="60" y="72" textAnchor="middle" fontSize="11" fill="#999">/ 100</text>
      </svg>
    </div>
  );
}

function BreakdownBar({ label, value }: { label: string; value: number }) {
  const color = value < 40 ? '#ef4444' : value < 70 ? '#f59e0b' : '#22c55e';
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: '#555', fontWeight: 600 }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ background: '#f0f0f0', borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

export function ScorePanel({ eventId, overall, breakdown, suggestions, onApply, onRescore }: Props) {
  const handleApply = async (s: Suggestion) => {
    if (!s.suggested_value) return;
    try {
      await updateEvent(eventId, { [s.field]: s.suggested_value });
      onApply(s.field, s.suggested_value);
    } catch (err) {
      console.error('Failed to apply suggestion:', err);
    }
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h3 style={styles.title}>Event Score</h3>
        <button style={styles.rescoreBtn} onClick={onRescore}>Re-Score</button>
      </div>

      <ScoreGauge score={overall} />

      <div style={styles.breakdownSection}>
        <BreakdownBar label="SEO" value={breakdown.seo} />
        <BreakdownBar label="Timing" value={breakdown.timing} />
        <BreakdownBar label="Pricing" value={breakdown.pricing} />
        <BreakdownBar label="Description" value={breakdown.description} />
        <BreakdownBar label="Photos" value={breakdown.photos} />
      </div>

      {suggestions.length > 0 && (
        <div style={styles.suggestionsSection}>
          <h4 style={styles.suggestionsTitle}>Suggestions</h4>
          {suggestions.map((s, i) => (
            <div key={i} style={styles.suggestionCard}>
              <div style={styles.suggestionHeader}>
                <span style={styles.fieldBadge}>{s.field}</span>
                <span style={styles.impactBadge}>+{s.impact} pts</span>
              </div>
              <p style={styles.issue}>{s.current_issue}</p>
              <p style={styles.fix}>{s.suggestion}</p>
              {s.suggested_value && (
                <button style={styles.applyBtn} onClick={() => handleApply(s)}>
                  Apply
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    background: '#fff', border: '1px solid #e8e6e1', borderRadius: 16,
    padding: '20px 24px', marginTop: 20,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 16, fontWeight: 700, color: '#080810', margin: 0, fontFamily: "'Outfit', sans-serif" },
  rescoreBtn: {
    padding: '6px 14px', fontSize: 12, fontWeight: 600, background: '#f0f0f0',
    border: 'none', borderRadius: 8, cursor: 'pointer', color: '#555',
  },
  breakdownSection: { marginBottom: 20 },
  suggestionsSection: {},
  suggestionsTitle: {
    fontSize: 13, fontWeight: 700, color: '#080810', margin: '0 0 12px',
    fontFamily: "'Outfit', sans-serif",
  },
  suggestionCard: {
    padding: '12px 16px', background: '#f8f6f1', borderRadius: 12,
    marginBottom: 8, border: '1px solid #e8e2d5',
  },
  suggestionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  fieldBadge: {
    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
    background: '#e0e0e0', color: '#555', textTransform: 'uppercase',
  },
  impactBadge: {
    fontSize: 11, fontWeight: 700, color: '#22c55e',
  },
  issue: { fontSize: 13, color: '#888', margin: '0 0 4px' },
  fix: { fontSize: 13, color: '#333', margin: '0 0 8px', fontWeight: 500 },
  applyBtn: {
    padding: '5px 14px', fontSize: 12, fontWeight: 600, background: '#E2725B',
    color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/ScorePanel.tsx
git commit -m "feat: add ScorePanel component with gauge, breakdown, and suggestions"
```

---

### Task 13: Wire Score button and panel into EventDetailPage

**Files:**
- Modify: `client/src/api/events.ts`
- Modify: `client/src/pages/EventDetailPage.tsx`

- [ ] **Step 1: Add score API functions**

In `client/src/api/events.ts`:

```typescript
// ── Event Score ──────────────────────────────────────────

export async function getEventScore(id: string): Promise<{ score: any | null }> {
  const res = await fetch(`${BASE}/events/${id}/score`);
  return json(res);
}

export async function scoreEvent(id: string): Promise<{ prompt: string; eventId: string }> {
  const res = await fetch(`${BASE}/events/${id}/score`, { method: 'POST' });
  return json(res);
}

export async function saveEventScore(id: string, data: { overall: number; breakdown: any; suggestions: any[] }): Promise<void> {
  await fetch(`${BASE}/events/${id}/score/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
```

- [ ] **Step 2: Add Score button and panel to EventDetailPage**

In `EventDetailPage.tsx`:

Add imports:
```typescript
import { ScorePanel } from '../components/ScorePanel';
import { scoreEvent, saveEventScore, getEventScore } from '../api/events';
```

Add state:
```typescript
const [scoreData, setScoreData] = useState<{ overall: number; breakdown: any; suggestions: any[] } | null>(null);
const [scoring, setScoring] = useState(false);
```

Add handler:
```typescript
const handleScore = async () => {
  if (!id) return;
  setScoring(true);
  try {
    // Check cache first
    const cached = await getEventScore(id);
    if (cached.score) {
      setScoreData(cached.score);
      setScoring(false);
      return;
    }

    // Compose and send scoring prompt
    const { prompt } = await scoreEvent(id);
    const w = window as any;
    if (w.electronAPI?.sendPromptToClaude) {
      const result = await w.electronAPI.sendPromptToClaude(prompt);
      if (result.response) {
        const jsonMatch = result.response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          await saveEventScore(id, parsed);
          setScoreData(parsed);
        }
      }
    } else {
      await navigator.clipboard.writeText(prompt);
      showToast('Score prompt copied to clipboard', 'info');
    }
  } catch (err: any) {
    setError(err.message);
  } finally {
    setScoring(false);
  }
};

const handleApplySuggestion = (field: string, value: string) => {
  // Update local form state
  if (field === 'title') setTitle(value);
  if (field === 'description') setDescription(value);
  if (field === 'venue') setVenue(value);
  // Clear cached score since fields changed
  setScoreData(null);
};
```

Add Score button next to the wand button in the header area (around line 477-487):
```tsx
<button
  style={{ ...styles.actionBtn, background: '#3b82f6' }}
  onClick={handleScore}
  disabled={scoring || !id}
>
  {scoring ? 'Scoring...' : '📊 Score'}
</button>
```

Add ScorePanel below the form (after OptimizePanel):
```tsx
{scoreData && id && (
  <ScorePanel
    eventId={id}
    overall={scoreData.overall}
    breakdown={scoreData.breakdown}
    suggestions={scoreData.suggestions}
    onApply={handleApplySuggestion}
    onRescore={() => { setScoreData(null); handleScore(); }}
  />
)}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build:all`
Expected: Builds successfully

- [ ] **Step 4: Commit**

```bash
git add client/src/api/events.ts client/src/pages/EventDetailPage.tsx
git commit -m "feat: wire Score button and ScorePanel into EventDetailPage"
```

---

### Task 14: Final integration test

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Build**

Run: `npm run build:all`
Expected: Builds successfully

- [ ] **Step 3: Manual verification**

Run: `SocialiseHub.bat`

Verify:
1. Events page shows "✦ Magic" button next to "New Event"
2. Clicking Magic shows idea card modal (may need ideas generated first)
3. Accepting an idea creates event and navigates to detail page with magic fill
4. Event detail page shows PhotoGrid instead of imageUrl text input
5. Score button appears, shows score panel with gauge and suggestions
6. Apply button on suggestions updates the field

- [ ] **Step 4: Final commit if needed**

```bash
git add -A
git commit -m "fix: integration fixes from manual testing"
```
