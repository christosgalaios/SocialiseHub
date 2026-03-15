import express, { type Request, type Response, type NextFunction } from 'express';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Database } from './data/database.js';
import { createDatabase } from './data/database.js';
import { SqliteEventStore } from './data/sqlite-event-store.js';
import { SqliteServiceStore } from './data/sqlite-service-store.js';
import { PlatformEventStore } from './data/platform-event-store.js';
import { SyncLogStore } from './data/sync-log-store.js';
import { PublishService } from './tools/publish-service.js';
import { MeetupAutomationClient } from './automation/meetup-client.js';
import { EventbriteAutomationClient } from './automation/eventbrite-client.js';
import { HeadfirstAutomationClient } from './automation/headfirst-client.js';
import { createEventsRouter } from './routes/events.js';
import { createServicesRouter } from './routes/services.js';
import { createSyncRouter } from './routes/sync.js';
import { createGeneratorRouter } from './routes/generator.js';
import { createTemplatesRouter } from './routes/templates.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createOptimizeRouter } from './routes/optimize.js';
import { createPhotosRouter } from './routes/photos.js';
import { createScoreRouter } from './routes/score.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { SyncSnapshotStore } from './data/sync-snapshot-store.js';
import { TemplateStore } from './data/template-store.js';
import { MarketAnalyzer } from './agents/market-analyzer.js';
import { MarketEventStore } from './data/market-event-store.js';
import { IdeaStore } from './data/idea-store.js';

export const VERSION = '0.1.0';

export interface AppDeps {
  db?: Database;
}

export function createApp(deps?: AppDeps): express.Express {
  const dataDir = join(process.cwd(), 'data');
  const db = deps?.db ?? createDatabase(join(dataDir, 'socialise.db'));

  const eventStore = new SqliteEventStore(db);
  const serviceStore = new SqliteServiceStore(db);
  const platformEventStore = new PlatformEventStore(db);
  const syncLogStore = new SyncLogStore(db);

  // Adapter so automation clients can look up service config (e.g. groupUrlname)
  const serviceLookup = {
    getExtra(platform: string) {
      const svc = serviceStore.getService(platform as import('./shared/types.js').PlatformName);
      return svc?.extra;
    },
  };

  const publishService = new PublishService({
    meetup: new MeetupAutomationClient(serviceLookup),
    eventbrite: new EventbriteAutomationClient(serviceLookup),
    headfirst: new HeadfirstAutomationClient(serviceLookup),
  });

  const app = express();

  // Middleware
  app.use(express.json());

  // CORS for dev (Vite on 5173 -> Express on 3000)
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,DELETE,OPTIONS',
    );
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  // API routes
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: VERSION });
  });

  const snapshotStore = new SyncSnapshotStore(db);
  const templateStore = new TemplateStore(db);
  const marketEventStore = new MarketEventStore(db);
  const marketAnalyzer = new MarketAnalyzer(marketEventStore);
  const ideaStore = new IdeaStore(db);

  app.use(
    '/api/events',
    createEventsRouter(eventStore, publishService, platformEventStore, syncLogStore),
  );
  app.use('/api/services', createServicesRouter(serviceStore, db));
  app.use('/api/sync', createSyncRouter(syncLogStore, platformEventStore, publishService, eventStore, serviceStore, snapshotStore));
  app.use('/api/generator', createGeneratorRouter(eventStore as never, marketAnalyzer, platformEventStore, ideaStore));
  app.use('/api/templates', createTemplatesRouter(templateStore, eventStore));
  app.use('/api/analytics', createAnalyticsRouter(db));
  app.use('/api/events', createOptimizeRouter(db, eventStore));
  app.use('/api/events', createPhotosRouter(db));
  app.use('/api/events', createScoreRouter(db, eventStore));
  app.use('/api/dashboard', createDashboardRouter(db, eventStore));
  app.use('/data', express.static(join(process.cwd(), 'data')));
  // 404 for unknown API routes (before SPA fallback)
  app.all('/api/{*path}', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Serve built frontend — single-server setup
  const clientDir = join(process.cwd(), 'dist-client');
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir));
    // SPA fallback — serve index.html for non-API routes
    app.get('/{*path}', (_req, res) => {
      res.sendFile(join(clientDir, 'index.html'));
    });
  }

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message });
  });

  return app;
}
