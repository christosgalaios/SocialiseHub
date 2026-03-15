// src/automation/types.ts
import type { PlatformName, SocialiseEvent } from '../shared/types.js';

export interface AutomationStep {
  action: 'navigate' | 'waitForSelector' | 'fill' | 'click' | 'evaluate' | 'extractText' | 'waitForNavigation' | 'pause';
  selector?: string;
  value?: string;
  url?: string;
  script?: string;
  timeout?: number;
  description: string;
}

export interface AutomationTask {
  platform: PlatformName;
  action: 'connect' | 'publish' | 'update' | 'cancel' | 'scrape';
  data?: SocialiseEvent;
  steps: AutomationStep[];
}

export interface AutomationResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

export interface AutomationStatus {
  step: number;
  totalSteps: number;
  description: string;
  state: 'running' | 'paused' | 'waiting_for_user' | 'completed' | 'failed';
}

export interface AutomationRequest {
  platform: PlatformName;
  action: 'connect' | 'publish' | 'update' | 'cancel' | 'scrape';
  data?: any;
  externalId?: string;
}
