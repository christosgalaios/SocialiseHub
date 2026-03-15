import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SocialiseEvent, PlatformName, EventStatus } from '@shared/types';
import { PLATFORM_COLORS } from '../lib/platforms';

interface EventTimelineProps {
  events: SocialiseEvent[];
}

const STATUS_COLORS: Record<EventStatus, { bg: string; color: string }> = {
  draft: { bg: '#f0f0f0', color: '#666' },
  published: { bg: '#e6f4ea', color: '#1e7e34' },
  cancelled: { bg: '#fce8e6', color: '#c0392b' },
  archived: { bg: '#e8e6e1', color: '#9ca3af' },
};

const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Platforms' },
  { value: 'meetup', label: 'Meetup' },
  { value: 'eventbrite', label: 'Eventbrite' },
  { value: 'headfirst', label: 'Headfirst' },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'archived', label: 'Archived' },
];

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function EventTimeline({ events }: EventTimelineProps) {
  const nav = useNavigate();
  const [platformFilter, setPlatformFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = events.filter((ev) => {
    if (statusFilter && ev.status !== statusFilter) return false;
    if (platformFilter) {
      const hasPlatform = ev.platforms.some((p) => p.platform === platformFilter);
      if (!hasPlatform) return false;
    }
    return true;
  });

  return (
    <div>
      {/* Filter bar */}
      <div style={styles.filterBar}>
        <select
          style={styles.select}
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
        >
          {PLATFORM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          style={styles.select}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span style={styles.count}>
          {filtered.length} event{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyTitle}>No events match this filter</p>
        </div>
      ) : (
        <div style={styles.table}>
          {/* Header */}
          <div style={styles.headerRow}>
            <span style={{ ...styles.headerCell, flex: 3 }}>Title</span>
            <span style={{ ...styles.headerCell, flex: 2 }}>Date</span>
            <span style={{ ...styles.headerCell, flex: 2 }}>Venue</span>
            <span style={{ ...styles.headerCell, flex: 1 }}>Status</span>
            <span style={{ ...styles.headerCell, flex: 2 }}>Platforms</span>
          </div>

          {filtered.map((ev) => {
            const statusStyle = STATUS_COLORS[ev.status] ?? STATUS_COLORS.draft;
            return (
              <div
                key={ev.id}
                style={styles.row}
                onClick={() => nav(`/events/${ev.id}`)}
              >
                <span style={{ ...styles.cell, flex: 3, fontWeight: 600, color: '#080810' }}>
                  {ev.title}
                </span>
                <span style={{ ...styles.cell, flex: 2, color: '#555' }}>
                  {formatDate(ev.start_time)}
                </span>
                <span style={{ ...styles.cell, flex: 2, color: '#555' }}>
                  {ev.venue || '—'}
                </span>
                <span style={{ ...styles.cell, flex: 1 }}>
                  <span
                    style={{
                      ...styles.badge,
                      background: statusStyle.bg,
                      color: statusStyle.color,
                    }}
                  >
                    {ev.status.charAt(0).toUpperCase() + ev.status.slice(1)}
                  </span>
                </span>
                <span style={{ ...styles.cell, flex: 2, display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                  {ev.platforms.length === 0 ? (
                    <span style={styles.noPlatform}>None</span>
                  ) : (
                    ev.platforms.map((ps) => (
                      <span
                        key={ps.platform}
                        style={{
                          ...styles.platformBadge,
                          background: PLATFORM_COLORS[ps.platform] ?? '#888',
                        }}
                      >
                        {(ps.platform as PlatformName).charAt(0).toUpperCase()}
                      </span>
                    ))
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap' as const,
  },
  select: {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #ddd',
    fontSize: 13,
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 600,
    color: '#333',
    background: '#fff',
    cursor: 'pointer',
    outline: 'none',
  },
  count: {
    fontSize: 13,
    color: '#7a7a7a',
    marginLeft: 'auto',
  },
  table: {
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 16,
    overflow: 'hidden',
  },
  headerRow: {
    display: 'flex',
    padding: '10px 20px',
    background: '#FAFAF6',
    borderBottom: '1px solid #e8e6e1',
  },
  headerCell: {
    fontSize: 11,
    fontWeight: 700,
    color: '#7a7a7a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    fontFamily: "'Outfit', sans-serif",
  },
  row: {
    display: 'flex',
    padding: '14px 20px',
    borderBottom: '1px solid #f0ede8',
    cursor: 'pointer',
    transition: 'background 0.15s',
    alignItems: 'center',
  },
  cell: {
    fontSize: 13,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    paddingRight: 8,
  },
  badge: {
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
  },
  platformBadge: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    color: '#fff',
    fontSize: 11,
    fontWeight: 800,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  noPlatform: {
    fontSize: 12,
    color: '#bbb',
  },
  empty: {
    textAlign: 'center' as const,
    padding: '48px 0',
  },
  emptyTitle: {
    fontSize: 15,
    color: '#7a7a7a',
  },
};
