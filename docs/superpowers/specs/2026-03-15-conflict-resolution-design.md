# Cross-Platform Conflict Resolution — Design Spec

## Problem

When the same event exists on multiple platforms (Meetup, Eventbrite, Headfirst), shared fields can drift out of sync — different titles, descriptions, start times, venues, etc. Currently there is no way to see or resolve these mismatches. The user must manually check each platform.

## Definition of "Conflict"

A conflict exists when a **shared field** has different values across platforms for the same event. Platform-specific fields (e.g., `doors_open_time` only exists on Headfirst, not Meetup) are **not** conflicts — they're expected to differ.

### Comparable Fields

Fields that exist on all (or most) platforms and should match:

| Field | Hub column | Platform event column |
|-------|-----------|----------------------|
| Title | `title` | `title` |
| Description | `description` | `description` |
| Start time | `start_time` | `date` |
| Venue | `venue` | `venue` |
| Price | `price` | `ticket_price` |
| Capacity | `capacity` | `capacity` |

Photos (`image_urls`) are also comparable but have array semantics (order-independent comparison).

### Non-Comparable Fields (Platform-Specific)

These fields may only exist on some platforms and are excluded from conflict detection:
- `doors_open_time`, `age_restriction`, `parking_info`, `refund_policy` (Headfirst-specific)
- `online_url` (relevant to Meetup online events, not Headfirst)
- `rsvp_open`, `rsvp_close` (Meetup-specific)
- Tags and categories (handled separately — see future spec)

## Architecture

### Backend

#### New endpoint: `GET /api/events/:id/conflicts`

Returns field-level conflicts for a single event across all linked platforms.

**Algorithm:**
1. Load the hub event by ID
2. Load all linked `platform_events` where `event_id = :id`
3. For each comparable field, compare the hub value against each platform's value
4. Return only fields where at least one platform differs from the hub

**Response shape:**
```ts
interface FieldConflict {
  field: string;              // e.g. "title", "description", "start_time"
  hubValue: string | number;  // current hub value
  platformValues: Array<{
    platform: PlatformName;
    value: string | number;
    externalUrl?: string;     // link to view on platform
  }>;
}

interface ConflictResponse {
  eventId: string;
  eventTitle: string;
  conflicts: FieldConflict[];
  platforms: Array<{
    platform: PlatformName;
    externalId: string;
    externalUrl?: string;
    lastSyncedAt: string;
  }>;
}
```

#### Updated endpoint: `GET /api/dashboard/conflicts`

Replace the current scheduling-overlap detection with cross-platform conflict detection.

**Algorithm:**
1. Load all events that have 2+ linked platform_events
2. For each, compare hub values against platform values on comparable fields
3. Return events that have at least one field conflict

**Response shape:**
```ts
interface DashboardConflict {
  eventId: string;
  eventTitle: string;
  conflictCount: number;       // number of differing fields
  platforms: PlatformName[];   // which platforms are involved
  fields: string[];            // which fields conflict (summary)
}

// Response: { data: DashboardConflict[], total: number }
```

#### Resolve + verify endpoint: `POST /api/events/:id/conflicts/resolve`

**Request body:**
```ts
interface ResolveRequest {
  updates: Record<string, string | number>;  // field -> new hub value
}
```

**Flow:**
1. Update the hub event with the provided field values
2. Push (publish/update) the event to all linked platforms via automation
3. Wait for push to complete
4. Pull fresh data from all platforms
5. Re-compare hub vs platform values on the updated fields
6. Return the verification result

**Response shape:**
```ts
interface ResolveResult {
  success: boolean;               // true only if ALL conflicts resolved
  resolved: string[];             // fields that now match across platforms
  remaining: FieldConflict[];     // fields that still differ (push failed or platform rejected)
  errors: Array<{
    platform: PlatformName;
    error: string;
  }>;
}
```

**Key principle:** The resolve endpoint does NOT mark anything as resolved optimistically. It pushes, pulls back, and reports what actually happened.

### Frontend

#### New page: `ConflictResolutionPage` at `/conflicts/:eventId`

**Layout:**
- Header: event title, link back to event detail page
- Status bar: "X conflicts across Y platforms" (red) or "All synced" (green)
- For each conflicting field:
  - Field label (e.g., "Title")
  - Current hub value (editable)
  - Platform values shown below/beside with platform icons, each showing what the platform currently has
  - Visual diff highlighting (red for mismatched, green when matching)
- Footer: "Sync to All Platforms" button (disabled until at least one field is edited)

**States:**
1. **Loading** — fetching conflict data
2. **Conflicts found** — showing field-level diffs, user can edit hub values
3. **Syncing** — after clicking "Sync All", show progress (pushing to platform X...)
4. **Verifying** — pulling back from platforms to confirm
5. **Resolved** — all fields match, green success state
6. **Partially resolved** — some fields still conflict, show remaining issues with error context

**Field editing:**
- Each conflicting field shows the hub value in an editable input
- Clicking a platform's value copies it to the hub input (quick "use this value" action)
- Fields that match across all platforms are shown as "synced" (green check, not editable in this view)
- Edited fields are visually marked as "pending sync" (yellow/amber)

#### Updated `ConflictsSection` (dashboard)

- Clicking a conflict card navigates to `/conflicts/:eventId` instead of `/events/:eventId`
- Card shows: event title, number of conflicting fields, which platforms are involved

#### Updated `EventDetailPage`

- When the event has cross-platform conflicts, show a warning banner at the top:
  - "3 field conflicts across Meetup, Eventbrite"
  - "Resolve" button that navigates to `/conflicts/:eventId`
- Banner only appears for events linked to 2+ platforms

### Navigation

| Entry point | Behavior |
|-------------|----------|
| Dashboard → ConflictsSection → click card | Navigate to `/conflicts/:eventId` |
| EventDetailPage → conflict banner → "Resolve" | Navigate to `/conflicts/:eventId` |
| ConflictResolutionPage → back link | Navigate to `/events/:eventId` |

## Data Flow

```
1. User opens /conflicts/:eventId
2. Frontend calls GET /api/events/:id/conflicts
3. Backend loads hub event + all platform_events, compares fields
4. Frontend renders field diffs

5. User edits hub values for conflicting fields
6. User clicks "Sync to All Platforms"
7. Frontend calls POST /api/events/:id/conflicts/resolve with updates
8. Backend:
   a. Updates hub event in SQLite
   b. Pushes to each platform via automation bridge
   c. Pulls fresh data from each platform
   d. Re-compares and returns verification result
9. Frontend shows resolved/remaining based on actual verification
```

## Comparison Logic

Field comparison rules:
- **Strings** (title, description, venue): trimmed, case-sensitive equality
- **Numbers** (price, capacity): numeric equality
- **Dates** (start_time): ISO string comparison after normalization to UTC
- **Photos**: sorted array comparison (order-independent)

Null/undefined platform values are treated as "field not present on platform" — not a conflict.

## Error Handling

- Platform push fails (automation error): show error per-platform, field stays conflicting
- Platform pull fails after push: show warning "could not verify — try again"
- Event not linked to any platform: redirect to event detail page (nothing to compare)
- Event linked to only one platform: still show comparison (hub vs that one platform)

## Testing

- Unit tests for field comparison logic (string normalization, null handling, date comparison)
- API tests for `GET /api/events/:id/conflicts` with mock platform data
- API tests for `POST /api/events/:id/conflicts/resolve` verifying the push-pull-verify flow
- Frontend component tests for conflict display and editing states

## Out of Scope (Future Specs)

- Platform-aware category/tag dropdowns with smart mapping
- Left sidebar layout (compact, non-scrollable)
- Automated conflict detection on sync pull (currently only on-demand)
- Batch conflict resolution (resolve all events at once)
