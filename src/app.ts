import express, { type Request, type Response, type NextFunction } from 'express';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { EventStore, ServiceStore } from './data/store.js';
import { EventCreator } from './agents/event-creator.js';
import { MeetupClient } from './tools/meetup.js';
import { EventbriteClient } from './tools/eventbrite.js';
import { HeadfirstClient } from './tools/headfirst.js';
import { createEventsRouter } from './routes/events.js';
import { createServicesRouter } from './routes/services.js';

export const VERSION = '0.1.0';

export interface AppDeps {
  eventStore?: EventStore;
  serviceStore?: ServiceStore;
}

export function createApp(deps?: AppDeps): express.Express {
  const dataDir = join(process.cwd(), 'data');
  const eventStore =
    deps?.eventStore ?? new EventStore(join(dataDir, 'events.json'));
  const serviceStore =
    deps?.serviceStore ?? new ServiceStore(join(dataDir, 'services.json'));

  const meetup = new MeetupClient();
  const eventbrite = new EventbriteClient();
  const headfirst = new HeadfirstClient();
  const creator = new EventCreator({
    store: eventStore,
    meetup,
    eventbrite,
    headfirst,
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

  app.use('/api/events', createEventsRouter(eventStore, creator));
  app.use('/api/services', createServicesRouter(serviceStore));

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
