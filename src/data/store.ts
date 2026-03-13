import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  SocialiseEvent,
  CreateEventInput,
  UpdateEventInput,
  InternalEventUpdate,
  ServiceConnection,
  PlatformName,
} from '../shared/types.js';

/** Fields the public API is allowed to update via PUT. */
const UPDATABLE_FIELDS = new Set([
  'title', 'description', 'start_time', 'end_time', 'duration_minutes',
  'venue', 'price', 'capacity', 'imageUrl',
]);

// ── Event Store ─────────────────────────────────────────

export class EventStore {
  private events: SocialiseEvent[] | null = null;

  constructor(private readonly filePath: string) {}

  private async load(): Promise<SocialiseEvent[]> {
    if (this.events) return this.events;
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      this.events = JSON.parse(raw) as SocialiseEvent[];
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.events = [];
      } else {
        throw err;
      }
    }
    return this.events!;
  }

  private async persist(): Promise<void> {
    if (!this.events) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.events, null, 2));
  }

  async getAll(): Promise<SocialiseEvent[]> {
    return await this.load();
  }

  async getById(id: string): Promise<SocialiseEvent | undefined> {
    const events = await this.load();
    return events.find((e) => e.id === id);
  }

  async create(input: CreateEventInput): Promise<SocialiseEvent> {
    const events = await this.load();
    const now = new Date().toISOString();
    const event: SocialiseEvent = {
      id: randomUUID(),
      title: input.title,
      description: input.description,
      start_time: input.start_time,
      end_time: input.end_time,
      duration_minutes: input.duration_minutes ?? 120,
      venue: input.venue,
      price: input.price,
      capacity: input.capacity,
      imageUrl: input.imageUrl,
      status: 'draft',
      platforms: (input.platforms ?? []).map((p) => ({
        platform: p,
        published: false,
      })),
      createdAt: now,
      updatedAt: now,
    };
    events.push(event);
    await this.persist();
    return event;
  }

  /** Public API update — only allows safe, whitelisted fields. */
  async update(
    id: string,
    input: UpdateEventInput,
  ): Promise<SocialiseEvent | undefined> {
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (UPDATABLE_FIELDS.has(k)) safe[k] = v;
    }
    return this.applyUpdate(id, safe as InternalEventUpdate);
  }

  /** Internal update — allows setting any field (platforms, status, etc). */
  async updateInternal(
    id: string,
    input: InternalEventUpdate,
  ): Promise<SocialiseEvent | undefined> {
    return this.applyUpdate(id, input);
  }

  private async applyUpdate(
    id: string,
    input: InternalEventUpdate,
  ): Promise<SocialiseEvent | undefined> {
    const events = await this.load();
    const idx = events.findIndex((e) => e.id === id);
    if (idx === -1) return undefined;
    events[idx] = {
      ...events[idx],
      ...input,
      id: events[idx].id,         // immutable
      createdAt: events[idx].createdAt, // immutable
      updatedAt: new Date().toISOString(),
    };
    await this.persist();
    return events[idx];
  }

  async delete(id: string): Promise<boolean> {
    const events = await this.load();
    const idx = events.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    events.splice(idx, 1);
    await this.persist();
    return true;
  }
}

// ── Service Connection Store ────────────────────────────

const DEFAULT_SERVICES: ServiceConnection[] = [
  {
    platform: 'meetup',
    connected: false,
    label: 'Meetup',
    description: 'Publish events to Meetup.com groups',
  },
  {
    platform: 'eventbrite',
    connected: false,
    label: 'Eventbrite',
    description: 'List events on Eventbrite for ticket sales',
  },
  {
    platform: 'headfirst',
    connected: false,
    label: 'Headfirst Bristol',
    description: "List events on Bristol's what's on guide",
  },
];

export class ServiceStore {
  private services: ServiceConnection[] | null = null;

  constructor(private readonly filePath: string) {}

  private async load(): Promise<ServiceConnection[]> {
    if (this.services) return this.services;
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      this.services = JSON.parse(raw) as ServiceConnection[];
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.services = DEFAULT_SERVICES.map((s) => ({ ...s }));
      } else {
        throw err;
      }
    }
    return this.services!;
  }

  private async persist(): Promise<void> {
    if (!this.services) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.services, null, 2));
  }

  async getAll(): Promise<ServiceConnection[]> {
    const services = await this.load();
    // Return without credentials for API responses
    return services.map(({ credentials: _creds, ...rest }) => rest);
  }

  async getService(
    platform: PlatformName,
  ): Promise<ServiceConnection | undefined> {
    const services = await this.load();
    return services.find((s) => s.platform === platform);
  }

  async connect(
    platform: PlatformName,
    credentials: Record<string, string>,
  ): Promise<ServiceConnection | undefined> {
    const services = await this.load();
    const svc = services.find((s) => s.platform === platform);
    if (!svc) return undefined;
    svc.connected = true;
    svc.credentials = credentials;
    svc.connectedAt = new Date().toISOString();
    await this.persist();
    const { credentials: _creds, ...safe } = svc;
    return safe;
  }

  async disconnect(
    platform: PlatformName,
  ): Promise<ServiceConnection | undefined> {
    const services = await this.load();
    const svc = services.find((s) => s.platform === platform);
    if (!svc) return undefined;
    svc.connected = false;
    svc.credentials = undefined;
    svc.connectedAt = undefined;
    await this.persist();
    return svc;
  }
}
