import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { getVenueAnalytics } from '../../api/events';
import { ListSkeleton } from '../Skeleton';

type VenueRow = {
  venue: string;
  eventCount: number;
  avgScore: number | null;
  platformCount: number;
};

type VenuePerformanceRow = {
  venue: string;
  platform: string;
  eventCount: number;
  avgFillRate: number | null;
  avgAttendance: number | null;
  totalRevenue: number;
};

function scoreColor(score: number | null): string {
  if (score === null) return '#555';
  if (score >= 70) return '#10b981';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

function platformBadgeLabel(count: number): string {
  return count === 1 ? '1 platform' : `${count} platforms`;
}

export function VenueTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [venuePerformance, setVenuePerformance] = useState<VenuePerformanceRow[]>([]);

  const load = () => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getVenueAnalytics()
      .then((data) => {
        if (cancelled) return;
        setVenues(data.venues);
        setVenuePerformance(data.venuePerformance);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load venue analytics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  };

  useEffect(() => {
    return load();
  }, []);

  if (loading) {
    return (
      <div style={s.wrapper}>
        <div style={s.section}>
          <div style={s.sectionTitle}>Venue Overview</div>
          <ListSkeleton rows={5} />
        </div>
        <div style={s.section}>
          <div style={s.sectionTitle}>Venue Performance</div>
          <ListSkeleton rows={5} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={s.wrapper}>
        <div style={s.errorBanner}>
          <span>{error}</span>
          <button style={s.retryBtn} onClick={load}>Retry</button>
        </div>
      </div>
    );
  }

  const maxEventCount = venues.length > 0 ? Math.max(...venues.map((v) => v.eventCount)) : 1;

  return (
    <div style={s.wrapper}>
      {/* Venue Overview */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Venue Overview</div>
        {venues.length === 0 ? (
          <div style={s.empty}>No venue data available yet</div>
        ) : (
          <div style={s.tableWrapper}>
            <div style={s.tableHeader}>
              <span style={{ ...s.col, ...s.colVenue }}>Venue</span>
              <span style={{ ...s.col, ...s.colEvents }}>Events</span>
              <span style={{ ...s.col, ...s.colScore }}>Avg Score</span>
              <span style={{ ...s.col, ...s.colPlatforms }}>Platforms</span>
            </div>
            {venues.map((row) => {
              const barPct = maxEventCount > 0 ? (row.eventCount / maxEventCount) * 100 : 0;
              const color = scoreColor(row.avgScore);
              return (
                <div key={row.venue} style={s.tableRow}>
                  <span style={{ ...s.col, ...s.colVenue, color: '#fff', fontWeight: 600 }}>
                    {row.venue || <em style={{ color: '#555' }}>Unknown</em>}
                  </span>
                  <span style={{ ...s.col, ...s.colEvents }}>
                    <div style={s.barTrack}>
                      <div style={{ ...s.barFill, width: `${barPct}%` }} />
                    </div>
                    <span style={s.barLabel}>{row.eventCount}</span>
                  </span>
                  <span style={{ ...s.col, ...s.colScore }}>
                    {row.avgScore !== null ? (
                      <span style={{ color, fontWeight: 700, fontSize: 14 }}>
                        {row.avgScore.toFixed(1)}
                      </span>
                    ) : (
                      <span style={{ color: '#555', fontSize: 13 }}>—</span>
                    )}
                  </span>
                  <span style={{ ...s.col, ...s.colPlatforms }}>
                    <span style={{ ...s.badge, background: 'rgba(139,92,246,0.18)', color: '#a78bfa' }}>
                      {platformBadgeLabel(row.platformCount)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Venue Performance */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Venue Performance</div>
        {venuePerformance.length === 0 ? (
          <div style={s.empty}>No performance data available yet</div>
        ) : (
          <div style={s.perfGrid}>
            {venuePerformance.map((row, i) => (
              <div key={`${row.venue}-${row.platform}-${i}`} style={s.perfCard}>
                <div style={s.perfHeader}>
                  <div style={s.perfVenue}>{row.venue || <em style={{ color: '#555' }}>Unknown</em>}</div>
                  <span style={{ ...s.badge, background: 'rgba(59,130,246,0.18)', color: '#60a5fa' }}>
                    {row.platform}
                  </span>
                </div>
                <div style={s.perfStats}>
                  <div style={s.perfStat}>
                    <span style={s.perfStatLabel}>Events</span>
                    <span style={s.perfStatValue}>{row.eventCount}</span>
                  </div>
                  <div style={s.perfStat}>
                    <span style={s.perfStatLabel}>Fill Rate</span>
                    <span style={s.perfStatValue}>
                      {row.avgFillRate !== null ? `${row.avgFillRate.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <div style={s.perfStat}>
                    <span style={s.perfStatLabel}>Avg Attendance</span>
                    <span style={s.perfStatValue}>
                      {row.avgAttendance !== null ? Math.round(row.avgAttendance).toLocaleString() : '—'}
                    </span>
                  </div>
                  <div style={s.perfStat}>
                    <span style={s.perfStatLabel}>Revenue</span>
                    <span style={{ ...s.perfStatValue, color: '#10b981' }}>
                      £{row.totalRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  section: {
    background: '#1e1e2e',
    borderRadius: 12,
    padding: '20px 24px',
  },
  sectionTitle: {
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    marginBottom: 16,
  },
  empty: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    padding: '20px 0',
  },
  errorBanner: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 10,
    padding: '14px 18px',
    color: '#ef4444',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  retryBtn: {
    background: 'rgba(239,68,68,0.2)',
    color: '#ef4444',
    border: '1px solid rgba(239,68,68,0.4)',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
  },
  tableWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 0 10px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: 4,
  },
  tableRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  col: {
    color: '#888',
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  colVenue: {
    flex: 2,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    paddingRight: 12,
  },
  colEvents: {
    flex: 2,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingRight: 12,
  },
  colScore: {
    flex: 1,
    paddingRight: 12,
  },
  colPlatforms: {
    flex: 1,
  },
  barTrack: {
    flex: 1,
    height: 6,
    background: 'rgba(255,255,255,0.07)',
    borderRadius: 3,
    overflow: 'hidden',
    minWidth: 40,
    maxWidth: 120,
  },
  barFill: {
    height: '100%',
    background: '#3b82f6',
    borderRadius: 3,
    transition: 'width 0.3s ease',
  },
  barLabel: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: 600,
    minWidth: 20,
    textAlign: 'right' as const,
  },
  badge: {
    display: 'inline-block',
    borderRadius: 6,
    padding: '2px 8px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.3px',
  },
  perfGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 12,
  },
  perfCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  perfHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  perfVenue: {
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    lineHeight: 1.3,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  perfStats: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px 12px',
  },
  perfStat: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  perfStatLabel: {
    color: '#666',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.4px',
  },
  perfStatValue: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: 600,
  },
};
