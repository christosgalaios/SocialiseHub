import type {
  SocialiseEvent,
  CreateEventInput,
  UpdateEventInput,
  PublishResult,
  PlatformName,
  ServiceConnection,
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
