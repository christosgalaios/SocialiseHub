import type {
  SocialiseEvent,
  CreateEventInput,
  UpdateEventInput,
  PublishResult,
  PlatformName,
  ServiceConnection,
  ScrapedEvent,
  DashboardSummary,
  SyncLogEntry,
  Template,
  CreateTemplateInput,
  QueuedIdea,
} from '@shared/types';

const BASE = '/api';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return (await res.json()) as T;
}

// ── Events ──────────────────────────────────────────────

export interface EventFilters {
  status?: string;
  sync_status?: string;
  search?: string;
  venue?: string;
  category?: string;
  upcoming?: boolean;
  start_after?: string;
  start_before?: string;
  sort_by?: string;
  order?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
}

export async function getEvents(filters?: EventFilters): Promise<{ data: SocialiseEvent[]; total: number }> {
  const params = new URLSearchParams();
  if (filters) {
    for (const [key, val] of Object.entries(filters)) {
      if (val !== undefined && val !== '') params.set(key, String(val));
    }
  }
  const qs = params.toString();
  const res = await fetch(`${BASE}/events${qs ? `?${qs}` : ''}`);
  return json<{ data: SocialiseEvent[]; total: number }>(res);
}

export async function getEvent(id: string): Promise<SocialiseEvent> {
  const res = await fetch(`${BASE}/events/${id}`);
  const body = await json<{ data: SocialiseEvent }>(res);
  return body.data;
}

export async function createEvent(
  input: CreateEventInput,
): Promise<SocialiseEvent> {
  const res = await fetch(`${BASE}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await json<{ data: SocialiseEvent }>(res);
  return body.data;
}

export async function updateEvent(
  id: string,
  input: UpdateEventInput,
): Promise<SocialiseEvent> {
  const res = await fetch(`${BASE}/events/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await json<{ data: SocialiseEvent }>(res);
  return body.data;
}

export async function deleteEvent(id: string): Promise<void> {
  const res = await fetch(`${BASE}/events/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
}

export async function publishEvent(
  id: string,
  platforms: PlatformName[],
): Promise<PublishResult[]> {
  const res = await fetch(`${BASE}/events/${id}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platforms }),
  });
  const body = await json<{ data: PublishResult[] }>(res);
  return body.data;
}

export async function duplicateEvent(id: string): Promise<SocialiseEvent> {
  const res = await fetch(`${BASE}/events/${id}/duplicate`, { method: 'POST' });
  const body = await json<{ data: SocialiseEvent }>(res);
  return body.data;
}

export async function recurEvent(
  id: string,
  frequency: 'weekly' | 'biweekly' | 'monthly',
  count: number,
): Promise<{ data: SocialiseEvent[]; count: number }> {
  const res = await fetch(`${BASE}/events/${id}/recur`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frequency, count }),
  });
  return json<{ data: SocialiseEvent[]; count: number }>(res);
}

export async function batchUpdateStatus(
  ids: string[],
  status: 'draft' | 'published' | 'cancelled',
): Promise<{ data: { id: string; success: boolean; error?: string }[]; updated: number }> {
  const res = await fetch(`${BASE}/events/batch/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, status }),
  });
  return json(res);
}

export async function batchUpdateCategory(
  ids: string[],
  category: string,
): Promise<{ data: { id: string; success: boolean; error?: string }[]; updated: number }> {
  const res = await fetch(`${BASE}/events/batch/category`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, category }),
  });
  return json(res);
}

export async function batchDeleteEvents(
  ids: string[],
): Promise<{ data: { id: string; success: boolean; error?: string }[]; deleted: number }> {
  const res = await fetch(`${BASE}/events/batch`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  return json(res);
}

export async function archiveEvents(
  ids: string[],
  unarchive = false,
): Promise<{ data: { id: string; success: boolean; error?: string }[]; updated: number }> {
  const res = await fetch(`${BASE}/events/batch/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, unarchive }),
  });
  return json(res);
}

export interface CalendarDay {
  date: string;
  events: { id: string; title: string; start_time: string; status: string; venue: string }[];
}

export async function getCalendar(month?: string): Promise<{ data: CalendarDay[]; totalDays: number; totalEvents: number }> {
  const qs = month ? `?month=${month}` : '';
  const res = await fetch(`${BASE}/events/calendar${qs}`);
  return json(res);
}

export interface ReadinessResult {
  checks: Array<{ field: string; label: string; passed: boolean; severity: string }>;
  score: number;
  ready: boolean;
}

export async function getEventReadiness(id: string): Promise<ReadinessResult> {
  const res = await fetch(`${BASE}/events/${id}/readiness`);
  const body = await json<{ data: ReadinessResult }>(res);
  return body.data;
}

export async function batchReadiness(
  ids: string[],
): Promise<{
  data: Array<{ id: string; found: boolean; title?: string; score: number; ready: boolean }>;
  summary: { total: number; ready: number; notReady: number; notFound: number; averageScore: number };
}> {
  const res = await fetch(`${BASE}/events/batch/readiness`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  return json(res);
}

export async function getEventPlatforms(id: string): Promise<import('@shared/types').PlatformEvent[]> {
  const res = await fetch(`${BASE}/events/${id}/platforms`);
  const body = await json<{ data: import('@shared/types').PlatformEvent[] }>(res);
  return body.data;
}

export async function getEventLog(id: string, limit = 50): Promise<SyncLogEntry[]> {
  const res = await fetch(`${BASE}/events/${id}/log?limit=${limit}`);
  const body = await json<{ data: SyncLogEntry[] }>(res);
  return body.data;
}

export async function getEventStats(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  bySyncStatus: Record<string, number>;
  upcoming: number;
  past: number;
}> {
  const res = await fetch(`${BASE}/events/stats`);
  const body = await json<{ data: { total: number; byStatus: Record<string, number>; bySyncStatus: Record<string, number>; upcoming: number; past: number } }>(res);
  return body.data;
}

export function getEventsExportUrl(params?: { status?: string; upcoming?: boolean }): string {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.upcoming) qs.set('upcoming', 'true');
  return `${BASE}/events/export/csv${qs.toString() ? '?' + qs.toString() : ''}`;
}

export async function importEventsFromJson(
  events: Array<{ title: string; description?: string; start_time: string; venue?: string; price?: number; capacity?: number; category?: string }>,
): Promise<{ data: Array<{ index: number; success: boolean; id?: string; error?: string }>; imported: number; total: number }> {
  const res = await fetch(`${BASE}/events/import/json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  });
  return json(res);
}

export async function quickCreateEvent(
  title: string,
  options?: { date?: string; category?: string },
): Promise<SocialiseEvent> {
  const res = await fetch(`${BASE}/events/quick-create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, ...options }),
  });
  const body = await json<{ data: SocialiseEvent }>(res);
  return body.data;
}

export interface DuplicateGroup {
  date: string;
  events: Array<{ id: string; title: string; venue: string; status: string }>;
}

export async function getEventDuplicates(): Promise<{ data: DuplicateGroup[]; total: number }> {
  const res = await fetch(`${BASE}/events/duplicates`);
  return json(res);
}

export interface CompareEventResult {
  id: string;
  found: boolean;
  title?: string;
  description?: string;
  startTime?: string;
  venue?: string;
  price?: number;
  capacity?: number;
  category?: string;
  status?: string;
  platformCount?: number;
}

export async function compareEvents(ids: string[]): Promise<CompareEventResult[]> {
  const res = await fetch(`${BASE}/events/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const body = await json<{ data: CompareEventResult[] }>(res);
  return body.data;
}

export async function cloneEvent(
  id: string,
  options?: { newDate?: string; titleSuffix?: string },
): Promise<SocialiseEvent> {
  const res = await fetch(`${BASE}/events/${id}/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options ?? {}),
  });
  const body = await json<{ data: SocialiseEvent }>(res);
  return body.data;
}

export async function batchReschedule(
  ids: string[],
  offsetDays: number,
): Promise<{ data: Array<{ id: string; success: boolean; newDate?: string }>; updated: number }> {
  const res = await fetch(`${BASE}/events/batch/reschedule`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, offsetDays }),
  });
  return json(res);
}

export async function batchUpdateVenue(ids: string[], venue: string): Promise<{ updated: number }> {
  const res = await fetch(`${BASE}/events/batch/venue`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, venue }),
  });
  return json(res);
}

export function getEventsJsonExportUrl(params?: { status?: string; upcoming?: boolean }): string {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.upcoming) qs.set('upcoming', 'true');
  return `${BASE}/events/export/json${qs.toString() ? '?' + qs.toString() : ''}`;
}

// ── Services ────────────────────────────────────────────

export async function getServices(): Promise<ServiceConnection[]> {
  const res = await fetch(`${BASE}/services`);
  const body = await json<{ data: ServiceConnection[] }>(res);
  return body.data;
}

export async function connectService(
  platform: PlatformName,
  credentials: Record<string, string>,
): Promise<ServiceConnection> {
  const res = await fetch(`${BASE}/services/${platform}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  const body = await json<{ data: ServiceConnection }>(res);
  return body.data;
}

export async function disconnectService(
  platform: PlatformName,
): Promise<ServiceConnection> {
  const res = await fetch(`${BASE}/services/${platform}/disconnect`, {
    method: 'POST',
  });
  const body = await json<{ data: ServiceConnection }>(res);
  return body.data;
}

// ── Automation ──────────────────────────────────────────

export async function startAutomation(platform: PlatformName, action: string, data?: unknown): Promise<void> {
  const api = (window as unknown as { electronAPI?: Record<string, unknown> }).electronAPI;
  if (api && typeof api.startAutomation === 'function') {
    await (api.startAutomation as Function)({ platform, action, data });
  }
}

export async function cancelAutomation(): Promise<void> {
  if (window.electronAPI) {
    await (window.electronAPI as Record<string, Function>).cancelAutomation();
  }
}

// ── Event Generator ────────────────────────────────────

export async function analyzeMarket(): Promise<ScrapedEvent[]> {
  const res = await fetch(`${BASE}/generator/analyze`, { method: 'POST' });
  const body = await json<{ events: ScrapedEvent[] }>(res);
  return body.events;
}

export async function saveIdeaAsDraft(idea: {
  title: string;
  description: string;
  venue?: string;
  date?: string;
}): Promise<SocialiseEvent> {
  return createEvent({
    title: idea.title,
    description: idea.description,
    venue: idea.venue ?? '',
    start_time: idea.date ? `${idea.date}T19:00:00Z` : new Date().toISOString(),
    duration_minutes: 120,
    price: 0,
    capacity: 50,
  });
}

// ── Dashboard ──────────────────────────────────────────

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const res = await fetch(`${BASE}/sync/dashboard/summary`);
  const body = await json<{ data: DashboardSummary }>(res);
  return body.data;
}

export async function getWeeklyDigestPrompt(): Promise<{ prompt: string }> {
  const res = await fetch(`${BASE}/dashboard/digest`, { method: 'POST' });
  return json(res);
}

export async function getActionPlanPrompt(): Promise<{ prompt: string }> {
  const res = await fetch(`${BASE}/dashboard/action-plan`, { method: 'POST' });
  return json(res);
}

export async function getPortfolio(): Promise<{
  data: {
    categories: Array<{
      category: string; count: number; upcoming: number;
      draft: number; published: number; avgPrice: number;
      totalCapacity: number; venueCount: number;
    }>;
    summary: {
      totalEvents: number; totalCategories: number;
      upcomingEvents: number; calendarGaps: string[];
    };
  };
}> {
  const res = await fetch(`${BASE}/dashboard/portfolio`);
  return json(res);
}

export async function getConflicts(): Promise<{
  data: Array<{
    events: Array<{ id: string; title: string; start_time: string; venue: string }>;
    reason: string;
  }>;
  total: number;
}> {
  const res = await fetch(`${BASE}/dashboard/conflicts`);
  return json(res);
}

export interface EventHealthItem {
  id: string;
  title: string;
  status: string;
  date: string | null;
  health: number;
  factors: string[];
  photoCount: number;
  platformCount: number;
  noteCount: number;
  hasScore: boolean;
}

export async function getEventHealth(): Promise<{
  data: EventHealthItem[];
  summary: { total: number; averageHealth: number; healthy: number; needsWork: number };
}> {
  const res = await fetch(`${BASE}/dashboard/health`);
  return json(res);
}

// ── Sync ───────────────────────────────────────────────

export async function syncPull(): Promise<{ pulled: number }> {
  const res = await fetch(`${BASE}/sync/pull`, { method: 'POST' });
  const body = await json<{ data: { pulled: number } }>(res);
  return body.data;
}

export async function pushEvent(eventId: string, platform: string): Promise<void> {
  const res = await fetch(`${BASE}/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, platform }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Push failed');
  }
}

export async function pushAllEvents(eventId: string): Promise<{ results: Array<{ platform: string; success: boolean; error?: string }> }> {
  const res = await fetch(`${BASE}/sync/push-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId }),
  });
  return json(res);
}

export async function pullEvent(eventId: string, platform: string): Promise<any> {
  const res = await fetch(`${BASE}/sync/pull-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, platform }),
  });
  return json(res);
}

export async function getSyncLog(limit = 50): Promise<SyncLogEntry[]> {
  const res = await fetch(`${BASE}/sync/log?limit=${limit}`);
  const body = await json<{ data: SyncLogEntry[] }>(res);
  return body.data;
}

// ── Templates ─────────────────────────────────────────

export async function getTemplates(): Promise<Template[]> {
  const res = await fetch(`${BASE}/templates`);
  const body = await json<{ data: Template[] }>(res);
  return body.data;
}

export async function createTemplate(input: CreateTemplateInput): Promise<Template> {
  const res = await fetch(`${BASE}/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await json<{ data: Template }>(res);
  return body.data;
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`${BASE}/templates/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
}

export async function createEventFromTemplate(templateId: string): Promise<SocialiseEvent> {
  const res = await fetch(`${BASE}/templates/${templateId}/create-event`, { method: 'POST' });
  const body = await json<{ data: SocialiseEvent }>(res);
  return body.data;
}

// ── Optimize ───────────────────────────────────────────

export interface EventPhoto {
  id: number;
  eventId: string;
  url: string;
  source: string;
  position: number;
  isCover: boolean;
}

export interface UnsplashPhoto {
  id: string;
  url: string;
  thumbUrl: string;
  alt: string;
  photographer: string;
}

export async function optimizeEvent(id: string): Promise<{ prompt: string; eventId: string }> {
  const res = await fetch(`${BASE}/events/${id}/optimize`, { method: 'POST' });
  return json<{ prompt: string; eventId: string }>(res);
}

export async function undoOptimize(id: string): Promise<SocialiseEvent> {
  const res = await fetch(`${BASE}/events/${id}/optimize/undo`, { method: 'POST' });
  const body = await json<{ data: SocialiseEvent }>(res);
  return body.data;
}

export async function getPhotoGenPrompt(id: string): Promise<{ prompt: string }> {
  const res = await fetch(`${BASE}/events/${id}/optimize/photos/generate-prompt`, { method: 'POST' });
  return json<{ prompt: string }>(res);
}

export async function getEventPhotos(id: string): Promise<EventPhoto[]> {
  const res = await fetch(`${BASE}/events/${id}/photos`);
  const body = await json<{ data: EventPhoto[] }>(res);
  return body.data;
}

export async function uploadEventPhoto(id: string, file: File, source: string): Promise<EventPhoto> {
  const formData = new FormData();
  formData.append('photo', file);
  formData.append('source', source);
  const res = await fetch(`${BASE}/events/${id}/photos`, { method: 'POST', body: formData });
  const body = await json<{ data: EventPhoto }>(res);
  return body.data;
}

export async function reorderPhotos(id: string, order: number[]): Promise<EventPhoto[]> {
  const res = await fetch(`${BASE}/events/${id}/photos/reorder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  });
  const body = await json<{ data: EventPhoto[] }>(res);
  return body.data;
}

export async function deletePhoto(id: string, photoId: number): Promise<void> {
  const res = await fetch(`${BASE}/events/${id}/photos/${photoId}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
}

export async function searchUnsplashPhotos(id: string, query: string): Promise<UnsplashPhoto[]> {
  const res = await fetch(`${BASE}/events/${id}/optimize/photos/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await json<{ photos: UnsplashPhoto[] }>(res);
  return body.photos;
}

// ── Analytics ──────────────────────────────────────────

export async function getAnalyticsSummary(): Promise<{
  total_events: number;
  total_attendees: number;
  total_revenue: number;
  avg_fill_rate: number;
}> {
  const res = await fetch(`${BASE}/analytics/summary`);
  const body = await json<{ data: { total_events: number; total_attendees: number; total_revenue: number; avg_fill_rate: number } }>(res);
  return body.data;
}

export async function getAnalyticsTrends(params?: { startDate?: string; endDate?: string }): Promise<{
  attendanceByMonth: { month: string; attendees: number; events_with_data: number }[];
  revenueByMonth: { month: string; revenue: number }[];
  fillByType: { platform: string; avg_fill: number; event_count: number }[];
  timingData: { day_of_week: number; hour: number; event_count: number; avg_attendance: number }[];
}> {
  const qs = new URLSearchParams();
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  const res = await fetch(`${BASE}/analytics/trends${qs.toString() ? '?' + qs.toString() : ''}`);
  const body = await json<{ data: { attendanceByMonth: { month: string; attendees: number; events_with_data: number }[]; revenueByMonth: { month: string; revenue: number }[]; fillByType: { platform: string; avg_fill: number; event_count: number }[]; timingData: { day_of_week: number; hour: number; event_count: number; avg_attendance: number }[] } }>(res);
  return body.data;
}

export async function getAnalyticsInsights(): Promise<{ prompt: string }> {
  const res = await fetch(`${BASE}/analytics/insights`, { method: 'POST' });
  const body = await json<{ data: { prompt: string } }>(res);
  return body.data;
}

export interface PricingAnalysis {
  priceRanges: Array<{ range: string; eventCount: number; avgFillRate: number | null; avgAttendance: number | null; totalRevenue: number; avgPrice: number }>;
  revenuePerAttendee: Array<{ platform: string; revenuePerAttendee: number; eventCount: number }>;
}

export async function getPricingAnalysis(): Promise<PricingAnalysis> {
  const res = await fetch(`${BASE}/analytics/pricing`);
  const body = await json<{ data: PricingAnalysis }>(res);
  return body.data;
}

export async function getVenueAnalytics(): Promise<{
  venues: Array<{ venue: string; eventCount: number; avgScore: number | null; platformCount: number }>;
  venuePerformance: Array<{ venue: string; platform: string; eventCount: number; avgFillRate: number | null; avgAttendance: number | null; totalRevenue: number }>;
}> {
  const res = await fetch(`${BASE}/analytics/venues`);
  const body = await json<{ data: Awaited<ReturnType<typeof getVenueAnalytics>> }>(res);
  return body.data;
}

export async function getRoiAnalysis(): Promise<{
  topEvents: Array<{
    title: string; platform: string; date: string | null;
    revenue: number; attendance: number; fillRate: number | null;
    revenuePerHead: number;
  }>;
  monthlyRevenue: Array<{
    month: string; revenue: number; attendees: number;
    eventCount: number; revenuePerHead: number;
  }>;
  platformEfficiency: Array<{
    platform: string; eventCount: number; totalRevenue: number;
    totalAttendees: number; avgRevenue: number; revenuePerHead: number;
  }>;
}> {
  const res = await fetch(`${BASE}/analytics/roi`);
  const body = await json<{ data: Awaited<ReturnType<typeof getRoiAnalysis>> }>(res);
  return body.data;
}

// ── Magic / Idea Queue ─────────────────────────────────

export async function getNextIdea(): Promise<{ idea: QueuedIdea | null; remaining: number }> {
  const res = await fetch(`${BASE}/generator/ideas`);
  return json<{ idea: QueuedIdea | null; remaining: number }>(res);
}

export async function generateIdeasPrompt(): Promise<{ prompt: string }> {
  const res = await fetch(`${BASE}/generator/ideas/generate`, { method: 'POST' });
  return json<{ prompt: string }>(res);
}

export async function storeIdeas(ideas: Omit<QueuedIdea, 'id' | 'used' | 'createdAt'>[]): Promise<{ stored: number }> {
  const res = await fetch(`${BASE}/generator/ideas/store`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ideas }),
  });
  return json<{ stored: number }>(res);
}

export async function acceptIdea(ideaId: number): Promise<{ eventId: string }> {
  const res = await fetch(`${BASE}/generator/ideas/${ideaId}/accept`, { method: 'POST' });
  return json<{ eventId: string }>(res);
}

export async function magicFill(eventId: string): Promise<{ prompt: string; eventId: string }> {
  const res = await fetch(`${BASE}/events/${eventId}/magic-fill`, { method: 'POST' });
  return json<{ prompt: string; eventId: string }>(res);
}

export async function autoFillPhotos(eventId: string): Promise<{ photos: EventPhoto[] }> {
  const res = await fetch(`${BASE}/events/${eventId}/photos/auto`, { method: 'POST' });
  return json<{ photos: EventPhoto[] }>(res);
}

// ── Scoring ────────────────────────────────────────────

export interface EventScore {
  overall: number;
  breakdown: Record<string, number>;
  suggestions: Array<{
    field: string;
    current_issue: string;
    suggestion: string;
    impact: number;
    suggested_value?: string | null;
  }>;
  scoredAt: string;
}

export async function getEventScore(id: string): Promise<{ score: EventScore | null }> {
  const res = await fetch(`${BASE}/events/${id}/score`);
  return json<{ score: EventScore | null }>(res);
}

export async function scoreEvent(id: string): Promise<{ prompt: string; eventId: string }> {
  const res = await fetch(`${BASE}/events/${id}/score`, { method: 'POST' });
  return json<{ prompt: string; eventId: string }>(res);
}

export async function saveEventScore(id: string, data: { overall: number; breakdown: Record<string, number>; suggestions: EventScore['suggestions'] }): Promise<void> {
  const res = await fetch(`${BASE}/events/${id}/score/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
}

// ── Notes ─────────────────────────────────────────────

export interface EventNote {
  id: number;
  eventId: string;
  content: string;
  author: string;
  createdAt: string;
}

export async function getEventNotes(eventId: string): Promise<{ data: EventNote[]; total: number }> {
  const res = await fetch(`${BASE}/events/${eventId}/notes`);
  return json(res);
}

export async function addEventNote(eventId: string, content: string, author?: string): Promise<EventNote> {
  const res = await fetch(`${BASE}/events/${eventId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, author }),
  });
  const result = await json<{ data: EventNote }>(res);
  return result.data;
}

export async function deleteEventNote(eventId: string, noteId: number): Promise<void> {
  const res = await fetch(`${BASE}/events/${eventId}/notes/${noteId}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
}

// ── Service Setup ──────────────────────────────────────

export async function setupService(
  platform: PlatformName,
  config: Record<string, unknown>,
): Promise<void> {
  await fetch(`${BASE}/services/${platform}/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}
