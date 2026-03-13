import type { PlatformName } from '@shared/types';

export interface AppSettings {
  defaultPlatforms: PlatformName[];
  defaultDuration: number;
  defaultPrice: number;
  defaultVenue: string;
  organizationName: string;
}

const STORAGE_KEY = 'socialise-settings';

const DEFAULTS: AppSettings = {
  defaultPlatforms: [],
  defaultDuration: 120,
  defaultPrice: 0,
  defaultVenue: '',
  organizationName: '',
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
