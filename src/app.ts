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
import { createEventsRouter } from './routes/events.js';
import { createServicesRouter } from './routes/services.js';
import { createSyncRouter } from './routes/sync.js';
import { createAuthRouter } from './routes/auth.js';
import { createGeneratorRouter } from './routes/generator.js';
import { MarketAnalyzer } from './agents/market-analyzer.js';

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

  // PublishService initialized with empty clients — real clients come in Tasks 12-14
  const publishService = new PublishService({});

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

  const port = Number(process.env.PORT) || 3000;
  const marketAnalyzer = new MarketAnalyzer(serviceStore as never);

  app.use(
    '/api/events',
    createEventsRouter(eventStore, publishService, platformEventStore, syncLogStore),
  );
  app.use('/api/services', createServicesRouter(serviceStore));
  app.use('/api/sync', createSyncRouter(syncLogStore, platformEventStore));
  app.use('/api/generator', createGeneratorRouter(eventStore as never, marketAnalyzer));
  app.use('/auth', createAuthRouter(serviceStore as never, port));

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
