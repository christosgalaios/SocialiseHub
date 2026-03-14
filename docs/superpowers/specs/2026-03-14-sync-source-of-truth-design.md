# SocialiseHub — Sync as Source of Truth

**Date:** 2026-03-14
**Status:** Approved
**Depends on:** Previous specs (events sync, platform dedup). `sync_status` column already exists on `events` table (migration v1).

---

## Overview

Make platform events the source of truth. Track a snapshot of what was last synced per event per platform. Detect changes on both sides (local edits and platform edits). Auto-resolve conflicts by defaulting to platform wins. Provide per-event push/pull controls.

---

## New Table: `event_sync_snapshots` (migration v8)

```sql
CREATE TABLE IF NOT EXISTS event_sync_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  title TEXT,
  description TEXT,
  start_time TEXT,
  venue TEXT,
  price REAL,
  capacity INTEGER,
  photos_json TEXT,
  snapshot_hash TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  UNIQUE(event_id, platform),
  FOREIGN KEY (event_id) REFERENCES events(id)
)
```

One row per event-platform combination. `photos_json` stores a JSON array of platform photo URLs (not local paths). `snapshot_hash` is MD5 of all fields concatenated.

---

## Scraper Extensions

All platform scrapers must now return additional fields.

### Meetup
- Add `description` to GraphQL query (field exists on the `Event` type)
- Add `imageUrl` (field: `imageUrl` on Event node) for photo tracking
- Already returns: title, dateTime, venue, going, maxTickets, feeSettings

### Eventbrite
- Add `expand=description` to API call
- Add `logo.url` for event image
- Already returns: title, start date, venue, ticket info

### Headfirst
- DOM scrape: for each event link, fetch the detail page to get description + image
- Fix the empty date bug: extract date from the detail page or event card attributes
- Note: Headfirst scraping is the least reliable. If date/description extraction fails, exclude Headfirst events from snapshot-based conflict detection (treat as always-synced).

### Updated PlatformEvent fields
Add to `PlatformEvent` interface in `src/shared/types.ts`:
```typescript
description?: string;
imageUrls?: string[];  // platform photo URLs
```

New columns on `platform_events` table (migration v8):
```sql
ALTER TABLE platform_events ADD COLUMN description TEXT;
ALTER TABLE platform_events ADD COLUMN image_urls TEXT;
```

Update `PlatformEventRow` and `platform-event-store.ts` upsert to store these.

---

## Sync Pull Flow

For each connected platform, for each scraped event:

```
1. Upsert into platform_events (with description, photos)
2. Link to events table (dedup by title+date as before)
3. Compute incoming_hash from platform data
4. Look up event_sync_snapshots for this event+platform

IF no snapshot exists (first sync):
  → Update local event with ALL platform data (title, description, date, venue, price, capacity)
  → Store snapshot with incoming_hash
  → Set sync_status = 'synced'

IF snapshot exists:
  snapshot_hash = stored hash
  local_hash = hash computed from local event fields + snapshot's photos_json
    (photos are compared using the snapshot's stored platform URLs, NOT local event_photos,
     since local photos are a separate system and don't map 1:1 to platform photos)

  IF incoming_hash == snapshot_hash:
    // Platform unchanged since last sync
    IF local_hash == snapshot_hash:
      → Still in sync (green dot), do nothing
    ELSE:
      → Local was edited (orange dot), keep local changes, don't update

  IF incoming_hash != snapshot_hash:
    // Platform was edited externally
    IF local_hash == snapshot_hash:
      → Local unchanged, auto-update local with platform data
      → Update snapshot to incoming_hash
      → sync_status = 'synced'
    ELSE:
      → CONFLICT: both changed. Platform wins.
      → Overwrite local with platform data
      → Update snapshot to incoming_hash
      → sync_status = 'synced'
      → Add to conflicts array in response
```

### Hash computation

```typescript
import { createHash } from 'crypto';

function computeSyncHash(data: {
  title: string;
  description: string;
  startTime: string;
  venue: string;
  price: number;
  capacity: number;
  photos: string[];
}): string {
  const raw = [
    data.title ?? '', data.description ?? '', data.startTime ?? '',
    data.venue ?? '', String(data.price ?? 0), String(data.capacity ?? 0),
    JSON.stringify([...data.photos].sort()),  // copy before sort to avoid mutation
  ].join('|');
  return createHash('md5').update(raw).digest('hex');
}
```

### Local hash computation

The local hash is computed from:
- `events.title`, `events.description`, `events.start_time`, `events.venue`, `events.price`, `events.capacity`
- For photos: use the **snapshot's** `photos_json` value (not local `event_photos`). This means local photo changes via the photo manager don't affect sync status — only text field edits do. Platform photos and local photos are independent systems.

This avoids the mismatch where local `event_photos` (file paths) would never match platform photo URLs.

---

## Sync Status

Values (existing column `events.sync_status`):
- `synced` — green dot. Local text fields match what was last synced from platform.
- `modified` — orange dot. Local has unpushed text edits.
- `local_only` — no platform link. Created locally, never synced.

### Per-platform sync status

Each `PlatformPublishStatus` in `SocialiseEvent.platforms[]` gains a new field:
```typescript
syncStatus?: 'synced' | 'modified' | 'platform_changed';
```

Computed in `rowToEvent()`:
- Look up `event_sync_snapshots` for this event+platform
- If no snapshot → `undefined` (never synced to this platform)
- Compute incoming hash from `platform_events` data, compare to snapshot
- If platform data matches snapshot → check local vs snapshot → `synced` or `modified`
- If platform data differs from snapshot → `platform_changed`

This is per-platform — an event could be `synced` on Meetup but `modified` on Eventbrite.

---

## Updated Pull Response

`POST /api/sync/pull` response changes from:
```json
{ "data": { "pulled": 15 } }
```
to:
```json
{
  "data": {
    "pulled": 15,
    "updated": 12,
    "conflicts": [
      { "eventId": "uuid", "eventTitle": "Speed Friending", "platform": "meetup", "message": "Platform changes overrode your local edits" }
    ]
  }
}
```

The client shows a toast for each conflict entry.

---

## Push Endpoints

### `POST /api/sync/push` (MODIFY existing endpoint)
Request: `{ eventId: string, platform: string }`

Current implementation already calls `publishService.publish()`. Add after success:
1. Compute new hash from current local event data
2. Upsert into `event_sync_snapshots` with this hash
3. Check if all platforms for this event are now synced → if so, set `sync_status = 'synced'`

### `POST /api/sync/push-all` (NEW)
Request: `{ eventId: string }`

1. Get platforms from `platform_events WHERE event_id = ?` (only platforms where event already exists — don't create on new platforms)
2. Push to each sequentially
3. Update snapshot for each
4. Set sync_status to `synced` when all complete
5. Return: `{ results: [{ platform, success, error? }] }`

---

## Pull-Event Endpoint

### `POST /api/sync/pull-event` (NEW)
Request: `{ eventId: string, platform: string }`

Since no single-event scraper exists, this endpoint:
1. Gets the `platform_events` row for this event+platform (has the latest scraped data from the most recent bulk sync)
2. Overwrites local event fields with the platform_events data
3. Updates snapshot hash
4. Sets sync_status to `synced`
5. Returns the updated event

This does NOT trigger a new scrape — it uses the data from the last sync. If the user wants truly fresh data, they should sync first then pull-event.

---

## linkPlatformEventToEvent Updates

The existing function in `sync.ts` currently only passes `title`, `start_time`, `venue` to `eventStore.update()`. Must now also pass:
- `description` (from `pe.description`)
- `price` (from `pe.ticketPrice` if available)
- `capacity` (from `pe.capacity` if available)

---

## UI Changes

### EventDetailPage — Platform Status section

Replace current platform rows with `PlatformSyncRow` component. Each row shows:
- Platform name + colored dot (platform color)
- Per-platform sync indicator:
  - Green check ✓ when `syncStatus === 'synced'`
  - Orange dot ● when `syncStatus === 'modified'` (local edits unpushed to this platform)
  - Blue dot ● when `syncStatus === 'platform_changed'` (platform was edited, pull to update)
- "View on [Platform] →" button (already implemented)
- "Push →" button: calls `POST /api/sync/push` for this event+platform. Disabled when synced.
- "Pull ←" button: calls `POST /api/sync/pull-event` for this event+platform. Disabled when synced.

### EventDetailPage — Header area
- "Push All" button: calls `POST /api/sync/push-all`. Only visible when sync_status is `modified`.

### Toast notifications
- After bulk sync pull: "Synced 15 events. 2 conflicts resolved (platform version kept)."
- After push: "Pushed to Meetup successfully"
- After pull-event: "Reverted to Meetup version"

---

## Migration v8

```sql
-- Add description and image_urls to platform_events
ALTER TABLE platform_events ADD COLUMN description TEXT;
ALTER TABLE platform_events ADD COLUMN image_urls TEXT;

-- Create sync snapshots table
CREATE TABLE IF NOT EXISTS event_sync_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  title TEXT,
  description TEXT,
  start_time TEXT,
  venue TEXT,
  price REAL,
  capacity INTEGER,
  photos_json TEXT,
  snapshot_hash TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  UNIQUE(event_id, platform),
  FOREIGN KEY (event_id) REFERENCES events(id)
);
```

---

## Files to create
- `src/data/sync-snapshot-store.ts` — CRUD for event_sync_snapshots, `computeSyncHash()`, `getSnapshot()`, `upsertSnapshot()`, `computeLocalHash()`
- `client/src/components/PlatformSyncRow.tsx` — per-platform sync status + push/pull/view buttons

## Files to modify
- `src/data/database.ts` — migration v8
- `src/shared/types.ts` — add description/imageUrls to PlatformEvent, add syncStatus to PlatformPublishStatus
- `src/data/platform-event-store.ts` — new columns (description, image_urls) in PlatformEventRow, rowToEvent, upsert
- `src/data/sqlite-event-store.ts` — rowToEvent: compute per-platform syncStatus from snapshots
- `src/routes/sync.ts` — rewrite pull to use snapshot comparison, modify push to update snapshot, add push-all and pull-event endpoints, pass description/price/capacity in linkPlatformEventToEvent
- `src/automation/meetup.ts` — add description + imageUrl to GraphQL scrape
- `src/automation/meetup-client.ts` — map description + imageUrls
- `src/automation/eventbrite.ts` — add description + logo to scrape
- `src/automation/eventbrite-client.ts` — map description + imageUrls
- `src/automation/headfirst.ts` — scrape description + image (best effort)
- `src/automation/headfirst-client.ts` — map description + imageUrls
- `client/src/pages/EventDetailPage.tsx` — replace Platform Status section with PlatformSyncRow, add Push All button
- `client/src/api/events.ts` — pushAllEvents, pullEvent API functions (pushEvent already exists)
