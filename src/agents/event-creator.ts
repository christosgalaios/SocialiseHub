import type { EventStore } from '../data/store.js';
import type { MeetupClient } from '../tools/meetup.js';
import type { EventbriteClient } from '../tools/eventbrite.js';
import type { HeadfirstClient } from '../tools/headfirst.js';
import type {
  CreateEventInput,
  SocialiseEvent,
  PlatformName,
  PublishResult,
  PlatformPublishStatus,
} from '../shared/types.js';
import { validateCreateEventInput } from '../lib/validate.js';

export interface EventCreatorDeps {
  store: EventStore;
  meetup?: MeetupClient;
  eventbrite?: EventbriteClient;
  headfirst?: HeadfirstClient;
}

export class EventCreator {
  constructor(private readonly deps: EventCreatorDeps) {}

  async create(input: CreateEventInput): Promise<SocialiseEvent> {
    const validation = validateCreateEventInput(input);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }
    return await this.deps.store.create(input);
  }

  async publish(
    eventId: string,
    platforms: PlatformName[],
  ): Promise<PublishResult[]> {
    const event = await this.deps.store.getById(eventId);
    if (!event) throw new Error('Event not found');

    const clients: Record<PlatformName, { publish: (e: SocialiseEvent) => Promise<PublishResult> } | undefined> = {
      meetup: this.deps.meetup,
      eventbrite: this.deps.eventbrite,
      headfirst: this.deps.headfirst,
    };

    const results = await Promise.allSettled(
      platforms.map(async (p) => {
        const client = clients[p];
        if (!client) return { platform: p, success: false, error: 'Service not configured' } as PublishResult;
        return await client.publish(event);
      }),
    );

    const publishResults: PublishResult[] = results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { platform: platforms[i], success: false, error: String(r.reason) },
    );

    // Update event platform statuses
    const updatedPlatforms: PlatformPublishStatus[] = [
      ...event.platforms.filter((p) => !platforms.includes(p.platform)),
      ...publishResults.map((r) => ({
        platform: r.platform,
        published: r.success,
        externalId: r.externalId,
        publishedAt: r.success ? new Date().toISOString() : undefined,
        error: r.error,
      })),
    ];

    const newStatus = publishResults.some((r) => r.success)
      ? 'published' as const
      : event.status;
    await this.deps.store.updateInternal(eventId, {
      platforms: updatedPlatforms,
      status: newStatus,
    });

    return publishResults;
  }
}
