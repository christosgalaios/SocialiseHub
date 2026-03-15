# SocialiseHub

AI-powered business operations tool for the Socialise events company.

## Stack

- **Runtime:** Node.js 20, TypeScript
- **Desktop:** Electron 40 (BaseWindow + WebContentsView)
- **Database:** SQLite (better-sqlite3) — local file at `data/socialise.db`
- **Frontend:** React 19, Vite 7, React Router v7
- **Backend:** Express 5 (runs inside Electron)
- **Testing:** Vitest
- **CI:** GitHub Actions (auto-approve, deploy)
- **Platforms:** Meetup, Eventbrite, Headfirst Bristol

## Architecture

```
electron/main.ts          — Electron main process, window management, IPC, automation view
electron/preload.ts       — Preload script (MUST compile as CommonJS, separate tsconfig)
src/data/                 — SQLite database, stores, migrations
src/automation/           — Browser automation engine, platform scripts, bridge, clients
src/tools/                — PublishService, PlatformClient interface
src/routes/               — Express API routes (events, services, sync, generator)
client/src/               — React frontend (pages, components, API client)
```

### Browser Automation (not API/OAuth)

Platform integrations use **browser automation via Electron WebContentsView**, not OAuth/API keys. The automation view shows the actual platform website and drives it like a real user.

- `src/automation/engine.ts` — Step-based engine (navigate, click, fill, evaluate, etc.)
- `src/automation/bridge.ts` — HTTP bridge (localhost:39847) for Express ↔ Electron IPC
- `src/automation/{meetup,eventbrite,headfirst}.ts` — Platform-specific step scripts
- `src/automation/{meetup,eventbrite,headfirst}-client.ts` — PlatformClient implementations via bridge

### Electron Layout

- **Left panel:** SocialiseHub React app (appView)
- **Right panel:** Claude.ai chat (claudeView) OR automation browser (automationView)
- Automation view uses `session.fromPartition('persist:automation')` for isolated cookies

### Build

Two Electron tsconfigs — main.ts compiles as ESM, preload.ts compiles as CommonJS:
- `electron/tsconfig.json` — ESM (excludes preload.ts)
- `electron/tsconfig.preload.json` — CommonJS (preload.ts only)

Native modules (better-sqlite3) must be rebuilt for Electron with `@electron/rebuild`. The bat file handles this automatically.

## Conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`
- Never edit .env files — set environment variables manually
- API keys go in environment variables, never in code
- Test platform integrations with mocks
- Sequential automation — one platform at a time (single WebContentsView)
- Pre-commit hook at `.githooks/pre-commit` checks for unacknowledged manager feedback (configured via `git config core.hooksPath .githooks`)

## Workflow Rules

### API-first platform integration
When adding or debugging platform integrations, **always inspect network traffic first** before writing scrape code. Use `mcp__claude-in-chrome__read_network_requests` or browser devtools to discover APIs (GraphQL, REST). Never guess at DOM selectors or API field names — observe what the real site uses.

### Delegate exploratory work to subagents
Long debugging sessions and API exploration exhaust the context window. Use subagents for:
- Exploring undocumented APIs (GraphQL introspection, endpoint discovery)
- Debugging platform-specific issues (cookie import, auth flows)
- Any task that may require multiple failed attempts before finding the right approach

### Commit working pieces early
Don't accumulate large uncommitted diffs. Commit each working piece as it's completed (e.g., commit Meetup refactor before starting Eventbrite). This prevents losing work if context runs out and makes code review easier.

### Run review agents in background
When using a manager/review agent, run it in the background while continuing other work. Don't block on review feedback — implement the next feature in parallel.

### Windows PowerShell path handling
When calling PowerShell from Node.js `execSync`, use `-LiteralPath` with single quotes and `''` escaping for paths with spaces. Never use double-quote nesting. Standard pattern:
```typescript
execSync(`powershell -NoProfile -Command "Copy-Item -LiteralPath '${path.replace(/'/g, "''")}'..."`)
```

## Running

```bash
SocialiseHub.bat           # Launch desktop app (auto-installs, builds, rebuilds native modules)
npm run dev                # Dev mode (Electron + Vite HMR)
npm run dev:web            # Web-only dev (no Electron)
npm run test:run           # Run tests once
npm run build:all          # Build server + electron + client
```

## Testing

- **Framework:** Vitest
- **Test count:** 750+ tests across 25 files
- **Database:** Tests use in-memory SQLite (`:memory:`)
- **HTTP:** Route tests use supertest

### Test Coverage
- All data stores (events, platform events, services, templates, sync log, sync snapshots, ideas)
- All API routes (events CRUD/batch/sort/paginate/export/stats/log/photos/optimize/score, sync, dashboard, analytics, generator, templates, services)
- Core libraries (validation, event readiness)
- Automation clients and engine

### Running Tests
```bash
npm run test:run           # Run all tests once
npx vitest run <file>      # Run specific test file
npx vitest --watch         # Watch mode
```

## Key Implementation Details

- Meetup connect stores `groupUrlname` in service extra data — used by sync/publish/scrape
- Service connection status stored in SQLite `services` table
- Sync pull calls `client.fetchEvents()` which uses automation bridge → Electron → browser scrape
- Meetup publish supports `draft: true` in data to save as draft instead of going live
- Dashboard summary uses `events` table as primary source, not `platform_events`
- Publish endpoint creates sync snapshots and sets `sync_status` to track sync state
- findMatch dedup requires 60% title length overlap for substring matches to avoid false positives
- cleanStale includes safety checks: skips if pull is empty or would remove >50% of rows
- Analytics queries use parameterized queries to prevent SQL injection
- Database tests run in-memory with better-sqlite3 in Node.js (not just Electron)
- Event creation validates: date format, end_time > start_time, duration (1-1440), title (max 200), capacity (1-10000), description (max 5000), venue (max 500)
- Event updates use `validateUpdateEventInput` (validates only fields present in the input)
- Dashboard attention items flag: missing description, no photos, low score, title mismatch, no venue, no capacity, unsaved changes
- Sync dedup uses normalized title matching with 60% length ratio requirement
- `cleanStale` skips cleanup if fresh pull returned 0 events or would remove >50% of existing events
- Platform image URLs are surfaced to event `image_url` during sync
- Events API supports sorting (sort_by + order), pagination (page + per_page), batch operations, CSV export, and per-event sync log/platform history
- Batch operations validate individual ids are non-empty strings
- Platform event store uses safe JSON.parse to prevent corrupt image_urls from crashing sync
- Service store uses safe JSON.parse for extra data
- Calendar endpoint groups events by date with optional month filter
- Per-event sync log and platform detail endpoints for event history tracking
- Category field is now editable in EventDetailPage form (was missing previously)
- Description character counter shows color-coded guidance (red < 100, yellow < 250, green 250+)
- Stats endpoint includes `byTag` breakdown alongside `byCategory` and `byVenue`
- Analytics summary includes `revenue_per_attendee` metric
- Dashboard `/upcoming` accepts `?limit=` param (default 5, max 50)
- Dashboard `/attention` accepts `?limit=` param (default 10, max 50)
- Sync `/pull` accepts `?platform=meetup|eventbrite|headfirst` to pull from a single platform
- React ErrorBoundary wraps all routes in App.tsx
- Database migration v14 adds indexes on all foreign key columns (event_id) and commonly filtered columns (start_time, status)
- Dashboard health, attention, and week endpoints use batch queries instead of per-event N+1 queries
- Event cascade delete now includes sync_log cleanup
- Validation enforces max lengths: description (5000), venue (500), category (100), title (200)
- All frontend pages use ListSkeleton loading states and cancelled-flag cleanup in useEffect hooks
- Event duration and end_time auto-sync in EventDetailPage (changing one computes the other)
- All pages use cancelled-flag cleanup pattern for unmount safety
- EventDetailPage warns before navigating away with unsaved changes (beforeunload + dirty indicator on save button)
- Event store getAll() uses batch loading for platforms, photos, notes, and checklist counts (eliminates N+1)
- EventCard shows checklist progress badges and notes count when data is present
- SyncLogPage and ServicesPage have consistent error banners with retry buttons
- Sync error messages include platform context for easier debugging
- Checklist reorder route registered before `:itemId` route to prevent Express param capture shadowing
- Services disconnect cascade-deletes related data (notes, checklist, photos, scores, etc.) when removing synced events
- All batch endpoints validate individual IDs are non-empty strings
- Batch category validates max 100 chars, batch venue validates max 500 chars
- Import/json sanitizes numeric fields (price, capacity, duration) to valid ranges and truncates strings
- Notes author truncated to 100 chars, score suggestions validated as array
- Quick-create and generator/save enforce title (200) and description (5000) length limits
- ActivityTimeline component on event detail page shows event history (creation, notes, sync, scores, platform links)
- Clone operation uses db.transaction() for atomic tag/checklist copy
- Batch reschedule validates date arithmetic (end_time > start_time, duration 1-1440)
- Per-event photo limit enforced at 50 photos (photo/auto endpoint, batch operations)
- Generator ideas field sanitizes length to prevent excessively long values
- Consistent ID type validation across all batch endpoints (readiness, archive now match status/category/venue pattern)
- Dashboard includes HealthSection (event health scores 0-100, sorted worst-first) and PortfolioSection (category breakdown table, calendar gap warnings)
- AnalyticsPage has 5 tabs: Insights, Data Explorer, Pricing, Venues, ROI — all wired to backend endpoints
- PricingTab shows price range fill rates, revenue-per-attendee by platform
- VenueTab shows venue overview with scores and per-venue/platform performance
- ROITab shows top events leaderboard, monthly revenue trends, platform efficiency
- EventsPage supports multi-select with batch operations toolbar (set status, set category, delete)
- EventsPage has JSON import modal supporting paste or .json file upload with results summary
- CalendarPage retry handler properly extracted to reusable load function (no stale cancelled flag)
- Analytics test coverage: 36 tests including pricing/venue/ROI query validation (750 total)
