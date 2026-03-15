import { Router } from 'express';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';
import type { PublishService } from '../tools/publish-service.js';
import type { PlatformEventStore } from '../data/platform-event-store.js';
import type { SyncLogStore } from '../data/sync-log-store.js';
import type { SyncSnapshotStore } from '../data/sync-snapshot-store.js';
import { computeSyncHash } from '../data/sync-snapshot-store.js';
import type { PlatformName } from '../shared/types.js';
import { validateCreateEventInput } from '../lib/validate.js';

export function createEventsRouter(
  store: SqliteEventStore,
  publishService: PublishService,
  platformEventStore: PlatformEventStore,
  syncLogStore: SyncLogStore,
  snapshotStore: SyncSnapshotStore,
): Router {
  const router = Router();

  router.get('/', (_req, res, next) => {
    try {
      const events = store.getAll();
      res.json({ data: events, total: events.length });
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
      });

      res.status(201).json({ data: copy });
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

      res.json({ data: results });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
