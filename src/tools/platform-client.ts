import type { SocialiseEvent, PlatformEvent, PlatformPublishResult, PlatformName } from '../shared/types.js';

export interface PlatformClient {
  readonly platform: PlatformName;
  fetchEvents(): Promise<PlatformEvent[]>;
  createEvent(event: SocialiseEvent): Promise<PlatformPublishResult>;
  updateEvent(externalId: string, event: SocialiseEvent): Promise<PlatformPublishResult>;
  cancelEvent(externalId: string): Promise<{ success: boolean; error?: string }>;
  validateConnection(): Promise<boolean>;
}
