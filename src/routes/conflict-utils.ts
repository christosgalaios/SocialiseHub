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
  if (type === 'number') {
    // For numbers, treat null/0 as equivalent (no data)
    const na = a == null ? null : Number(a);
    const nb = b == null ? null : Number(b);
    if (na == null && nb == null) return true;
    if (na == null || nb == null) return false;
    return na === nb;
  }
  // For strings, normalize first (empty string → null)
  const sa = normalizeString(a != null ? String(a) : null);
  const sb = normalizeString(b != null ? String(b) : null);
  // Both null/empty = match (neither has data)
  if (sa == null && sb == null) return true;
  // One has data, other doesn't = mismatch
  if (sa == null || sb == null) return false;
  return sa === sb;
}
