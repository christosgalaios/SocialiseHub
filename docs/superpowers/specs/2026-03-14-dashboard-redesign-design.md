# SocialiseHub — Dashboard Redesign: Actionable Command Center

**Date:** 2026-03-14
**Status:** Draft
**Depends on:** Previous specs (events sync, analytics, scoring). Requires migration v1 (sync_status column on events) to be applied.

---

## Overview

Replace the current dashboard (raw summary cards + event timeline) with an actionable command center showing problems, upcoming events, performance snapshot, and AI suggestions — in that priority order.

---

## Section 1: Attention Required

**Purpose:** Surface events with problems that need fixing, sorted by urgency.

**Data source:** `GET /api/dashboard/attention` — queries `events` LEFT JOINed with `platform_events`, `event_photos`, `event_scores`

**Base filter:** `events.status != 'cancelled' AND events.start_time > datetime('now', '-7 days')` — only upcoming and recently past events.

**Problem types (checked server-side):**

| Problem | Query logic | Urgency |
|---------|-------------|---------|
| Missing description | `(events.description IS NULL OR events.description = '')` AND `events.sync_status != 'local_only'` | High |
| No photos | `events.id NOT IN (SELECT event_id FROM event_photos)` AND `events.start_time > datetime('now')` | High |
| Low score | `event_scores.overall < 40` (LEFT JOIN — events with no score are NOT flagged) | Medium |
| Cross-platform mismatch | Event linked to 2+ `platform_events` where `LOWER(TRIM(pe.title))` values differ | Medium |
| Upcoming, no venue | `events.start_time > datetime('now')` AND `events.start_time < datetime('now', '+30 days')` AND `(events.venue IS NULL OR events.venue = '')` | High |
| Upcoming, no capacity | Same date filter AND `(events.capacity IS NULL OR events.capacity = 0)` | Low |

**Note on joins:** Use `LEFT JOIN event_scores ON event_scores.event_id = events.id` — events without a score row simply won't produce a "low score" attention item. Use `LEFT JOIN platform_events ON platform_events.event_id = events.id` for platform badge data.

**Cross-platform mismatch normalization:** `LOWER(TRIM(title))` — simple lowercase + trim. No fuzzy matching needed here since these are the same event linked to multiple platforms; if titles differ at all after normalization, it's a mismatch.

**Response shape:**
```json
{
  "items": [
    {
      "eventId": "uuid",
      "eventTitle": "Speed Friending Social",
      "problem": "missing_description",
      "problemLabel": "No description",
      "urgency": "high",
      "platforms": ["meetup"],
      "date": "2026-04-30T19:00:00Z"
    }
  ],
  "count": 3
}
```

**UI:**
- Section header: "Attention Required" with red count badge
- Cards in a horizontal scrollable row or vertical list (max 5 visible, "View all" link if more)
- Each card: event title, problem badge (red for high, orange for medium, grey for low), platform badges, relative date
- Click navigates to `/events/:eventId`
- If no problems: collapsed green banner "All events look good"

---

## Section 2: Upcoming Events

**Purpose:** Countdown view of the next events with readiness status.

**Data source:** `GET /api/dashboard/upcoming` — queries `events` WHERE `start_time > datetime('now')` ORDER BY `start_time ASC` LIMIT 5, LEFT JOINed with `platform_events` and `event_photos`

**Response shape:**
```json
{
  "events": [
    {
      "id": "uuid",
      "title": "Speed Friending Social",
      "start_time": "2026-04-30T19:00:00Z",
      "venue": "The Ostrich",
      "timeUntil": "in 3 days",
      "platforms": [{ "platform": "meetup", "published": true }],
      "readiness": { "passed": 5, "total": 7, "missing": ["photos", "capacity"] },
      "photoCount": 0
    }
  ]
}
```

**Readiness checks (7 total, computed server-side):**
1. Title set (non-empty)
2. Description set (100+ chars)
3. Start date set (always true since `start_time NOT NULL`, but included for completeness)
4. Venue set (non-empty)
5. Price set (`COALESCE(price, 0) > 0`)
6. Photos (at least 1 row in `event_photos`)
7. Capacity set (`COALESCE(capacity, 0) > 0`)

**UI:**
- Section header: "Upcoming Events"
- Cards showing: title, venue, formatted date, countdown ("in 3 days"), readiness bar (e.g., "5/7 ready"), platform badges
- Missing items shown as small red text ("needs: photos, capacity")
- Click navigates to `/events/:id`
- If no upcoming events: "No upcoming events — create one with Magic ✦" with button

---

## Section 3: Performance Snapshot

**Purpose:** Quick headline numbers with trend direction, not full charts.

**Data source:** `GET /api/dashboard/performance`

**Data sources per field:**
- `upcomingCount` — from `events` table: `SELECT COUNT(*) FROM events WHERE start_time > datetime('now')`
- `attendeesLast30` — from `platform_events` table: `SELECT COALESCE(SUM(attendance), 0) FROM platform_events WHERE date < datetime('now') AND date > datetime('now', '-30 days') AND attendance IS NOT NULL`
- `attendeesPrev30` — same but `date BETWEEN datetime('now', '-60 days') AND datetime('now', '-30 days')` (used for trend calc, not returned)
- `revenueLast30` — from `platform_events`: `SELECT COALESCE(SUM(revenue), 0) ... WHERE date < datetime('now') AND date > datetime('now', '-30 days') AND revenue IS NOT NULL`
- `revenuePrev30` — same 60-to-30 day window (for trend)
- `avgFillRate` — from `platform_events`: `AVG(CAST(attendance AS REAL) / capacity) WHERE capacity > 0 AND attendance IS NOT NULL`

**Trend calculation:** Compare last 30 vs previous 30. `up` if current > prev * 1.1, `down` if current < prev * 0.9, `flat` otherwise. If prev is 0, trend is `up` when current > 0, `flat` when current = 0.

**Response shape:**
```json
{
  "upcomingCount": 12,
  "attendeesLast30": 245,
  "attendeesTrend": "up",
  "revenueLast30": 1250.00,
  "revenueTrend": "flat",
  "avgFillRate": 78
}
```

**UI:**
- 4 mini cards in a row: Upcoming Events, Attendees (30d), Revenue (30d), Avg Fill Rate
- Each card shows the number + a small trend arrow (green up ↑, red down ↓, grey flat →)
- "View Analytics →" link below the row
- If no data: cards show 0 with "Sync to populate" hint

---

## Section 4: AI Suggestions

**Purpose:** Actionable, AI-generated recommendations based on all available data.

**Two-step pattern (same as score/optimize):**
1. `POST /api/dashboard/suggestions` — composes a prompt from event data + performance context, returns `{ prompt }`
2. Client sends prompt to Claude via `electronAPI.sendPromptToClaude`, parses JSON response
3. Client calls `PUT /api/dashboard/suggestions` with parsed suggestions to cache them
4. `GET /api/dashboard/suggestions` — returns cached suggestions from `dashboard_suggestions` table

**New table `dashboard_suggestions` (migration v7):**
```sql
CREATE TABLE IF NOT EXISTS dashboard_suggestions (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  suggestions_json TEXT NOT NULL,
  generated_at TEXT NOT NULL
)
```
The `CHECK (id = 1)` constraint ensures only one row exists (singleton).

**Suggestion generation prompt includes:**
- Upcoming event calendar (next 30 days)
- Past performance data (which event types/times work best)
- Calendar context (AI knowledge of holidays, seasons, Bristol events)
- Current attention items count and types
- Recent event history

**GET response shape:**
```json
{
  "suggestions": [
    {
      "text": "Bank Holiday Monday May 5 — great opportunity for an outdoor Bristol event.",
      "action": "create_event",
      "actionData": { "title": "Bank Holiday Outdoor Social", "suggestedDate": "2026-05-05", "category": "Outdoor" }
    },
    {
      "text": "3 upcoming events have no descriptions — fix them to improve discoverability.",
      "action": "navigate",
      "actionUrl": "/events"
    }
  ],
  "generatedAt": "2026-03-14T14:00:00Z"
}
```

Note: suggestion `id` fields are not needed — suggestions are identified by array index within the cached JSON blob.

**Actions:**
- `create_event` — "Create Event" button navigates to `/events/new?title=X&date=Y&category=Z` with pre-fill query params
- `navigate` — "Go" button navigates to the `actionUrl` path
- `null` — informational only, no button

**UI:**
- Section header: "AI Suggestions" with "Refresh" button
- 3-5 suggestion cards with text + action button
- "Last updated: 2 hours ago" timestamp
- Loading state while generating (can take 15-30 seconds via Claude bridge)
- Web fallback: "Refresh" copies prompt to clipboard for manual Claude use
- If no suggestions cached: "Generate Suggestions" button

---

## New API Endpoints

All under `/api/dashboard/`:
- `GET /attention` — attention items
- `GET /upcoming` — upcoming events with readiness
- `GET /performance` — headline stats with trends
- `GET /suggestions` — cached AI suggestions
- `POST /suggestions` — compose suggestion prompt, return `{ prompt }`
- `PUT /suggestions` — store parsed suggestions from client

**Route file:** `src/routes/dashboard.ts` — `createDashboardRouter(db, eventStore)`

**Registration:** in `src/app.ts` at `/api/dashboard` before the 404 catch-all

---

## Migration

**Version 7:** Create `dashboard_suggestions` table (see SQL above)

---

## Files to create
- `src/routes/dashboard.ts` — all dashboard API endpoints
- `client/src/pages/DashboardPage.tsx` — complete rewrite of existing page
- `client/src/components/dashboard/AttentionSection.tsx`
- `client/src/components/dashboard/UpcomingSection.tsx`
- `client/src/components/dashboard/PerformanceSection.tsx`
- `client/src/components/dashboard/SuggestionsSection.tsx`
- `client/src/api/dashboard.ts` — dashboard-specific API client functions (separate from events.ts)

## Files to modify
- `src/data/database.ts` — migration v7
- `src/app.ts` — register dashboard routes

## Existing dashboard code to replace
- `client/src/pages/DashboardPage.tsx` — full rewrite (current version shows DashboardSummaryCards + event timeline)
- `GET /api/sync/dashboard/summary` — deprecated, kept for backward compat but no longer called by the new dashboard
