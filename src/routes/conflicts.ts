import { Router } from 'express';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';
import type { PlatformEventStore } from '../data/platform-event-store.js';
import { COMPARABLE_FIELDS, valuesMatch, type FieldConflict } from './conflict-utils.js';

export function createConflictsRouter(
  eventStore: SqliteEventStore,
  platformEventStore: PlatformEventStore,
): Router {
  const router = Router();

  /**
   * GET /api/events/:id/conflicts
   * Compares hub event field values against linked platform events.
   * Returns only fields where at least one platform differs from the hub.
   */
  router.get('/:id/conflicts', (req, res, next) => {
    try {
      const { id } = req.params;
      const event = eventStore.getById(id);
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }

      const platformEvents = platformEventStore.getByEventId(id);

      const conflicts: FieldConflict[] = [];

      for (const fieldDef of COMPARABLE_FIELDS) {
        const hubRaw = (event as unknown as Record<string, unknown>)[fieldDef.hubKey];
        const hubValue = hubRaw == null ? null : (hubRaw as string | number);

        const diffPlatforms: FieldConflict['platformValues'] = [];

        for (const pe of platformEvents) {
          const platRaw = (pe as unknown as Record<string, unknown>)[fieldDef.platformKey];
          const platValue = platRaw == null ? null : (platRaw as string | number);

          if (!valuesMatch(hubValue, platValue, fieldDef.type)) {
            diffPlatforms.push({
              platform: pe.platform,
              value: platValue,
              externalUrl: pe.externalUrl,
            });
          }
        }

        if (diffPlatforms.length > 0) {
          conflicts.push({
            field: fieldDef.field,
            hubValue,
            platformValues: diffPlatforms,
          });
        }
      }

      const platforms = platformEvents.map(pe => ({
        platform: pe.platform,
        externalId: pe.externalId,
        externalUrl: pe.externalUrl,
        lastSyncedAt: pe.syncedAt,
      }));

      res.json({
        eventId: id,
        eventTitle: event.title,
        conflicts,
        platforms,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
