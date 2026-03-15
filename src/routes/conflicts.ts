import { Router } from 'express';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';
import type { PlatformEventStore } from '../data/platform-event-store.js';
import { COMPARABLE_FIELDS, valuesMatch, normalizeString, type FieldConflict } from './conflict-utils.js';

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

  /**
   * POST /api/events/:id/conflicts/resolve
   * Updates hub event with provided field values, then re-checks which conflicts remain.
   * Does NOT push to platforms — frontend handles that via /api/sync/push.
   */
  router.post('/:id/conflicts/resolve', (req, res, next) => {
    try {
      const { id } = req.params;
      const { updates } = req.body as { updates?: Record<string, unknown> };

      if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        res.status(400).json({ error: 'updates must be a non-empty object' });
        return;
      }

      const event = eventStore.getById(id);
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }

      // Apply the updates to the hub event
      eventStore.update(id, updates as never);

      const platformEvents = platformEventStore.getByEventId(id);

      // If linked to platform events, mark as modified so user knows to push
      const needsSync = platformEvents.length > 0;
      if (needsSync) {
        eventStore.updateSyncStatus(id, 'modified');
      }

      // Reload the updated event for re-comparison
      const updatedEvent = eventStore.getById(id)!;

      // Re-check which fields are resolved vs still conflicting
      const resolved: string[] = [];
      const remaining: FieldConflict[] = [];

      for (const fieldDef of COMPARABLE_FIELDS) {
        const hubRaw = (updatedEvent as unknown as Record<string, unknown>)[fieldDef.hubKey];
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

        // Only report on fields that were originally conflicting (i.e., updated fields or known conflicts)
        const wasUpdated = fieldDef.hubKey in updates || fieldDef.field in updates;

        if (diffPlatforms.length === 0 && wasUpdated) {
          resolved.push(fieldDef.field);
        } else if (diffPlatforms.length > 0) {
          remaining.push({
            field: fieldDef.field,
            hubValue,
            platformValues: diffPlatforms,
          });
        }
      }

      // Also check updated fields that may not be in COMPARABLE_FIELDS
      for (const key of Object.keys(updates)) {
        const inComparable = COMPARABLE_FIELDS.some(
          (f) => f.hubKey === key || f.field === key,
        );
        const alreadyResolved = resolved.includes(key);
        if (!inComparable && !alreadyResolved) {
          resolved.push(key);
        }
      }

      res.json({
        success: remaining.length === 0,
        resolved,
        remaining,
        errors: [],
        needsSync,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// Re-export for use in normalizeString if needed externally
export { normalizeString };
