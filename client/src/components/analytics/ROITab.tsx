import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { getRoiAnalysis } from '../../api/events';
import { ListSkeleton } from '../Skeleton';

type RoiData = Awaited<ReturnType<typeof getRoiAnalysis>>;

const MEDAL_COLORS = ['#f59e0b', '#9ca3af', '#cd7f32'] as const; // gold, silver, bronze

function fmt(n: number) {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtShort(n: number) {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(1)}k`;
  return fmt(n);
}

// ── Top Performing Events ──────────────────────────────────────────────────

function TopEventsSection({ events }: { events: RoiData['topEvents'] }) {
  if (events.length === 0) {
    return <div style={S.emptyMsg}>No event revenue data available.</div>;
  }

  return (
    <section style={S.section}>
      <h3 style={S.sectionHeading}>Top Performing Events</h3>
      <div style={S.tableWrapper}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>#</th>
              <th style={S.th}>Event</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Platform</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Revenue</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Attendees</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Fill Rate</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Rev / Head</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev, i) => {
              const medalColor = i < 3 ? MEDAL_COLORS[i] : undefined;
              return (
                <tr key={i} style={i % 2 === 0 ? S.rowEven : S.rowOdd}>
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    <span style={{ color: medalColor ?? '#555', fontWeight: 700, fontSize: 13 }}>
                      {i + 1}
                    </span>
                  </td>
                  <td style={S.td}>
                    <div style={{ color: '#fff', fontWeight: 500 }}>{ev.title}</div>
                    {ev.date && (
                      <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>
                        {new Date(ev.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', color: '#888', fontSize: 12 }}>
                    {ev.platform}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                    {fmt(ev.revenue)}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', color: '#3b82f6' }}>
                    {ev.attendance.toLocaleString()}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', color: '#8b5cf6' }}>
                    {ev.fillRate != null ? `${ev.fillRate}%` : '—'}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>
                    {fmt(ev.revenuePerHead)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Monthly Revenue Trend ──────────────────────────────────────────────────

function MonthlyRevenueSection({ months }: { months: RoiData['monthlyRevenue'] }) {
  if (months.length === 0) {
    return (
      <section style={S.section}>
        <h3 style={S.sectionHeading}>Monthly Revenue Trend</h3>
        <div style={S.emptyMsg}>No monthly revenue data available.</div>
      </section>
    );
  }

  const maxRevenue = Math.max(...months.map(m => m.revenue), 1);

  return (
    <section style={S.section}>
      <h3 style={S.sectionHeading}>Monthly Revenue Trend</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {months.map((m, i) => {
          const pct = (m.revenue / maxRevenue) * 100;
          return (
            <div key={i} style={S.barRow}>
              <div style={S.barLabel}>{m.month}</div>
              <div style={S.barTrack}>
                <div
                  style={{
                    ...S.barFill,
                    width: `${pct}%`,
                    background: pct === 100 ? '#f59e0b' : '#3b82f6',
                  }}
                />
              </div>
              <div style={S.barMeta}>
                <span style={{ color: '#10b981', fontWeight: 600, minWidth: 70, textAlign: 'right' }}>
                  {fmtShort(m.revenue)}
                </span>
                <span style={{ color: '#888', fontSize: 11, marginLeft: 12 }}>
                  {m.attendees.toLocaleString()} att.
                </span>
                <span style={{ color: '#888', fontSize: 11, marginLeft: 8 }}>
                  {m.eventCount} {m.eventCount === 1 ? 'event' : 'events'}
                </span>
                <span style={{ color: '#f59e0b', fontSize: 11, marginLeft: 12, minWidth: 60, textAlign: 'right' }}>
                  {fmt(m.revenuePerHead)} / head
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Platform Efficiency ────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  meetup: '#f0522b',
  eventbrite: '#f05537',
  headfirst: '#00b4d8',
};

function platformColor(name: string) {
  return PLATFORM_COLORS[name.toLowerCase()] ?? '#6366f1';
}

function PlatformEfficiencySection({ platforms }: { platforms: RoiData['platformEfficiency'] }) {
  if (platforms.length === 0) {
    return (
      <section style={S.section}>
        <h3 style={S.sectionHeading}>Platform Efficiency</h3>
        <div style={S.emptyMsg}>No platform data available.</div>
      </section>
    );
  }

  return (
    <section style={S.section}>
      <h3 style={S.sectionHeading}>Platform Efficiency</h3>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {platforms.map((p, i) => {
          const accent = platformColor(p.platform);
          return (
            <div key={i} style={{ ...S.platformCard, borderLeft: `4px solid ${accent}` }}>
              <div style={{ color: accent, fontWeight: 700, fontSize: 15, marginBottom: 14, textTransform: 'capitalize' }}>
                {p.platform}
              </div>
              <div style={S.platformStat}>
                <span style={S.platformStatLabel}>Events</span>
                <span style={S.platformStatValue}>{p.eventCount}</span>
              </div>
              <div style={S.platformStat}>
                <span style={S.platformStatLabel}>Total Revenue</span>
                <span style={{ ...S.platformStatValue, color: '#10b981' }}>{fmtShort(p.totalRevenue)}</span>
              </div>
              <div style={S.platformStat}>
                <span style={S.platformStatLabel}>Total Attendees</span>
                <span style={{ ...S.platformStatValue, color: '#3b82f6' }}>{p.totalAttendees.toLocaleString()}</span>
              </div>
              <div style={S.platformStat}>
                <span style={S.platformStatLabel}>Avg Revenue / Event</span>
                <span style={{ ...S.platformStatValue, color: '#f59e0b' }}>{fmtShort(p.avgRevenue)}</span>
              </div>
              <div style={{ ...S.platformStat, borderBottom: 'none', paddingBottom: 0 }}>
                <span style={S.platformStatLabel}>Revenue / Head</span>
                <span style={{ ...S.platformStatValue, color: '#8b5cf6' }}>{fmt(p.revenuePerHead)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Root Component ─────────────────────────────────────────────────────────

export function ROITab() {
  const [data, setData] = useState<RoiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    let cancelled = false;

    getRoiAnalysis()
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e instanceof Error ? e.message : 'Failed to load ROI data'); setLoading(false); } });

    return () => { cancelled = true; };
  }

  useEffect(() => {
    return load();
  }, []);

  if (loading) return <ListSkeleton rows={6} />;

  if (error) {
    return (
      <div style={S.errorBox}>
        <span style={{ color: '#ef4444' }}>{error}</span>
        <button style={S.retryBtn} onClick={load}>Retry</button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={S.root}>
      <TopEventsSection events={data.topEvents} />
      <MonthlyRevenueSection months={data.monthlyRevenue} />
      <PlatformEfficiencySection platforms={data.platformEfficiency} />
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const S: Record<string, CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 32,
  },
  section: {
    background: '#1e1e2e',
    borderRadius: 12,
    padding: '24px 28px',
  },
  sectionHeading: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    margin: '0 0 20px 0',
    letterSpacing: '0.2px',
  },
  emptyMsg: {
    color: '#555',
    fontSize: 13,
    fontStyle: 'italic',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 10,
    padding: '14px 18px',
    color: '#ef4444',
    fontSize: 13,
  },
  retryBtn: {
    background: 'rgba(239,68,68,0.15)',
    color: '#ef4444',
    border: '1px solid rgba(239,68,68,0.4)',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },

  // Table
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    color: '#666',
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    padding: '0 12px 10px 0',
    borderBottom: '1px solid #2a2a3e',
    textAlign: 'left' as const,
    whiteSpace: 'nowrap' as const,
  },
  td: {
    color: '#ccc',
    padding: '10px 12px 10px 0',
    borderBottom: '1px solid #1a1a28',
    verticalAlign: 'middle' as const,
  },
  rowEven: {
    background: 'transparent',
  },
  rowOdd: {
    background: 'rgba(255,255,255,0.02)',
  },

  // Bar chart
  barRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  barLabel: {
    color: '#888',
    fontSize: 12,
    width: 72,
    flexShrink: 0,
    textAlign: 'right' as const,
  },
  barTrack: {
    flex: 1,
    background: '#2a2a3e',
    borderRadius: 4,
    height: 18,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    minWidth: 4,
    transition: 'width 0.3s ease',
  },
  barMeta: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    minWidth: 260,
  },

  // Platform cards
  platformCard: {
    background: '#16162a',
    borderRadius: 10,
    padding: '18px 20px',
    minWidth: 200,
    flex: '1 1 200px',
    maxWidth: 280,
  },
  platformStat: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: '1px solid #1e1e2e',
  },
  platformStatLabel: {
    color: '#666',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.4px',
  },
  platformStatValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
  },
};
