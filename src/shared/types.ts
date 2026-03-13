/**
 * Shared types for SocialiseHub — used by both backend and frontend.
 */

// ── Events ──────────────────────────────────────────────

export type EventStatus = 'draft' | 'published' | 'cancelled';

export type PlatformName = 'meetup' | 'eventbrite' | 'headfirst';

export interface PlatformPublishStatus {
  platform: PlatformName;
  published: boolean;
  externalId?: string;
  publishedAt?: string;
  error?: string;
}

export interface SocialiseEvent {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time?: string;
  duration_minutes: number;
  venue: string;
  price: number;
  capacity: number;
  imageUrl?: string;
  status: EventStatus;
  platforms: PlatformPublishStatus[];
  createdAt: string;
  updatedAt: string;
}

export type CreateEventInput = Omit<
  SocialiseEvent,
  'id' | 'createdAt' | 'updatedAt' | 'platforms' | 'status'
> & {
  platforms?: PlatformName[];
};

export type UpdateEventInput = Partial<CreateEventInput>;

/** Internal update that also allows setting status + resolved platform statuses. */
export type InternalEventUpdate = Partial<
  Omit<SocialiseEvent, 'id' | 'createdAt'>
>;

export const VALID_PLATFORMS: PlatformName[] = ['meetup', 'eventbrite', 'headfirst'];

// ── Platform Services ───────────────────────────────────

export interface ServiceConnection {
  platform: PlatformName;
  connected: boolean;
  label: string;
  description: string;
  credentials?: Record<string, string>;
  connectedAt?: string;
}

export interface PublishResult {
  platform: PlatformName;
  success: boolean;
  externalId?: string;
  error?: string;
}

// ── Event Generator ─────────────────────────────────────

export interface ScrapedEvent {
  title: string;
  date: string;
  venue: string;
  category?: string;
  price?: string;
  attendees?: number;
  platform: PlatformName;
  url: string;
}

export interface EventIdea {
  id: string;
  title: string;
  description: string;
  rationale: string;
  suggestedDate?: string;
  suggestedVenue?: string;
  estimatedAttendance?: number;
  category: string;
}

// ── API Responses ───────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: string;
}

// ── Platform Events (from sync) ────────────────────────

export interface PlatformEvent {
  id: string;
  eventId?: string;
  platform: PlatformName;
  externalId: string;
  externalUrl?: string;
  title: string;
  date?: string;
  venue?: string;
  status: 'active' | 'cancelled' | 'past';
  rawData?: string;
  syncedAt: string;
  publishedAt?: string;
}

export interface PlatformPublishResult {
  platform: PlatformName;
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  error?: string;
}

// ── Sync Log ───────────────────────────────────────────

export type SyncAction = 'pull' | 'push' | 'publish' | 'update';

export interface SyncLogEntry {
  id: number;
  platform: PlatformName;
  action: SyncAction;
  eventId?: string;
  externalId?: string;
  status: 'success' | 'error';
  message?: string;
  createdAt: string;
}

// ── Dashboard ──────────────────────────────────────────

export interface DashboardSummary {
  totalEvents: number;
  eventsThisWeek: number;
  eventsThisMonth: number;
  byPlatform: Record<PlatformName, number>;
  upcomingEvents: number;
  pastEvents: number;
  /** Events per month for the last 6 months, oldest first */
  monthlyTrend: { month: string; count: number }[];
}

// ── Unified Event (for dashboard display) ──────────────

export interface UnifiedEvent {
  id: string;
  title: string;
  date: string;
  venue?: string;
  status: string;
  platforms: PlatformName[];
  source: 'internal' | 'external';
  internalEventId?: string;
  externalUrl?: string;
}
