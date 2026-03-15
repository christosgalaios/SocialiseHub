#!/usr/bin/env node
/**
 * SocialiseHub MCP Server
 *
 * Exposes the SocialiseHub Express API as MCP tools so Claude can
 * query and manage events, conflicts, analytics, sync, and more
 * without reading source code.
 *
 * Requires: SocialiseHub running locally (npm run dev or Electron app)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = process.env.SOCIALISE_HUB_URL || 'http://localhost:3000';

// ── HTTP helper ──────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const url = `${BASE}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(url);
  if (method !== 'GET') {
    const res2 = await fetch(url, opts);
    if (!res2.ok) {
      const err = await res2.json().catch(() => ({ error: res2.statusText }));
      throw new Error(err.error || `${res2.status} ${res2.statusText}`);
    }
    return res2.json();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function get(path) { return api('GET', path); }
async function post(path, body) { return api('POST', path, body); }
async function patch(path, body) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function del(path, body) {
  const url = `${BASE}${path}`;
  const opts = {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

function truncate(s, max = 200) {
  if (!s || s.length <= max) return s;
  return s.slice(0, max) + '...';
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'socialise-hub',
  version: '1.0.0',
});

// ── Events ───────────────────────────────────────────────────────────────────

server.tool(
  'list_events',
  'List events with optional filters (status, category, venue, search, platform, tag, sort)',
  {
    status: z.enum(['draft', 'published', 'cancelled', 'archived']).optional().describe('Filter by status'),
    category: z.string().optional().describe('Filter by category'),
    venue: z.string().optional().describe('Filter by venue'),
    search: z.string().optional().describe('Search title/description/venue'),
    tag: z.string().optional().describe('Filter by tag'),
    upcoming: z.boolean().optional().describe('Only future events'),
    sort_by: z.enum(['title', 'start_time', 'price', 'capacity', 'created_at']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    page: z.number().optional(),
    per_page: z.number().optional(),
    include_archived: z.boolean().optional(),
  },
  async (params) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qs.set(k, String(v));
    }
    const data = await get(`/api/events?${qs}`);
    const events = data.data || data;
    const summary = events.map(e => ({
      id: e.id,
      title: e.title,
      date: e.start_time,
      venue: e.venue,
      status: e.status,
      price: e.price,
      capacity: e.capacity,
      category: e.category,
      platforms: e.platforms?.map(p => `${p.platform}${p.published ? ' ✓' : ''}`).join(', ') || 'none',
      sync_status: e.sync_status,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
  },
);

server.tool(
  'get_event',
  'Get full details of a single event by ID',
  { id: z.string().describe('Event ID') },
  async ({ id }) => {
    const event = await get(`/api/events/${id}`);
    return { content: [{ type: 'text', text: JSON.stringify(event, null, 2) }] };
  },
);

server.tool(
  'update_event',
  'Update one or more fields of an event',
  {
    id: z.string().describe('Event ID'),
    title: z.string().optional(),
    description: z.string().optional(),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    venue: z.string().optional(),
    price: z.number().optional(),
    capacity: z.number().optional(),
    category: z.string().optional(),
    status: z.string().optional(),
    short_description: z.string().optional(),
    age_restriction: z.string().optional(),
    event_type: z.string().optional(),
    online_url: z.string().optional(),
    parking_info: z.string().optional(),
    refund_policy: z.string().optional(),
  },
  async ({ id, ...updates }) => {
    const result = await patch(`/api/events/${id}`, updates);
    return { content: [{ type: 'text', text: `Updated event ${id}: ${JSON.stringify(updates)}` }] };
  },
);

server.tool(
  'create_event',
  'Create a new draft event',
  {
    title: z.string().describe('Event title (max 200 chars)'),
    description: z.string().optional(),
    start_time: z.string().describe('ISO 8601 datetime'),
    venue: z.string().optional(),
    price: z.number().optional().default(0),
    capacity: z.number().optional().default(50),
    duration_minutes: z.number().optional().default(120),
    category: z.string().optional(),
  },
  async (params) => {
    const result = await post('/api/events', params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'delete_event',
  'Permanently delete an event',
  { id: z.string().describe('Event ID') },
  async ({ id }) => {
    await del(`/api/events/${id}`);
    return { content: [{ type: 'text', text: `Deleted event ${id}` }] };
  },
);

// ── Batch Operations ─────────────────────────────────────────────────────────

server.tool(
  'batch_update_status',
  'Set status for multiple events at once',
  {
    ids: z.array(z.string()).describe('Event IDs'),
    status: z.enum(['draft', 'published', 'cancelled', 'archived']),
  },
  async ({ ids, status }) => {
    const result = await patch('/api/events/batch/status', { ids, status });
    return { content: [{ type: 'text', text: `Updated ${ids.length} events to status: ${status}` }] };
  },
);

server.tool(
  'batch_update_category',
  'Set category for multiple events at once',
  {
    ids: z.array(z.string()).describe('Event IDs'),
    category: z.string().describe('Category name'),
  },
  async ({ ids, category }) => {
    await patch('/api/events/batch/category', { ids, category });
    return { content: [{ type: 'text', text: `Set category "${category}" on ${ids.length} events` }] };
  },
);

// ── Conflicts ────────────────────────────────────────────────────────────────

server.tool(
  'list_conflicts',
  'List all events with cross-platform field conflicts',
  {},
  async () => {
    const data = await get('/api/dashboard/conflicts');
    const conflicts = data.data || data;
    if (!conflicts.length) {
      return { content: [{ type: 'text', text: 'No conflicts found.' }] };
    }
    const summary = conflicts.map(c => ({
      eventId: c.eventId,
      title: c.title,
      conflictCount: c.conflictCount,
      fields: c.fields,
      platforms: c.platforms,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
  },
);

server.tool(
  'get_event_conflicts',
  'Get detailed field conflicts for a specific event',
  { id: z.string().describe('Event ID') },
  async ({ id }) => {
    const data = await get(`/api/events/${id}/conflicts`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'resolve_conflicts',
  'Resolve conflicts by updating hub fields to specified values',
  {
    id: z.string().describe('Event ID'),
    updates: z.record(z.union([z.string(), z.number()])).describe('Field updates, e.g. { "price": 10, "venue": "New Venue" }'),
  },
  async ({ id, updates }) => {
    const result = await post(`/api/events/${id}/conflicts/resolve`, { updates });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

// ── Sync ─────────────────────────────────────────────────────────────────────

server.tool(
  'sync_pull',
  'Pull events from platforms (all or a specific one)',
  { platform: z.enum(['meetup', 'eventbrite', 'headfirst']).optional().describe('Specific platform, or omit for all') },
  async ({ platform }) => {
    const qs = platform ? `?platform=${platform}` : '';
    const result = await post(`/api/sync/pull${qs}`);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'sync_push',
  'Push an event to a specific platform',
  {
    eventId: z.string().describe('Event ID'),
    platform: z.enum(['meetup', 'eventbrite', 'headfirst']),
  },
  async ({ eventId, platform }) => {
    const result = await post('/api/sync/push', { eventId, platform });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'sync_push_all',
  'Push an event to all linked platforms',
  { eventId: z.string().describe('Event ID') },
  async ({ eventId }) => {
    const result = await post('/api/sync/push-all', { eventId });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'sync_status',
  'Get sync dashboard summary (last sync times, error counts)',
  {},
  async () => {
    const data = await get('/api/sync/dashboard/summary');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Analytics ────────────────────────────────────────────────────────────────

server.tool(
  'analytics_summary',
  'Get high-level analytics: total events, attendees, revenue, fill rate',
  {},
  async () => {
    const data = await get('/api/analytics/summary');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'analytics_organizers',
  'Get organizer performance breakdown',
  {},
  async () => {
    const data = await get('/api/analytics/organizers');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'analytics_categories',
  'Get category performance breakdown',
  {},
  async () => {
    const data = await get('/api/analytics/categories');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'analytics_top_events',
  'Get top 20 events by attendance',
  {},
  async () => {
    const data = await get('/api/analytics/top-events');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'analytics_day_of_week',
  'Get day-of-week performance',
  {},
  async () => {
    const data = await get('/api/analytics/day-of-week');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'analytics_drill_down',
  'Get individual events for a specific month',
  { month: z.string().describe('Month in YYYY-MM format') },
  async ({ month }) => {
    const data = await get(`/api/analytics/drill-down?month=${encodeURIComponent(month)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'analytics_pricing',
  'Get pricing effectiveness analysis',
  {},
  async () => {
    const data = await get('/api/analytics/pricing-effectiveness');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Dashboard ────────────────────────────────────────────────────────────────

server.tool(
  'dashboard_attention',
  'Get events needing attention (missing fields, low scores, conflicts)',
  { limit: z.number().optional().default(10) },
  async ({ limit }) => {
    const data = await get(`/api/dashboard/attention?limit=${limit}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'dashboard_upcoming',
  'Get upcoming events with readiness scores',
  { limit: z.number().optional().default(10) },
  async ({ limit }) => {
    const data = await get(`/api/dashboard/upcoming?limit=${limit}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'dashboard_health',
  'Get health scores for all events',
  {},
  async () => {
    const data = await get('/api/dashboard/health');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'dashboard_performance',
  'Get headline performance metrics',
  {},
  async () => {
    const data = await get('/api/dashboard/performance');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Services ─────────────────────────────────────────────────────────────────

server.tool(
  'list_services',
  'List all platform connections and their status',
  {},
  async () => {
    const data = await get('/api/services');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Publish ──────────────────────────────────────────────────────────────────

server.tool(
  'publish_event',
  'Publish an event to specified platforms',
  {
    id: z.string().describe('Event ID'),
    platforms: z.array(z.enum(['meetup', 'eventbrite', 'headfirst'])).describe('Target platforms'),
  },
  async ({ id, platforms }) => {
    const result = await post(`/api/events/${id}/publish`, { platforms });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

// ── Notes ────────────────────────────────────────────────────────────────────

server.tool(
  'get_notes',
  'Get all notes for an event',
  { id: z.string().describe('Event ID') },
  async ({ id }) => {
    const data = await get(`/api/events/${id}/notes`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'add_note',
  'Add a note to an event',
  {
    id: z.string().describe('Event ID'),
    content: z.string().describe('Note text'),
    author: z.string().optional().default('Claude'),
  },
  async ({ id, content, author }) => {
    const result = await post(`/api/events/${id}/notes`, { content, author });
    return { content: [{ type: 'text', text: `Added note to event ${id}` }] };
  },
);

// ── Tags ─────────────────────────────────────────────────────────────────────

server.tool(
  'get_tags',
  'List all tags with usage counts',
  {},
  async () => {
    const data = await get('/api/tags');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'set_event_tags',
  'Replace all tags on an event',
  {
    id: z.string().describe('Event ID'),
    tags: z.array(z.string()).describe('New tags (max 20)'),
  },
  async ({ id, tags }) => {
    const url = `${BASE}/api/events/${id}/tags`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
    });
    if (!res.ok) throw new Error(`Failed to set tags: ${res.statusText}`);
    return { content: [{ type: 'text', text: `Set tags on event ${id}: ${tags.join(', ')}` }] };
  },
);

// ── Health Check ─────────────────────────────────────────────────────────────

server.tool(
  'health_check',
  'Check if SocialiseHub is running and get server version',
  {},
  async () => {
    try {
      const data = await get('/health');
      return { content: [{ type: 'text', text: `SocialiseHub is running. ${JSON.stringify(data)}` }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `SocialiseHub is NOT reachable at ${BASE}. Error: ${e.message}` }] };
    }
  },
);

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('SocialiseHub MCP server running on stdio');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
