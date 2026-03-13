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

// ── OAuth ──────────────────────────────────────────────

export async function startOAuth(
  platform: PlatformName,
): Promise<{ authUrl: string }> {
  const res = await fetch(`/auth/${platform}/start`, {
    method: 'POST',
  });
  return json<{ authUrl: string }>(res);
}

/**
 * Subscribes to an SSE stream that emits when OAuth completes.
 * Returns a cleanup function to abort the connection.
 */
export function watchOAuthStatus(
  platform: PlatformName,
  onConnected: () => void,
): () => void {
  const es = new EventSource(`/auth/${platform}/status`);
  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.connected) {
        onConnected();
        es.close();
      }
    } catch { /* ignore */ }
  };
  es.onerror = () => es.close();
  return () => es.close();
}

// ── Event Generator ────────────────────────────────────

export async function analyzeMarket(): Promise<ScrapedEvent[]> {
  const res = await fetch(`${BASE}/generator/analyze`, { method: 'POST' });
  const body = await json<{ data: ScrapedEvent[] }>(res);
  return body.data;
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

export async function getSyncLog(limit = 50): Promise<SyncLogEntry[]> {
  const res = await fetch(`${BASE}/sync/log?limit=${limit}`);
  const body = await json<{ data: SyncLogEntry[] }>(res);
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
