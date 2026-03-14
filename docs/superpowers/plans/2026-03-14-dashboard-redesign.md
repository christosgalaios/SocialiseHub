# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current dashboard with an actionable command center showing attention items, upcoming events, performance snapshot, and AI suggestions.

**Architecture:** Four new API endpoints under `/api/dashboard/` serve data to four corresponding React components. DashboardPage is fully rewritten. AI suggestions use the two-step Claude bridge pattern (POST returns prompt, PUT stores parsed result). New `dashboard_suggestions` table for caching.

**Tech Stack:** React 19, Express 5, SQLite (better-sqlite3), Vitest

**Spec:** `docs/superpowers/specs/2026-03-14-dashboard-redesign-design.md`

---

## Task 1: Migration v7 + dashboard API routes

**Files:**
- Modify: `src/data/database.ts` — add migration v7
- Create: `src/routes/dashboard.ts` — all 6 endpoints
- Modify: `src/app.ts` — register dashboard routes

### Migration v7
Add after migration v6 in `runMigrations()`:
```typescript
if (currentVersion < 7) {
  db.exec(`CREATE TABLE IF NOT EXISTS dashboard_suggestions (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    suggestions_json TEXT NOT NULL,
    generated_at TEXT NOT NULL
  )`);
  db.pragma('user_version = 7');
}
```

### Dashboard routes
Create `src/routes/dashboard.ts` with `createDashboardRouter(db, eventStore)`:

**GET /attention** — queries events with problems:
- LEFT JOIN platform_events, event_photos, event_scores
- Base filter: `status != 'cancelled' AND start_time > datetime('now', '-7 days')`
- Check each problem type, return array of items with eventId, title, problem, urgency, platforms, date

**GET /upcoming** — next 5 events:
- WHERE `start_time > datetime('now')` ORDER BY start_time ASC LIMIT 5
- Compute readiness (7 checks), photoCount, platforms, timeUntil

**GET /performance** — headline stats:
- upcomingCount from events table
- attendees/revenue last 30 days vs prev 30 days from platform_events (WHERE date < datetime('now'))
- Trend: up/down/flat based on 10% threshold

**POST /suggestions** — compose AI prompt from event data + performance, return `{ prompt }`

**PUT /suggestions** — store `{ suggestions }` JSON in dashboard_suggestions

**GET /suggestions** — return cached suggestions or `{ suggestions: null }`

Register in `src/app.ts` at `/api/dashboard` before the 404 catch-all (line 98).

- [ ] **Step 1: Implement migration + all routes**
- [ ] **Step 2: Register in app.ts**
- [ ] **Step 3: Commit**

```bash
git add src/data/database.ts src/routes/dashboard.ts src/app.ts
git commit -m "feat: add dashboard API routes (attention, upcoming, performance, suggestions)"
```

---

## Task 2: Dashboard API client

**Files:**
- Create: `client/src/api/dashboard.ts`

Functions:
```typescript
getAttentionItems() → { items, count }
getUpcomingEvents() → { events }
getPerformance() → { upcomingCount, attendeesLast30, attendeesTrend, revenueLast30, revenueTrend, avgFillRate }
getSuggestions() → { suggestions, generatedAt } | { suggestions: null }
generateSuggestionsPrompt() → { prompt }
storeSuggestions(suggestions) → void
```

All follow the existing `fetch → json<T>` pattern from `client/src/api/events.ts`.

- [ ] **Step 1: Create API client**
- [ ] **Step 2: Commit**

```bash
git add client/src/api/dashboard.ts
git commit -m "feat: add dashboard API client functions"
```

---

## Task 3: Dashboard section components

**Files:**
- Create: `client/src/components/dashboard/AttentionSection.tsx`
- Create: `client/src/components/dashboard/UpcomingSection.tsx`
- Create: `client/src/components/dashboard/PerformanceSection.tsx`
- Create: `client/src/components/dashboard/SuggestionsSection.tsx`

### AttentionSection
- Props: `items: AttentionItem[]`
- Shows cards with problem badge (red/orange/grey by urgency), event title, platform badges, date
- Click navigates to `/events/:eventId`
- Empty state: green "All events look good" banner

### UpcomingSection
- Props: `events: UpcomingEvent[]`
- Shows cards with title, venue, countdown, readiness bar (X/7), platform badges
- Missing items as small red text
- Empty state: "No upcoming events — create one with Magic ✦" button

### PerformanceSection
- Props: performance data object
- 4 mini cards: Upcoming, Attendees 30d, Revenue 30d, Fill Rate
- Trend arrows: green ↑, red ↓, grey →
- "View Analytics →" link

### SuggestionsSection
- Props: `suggestions`, `onRefresh`, `loading`
- Cards with text + action button (Create Event / Go / info only)
- "Refresh" button, timestamp, loading spinner
- Handles Claude bridge flow: calls generateSuggestionsPrompt → sendPromptToClaude → storeSuggestions
- Web fallback: copy prompt to clipboard

- [ ] **Step 1: Create all 4 components**
- [ ] **Step 2: Commit**

```bash
git add client/src/components/dashboard/
git commit -m "feat: add dashboard section components"
```

---

## Task 4: Rewrite DashboardPage

**Files:**
- Modify: `client/src/pages/DashboardPage.tsx` — full rewrite

Loads all 4 data sources in parallel on mount:
```typescript
const [attention, upcoming, performance, suggestions] = await Promise.all([
  getAttentionItems(), getUpcomingEvents(), getPerformance(), getSuggestions()
]);
```

Layout: 4 sections stacked vertically in priority order:
1. AttentionSection (if items > 0, otherwise green banner)
2. UpcomingSection
3. PerformanceSection
4. SuggestionsSection

Keep the sync button in the header. Match existing app light theme.

- [ ] **Step 1: Rewrite DashboardPage**
- [ ] **Step 2: Build and verify**

Run: `npm run build:all`

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/DashboardPage.tsx
git commit -m "feat: rewrite dashboard as actionable command center"
```

---

## Task 5: Integration test

- [ ] **Step 1: Run tests**
Run: `npx vitest run`

- [ ] **Step 2: Build**
Run: `npm run build:all`

- [ ] **Step 3: Manual verify in browser**
- Dashboard shows 4 sections
- Attention items link to event pages
- Upcoming events show readiness
- Performance cards show numbers
- Suggestions section has Refresh button

- [ ] **Step 4: Commit if fixes needed**
