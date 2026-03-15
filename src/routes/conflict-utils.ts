import type { PlatformName } from '../shared/types.js';

export const COMPARABLE_FIELDS: Array<{
  field: string;
  hubKey: string;
  platformKey: string;
  type: 'string' | 'number' | 'datetime' | 'text';
}> = [
  { field: 'title', hubKey: 'title', platformKey: 'title', type: 'string' },
  { field: 'description', hubKey: 'description', platformKey: 'description', type: 'text' },
  { field: 'start_time', hubKey: 'start_time', platformKey: 'date', type: 'datetime' },
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

/**
 * Strip HTML tags and normalize whitespace for text comparison.
 * Platforms store descriptions in different formats (HTML, markdown, plain text).
 */
function normalizeText(v: string | null | undefined): string | null {
  if (v == null || v === '') return null;
  // Strip HTML tags
  let text = v.replace(/<[^>]*>/g, ' ');
  // Normalize whitespace (newlines, tabs, multiple spaces → single space)
  text = text.replace(/\s+/g, ' ').trim();
  // Lowercase for comparison
  return text.toLowerCase() || null;
}

/**
 * Normalize datetime strings for comparison.
 * "2026-03-19T19:00:00Z" and "2026-03-19T19:00:00.000Z" should match.
 */
function normalizeDatetime(v: string | null | undefined): number | null {
  if (v == null || v === '') return null;
  try {
    const ts = new Date(v).getTime();
    return isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

export function valuesMatch(
  a: string | number | null,
  b: string | number | null,
  type: 'string' | 'number' | 'datetime' | 'text',
): boolean {
  if (type === 'number') {
    // For numbers, treat null/undefined/empty/0 as equivalent (all mean "free" or "no data")
    const na = (a == null || a === '') ? 0 : Number(a);
    const nb = (b == null || b === '') ? 0 : Number(b);
    if (isNaN(na) && isNaN(nb)) return true;
    return na === nb;
  }

  if (type === 'datetime') {
    const ta = normalizeDatetime(a != null ? String(a) : null);
    const tb = normalizeDatetime(b != null ? String(b) : null);
    if (ta == null && tb == null) return true;
    if (ta == null || tb == null) return false;
    // Allow 60 second tolerance (some platforms round to nearest minute)
    return Math.abs(ta - tb) < 60_000;
  }

  if (type === 'text') {
    // For long text fields (description), normalize HTML/whitespace before comparing
    const sa = normalizeText(a != null ? String(a) : null);
    const sb = normalizeText(b != null ? String(b) : null);
    if (sa == null && sb == null) return true;
    if (sa == null || sb == null) return false;
    // Check if one contains the other (platforms often truncate descriptions)
    if (sa.length > 20 && sb.length > 20) {
      const shorter = sa.length < sb.length ? sa : sb;
      const longer = sa.length < sb.length ? sb : sa;
      // If the shorter text is substantially contained in the longer, it's a match
      if (longer.includes(shorter)) return true;
      // If >80% of content overlaps, consider it a match
      const overlap = shorter.length / longer.length;
      if (overlap > 0.8 && shorter.slice(0, 100) === longer.slice(0, 100)) return true;
    }
    return sa === sb;
  }

  // For regular strings (title, venue), normalize and compare
  const sa = normalizeString(a != null ? String(a) : null);
  const sb = normalizeString(b != null ? String(b) : null);
  // Both null/empty = match (neither has data)
  if (sa == null && sb == null) return true;
  // One has data, other doesn't = mismatch
  if (sa == null || sb == null) return false;
  // Exact match
  if (sa === sb) return true;
  // Check if one contains the other (e.g., "The Greenhouse" vs "The Greenhouse, Bristol")
  const la = sa.toLowerCase();
  const lb = sb.toLowerCase();
  if (la.includes(lb) || lb.includes(la)) return true;
  return false;
}
