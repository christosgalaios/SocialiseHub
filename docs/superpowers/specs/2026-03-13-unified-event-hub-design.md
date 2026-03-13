# Phase 1: Unified Event Hub — Design Spec

**Date:** 2026-03-13
**Status:** Approved (v2 — post-review)
**Scope:** Event creation, publishing, syncing, and unified dashboard across Meetup, Eventbrite, and Headfirst Bristol.

---

## 1. Problem

Socialise manages events across three platforms (Meetup, Eventbrite, Headfirst Bristol) with no unified view. Events are created independently on each platform, making it impossible to see the full picture of the business from one place. Publishing is manual and error-prone.

## 2. Goals

1. **Unified dashboard** — See every event across all connected platforms in one view, whether created in SocialiseHub or directly on the platform.
2. **Multi-platform publishing** — Create an event once, publish to one or more platforms simultaneously.
3. **OAuth connection flows** — Connect Meetup and Eventbrite accounts via OAuth2; connect Headfirst via credentials.
4. **Edit & sync** — Update events in SocialiseHub and push changes to connected platforms.
5. **Local-first storage** — SQLite database replacing JSON files, with proper schema and migrations.
6. **Web-mode server** — Express + Vite running locally, testable in Chrome.

## 3. Non-Goals (Phase 2)

- Social media integrations (Instagram, TikTok, Facebook)
- AI-powered autonomous event generation
- Market analysis and competitor scraping
- Photo/media management and auto-selection
- Analytics dashboard

## 4. Architecture

### 4.1 System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend (Vite)                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │Dashboard │ │Event Edit│ │Services  │ │  Sync Log │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘  │
│       └─────────────┴────────────┴─────────────┘        │
│                         │ REST API                       │
├─────────────────────────┼───────────────────────────────┤
│                  Express Backend                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │Events API│ │Auth API  │ │Sync API  │ │Services   │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘  │
│       └─────────────┴────────────┴─────────────┘        │
│                         │                                │
│  ┌──────────────────────┴──────────────────────────┐    │
│  │           Platform Clients Layer                 │    │
│  │  ┌─────────┐  ┌───────────┐  ┌───────────────┐  │    │
│  │  │ Meetup  │  │Eventbrite │  │  Headfirst    │  │    │
│  │  │ GraphQL │  │  REST v3  │  │  Web Scraping │  │    │
│  │  └─────────┘  └───────────┘  └───────────────┘  │    │
│  └──────────────────────────────────────────────────┘    │
│                         │                                │
│  ┌──────────────────────┴──────────────────────────┐    │
│  │              SQLite (better-sqlite3)             │    │
│  │  events │ platform_events │ services │ sync_log  │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Database Schema (SQLite)

**`events`** — Internal events created in SocialiseHub.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| title | TEXT NOT NULL | |
| description | TEXT | |
| start_time | TEXT NOT NULL | ISO 8601 datetime with timezone (Europe/London) |
| end_time | TEXT | ISO 8601 datetime with timezone |
| duration_minutes | INTEGER | Fallback if no end_time (default 120) |
| venue | TEXT | |
| price | REAL | 0 = free |
| capacity | INTEGER | |
| image_url | TEXT | |
| status | TEXT | draft / published / cancelled |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

**`platform_events`** — Links internal events to platform-specific external events. Also stores events fetched from platforms that weren't created in SocialiseHub.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| event_id | TEXT FK → events.id | NULL if imported from platform |
| platform | TEXT NOT NULL | meetup / eventbrite / headfirst |
| external_id | TEXT NOT NULL | Platform's event ID |
| external_url | TEXT | Link to event on platform |
| title | TEXT | Platform-side title (may differ) |
| date | TEXT | Platform-side date |
| venue | TEXT | Platform-side venue |
| status | TEXT | active / cancelled / past |
| raw_data | TEXT | JSON blob of full platform response |
| synced_at | TEXT | Last sync timestamp |
| published_at | TEXT | When first published |

**UNIQUE** constraint on `(platform, external_id)`.

**`services`** — Platform connection credentials.

| Column | Type | Notes |
|--------|------|-------|
| platform | TEXT PK | meetup / eventbrite / headfirst |
| connected | INTEGER | 0/1 boolean |
| access_token | TEXT | Encrypted at rest |
| refresh_token | TEXT | For OAuth token refresh |
| token_expires_at | TEXT | ISO timestamp |
| extra | TEXT | JSON blob for platform-specific fields |
| connected_at | TEXT | ISO timestamp |

**`sync_log`** — Audit trail for sync operations.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTOINCREMENT | |
| platform | TEXT NOT NULL | |
| action | TEXT | pull / push / publish / update |
| event_id | TEXT | Internal event if applicable |
| external_id | TEXT | Platform event ID |
| status | TEXT | success / error |
| message | TEXT | Error details or summary |
| created_at | TEXT | ISO timestamp |

### 4.3 Platform Clients

Each platform client implements a common interface. The existing clients (`MeetupClient`, `EventbriteClient`, `HeadfirstClient`) and the `EventCreator` agent will be refactored to implement this interface. The `EventCreator` agent's `publish()` orchestration logic moves into a new `PublishService` class that coordinates across platform clients and the sync log. The existing `EventCreator` class is removed.

```typescript
interface PlatformClient {
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

**Field mappings per platform:**

| SocialiseHub field | Meetup GraphQL | Eventbrite REST v3 |
|--------------------|----------------|-------------------|
| `title` | `title` | `event.name.html` |
| `description` | `description` | `event.description.html` |
| `start_time` | `dateTime` (ISO 8601) | `event.start.utc` + `event.start.timezone` |
| `end_time` | `duration` (calculated) | `event.end.utc` + `event.end.timezone` |
| `venue` | `venueId` (lookup required) | `event.venue_id` (lookup required) |
| `price` | free (Meetup handles tickets externally) | `ticket_classes[].cost` |
| `capacity` | `rsvpLimit` | `ticket_classes[].quantity_total` |

**Eventbrite three-step publish flow:** create event (draft) → create ticket class → publish event. All three steps required before an event is live.

**Headfirst form submission flow:** GET form page → extract CSRF token and hidden fields → POST with event data + tokens. Session cookies must be maintained across requests.

#### Meetup (GraphQL API)

- **Auth:** OAuth2 via `secure.meetup.com/oauth2/authorize`
- **API:** GraphQL at `https://api.meetup.com/gql`
- **Key operations:**
  - `createEvent` mutation → creates event in user's group
  - `editEvent` mutation → updates existing event
  - `getGroupEvents` query → fetches all events for the connected group
- **Requires:** `MEETUP_CLIENT_ID`, `MEETUP_CLIENT_SECRET` env vars
- **Requires:** `MEETUP_CLIENT_ID`, `MEETUP_CLIENT_SECRET` env vars
- **Prerequisite:** Meetup's GraphQL API and event_management scope require an approved OAuth consumer application. Must register at meetup.com/api and may require approval time.
- **Note:** Need to fetch user's groups on first connect to let them choose which group to publish to. Store selected group in `services.extra`.

#### Eventbrite (REST v3 API)

- **Auth:** OAuth2 via `eventbrite.com/oauth/authorize`
- **API:** REST at `https://www.eventbriteapi.com/v3/`
- **Key operations:**
  - `POST /organizations/{id}/events/` → create event
  - `POST /events/{id}/` → update event
  - `GET /organizations/{id}/events/` → list events
  - `POST /events/{id}/publish/` → make event live
- **Requires:** `EVENTBRITE_CLIENT_ID`, `EVENTBRITE_CLIENT_SECRET` env vars
- **Note:** Events are created as drafts first, then explicitly published. Need to fetch organization ID on first connect.

#### Headfirst Bristol (Web Form Submission)

- **Auth:** Email/password credentials (no OAuth)
- **Method:** HTTP form submission mimicking the browser
- **Key operations:**
  - POST to event submission form with event details
  - Scrape user's submitted events page to list existing events
- **Note:** This is the most fragile integration since it depends on HTML structure. Should include health-check that validates the expected form fields still exist.

### 4.4 Sync Strategy

**Pull (fetch from platforms):**
- On dashboard load, fetch events from all connected platforms
- Store in `platform_events` table with `synced_at` timestamp
- Events without a matching `event_id` are displayed as "external" (created outside SocialiseHub)
- "Claim" functionality deferred to Phase 2 — external events are read-only for now

**Push (publish to platforms):**
- When user creates/updates an event and selects target platforms
- SocialiseHub calls each platform client's `createEvent`/`updateEvent`
- Results stored in `platform_events` and logged in `sync_log`

**Conflict handling:**
- SocialiseHub is the source of truth for events created here
- Platform-side changes to SocialiseHub-published events are overwritten on next push
- External events (created on platform) are read-only in the dashboard

### 4.5 OAuth Flow (Meetup & Eventbrite)

The existing auth router (`src/routes/auth.ts`) is already well-structured. Changes needed:

1. **Token refresh** — Add automatic token refresh when `token_expires_at` is approaching. Each platform client checks token validity before API calls.
2. **Post-connect setup** — After OAuth completes, immediately fetch the user's organization/group and store it (needed for API calls).
3. **Disconnect cleanup** — Revoke tokens on disconnect where the platform supports it.

### 4.6 Headfirst Credentials Flow

Since Headfirst uses email/password:

1. Frontend shows a credentials form (email + password fields)
2. Backend receives credentials, attempts a test login to headfirstbristol.co.uk
3. If successful, stores encrypted credentials and marks as connected
4. On failure, returns error to frontend

## 5. Frontend Changes

### 5.1 Unified Dashboard (new default page)

The main dashboard replaces the current Events page as the landing view:

- **Summary cards** at top: total events, events this week, events this month, by platform
- **Event timeline** — All events (internal + external) sorted by date, with platform badges
- **Filter bar** — By platform, by status (upcoming/past/draft), by date range
- **Each event row** shows: title, date, venue, platform badges, status, actions (edit/view/sync)
- External events (from platform sync) shown with a subtle "external" indicator
- Click any event → Event Detail page

### 5.2 Event Detail Page (enhanced)

- Current form fields preserved (title, description, date, time, venue, price, capacity)
- **Platform selector** — Checkboxes for which platforms to publish to
- **Platform status panel** — Shows publish status per platform (draft/published/error), with links to the event on each platform
- **Sync button** — Pull latest from platforms, show diff if changed
- **Publish button** — Pushes to all selected platforms

### 5.3 Services Page (enhanced)

- OAuth connect buttons for Meetup and Eventbrite (opens popup/new tab)
- Credentials form for Headfirst
- Connection status with "last synced" timestamp
- **Post-connect setup:** After Meetup OAuth, show group selector. After Eventbrite OAuth, confirm organization.
- Disconnect button with confirmation

### 5.4 Sync Log Page (new)

Simple table showing recent sync operations:
- Timestamp, platform, action (pull/push/publish), event title, status, error message
- Useful for debugging and auditing

## 6. API Changes

### New Endpoints

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/dashboard/summary` | GET | Aggregated stats for dashboard cards |
| `GET /api/events/all?limit=50&offset=0&platform=&status=` | GET | Paginated unified view (internal + external) |
| `POST /api/events/:id/sync` | POST | Pull latest from platforms for this event |
| `POST /api/sync/pull` | POST | Pull all events from all connected platforms |
| `GET /api/sync/log` | GET | Recent sync log entries |
| `POST /api/services/:platform/setup` | POST | Post-OAuth setup (select group/org) |

### Modified Endpoints

| Route | Change |
|-------|--------|
| `POST /api/events/:id/publish` | Real platform API calls instead of stubs |
| `PUT /api/events/:id` | Optionally push updates to connected platforms |
| `GET /api/services` | Include last sync time and connection health |

## 7. Migration Path

The transition from JSON to SQLite should be seamless:

1. Add `better-sqlite3` dependency
2. Create `src/data/database.ts` with schema creation and migration support
3. Create new store classes (`SqliteEventStore`, `SqliteServiceStore`) implementing the same interfaces
4. Add a one-time migration that reads existing JSON files and imports into SQLite
5. Update `app.ts` to use SQLite stores
6. Remove JSON store code once migration is verified

## 8. Error Handling

- All platform API calls wrapped in try/catch with structured error logging to `sync_log`
- Token expiry → automatic refresh → retry once → fail with clear error
- Platform API rate limits → exponential backoff with max 3 retries
- Headfirst form changes → health check on connect, clear error message if structure changed
- Network failures → timeout after 30s, log error, don't block other platforms

## 9. Security

- OAuth tokens and Headfirst credentials encrypted at rest in SQLite using AES-256-GCM via `node:crypto`
- Encryption key derived via PBKDF2 from `os.hostname()` + `os.userInfo().username` with a static salt stored in the app
- Key cached in memory at runtime (derived once on startup)
- Credential encryption must be implemented before Headfirst credentials flow is enabled
- OAuth error messages in callback HTML are HTML-escaped to prevent reflected XSS
- No credentials ever returned in API responses (current behavior preserved)
- CSRF protection on OAuth callbacks (existing state token approach)
- All platform API calls made server-side, never from the browser

## 10. Testing Strategy

- **Unit tests:** Platform client methods with mocked HTTP responses
- **Integration tests:** API routes with in-memory SQLite database
- **OAuth flow:** Mock token exchange, verify credential storage
- **Sync logic:** Test pull/push/conflict scenarios with fixtures
- **Target:** Maintain 80% coverage threshold

## 11. File Changes Summary

### New Files
- `src/data/database.ts` — SQLite setup, schema, migrations
- `src/data/sqlite-event-store.ts` — Event CRUD on SQLite
- `src/data/sqlite-service-store.ts` — Service connections on SQLite
- `src/data/migrate-json.ts` — One-time JSON → SQLite migration
- `src/tools/platform-client.ts` — Shared `PlatformClient` interface
- `src/routes/sync.ts` — Sync and dashboard endpoints
- `client/src/pages/DashboardPage.tsx` — Unified dashboard
- `client/src/pages/SyncLogPage.tsx` — Sync audit log
- `client/src/components/PlatformSelector.tsx` — Multi-platform checkbox
- `client/src/components/DashboardSummary.tsx` — Stats cards
- `client/src/components/EventTimeline.tsx` — Unified event list
- `client/src/components/GroupSelector.tsx` — Meetup group picker
- `client/src/components/CredentialsForm.tsx` — Headfirst login form

### Modified Files
- `package.json` — Add `better-sqlite3`
- `src/app.ts` — Switch to SQLite stores, add sync routes
- `src/shared/types.ts` — Add new types (PlatformEvent, SyncLogEntry, DashboardSummary)
- `src/tools/meetup.ts` — Real GraphQL API implementation
- `src/tools/eventbrite.ts` — Real REST API implementation
- `src/tools/headfirst.ts` — Real web form submission
- `src/routes/events.ts` — Use SQLite store, real publishing
- `src/routes/auth.ts` — Add token refresh, post-connect setup
- `src/routes/services.ts` — Include sync status
- `client/src/App.tsx` — Add dashboard route, update navigation
- `client/src/pages/EventDetailPage.tsx` — Platform selector, sync status
- `client/src/pages/ServicesPage.tsx` — OAuth buttons, credentials form, group selector
- `client/src/api/events.ts` — New API client functions

### Removed Files
- `src/data/store.ts` — Replaced by SQLite stores (after migration verified)
- `src/agents/event-creator.ts` — Replaced by PublishService
- `data/events.json` — Replaced by SQLite
- `data/services.json` — Replaced by SQLite

## 12. Implementation Order

Dependencies flow top-down — each step requires the one above it:

1. **Database layer** — `better-sqlite3`, schema, `database.ts`, encryption util, SQLite stores, JSON migration
2. **Platform client interface** — `PlatformClient` interface, `PublishService`, updated types
3. **Platform clients** — Meetup GraphQL, Eventbrite REST, Headfirst web scraping (can be parallel)
4. **Auth enhancements** — Token refresh, post-connect setup, Headfirst credentials flow
5. **Sync engine** — Pull/push logic, sync log, dashboard summary endpoint
6. **Backend routes** — New and modified API endpoints
7. **Frontend** — Dashboard, enhanced event detail, enhanced services page, sync log
8. **Testing** — Unit tests for clients (mocked HTTP), integration tests for routes
9. **Cleanup** — Remove JSON stores, old EventCreator agent

## 13. Timezone Handling

All datetimes stored as ISO 8601 with timezone offset. The business operates in Bristol, UK — default timezone is `Europe/London` (handles GMT/BST automatically). Platform APIs receive UTC-converted times where required (Eventbrite) or timezone-aware strings (Meetup).
