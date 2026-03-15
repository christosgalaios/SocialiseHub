import { Router } from 'express';
import type { Database } from '../data/database.js';

const CATEGORIES: Record<string, { tables: string[]; resetServices?: boolean; message: string }> = {
  events: {
    tables: [
      'event_sync_snapshots', 'event_snapshots', 'event_photos', 'event_scores',
      'event_notes', 'event_tags', 'event_checklist', 'sync_log',
      'platform_events', 'events',
    ],
    message: 'Cleared all event data',
  },
  platforms: {
    tables: ['platform_events', 'event_sync_snapshots'],
    resetServices: true,
    message: 'Cleared platform connections',
  },
  templates: {
    tables: ['templates'],
    message: 'Cleared all templates',
  },
  ideas: {
    tables: ['event_ideas'],
    message: 'Cleared all ideas',
  },
  market: {
    tables: ['market_events'],
    message: 'Cleared market research data',
  },
  dashboard: {
    tables: ['dashboard_suggestions'],
    message: 'Cleared dashboard cache',
  },
};

const VALID_CATEGORIES = Object.keys(CATEGORIES).join(', ');

function resetServices(db: Database): void {
  db.prepare(
    'UPDATE services SET connected = 0, access_token = NULL, refresh_token = NULL, token_expires_at = NULL, extra = NULL, connected_at = NULL',
  ).run();
}

function clearTables(db: Database, tables: string[]): void {
  for (const table of tables) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
}

export function createDataRouter(db: Database): Router {
  const router = Router();

  // Must be registered before /:category to prevent param shadowing
  router.delete('/all', (_req, res, next) => {
    try {
      const allTables = [
        'event_sync_snapshots', 'event_snapshots', 'event_photos', 'event_scores',
        'event_notes', 'event_tags', 'event_checklist', 'sync_log',
        'platform_events', 'events',
        'templates', 'event_ideas', 'market_events', 'dashboard_suggestions',
      ];

      const cleared = db.transaction(() => {
        clearTables(db, allTables);
        resetServices(db);
        return [...allTables, 'services'];
      })();

      res.json({ cleared, message: 'Cleared all data' });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:category', (req, res, next) => {
    try {
      const cat = CATEGORIES[req.params.category];
      if (!cat) {
        return res.status(400).json({
          error: `Invalid category. Valid: ${VALID_CATEGORIES}`,
        });
      }

      const cleared = db.transaction(() => {
        clearTables(db, cat.tables);
        if (cat.resetServices) resetServices(db);
        const result = [...cat.tables];
        if (cat.resetServices) result.push('services');
        return result;
      })();

      res.json({ cleared, message: cat.message });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
