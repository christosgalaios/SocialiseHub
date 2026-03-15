import type { PlatformName } from '../shared/types.js';

export const COMPARABLE_FIELDS: Array<{
  field: string;
  hubKey: string;
  platformKey: string;
  type: 'string' | 'number';
}> = [
  { field: 'title', hubKey: 'title', platformKey: 'title', type: 'string' },
  { field: 'description', hubKey: 'description', platformKey: 'description', type: 'string' },
  { field: 'start_time', hubKey: 'start_time', platformKey: 'date', type: 'string' },
  { field: 'venue', hubKey: 'venue', platformKey: 'venue', type: 'string' },
  { field: 'price', hubKey: 'price', platformKey: 'ticketPrice', type: 'number' },
  { field: 'capacity', hubKey: 'capacity', platformKey: 'capacity', type: 'number' },
];

export interface FieldConflict {
  field: string;
  hubValue: string | number | null;
  platformValues: Array<{
    platform: PlatformName;
    value: string | number | null;
    externalUrl?: string;
  }>;
}

export function normalizeString(v: string | null | undefined): string | null {
  if (v == null || v === '') return null;
  return v.trim();
}

export function valuesMatch(
  a: string | number | null,
  b: string | number | null,
  type: 'string' | 'number',
): boolean {
  if (a == null || b == null) return true; // null = not present on platform, not a conflict
  if (type === 'number') return Number(a) === Number(b);
  return normalizeString(String(a)) === normalizeString(String(b));
}
