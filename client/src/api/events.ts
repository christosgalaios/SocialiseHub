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

export async function getEvents(): Promise<SocialiseEvent[]> {
  const res = await fetch(`${BASE}/events`);
  const body = await json<{ data: SocialiseEvent[] }>(res);
  return body.data;
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
    start_time: idea.date ? `${idea.date}T19:00:00+01:00` : new Date().toISOString(),
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
