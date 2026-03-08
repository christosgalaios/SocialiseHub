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
  date: string;
  time: string;
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

// ── Auth ────────────────────────────────────────────────

export type PlatformAuthType = 'oauth' | 'credentials';

export const PLATFORM_AUTH_TYPES: Record<PlatformName, PlatformAuthType> = {
  meetup: 'oauth',
  eventbrite: 'oauth',
  headfirst: 'credentials',
};

// ── API Responses ───────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: string;
}
