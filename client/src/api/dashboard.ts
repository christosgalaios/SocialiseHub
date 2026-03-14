const BASE = '/api/dashboard';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error || res.statusText);
  }
  return (await res.json()) as T;
}

export interface AttentionItem {
  eventId: string;
  eventTitle: string;
  problem: string;
  problemLabel: string;
  urgency: 'high' | 'medium' | 'low';
  platforms: string[];
  date: string | null;
}

export interface UpcomingEvent {
  eventId: string;
  eventTitle: string;
  startTime: string;
  venue: string | null;
  readiness: number;
  readinessChecks: Record<string, boolean>;
  platforms: string[];
  photoCount: number;
  timeUntil: string;
}

export interface PerformanceStats {
  upcomingCount: number;
  attendeesLast30: number;
  attendeesTrend: 'up' | 'down' | 'flat';
  revenueLast30: number;
  revenueTrend: 'up' | 'down' | 'flat';
  avgFillRate: number | null;
}

export interface DashboardSuggestion {
  title: string;
  body: string;
  priority: 'high' | 'medium' | 'low';
  action?: string;
}

export async function getAttentionItems(): Promise<{ items: AttentionItem[]; count: number }> {
  const res = await fetch(`${BASE}/attention`);
  return json<{ items: AttentionItem[]; count: number }>(res);
}

export async function getUpcomingEvents(): Promise<{ events: UpcomingEvent[] }> {
  const res = await fetch(`${BASE}/upcoming`);
  return json<{ events: UpcomingEvent[] }>(res);
}

export async function getPerformance(): Promise<{ data: PerformanceStats }> {
  const res = await fetch(`${BASE}/performance`);
  return json<{ data: PerformanceStats }>(res);
}

export async function getSuggestions(): Promise<{ suggestions: DashboardSuggestion[] | null; generatedAt?: string }> {
  const res = await fetch(`${BASE}/suggestions`);
  return json<{ suggestions: DashboardSuggestion[] | null; generatedAt?: string }>(res);
}

export async function generateSuggestionsPrompt(): Promise<{ prompt: string }> {
  const res = await fetch(`${BASE}/suggestions`, { method: 'POST' });
  return json<{ prompt: string }>(res);
}

export async function storeSuggestions(suggestions: DashboardSuggestion[]): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/suggestions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestions }),
  });
  return json<{ ok: boolean }>(res);
}
