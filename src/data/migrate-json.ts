import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabase } from './database.js';
import { SqliteEventStore } from './sqlite-event-store.js';
import { SqliteServiceStore } from './sqlite-service-store.js';

export function migrateJsonToSqlite(dataDir: string): { events: number; services: number } {
  const dbPath = join(dataDir, 'socialise.db');
  const db = createDatabase(dbPath);
  const eventStore = new SqliteEventStore(db);
  const serviceStore = new SqliteServiceStore(db);

  let eventCount = 0;
  let serviceCount = 0;

  // Migrate events
  const eventsPath = join(dataDir, 'events.json');
  if (existsSync(eventsPath)) {
    const events = JSON.parse(readFileSync(eventsPath, 'utf-8'));
    for (const e of events) {
      const startTime = e.start_time ?? (e.date ? `${e.date}T${e.time || '19:00'}:00+00:00` : new Date().toISOString());
      eventStore.create({
        title: e.title,
        description: e.description ?? '',
        start_time: startTime,
        duration_minutes: e.duration_minutes ?? 120,
        venue: e.venue ?? '',
        price: e.price ?? 0,
        capacity: e.capacity ?? 50,
      });
      eventCount++;
    }
    console.log(`Migrated ${eventCount} events from events.json`);
  }

  // Migrate services
  const servicesPath = join(dataDir, 'services.json');
  if (existsSync(servicesPath)) {
    const services = JSON.parse(readFileSync(servicesPath, 'utf-8'));
    for (const s of services) {
      if (s.connected && s.credentials) {
        serviceStore.connect(s.platform, s.credentials);
        serviceCount++;
      }
    }
    console.log(`Migrated ${serviceCount} service connections from services.json`);
  }

  db.close();
  return { events: eventCount, services: serviceCount };
}

// Run directly
if (process.argv[1]?.endsWith('migrate-json.js') || process.argv[1]?.endsWith('migrate-json.ts')) {
  const dataDir = join(process.cwd(), 'data');
  const result = migrateJsonToSqlite(dataDir);
  console.log('Migration complete:', result);
}
