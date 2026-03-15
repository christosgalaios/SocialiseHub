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
  problems?: Array<{ problem: string; label: string; urgency: string }>;
}

export interface UpcomingEvent {
  eventId: string;
  eventTitle: string;
  startTime: string;
  venue: string | null;
  readiness: number;
  passed: number;
  total: number;
  missing: string[];
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
  actionTitle?: string;
  actionDate?: string;
  actionUrl?: string;
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

export interface WeekDayEvent {
  id: string;
  title: string;
  startTime: string;
  venue: string | null;
  status: string;
  capacity: number | null;
  price: number;
  checklist: { total: number; done: number } | null;
}

export interface WeekView {
  data: Record<string, WeekDayEvent[]>;
  totalEvents: number;
  startDate: string;
  endDate: string;
}

export async function getWeekView(): Promise<WeekView> {
  const res = await fetch(`${BASE}/week`);
  return json<WeekView>(res);
}

export interface PortfolioCategory {
  category: string;
  count: number;
  upcoming: number;
  draft: number;
  published: number;
  avgPrice: number;
  totalCapacity: number;
  venueCount: number;
}

export interface PortfolioData {
  data: {
    categories: PortfolioCategory[];
    summary: {
      totalEvents: number;
      totalCategories: number;
      upcomingEvents: number;
      calendarGaps: string[];
    };
  };
}

export async function getPortfolio(): Promise<PortfolioData> {
  const res = await fetch(`${BASE}/portfolio`);
  return json<PortfolioData>(res);
}

export interface Conflict {
  events: Array<{ id: string; title: string; start_time: string; venue: string }>;
  reason: string;
}

export async function getConflicts(): Promise<{ data: Conflict[]; total: number }> {
  const res = await fetch(`${BASE}/conflicts`);
  return json<{ data: Conflict[]; total: number }>(res);
}

export interface EventHealth {
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

export interface HealthSummary {
  data: EventHealth[];
  summary: {
    total: number;
    averageHealth: number;
    healthy: number;
    needsWork: number;
  };
}

export async function getHealth(): Promise<HealthSummary> {
  const res = await fetch(`${BASE}/health`);
  return json<HealthSummary>(res);
}

export async function generateDigestPrompt(): Promise<{ prompt: string }> {
  const res = await fetch(`${BASE}/digest`, { method: 'POST' });
  return json<{ prompt: string }>(res);
}

export async function generateActionPlanPrompt(): Promise<{ prompt: string }> {
  const res = await fetch(`${BASE}/action-plan`, { method: 'POST' });
  return json<{ prompt: string }>(res);
}
