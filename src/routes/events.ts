import { Router } from 'express';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';
import type { PublishService } from '../tools/publish-service.js';
import type { PlatformEventStore } from '../data/platform-event-store.js';
import type { SyncLogStore } from '../data/sync-log-store.js';
import type { SyncSnapshotStore } from '../data/sync-snapshot-store.js';
import { computeSyncHash } from '../data/sync-snapshot-store.js';
import type { PlatformName } from '../shared/types.js';
import { validateCreateEventInput, validateUpdateEventInput } from '../lib/validate.js';
import { checkEventReadiness } from '../lib/event-readiness.js';

export function createEventsRouter(
  store: SqliteEventStore,
  publishService: PublishService,
  platformEventStore: PlatformEventStore,
  syncLogStore: SyncLogStore,
  snapshotStore: SyncSnapshotStore,
): Router {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      let events = store.getAll();

      // Filter by status (draft, published, cancelled)
      const status = req.query.status as string | undefined;
      if (status) events = events.filter(e => e.status === status);

      // Filter by sync_status (synced, modified, local_only)
      const syncStatus = req.query.sync_status as string | undefined;
      if (syncStatus) events = events.filter(e => e.sync_status === syncStatus);

      // Search by title and description (case-insensitive substring match)
      const search = req.query.search as string | undefined;
      if (search) {
        const q = search.toLowerCase();
        events = events.filter(e =>
          e.title.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q)
        );
      }

      // Filter by venue (case-insensitive substring match)
      const venue = req.query.venue as string | undefined;
      if (venue) {
        const v = venue.toLowerCase();
        events = events.filter(e => e.venue?.toLowerCase().includes(v));
      }

      // Filter by category
      const category = req.query.category as string | undefined;
      if (category) {
        const c = category.toLowerCase();
        events = events.filter(e => e.category?.toLowerCase() === c);
      }

      // Filter upcoming only
      if (req.query.upcoming === 'true') {
        const now = new Date().toISOString();
        events = events.filter(e => e.start_time > now);
      }

      // Date range filters
      const startAfter = req.query.start_after as string | undefined;
      if (startAfter) events = events.filter(e => e.start_time >= startAfter);

      const startBefore = req.query.start_before as string | undefined;
      if (startBefore) events = events.filter(e => e.start_time <= startBefore);

      // Sorting
      const sortBy = req.query.sort_by as string | undefined;
      const order = req.query.order === 'asc' ? 'asc' : 'desc';
      const sortFieldMap: Record<string, string> = {
        title: 'title', start_time: 'start_time', price: 'price',
        capacity: 'capacity', status: 'status',
        created_at: 'createdAt', updated_at: 'updatedAt',
      };
      const mappedField = sortBy ? sortFieldMap[sortBy] : undefined;
      if (mappedField) {
        events.sort((a, b) => {
          const aVal = (a as unknown as Record<string, unknown>)[mappedField];
          const bVal = (b as unknown as Record<string, unknown>)[mappedField];
          if (aVal == null && bVal == null) return 0;
          if (aVal == null) return 1;
          if (bVal == null) return -1;
          const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal as string) : (aVal as number) - (bVal as number);
          return order === 'asc' ? cmp : -cmp;
        });
      }

      // Pagination
      const total = events.length;
      const page = Math.max(1, Number(req.query.page) || 1);
      const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 0));
      if (req.query.per_page) {
        const start = (page - 1) * perPage;
        events = events.slice(start, start + perPage);
      }

      res.json({ data: events, total, ...(req.query.per_page ? { page, per_page: perPage } : {}) });
    } catch (err) {
      next(err);
    }
  });

  // Batch and export routes must be before /:id to avoid param capture
  router.patch('/batch/status', (req, res, next) => {
    try {
      const { ids, status } = req.body as { ids?: string[]; status?: string };
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids must be a non-empty array' });
      }
      if (ids.length > 100) {
        return res.status(400).json({ error: 'Maximum 100 events per batch' });
      }
      if (ids.some(id => typeof id !== 'string' || !id)) {
        return res.status(400).json({ error: 'Each id must be a non-empty string' });
      }
      const validStatuses = ['draft', 'published', 'cancelled'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
      }

      const results: { id: string; success: boolean; error?: string }[] = [];
      for (const id of ids) {
        const event = store.getById(id);
        if (!event) {
          results.push({ id, success: false, error: 'Not found' });
          continue;
        }
        store.updateStatus(id, status as 'draft' | 'published' | 'cancelled');
        results.push({ id, success: true });
      }

      res.json({ data: results, updated: results.filter(r => r.success).length });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/batch/category', (req, res, next) => {
    try {
      const { ids, category } = req.body as { ids?: string[]; category?: string };
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids must be a non-empty array' });
      }
      if (ids.length > 100) {
        return res.status(400).json({ error: 'Maximum 100 events per batch' });
      }
      if (typeof category !== 'string') {
        return res.status(400).json({ error: 'category must be a string' });
      }

      const results: { id: string; success: boolean; error?: string }[] = [];
      for (const id of ids) {
        const event = store.getById(id);
        if (!event) {
          results.push({ id, success: false, error: 'Not found' });
          continue;
        }
        store.update(id, { category: category || undefined });
        results.push({ id, success: true });
      }

      res.json({ data: results, updated: results.filter(r => r.success).length });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/batch', (req, res, next) => {
    try {
      const { ids } = req.body as { ids?: string[] };
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids must be a non-empty array' });
      }
      if (ids.length > 100) {
        return res.status(400).json({ error: 'Maximum 100 events per batch' });
      }
      if (ids.some(id => typeof id !== 'string' || !id)) {
        return res.status(400).json({ error: 'Each id must be a non-empty string' });
      }

      const results: { id: string; success: boolean; error?: string }[] = [];
      for (const id of ids) {
        const deleted = store.delete(id);
        results.push(deleted ? { id, success: true } : { id, success: false, error: 'Not found' });
      }

      res.json({ data: results, deleted: results.filter(r => r.success).length });
    } catch (err) {
      next(err);
    }
  });

  router.get('/calendar', (req, res, next) => {
    try {
      let events = store.getAll();

      // Optional month filter: ?month=2030-01
      const month = req.query.month as string | undefined;
      if (month && /^\d{4}-\d{2}$/.test(month)) {
        events = events.filter(e => e.start_time.startsWith(month));
      }

      // Group by date (YYYY-MM-DD)
      const byDate: Record<string, { id: string; title: string; start_time: string; status: string; venue: string }[]> = {};
      for (const e of events) {
        const date = e.start_time.slice(0, 10);
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push({
          id: e.id,
          title: e.title,
          start_time: e.start_time,
          status: e.status,
          venue: e.venue,
        });
      }

      // Sort dates
      const sortedDates = Object.keys(byDate).sort();
      const calendar = sortedDates.map(date => ({
        date,
        events: byDate[date],
      }));

      res.json({ data: calendar, totalDays: calendar.length, totalEvents: events.length });
    } catch (err) {
      next(err);
    }
  });

  router.get('/stats', (_req, res, next) => {
    try {
      const events = store.getAll();
      const byStatus: Record<string, number> = { draft: 0, published: 0, cancelled: 0 };
      const bySyncStatus: Record<string, number> = { synced: 0, modified: 0, local_only: 0 };
      const byCategory: Record<string, number> = {};
      const byVenue: Record<string, number> = {};
      let upcoming = 0;
      let past = 0;
      const now = new Date().toISOString();

      for (const e of events) {
        byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
        const ss = e.sync_status ?? 'local_only';
        bySyncStatus[ss] = (bySyncStatus[ss] ?? 0) + 1;
        const cat = e.category ?? 'uncategorized';
        byCategory[cat] = (byCategory[cat] ?? 0) + 1;
        if (e.venue) byVenue[e.venue] = (byVenue[e.venue] ?? 0) + 1;
        if (e.start_time > now) upcoming++;
        else past++;
      }

      res.json({
        data: {
          total: events.length,
          byStatus,
          bySyncStatus,
          byCategory,
          byVenue,
          upcoming,
          past,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/export/csv', (req, res, next) => {
    try {
      let events = store.getAll();

      const status = req.query.status as string | undefined;
      if (status) events = events.filter(e => e.status === status);
      if (req.query.upcoming === 'true') {
        const now = new Date().toISOString();
        events = events.filter(e => e.start_time > now);
      }

      const escCsv = (val: string | number | undefined | null): string => {
        if (val == null) return '';
        const s = String(val);
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const headers = ['id', 'title', 'description', 'start_time', 'end_time', 'duration_minutes', 'venue', 'price', 'capacity', 'category', 'status', 'sync_status', 'createdAt', 'updatedAt'];
      const rows = events.map(e =>
        headers.map(h => escCsv((e as unknown as Record<string, unknown>)[h] as string)).join(',')
      );

      const csv = [headers.join(','), ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="events.csv"');
      res.send(csv);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', (req, res, next) => {
    try {
      const event = store.getById(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });
      res.json({ data: event });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/platforms', (req, res, next) => {
    try {
      const event = store.getById(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });
      const platformEvents = platformEventStore.getByEventId(req.params.id);
      res.json({ data: platformEvents });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/log', (req, res, next) => {
    try {
      const event = store.getById(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });
      const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 200);
      const entries = syncLogStore.getByEventId(req.params.id, limit);
      res.json({ data: entries, total: entries.length });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const validation = validateCreateEventInput(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: `Validation failed: ${validation.errors.join(', ')}` });
      }
      const event = store.create(req.body);
      res.status(201).json({ data: event });
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', (req, res, next) => {
    try {
      const validation = validateUpdateEventInput(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: `Validation failed: ${validation.errors.join(', ')}` });
      }
      const event = store.update(req.params.id, req.body);
      if (!event) return res.status(404).json({ error: 'Event not found' });
      res.json({ data: event });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', (req, res, next) => {
    try {
      const deleted = store.delete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Event not found' });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/readiness', (req, res, next) => {
    try {
      const event = store.getById(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      const checks = checkEventReadiness(event);
      const passed = checks.filter(c => c.passed).length;
      const total = checks.length;
      const ready = checks.filter(c => c.severity === 'required').every(c => c.passed);

      res.json({
        data: {
          checks,
          score: Math.round((passed / total) * 100),
          ready,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/duplicate', (req, res, next) => {
    try {
      const original = store.getById(req.params.id);
      if (!original) return res.status(404).json({ error: 'Event not found' });

      const copy = store.create({
        title: `Copy of ${original.title}`,
        description: original.description,
        start_time: original.start_time,
        end_time: original.end_time,
        duration_minutes: original.duration_minutes,
        venue: original.venue,
        price: original.price,
        capacity: original.capacity,
        category: original.category,
      });

      res.status(201).json({ data: copy });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/recur', (req, res, next) => {
    try {
      const original = store.getById(req.params.id);
      if (!original) return res.status(404).json({ error: 'Event not found' });

      const { frequency, count } = req.body as { frequency?: string; count?: number };
      const validFrequencies = ['weekly', 'biweekly', 'monthly'];
      if (!frequency || !validFrequencies.includes(frequency)) {
        return res.status(400).json({ error: `frequency must be one of: ${validFrequencies.join(', ')}` });
      }
      if (!count || !Number.isInteger(count) || count < 1 || count > 52) {
        return res.status(400).json({ error: 'count must be an integer between 1 and 52' });
      }

      const daysMap: Record<string, number> = { weekly: 7, biweekly: 14, monthly: 0 };
      const created: typeof original[] = [];

      for (let i = 1; i <= count; i++) {
        const baseDate = new Date(original.start_time);
        if (frequency === 'monthly') {
          baseDate.setMonth(baseDate.getMonth() + i);
        } else {
          baseDate.setDate(baseDate.getDate() + daysMap[frequency] * i);
        }

        let endDate: string | undefined;
        if (original.end_time) {
          const end = new Date(original.end_time);
          const diff = end.getTime() - new Date(original.start_time).getTime();
          endDate = new Date(baseDate.getTime() + diff).toISOString();
        }

        const event = store.create({
          title: original.title,
          description: original.description,
          start_time: baseDate.toISOString(),
          end_time: endDate,
          duration_minutes: original.duration_minutes,
          venue: original.venue,
          price: original.price,
          capacity: original.capacity,
          category: original.category,
        });
        created.push(event);
      }

      res.status(201).json({ data: created, count: created.length });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/publish', async (req, res, next) => {
    try {
      const platforms = req.body.platforms as PlatformName[] | undefined;
      if (!platforms?.length) {
        return res.status(400).json({ error: 'No platforms specified' });
      }

      const event = store.getById(req.params.id);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      const readiness = checkEventReadiness(event);
      const requiredMissing = readiness.filter(c => c.severity === 'required' && !c.passed);

      const results = await publishService.publish(event, platforms);

      // Record results in platform event store and sync log
      for (const result of results) {
        if (result.success && result.externalId) {
          platformEventStore.upsert({
            eventId: event.id,
            platform: result.platform,
            externalId: result.externalId,
            externalUrl: result.externalUrl,
            title: event.title,
            date: event.start_time,
            venue: event.venue,
            status: 'active',
            publishedAt: new Date().toISOString(),
          });
        }

        syncLogStore.log({
          platform: result.platform,
          action: 'publish',
          eventId: event.id,
          externalId: result.externalId,
          status: result.success ? 'success' : 'error',
          message: result.error,
        });
      }

      // Update event status if any platform succeeded
      const anySucceeded = results.some((r) => r.success);
      if (anySucceeded) {
        store.updateStatus(event.id, 'published');
        store.updateSyncStatus(event.id, 'synced');

        // Create sync snapshots for each successfully published platform
        for (const result of results) {
          if (result.success) {
            const platformEventsAfter = platformEventStore.getByEventId(event.id);
            const pe = platformEventsAfter.find((p) => p.platform === result.platform);
            const photos = pe?.imageUrls ?? [];
            const publishHash = computeSyncHash({
              title: event.title,
              description: event.description ?? '',
              startTime: event.start_time,
              venue: event.venue ?? '',
              price: event.price,
              capacity: event.capacity ?? 0,
              photos,
            });
            snapshotStore.upsert({
              eventId: event.id,
              platform: result.platform,
              title: event.title,
              description: event.description ?? '',
              startTime: event.start_time,
              venue: event.venue ?? '',
              price: event.price,
              capacity: event.capacity ?? 0,
              photosJson: JSON.stringify(photos),
              snapshotHash: publishHash,
            });
          }
        }
      }

      res.json({
        data: results,
        warnings: requiredMissing.length > 0
          ? requiredMissing.map(c => `Missing ${c.label.toLowerCase()}`)
          : undefined,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
