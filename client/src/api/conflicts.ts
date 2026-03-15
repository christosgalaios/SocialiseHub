import type { PlatformName } from '../../../src/shared/types';

const BASE = '/api/events';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export interface FieldConflict {
  field: string;
  hubValue: string | number | null;
  platformValues: Array<{
    platform: PlatformName;
    value: string | number | null;
    externalUrl?: string;
  }>;
}

export interface ConflictResponse {
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

export interface ResolveResult {
  success: boolean;
  resolved: string[];
  remaining: FieldConflict[];
  errors: Array<{ platform: string; error: string }>;
  needsSync: boolean;
}

export async function getEventConflicts(eventId: string): Promise<ConflictResponse> {
  const res = await fetch(`${BASE}/${eventId}/conflicts`);
  return json<ConflictResponse>(res);
}

export async function resolveConflicts(
  eventId: string,
  updates: Record<string, string | number>,
): Promise<ResolveResult> {
  const res = await fetch(`${BASE}/${eventId}/conflicts/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  return json<ResolveResult>(res);
}

export async function pushToPlatform(eventId: string, platform: string): Promise<unknown> {
  const res = await fetch('/api/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, platform }),
  });
  return json<unknown>(res);
}
