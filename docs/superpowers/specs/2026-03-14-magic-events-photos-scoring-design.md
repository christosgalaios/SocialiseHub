# SocialiseHub — Magic Events, Photo System & Event Scoring Design

**Date:** 2026-03-14
**Status:** Draft
**Depends on:** Previous spec (events-generator-analytics-optimize)

---

## Cross-Cutting: Database Migration Strategy

Continues from previous spec (currently at version 4). Uses `PRAGMA user_version` with try/catch guarded `ALTER TABLE` statements.

**Migration version 5:** `event_ideas` and `event_scores` tables (both created in same migration)

**Migration version 6:** Stop reading/writing `imageUrl` column on `events` table (leave column in place — SQLite <3.35 doesn't support DROP COLUMN). Also leave `image_url` on `templates` table untouched — templates are out of scope for this spec.

---

## Feature 1: Magic New Event (Idea Queue)

### Problem
Users must manually come up with event ideas. The generator page requires multiple steps (analyze → generate prompt → copy to Claude → parse response). There's no quick way to get a suggested event pre-filled and ready to publish.

### Solution

**Idea Queue system:**
- New table `event_ideas` (migration v5):
  - `id` INTEGER PRIMARY KEY
  - `title` TEXT NOT NULL
  - `short_description` TEXT
  - `category` TEXT
  - `suggested_date` TEXT
  - `date_reason` TEXT
  - `confidence` TEXT (high/medium/low)
  - `used` INTEGER DEFAULT 0
  - `created_at` TEXT
- Note: the existing `EventIdea` type in `src/shared/types.ts` is for the generator page's save-as-draft flow. The new `event_ideas` table is a separate concept — the AI-generated idea queue. Create a new type `QueuedIdea` (not `EventIdea`) to avoid collision.
- Ideas are generated in batches of 10-15 via Claude bridge
- When unused ideas drop below 3, auto-triggers another generation batch
- Used ideas are marked `used = 1`, never shown again

**Idea generation prompt context includes:**
- Past event performance data (attendance, fill rates, revenue from `platform_events`)
- Calendar context (AI knowledge of UK bank holidays, Bristol festivals, seasonal trends, cultural dates like Valentine's Day)
- External market data (from `market_events` if available)
- Socialise's event history and style (from `events` table)
- Prioritization: low effort / high reward, upcoming important dates, high-performing categories

**UI flow:**
1. "New Event" button gets a dropdown: "Blank" and "Magic ✦"
2. "Magic ✦" opens an idea card modal showing: title, one-line description, category, suggested date, date reason
3. Two buttons: "Yes — Create This" and "Next Idea →"
4. "Next Idea" shows the next unused idea from the queue. If queue is empty, shows "Generating ideas..." spinner and triggers a batch generation.
5. "Yes" → creates event in `events` table, marks idea as `used`, triggers deep research:
   - Client calls `POST /api/generator/ideas/:id/accept` → returns `{ eventId }`
   - Client navigates to `/events/:eventId`
   - EventDetailPage detects new magic event (query param `?magic=true`) and calls `POST /api/events/:id/magic-fill`
   - magic-fill composes a deep optimization prompt, sends via Claude bridge, applies results
   - magic-fill internally calls `POST /api/events/:id/photos/auto` to fetch 4 photos
   - Page shows loading state while magic-fill runs, then reveals pre-filled form

**Async behavior for idea generation:**
- `GET /api/generator/ideas` — returns next unused idea from DB. If fewer than 3 unused ideas remain, fires `POST /api/generator/ideas/generate` in the background (fire-and-forget). Returns the available idea immediately (or `{ empty: true }` if none exist yet).
- `POST /api/generator/ideas/generate` — synchronous from the server's perspective: composes prompt, sends to Claude bridge, waits for response, parses JSON array of ideas, stores all in `event_ideas`, returns `{ count: N }`. The Claude bridge call may take 15-30 seconds. The client shows a spinner during this time.
- If the client gets `{ empty: true }` from GET, it calls POST /generate directly and waits.

**New endpoints:**
- `GET /api/generator/ideas` — returns next unused idea (fires background generation if queue low)
- `POST /api/generator/ideas/generate` — generates a batch of 10-15 ideas via Claude bridge, stores in `event_ideas`, returns count
- `POST /api/generator/ideas/:id/accept` — marks idea as used, creates event with basic fields, returns event ID
- `POST /api/events/:id/magic-fill` — deep research: optimizes all text fields via Claude bridge, then calls photos/auto internally

### Files to create
- `src/data/idea-store.ts` — CRUD for `event_ideas` table, type `QueuedIdea`
- `client/src/components/IdeaCardModal.tsx` — idea preview card with Yes/Next buttons

### Files to modify
- `src/data/database.ts` — migration v5 for `event_ideas` and `event_scores` tables
- `src/shared/types.ts` — add `QueuedIdea` type (separate from existing `EventIdea`)
- `src/routes/generator.ts` — idea queue endpoints (GET ideas, POST generate, POST accept)
- `src/routes/optimize.ts` — magic-fill endpoint (calls photos/auto internally)
- `client/src/pages/EventsPage.tsx` — "New Event" dropdown with Magic option
- `client/src/api/events.ts` — API client functions for ideas and magic-fill

---

## Feature 2: Photo System Overhaul

### Problem
The current event form has a single `imageUrl` text field where users paste a URL. Events need multiple photos (1 hero + 3 supporting), photos should be uploadable files not URLs, and Magic should auto-fill photos from web search.

### Solution

**Stop using `imageUrl` on events (migration v6):**
- Do NOT drop the column (SQLite compatibility). Instead:
- Remove `imageUrl` from `SocialiseEvent` type, `CreateEventInput`, `UpdateEventInput` in `src/shared/types.ts`
- Remove `imageUrl` from `EventRow`, `rowToEvent()`, `create()`, `update()`, and `UPDATABLE_FIELDS` in `SqliteEventStore`
- Remove the URL text input from `EventDetailPage`
- Leave `image_url` on `templates` table untouched (out of scope)

**Photo grid in event form:**
- Replace the imageUrl field with an inline `PhotoGrid` component (reuse existing from OptimizePanel)
- 4 slots displayed: slot 0 is "Cover" (larger), slots 1-3 are supporting (smaller)
- Each slot shows: photo thumbnail, "Replace" button, "Delete" button
- Empty slots show a dashed border with "+" icon
- Below the grid: "Search Web" button, "AI Prompt" button, "Upload" drag-and-drop zone

**Auto-fill photos endpoint:**
- `POST /api/events/:id/photos/auto` — in `src/routes/photos.ts` (not optimize.ts, since it's photo storage logic)
- Takes event title + description from the event record
- Searches Unsplash for 4 relevant images using event keywords
- Downloads to `data/photos/{eventId}/`, creates `event_photos` rows
- First result is cover (position 0, is_cover = 1)
- Returns the created photo records

**Called by magic-fill internally:** `POST /api/events/:id/magic-fill` in optimize.ts calls `photos/auto` internally (shared logic via a helper function, not an HTTP self-call). This avoids duplicated Unsplash logic.

**Platform publishing:**
- Cover photo (position 0) used as hero image for Meetup/Eventbrite
- Supporting photos attached where platform supports galleries

### Files to modify
- `src/shared/types.ts` — remove imageUrl from SocialiseEvent, CreateEventInput, UpdateEventInput
- `src/data/sqlite-event-store.ts` — remove imageUrl from EventRow, rowToEvent, create, update, UPDATABLE_FIELDS
- `client/src/pages/EventDetailPage.tsx` — replace imageUrl input with PhotoGrid + photo action buttons
- `src/routes/photos.ts` — add photos/auto endpoint
- `src/routes/optimize.ts` — magic-fill calls photo auto-fill helper

---

## Feature 3: Event Score

### Problem
Users have no way to know how well-optimized their event listing is. They can't tell if their title is SEO-friendly, if their date is optimal, or if their pricing is competitive. They have to guess what to improve.

### Solution

**Score endpoint:** `POST /api/events/:id/score`
- Reads event data from DB (title, description, date, venue, price, capacity)
- Counts photos from `event_photos` table
- Reads past performance data from `platform_events` (attendance patterns, fill rates by category/timing)
- Composes a scoring prompt sent via Claude bridge
- Claude returns JSON with:
  - `overall`: 0-100 composite score
  - `breakdown`: `{ seo: 0-100, timing: 0-100, pricing: 0-100, description: 0-100, photos: 0-100 }`
  - `suggestions`: array of `{ field, current_issue, suggestion, impact, suggested_value? }` where impact is estimated score point improvement, and `suggested_value` is the specific replacement text (if applicable)
- Response cached in `event_scores` table

**Scoring prompt includes context:**
- The event's current field values
- Photo count (out of 4 target)
- Past event performance data (which categories/times/prices perform best)
- Platform SEO best practices

**Example suggestions returned:**
- `{ field: "title", current_issue: "Missing location keyword", suggestion: "Add 'Bristol' to title for local search visibility", impact: 8, suggested_value: "Speed Friending Social in Bristol — Meet New People!" }`
- `{ field: "date", current_issue: "Weekday evening", suggestion: "Saturday afternoons fill 23% better based on your past events", impact: 12, suggested_value: null }`
- `{ field: "photos", current_issue: "Only 2 of 4 photo slots filled", suggestion: "Events with 4+ photos get 35% more clicks on Eventbrite", impact: 5, suggested_value: null }`

**New table `event_scores` (migration v5, alongside event_ideas):**
- `id` INTEGER PRIMARY KEY
- `event_id` TEXT NOT NULL UNIQUE
- `overall` INTEGER NOT NULL
- `breakdown_json` TEXT NOT NULL
- `suggestions_json` TEXT NOT NULL
- `scored_at` TEXT NOT NULL
- FK on event_id → events(id)

**UI — Score panel in EventDetailPage:**
- "Score" button in the page header (next to existing wand button)
- Clicking it calls `POST /api/events/:id/score`, shows results in a panel:
  - Circular score gauge (0-100) with color coding: red < 40, orange 40-70, green > 70
  - 5 horizontal bars for breakdown categories (SEO, Timing, Pricing, Description, Photos)
  - Suggestion cards below, each with the issue, suggestion text, estimated impact, and an "Apply" button
  - "Apply" calls `updateEvent(id, { [field]: suggested_value })` using the existing `PATCH /api/events/:id` endpoint (same as the event form's save). Only enabled when `suggested_value` is non-null.
  - After applying suggestions, user can click "Re-Score" to see the improvement

**Storage:**
- Cached in `event_scores` — shown from cache until user explicitly re-scores
- One score per event (upsert on event_id)

### New endpoints
- `POST /api/events/:id/score` — compose scoring prompt, relay via Claude bridge, cache result
- `GET /api/events/:id/score` — return cached score if exists

### Route registration
Both score endpoints go in `src/routes/score.ts`. Mounted in `src/app.ts` at `/api/events` (so endpoints are `/api/events/:id/score`). Must be registered before the catch-all 404 handler.

### Files to create
- `client/src/components/ScorePanel.tsx` — score gauge + breakdown + suggestions with Apply buttons
- `src/routes/score.ts` — score API routes

### Files to modify
- `src/data/database.ts` — migration v5 for `event_scores` and `event_ideas` tables
- `src/app.ts` — register score routes at `/api/events` (before 404 catch-all)
- `client/src/pages/EventDetailPage.tsx` — add Score button + ScorePanel
- `client/src/api/events.ts` — score API client functions (scoreEvent, getCachedScore)
