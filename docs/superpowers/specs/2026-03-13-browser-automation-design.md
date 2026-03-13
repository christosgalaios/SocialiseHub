# Browser Automation Platform Integration — Design Spec

## Goal

Replace OAuth/API-based platform integrations with browser automation using Electron's built-in Chromium. The app drives a visible `WebContentsView` to interact with Meetup, Eventbrite, and Headfirst Bristol as a real user would — filling forms, clicking buttons, and scraping event data.

## Why

OAuth registration requires real domains, API credentials, and per-platform approval. Browser automation eliminates all of that. The app runs locally, uses the user's existing browser sessions, and works with any platform that has a web interface.

## Architecture

### Components

**AutomationEngine** (`src/automation/engine.ts`)
- Manages the `WebContentsView` lifecycle in the Electron main process
- Exposes a step-based execution API: navigate, waitForSelector, fill, click, evaluate, extractText
- Communicates with the renderer via IPC (`automation:start`, `automation:status`, `automation:result`)
- Handles timeouts and error recovery (pause + show view to user)

**Platform Scripts** (`src/automation/meetup.ts`, `eventbrite.ts`, `headfirst.ts`)
- Per-platform step sequences for: connect, publish, update, cancel, scrape
- Each implements the existing `PlatformClient` interface so PublishService and sync engine stay unchanged
- Scripts are arrays of `AutomationStep` objects — declarative, testable, easy to update when platform UIs change

**AutomationView** (Electron main process, inside `electron/main.ts`)
- A `WebContentsView` that renders platform websites inside the app window
- Appears on the right side when automation runs (like the Claude panel)
- Hidden by default, slides in on demand
- Read-only during script execution (user can watch but not interfere)
- Interactive during connect flow (user logs in manually)

**IPC Bridge** (`electron/preload.ts` extensions)
- `automation:start(platform, action, data)` — start an automation task
- `automation:cancel()` — cancel the running task
- `automation:resume()` — resume after user intervention (login, CAPTCHA)
- `automation:status` — stream of step updates to the renderer
- `automation:result` — final success/failure result

### Layout

The Electron window has three views:
1. **App view** (left) — the React frontend, always visible
2. **Automation view** (right) — platform website, visible during automation
3. **Claude panel** (right, toggle) — existing Claude integration

When automation starts, the automation view replaces the Claude panel position. When automation finishes, it can hide or stay for review. The Claude panel and automation view never show simultaneously.

### Process Boundary: Express ↔ Electron Main

The `PlatformClient` interface is consumed by `PublishService` in the Express server layer, but browser automation requires Electron main process APIs (`WebContentsView`, `webContents.executeJavaScript`). These live in different contexts.

**Solution:** The automation-backed `PlatformClient` implementations don't drive the browser directly. Instead, they send requests to the Electron main process via an internal HTTP bridge:

1. AutomationEngine registers an internal Express endpoint (`/internal/automation`) on app startup
2. The automation `PlatformClient` implementations call this endpoint with the task details
3. The main process receives the request, drives the WebContentsView, and responds with the result
4. The `PlatformClient` method resolves its Promise with the response

This keeps the `PlatformClient` interface unchanged — async methods that return Promises — while the actual browser work happens in the main process. The internal endpoint is only bound to `127.0.0.1` and not exposed externally.

Alternative considered: Move `PublishService` to the main process. Rejected because it would require restructuring the entire Express routing layer.

### Concurrency: Sequential Automation

Browser automation tasks run **one at a time**. A single `WebContentsView` drives one platform at a time.

When publishing to multiple platforms, `PublishService` must serialize instead of using `Promise.allSettled()`. The automation-backed PublishService processes platforms sequentially: Meetup → Eventbrite → Headfirst. Each completes before the next starts.

This is acceptable because:
- Browser automation is inherently sequential (one view, one page at a time)
- Multi-platform publish is infrequent (a few times per event)
- The user watches each platform publish in sequence, which is clearer than parallel

### Session Persistence

The AutomationView uses a **separate persistent session partition**: `session.fromPartition('persist:automation')`. This isolates platform cookies from the Claude panel's session, preventing any cross-contamination. The `persist:` prefix ensures cookies are saved to disk across app restarts.

### Security

Automation scripts execute JavaScript in the context of third-party platform pages via `webContents.executeJavaScript()`. This bypasses CSP restrictions and has full access to the user's session on those platforms. This is acceptable because:
- The app runs locally on the user's machine
- Only trusted, hardcoded scripts are executed (no user-provided code)
- The automation session is isolated from the rest of the app via partition
- The user can see everything the automation does in the visible view

The AutomationView's `webContents.setUserAgent()` is set to a standard Chrome user-agent string to avoid bot detection.

## Flows

### Connect Flow

1. User clicks "Connect" on a platform card in the Services page
2. Frontend sends IPC: `automation:start({ platform: 'meetup', action: 'connect' })`
3. Main process shows AutomationView, navigates to platform homepage
4. AutomationEngine checks login state (looks for logged-in DOM indicators)
5. **If not logged in:** View stays open, user logs in manually. Engine polls for login state.
6. **If logged in:** Engine extracts user info (name, group URL), marks service as connected in SQLite
7. AutomationView hides, Services page updates to show "Connected"

### Publish Flow

1. User clicks "Publish to Meetup" on an event
2. Frontend sends IPC: `automation:start({ platform: 'meetup', action: 'publish', data: eventData })`
3. AutomationView slides in, navigates to create-event page
4. Engine executes the platform script step by step:
   - Fill title field → status update "Filling title..."
   - Fill description → status update "Filling description..."
   - Set date/time → status update "Setting date..."
   - Set venue, capacity, etc.
   - Click publish button
   - Wait for success confirmation
   - Extract event URL from the result page
5. Result sent back via IPC, stored in platform_events table
6. AutomationView hides (or stays for user to review)

### Scrape/Sync Flow

1. User clicks "Sync" on the dashboard (or it runs on schedule)
2. For each connected platform:
   - Navigate to the user's events list page
   - Wait for event cards/rows to load
   - Extract structured data: title, date, venue, URL, attendee count
   - Return as `PlatformEvent[]`
3. Upsert results into platform_events table
4. Update dashboard with unified event timeline

### Error Handling

Error handling is built into the AutomationEngine from the start, not added later.

- **Selector not found (timeout):** Pause automation, keep view visible, show error message to user ("Couldn't find the title field — the page may have changed"). User can cancel or retry. Default timeout: 10 seconds per step. Eventbrite multi-step wizard uses 15 seconds.
- **Not logged in during publish:** Redirect to connect flow. Engine enters `waiting_for_user` state. User logs in manually. User clicks "Resume" in the app (sends `automation:resume` IPC). Engine re-runs the publish steps from the beginning.
- **Network error:** Retry once, then report failure.
- **CAPTCHA/2FA:** Engine enters `waiting_for_user` state, view stays interactive. User solves the challenge. User clicks "Resume" to continue. Engine re-checks login state before proceeding.

## Platform Script Details

### Meetup

**Connect check:** Navigate to `meetup.com`, check for avatar/profile element in nav bar. Extract group URL name from the user's profile/groups page.

**Publish:** Navigate to `meetup.com/{groupUrlname}/events/create/`.

Field mapping:
- `title` → title input field
- `description` → rich text editor. **Known risk:** Meetup uses a complex editor (ProseMirror-like). Strategy: use `evaluate` to set the editor's internal content via its API or dispatch input events. Requires prototyping — may need `innerHTML` + synthetic input events as fallback.
- `start_time` → date picker + time picker (split into date and time components)
- `duration_minutes` → duration selector
- `venue` → venue search autocomplete (type venue name, wait for suggestions, click first match)
- `capacity` → attendee limit field
- `price` → Meetup uses free/paid RSVP toggle, not a price field. If `price > 0`, enable paid RSVP and set the amount. If `price === 0`, keep as free.
- `imageUrl` → Skip for now. Image upload requires file picker interaction which is complex. Phase 2 feature.

**External ID extraction:** After publish, Meetup redirects to the event page. Parse the URL pattern `meetup.com/{group}/events/{eventId}/` to extract `externalId`. The `externalUrl` is the full redirect URL.

**Scrape:** Navigate to `meetup.com/{groupUrlname}/events/`. Parse event cards: title, date, venue, RSVP count, event URL. Extract `externalId` from each event's URL. Handle pagination if needed.

**Required user config:** Group URL name (detected during connect or entered manually).

### Eventbrite

**Connect check:** Navigate to `eventbrite.com`, check for logged-in nav element. Extract organization ID from the dashboard URL or profile.

**Publish:** Eventbrite has a multi-step event creation wizard. Navigate to `eventbrite.com/create`. Step timeout: 15 seconds (wizard transitions are slow).

Field mapping:
- `title` → "Event Title" field on step 1
- `description` → rich text editor (similar risk to Meetup)
- `start_time` / `duration_minutes` → date/time pickers on the schedule step
- `venue` → location step (type venue, select from suggestions)
- `capacity` → ticket quantity on the tickets step
- `price` → ticket price field. If `price === 0`, select "Free" ticket type.
- `imageUrl` → Skip for now (same as Meetup).

**External ID extraction:** After publish, Eventbrite redirects to the event management page. URL pattern: `eventbrite.com/myevent?eid={eventId}`. Extract `externalId` from the `eid` parameter.

**Scrape:** Navigate to `eventbrite.com/organizations/events/`. Parse event table: title, date, status, ticket sales, URL. Extract `externalId` from each event's URL.

**Required user config:** Organization ID (detected during connect).

### Headfirst Bristol

**Connect check:** Navigate to `headfirstbristol.co.uk`, check for logged-in indicator.

**Publish:** Navigate to event submission form. Headfirst uses a simple HTML form — no complex editor issues.

Field mapping:
- `title` → title field
- `description` → textarea (plain text)
- `start_time` → date and time fields
- `venue` → venue dropdown or text field
- `price` → price field
- `imageUrl` → Skip for now.

**External ID extraction:** After submit, extract from the confirmation page URL or success message.

**Scrape:** Navigate to user's events listing. Parse event entries. Extract IDs from URLs.

**Required user config:** None beyond login session.

## Types

```typescript
interface AutomationStep {
  action: 'navigate' | 'waitForSelector' | 'fill' | 'click' | 'evaluate' | 'extractText' | 'waitForNavigation' | 'pause';
  selector?: string;
  value?: string;
  url?: string;
  script?: string; // for evaluate
  timeout?: number;
  description: string; // shown to user: "Filling event title..."
}

interface AutomationTask {
  platform: PlatformName;
  action: 'connect' | 'publish' | 'update' | 'cancel' | 'scrape';
  data?: SocialiseEvent;
  steps: AutomationStep[];
}

interface AutomationResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>; // extracted data (event URL, scraped events, etc.)
}

interface AutomationStatus {
  step: number;
  totalSteps: number;
  description: string;
  state: 'running' | 'paused' | 'waiting_for_user' | 'completed' | 'failed';
}
```

## What Gets Removed

- `src/routes/auth.ts` — OAuth router (entire file)
- `src/data/crypto.ts` — AES encryption for credentials (entire file)
- `src/tools/meetup.ts` — API client (replaced by automation script)
- `src/tools/eventbrite.ts` — API client (replaced by automation script)
- `src/tools/headfirst.ts` — Web scraping client (replaced by automation script)
- `railway.toml` — No deployment needed (if present)
- OAuth-related types in `src/shared/types.ts`: `PlatformAuthType`, `PLATFORM_AUTH_TYPES` — replace with browser-session-based model
- OAuth-related client code: `startOAuth`, `watchOAuthStatus`, `getOAuthStatus` from `client/src/api/events.ts`
- OAuth setup UI in `ServicesPage.tsx`

## What Stays

- SQLite database and all stores (events, services, platform_events, sync_log)
- `PublishService` orchestrator (platform clients just swap implementation)
- `PlatformClient` interface (automation scripts implement it)
- All frontend pages (Dashboard, Events, Event Generator)
- Express API routes for events, services, sync
- Vite + React frontend

## What Changes

- `ServicesPage.tsx` — Simplified: Connect button triggers automation view, no OAuth/credential forms
- `electron/main.ts` — Add AutomationView management alongside existing views
- `electron/preload.ts` — Add automation IPC channels
- `src/tools/publish-service.ts` — No change to interface, but clients are now automation-backed
- `client/src/api/events.ts` — Remove OAuth functions, add automation trigger functions

## New Files

```
src/automation/
  engine.ts          — AutomationEngine: step execution, view management, IPC
  types.ts           — AutomationStep, AutomationTask, AutomationResult, AutomationStatus
  meetup.ts          — Meetup platform scripts (connect, publish, scrape)
  eventbrite.ts      — Eventbrite platform scripts
  headfirst.ts       — Headfirst platform scripts
```

## Testing

- Platform scripts are declarative step arrays — testable without a real browser
- AutomationEngine can be tested with a mock WebContentsView
- Integration tests use Electron's test utilities to drive the full flow
- Scraping tests use saved HTML snapshots of platform pages

## Implementation Order

1. Types + AutomationEngine with error handling + internal HTTP bridge (foundation — error recovery is core, not an afterthought)
2. AutomationView layout in Electron main process + IPC bridge + session partition
3. Meetup platform scripts (connect + publish + scrape)
4. Wire into PublishService (sequential execution) and sync engine
5. Update ServicesPage UI
6. Eventbrite platform scripts
7. Headfirst platform scripts
8. Remove old OAuth/API/crypto code and types
