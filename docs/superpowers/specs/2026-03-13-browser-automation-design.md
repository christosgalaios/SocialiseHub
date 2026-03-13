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
- `automation:status` — stream of step updates to the renderer
- `automation:result` — final success/failure result

### Layout

The Electron window has three views:
1. **App view** (left) — the React frontend, always visible
2. **Automation view** (right) — platform website, visible during automation
3. **Claude panel** (right, toggle) — existing Claude integration

When automation starts, the automation view replaces the Claude panel position. When automation finishes, it can hide or stay for review. The Claude panel and automation view never show simultaneously.

### Session Persistence

Electron's default session persists cookies to disk. The automation view shares this session, so logging into Meetup once persists across app restarts. No credentials are stored by the app — the browser handles authentication natively.

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

- **Selector not found (timeout):** Pause automation, keep view visible, show error message to user ("Couldn't find the title field — the page may have changed"). User can cancel or retry.
- **Not logged in during publish:** Redirect to connect flow, then resume publish.
- **Network error:** Retry once, then report failure.
- **CAPTCHA/2FA:** Pause automation, show view to user, let them solve it, then resume.

## Platform Script Details

### Meetup

**Connect check:** Navigate to `meetup.com`, check for avatar/profile element in nav bar.

**Publish:** Navigate to `meetup.com/{groupUrlname}/events/create/`. Fill: title, description (rich text — may need `innerHTML` injection), date picker, time picker, venue search, duration, attendee limit. Click publish. Extract event URL from redirect.

**Scrape:** Navigate to `meetup.com/{groupUrlname}/events/`. Parse event cards: title, date, venue, RSVP count, event URL. Handle pagination if needed.

**Required user config:** Group URL name (detected during connect or entered manually).

### Eventbrite

**Connect check:** Navigate to `eventbrite.com`, check for logged-in nav element.

**Publish:** Eventbrite has a multi-step event creation wizard. Navigate to `eventbrite.com/create`. Step through: basic info (title, type, category), location, date/time, tickets (free/paid), publish. Each step requires waiting for the next form to load.

**Scrape:** Navigate to `eventbrite.com/organizations/events/`. Parse event table: title, date, status, ticket sales, URL.

**Required user config:** Organization ID (detected during connect).

### Headfirst Bristol

**Connect check:** Navigate to `headfirstbristol.co.uk`, check for logged-in indicator.

**Publish:** Navigate to event submission form. Fill: title, description, date, time, venue, price, category. Submit.

**Scrape:** Navigate to user's events listing. Parse event entries.

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
- `railway.toml` — No deployment needed
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

1. AutomationEngine + types + IPC bridge (foundation)
2. AutomationView layout in Electron main process
3. Meetup platform scripts (connect + publish + scrape)
4. Wire into PublishService and sync engine
5. Update ServicesPage UI
6. Eventbrite platform scripts
7. Headfirst platform scripts
8. Remove old OAuth/API code
9. Error handling and edge cases
