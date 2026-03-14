# SocialiseHub — Events, Generator, Analytics & Optimize Design

**Date:** 2026-03-14
**Status:** Draft
**Build order:** 1 → 2 → 3 → 4 (sequential, each builds on previous)

---

## Cross-Cutting: Database Migration Strategy

SQLite has no `ALTER TABLE IF NOT EXISTS` for columns. Use a versioned migration approach:
- Add `PRAGMA user_version` tracking to `database.ts`
- Each workstream increments the version and runs `ALTER TABLE ADD COLUMN` statements
- Guard each ALTER with a try/catch (SQLite throws if column exists, which is safe to ignore)
- New tables use `CREATE TABLE IF NOT EXISTS`

---

## Workstream 1: Events Tab Bug Fix + Sync Status

### Problem
Synced events write to `platform_events` table only. Events tab reads from `events` table. Synced events don't appear in the Events tab.

### Solution

**Data layer:**
- `POST /api/sync/pull` now also upserts into `events` table: for each scraped platform event, check if `platform_events.event_id` is set. If not, create a new row in `events` and set `platform_events.event_id` to link them. If already linked, update the `events` row with latest platform data.
- Use the existing `platform_events.event_id TEXT` FK as the sole link between tables (no reverse FK needed)
- New `sync_status` column on `events`: `synced` | `modified` | `local_only`
- State machine:
  - `local_only` — created in app, never synced
  - `synced` — matches platform version exactly
  - `modified` — user edited a synced event locally, needs push
  - Transitions: `local_only` → (publish) → `synced`; `synced` → (edit) → `modified`; `modified` → (push) → `synced`; `synced` → (pull with changes) → `synced` (updated)
  - Conflict resolution: `modified` → (pull with changes) → skip update, keep local edits, log warning. User must push or discard before pull can update.
- When upserting synced events into `events`, set `price` to 0 if not available from platform data (price is scraped separately and may not always be present)
- Add `sync_status` to `SocialiseEvent` type in `src/shared/types.ts`
- Update `SqliteEventStore.rowToEvent()` to include `sync_status`

**New endpoint:**
- `POST /api/sync/push` — request body: `{ eventId: string, platform: string }`. Calls `publishService.publish(eventId, platform)` to push changes back via the automation bridge. Resets `sync_status` to `synced` on success. Pushes to one platform at a time (matches existing sequential automation constraint).

**UI changes to EventCard:**
- Small badge showing sync status: green dot = synced, orange dot = modified (needs push), no dot = local only
- "Push" button appears when status is `modified`

**Migration (version 1 → 2):**
- `ALTER TABLE events ADD COLUMN sync_status TEXT DEFAULT 'local_only'`

### Files to modify
- `src/routes/sync.ts` — upsert into events on pull, new push endpoint
- `src/data/sqlite-event-store.ts` — add sync_status field support, update rowToEvent()
- `src/data/database.ts` — migration for new column + version tracking
- `src/shared/types.ts` — add sync_status to SocialiseEvent
- `client/src/components/EventCard.tsx` — sync status badge + push button
- `client/src/api/events.ts` — push API call

---

## Workstream 2: Generator Rewrite

### Problem
Market analyzer scrapes Socialise's own platform accounts (Meetup group, Eventbrite organizer dashboard, Headfirst event manager). The AI prompt then frames these as "market data" and asks Claude to find gaps — effectively competing against itself. No external context (holidays, cultural dates, seasonal trends).

### Solution

**New public scrapers** (separate from account scrapers):
- `meetupPublicScrapeSteps()` — `meetup.com/find/?location=Bristol`, uses search GraphQL API
- `eventbritePublicScrapeSteps()` — `eventbrite.co.uk/d/united-kingdom--bristol/events/`
- `headfirstPublicScrapeSteps()` — `headfirstbristol.co.uk/whats-on` (public page)
- Public scrapers use a separate session partition (`persist:public-scrape`) to avoid cookie contamination with authenticated sessions
- Market analyzer invokes these via the automation bridge HTTP endpoint (same async pattern as account scraping)

**Market analyzer rewrite** (`src/agents/market-analyzer.ts`):
- Calls new public scrapers via automation bridge instead of `platformEventStore.getAll()`
- Returns external Bristol events categorized by type, date, venue, price range
- Stores results in new `market_events` table (cached, refreshed on analyze)
- Cache invalidation: `DELETE FROM market_events WHERE platform = ?` before each platform's scrape cycle

**Prompt endpoint update:**
- `POST /api/generator/prompt` reads from `market_events` table directly (no longer expects client to relay market data in request body)

**Prompt rewrite** (`composeClaudePrompt` in `src/routes/generator.ts`):
- Remove "identify market gaps" / "outperform competitors" framing
- New prompt structure:
  1. **External landscape** — what's happening in Bristol (scraped data from `market_events`)
  2. **Calendar context** — UK bank holidays, school holidays, seasonal trends, cultural dates (AI knowledge)
  3. **Socialise history** — past events for style reference only
  4. **Task** — "Find optimal dates where attendance would be highest. Suggest events that fit those windows. Consider: bank holidays = people free, competing events = avoid clashes, seasonal activities = timely themes"

**Example output:**
- "May 5 is Early May Bank Holiday (Monday). Weekend + holiday = 3-day window. Bristol has few outdoor events listed. Suggest: 'Spring Wildflower Walk & Bouquet Making' on Saturday May 3rd"

### New table: `market_events` (version 2 → 3)
- `id` INTEGER PRIMARY KEY
- `platform` TEXT (meetup/eventbrite/headfirst)
- `external_id` TEXT
- `title` TEXT
- `description` TEXT
- `start_time` TEXT (ISO string)
- `venue` TEXT
- `category` TEXT
- `price` TEXT (stored as display string, e.g. "Free", "£5" — matches ScrapedEvent type)
- `url` TEXT
- `scraped_at` TEXT
- UNIQUE(platform, external_id)

**Analyze endpoint update:**
- `POST /api/generator/analyze` becomes async: triggers public scraping via automation bridge, populates `market_events` table, returns the scraped data when complete
- Frontend `EventGeneratorPage.tsx` updated: no longer passes `marketData` in request body to `/prompt` endpoint. After analyze completes, calls `/prompt` which reads from `market_events` directly.

### Files to modify
- `src/automation/meetup.ts` — add `meetupPublicScrapeSteps()`
- `src/automation/eventbrite.ts` — add `eventbritePublicScrapeSteps()`
- `src/automation/headfirst.ts` — add `headfirstPublicScrapeSteps()`
- `src/agents/market-analyzer.ts` — rewrite to use public scrapers via bridge
- `src/routes/generator.ts` — rewrite `composeClaudePrompt()`, update prompt endpoint to read from `market_events`
- `src/data/database.ts` — migration for `market_events` table
- `client/src/pages/EventGeneratorPage.tsx` — update analyze/prompt flow (no longer relay marketData in body)

---

## Workstream 3: Analytics Tab

### Problem
No visibility into event performance — what worked, what didn't, and why.

### Solution

**New sidebar entry:** Analytics (between Calendar and Templates, chart icon)

**Data source — scraper extensions:**
- Extend Meetup GraphQL scrape to pull `going` (RSVP count) and `maxTickets` (capacity)
- Extend Eventbrite scrape to pull ticket sales count and revenue from organizer dashboard
- Headfirst: attendance/revenue data not available from their platform — columns will be NULL for Headfirst events, UI shows "N/A"
- New columns on `platform_events`: `attendance INTEGER`, `capacity INTEGER`, `revenue REAL` (scrapers parse formatted strings like "£1,234.56" to float before storing), `ticket_price REAL`
- Sync pull populates these automatically
- Analytics reads from `events` table (joined with `platform_events` via `platform_events.event_id`) to ensure consistency with WS1's unified event model

**Page layout — 3 sections:**

1. **Summary cards** (top row):
   - Total events
   - Total attendees
   - Total revenue
   - Avg fill rate (attendance/capacity %)

2. **Charts** (middle, using Recharts ~300KB minified, acceptable for Electron):
   - Attendance over time (line chart, monthly)
   - Revenue over time (bar chart)
   - Fill rate by event type (bar chart — which categories sell out)
   - Best performing days/times (heatmap — day of week × time of day, using `start_time` ISO string which includes hour)

3. **AI insights panel** (bottom):
   - Composes a prompt with performance data and sends via the Claude panel bridge (same pattern as generator — compose prompt, relay to Claude panel, get response back)
   - Returns narrative insights (e.g., "Your Saturday afternoon workshops fill 92% on average vs 61% for weekday evenings")
   - Refresh button to re-analyze

**Filters:** Date range picker, event type filter

### New routes
- `GET /api/analytics/summary` — aggregate stats
- `GET /api/analytics/trends` — time-series data for charts
- `POST /api/analytics/insights` — compose AI prompt, relay via Claude bridge

### Migration (version 3 → 4)
- `ALTER TABLE platform_events ADD COLUMN attendance INTEGER`
- `ALTER TABLE platform_events ADD COLUMN capacity INTEGER`
- `ALTER TABLE platform_events ADD COLUMN revenue REAL`
- `ALTER TABLE platform_events ADD COLUMN ticket_price REAL`

### Files to create
- `client/src/pages/AnalyticsPage.tsx` — main page component
- `client/src/components/analytics/SummaryCards.tsx`
- `client/src/components/analytics/AttendanceChart.tsx`
- `client/src/components/analytics/RevenueChart.tsx`
- `client/src/components/analytics/EventTypeChart.tsx`
- `client/src/components/analytics/TimingHeatmap.tsx`
- `client/src/components/analytics/InsightsPanel.tsx`
- `src/routes/analytics.ts` — API routes

### Files to modify
- `client/src/App.tsx` — add Analytics route + sidebar entry
- `src/automation/meetup.ts` — extend scrape to include attendance/capacity
- `src/automation/eventbrite.ts` — extend scrape to include sales/revenue
- `src/data/platform-event-store.ts` — new columns
- `src/data/database.ts` — migration for new columns
- `src/app.ts` — register analytics routes (MUST be before the catch-all 404 handler)

### New dependency
- `recharts` — React charting library

---

## Workstream 4: Optimize Button

### Problem
No way to automatically improve event listings for SEO, visibility, and sellout potential.

### Existing code to replace
`EventDetailPage.tsx` already has `handleOptimize` which calls `POST /api/generator/optimize/:id` and shows a modal. This will be replaced with the new `OptimizePanel` component and `POST /api/events/:id/optimize` route. The old `composeOptimizePrompt` function in `generator.ts` will be removed.

### Solution

**Trigger:** Magic wand icon on EventCard + EventDetailPage header.

**Text optimization flow (in-place with undo):**
1. User clicks wand → `POST /api/events/:id/optimize`
2. Backend composes optimization prompt with event data + analytics context, relays via Claude bridge (same pattern as generator)
3. Response applied directly to event fields
4. Original saved to `event_snapshots` table (keep only latest snapshot per event, auto-delete older ones)
5. Toast: "Event optimized — [Undo]" (restores text fields from snapshot; photos are not affected by undo)

**Photo optimization — 4 sources, multi-photo:**

1. **Web search** (`POST /api/events/:id/optimize/photos/search`):
   - Uses Unsplash API (free tier, 50 requests/hour) for stock images by event keywords
   - API key stored in environment variable `UNSPLASH_ACCESS_KEY`
   - Returns grid of options, user picks which to add

2. **Local folder:**
   - Settings page gets "Default photo folder" path selector
   - Optimize scans folder for image files (jpg/png/webp), shows all as a grid for manual selection
   - Selected photos are copied to `data/photos/{eventId}/` and served by Express static middleware

3. **Auto-enhance:**
   - Uses Sharp library for crop, resize, brightness, contrast adjustments
   - Preset "optimize for platform" profiles (e.g., Meetup hero = 1200x675, Eventbrite = 2160x1080)
   - Original file preserved alongside enhanced version (e.g., `image1.jpg` → `image1_original.jpg` + `image1.jpg` replaced). User can revert individual photos via the photo grid UI (separate from text undo).

4. **AI generation** (`POST /api/events/:id/optimize/photos/generate-prompt`):
   - Returns a tailored text prompt for AI image generation
   - User copies prompt to their image gen tool
   - Uploads result via drop zone in optimization panel
   - Uploaded files saved to `data/photos/{eventId}/`

**Photo storage strategy:**
- All photos (from any source) are copied/downloaded to `data/photos/{eventId}/` directory
- `event_photos.photo_path` stores the relative path (e.g., `photos/{eventId}/image1.jpg`)
- Express serves `data/` as static files
- Web search photos are downloaded to local storage on selection (not hotlinked)

**Photo management panel:**
- Sortable grid of current photos (drag to reorder)
- Each source adds to the grid
- Remove, reorder, or replace individual photos
- "Cover photo" designation for primary image

### New tables (version 4 → 5)

**`event_snapshots`:**
- `id` INTEGER PRIMARY KEY
- `event_id` TEXT FK → events (TEXT to match events.id UUID)
- `snapshot_json` TEXT
- `created_at` TEXT
- One snapshot per event (upsert on event_id)

**`event_photos`:**
- `id` INTEGER PRIMARY KEY
- `event_id` TEXT FK → events
- `photo_path` TEXT (relative path in data/photos/)
- `source` TEXT — `web` (Unsplash), `local` (from folder), `upload` (user uploaded, including AI-generated images), `enhanced` (auto-enhanced version of existing photo)
- `position` INTEGER
- `is_cover` INTEGER DEFAULT 0

### New routes
- `POST /api/events/:id/optimize` — text optimization via Claude bridge
- `POST /api/events/:id/optimize/undo` — restore text fields from snapshot
- `POST /api/events/:id/optimize/photos/search` — Unsplash image search
- `POST /api/events/:id/optimize/photos/local` — scan local folder
- `POST /api/events/:id/optimize/photos/enhance` — Sharp auto-enhance
- `POST /api/events/:id/optimize/photos/generate-prompt` — AI gen prompt
- `GET /api/events/:id/photos` — list photos
- `POST /api/events/:id/photos` — add photo (multipart upload)
- `PATCH /api/events/:id/photos/reorder` — reorder photos (partial update of position fields)
- `DELETE /api/events/:id/photos/:photoId` — remove photo + delete file

### Files to create
- `client/src/components/OptimizePanel.tsx` — main optimization UI
- `client/src/components/PhotoGrid.tsx` — sortable photo management
- `client/src/components/PhotoSearchModal.tsx` — web search results picker
- `src/routes/optimize.ts` — optimization API routes
- `src/routes/photos.ts` — photo management API routes

### Files to modify
- `client/src/components/EventCard.tsx` — add wand icon
- `client/src/pages/EventDetailPage.tsx` — replace existing optimize modal with OptimizePanel
- `client/src/api/events.ts` — optimize + photo API calls
- `src/data/database.ts` — migrations for new tables
- `src/app.ts` — register new routes (before catch-all 404), serve data/photos/ as static
- `client/src/pages/SettingsPage.tsx` — add photo folder path setting
- `src/routes/generator.ts` — remove old `composeOptimizePrompt`

### New dependencies
- `sharp` — image processing (needs `@electron/rebuild` like better-sqlite3; update `SocialiseHub.bat` rebuild step to include sharp)
- `multer` — multipart file upload handling
