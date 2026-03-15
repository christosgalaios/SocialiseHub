import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { getPricingAnalysis } from '../../api/events';
import type { PricingAnalysis } from '../../api/events';
import { ListSkeleton } from '../Skeleton';

const RANGE_LABELS: Record<string, string> = {
  free: 'Free',
  under_10: 'Under £10',
  '10_to_20': '£10–£20',
  over_20: '£20+',
};

const RANGE_COLORS: Record<string, string> = {
  free: '#10b981',
  under_10: '#3b82f6',
  '10_to_20': '#f59e0b',
  over_20: '#ef4444',
};

const PLATFORM_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

function fillRateColor(rate: number | null): string {
  if (rate === null) return '#555';
  if (rate >= 75) return '#10b981';
  if (rate >= 40) return '#f59e0b';
  return '#ef4444';
}

export function PricingTab() {
  const [data, setData] = useState<PricingAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPricingAnalysis()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load pricing data');
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
          <div style={s.sectionTitle}>Price Range Analysis</div>
          <ListSkeleton rows={4} />
        </div>
        <div style={s.section}>
          <div style={s.sectionTitle}>Revenue per Attendee by Platform</div>
          <ListSkeleton rows={3} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={s.wrapper}>
        <div style={s.errorBox}>
          <span>{error}</span>
          <button style={s.retryBtn} onClick={load}>Retry</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const maxRevenue = Math.max(...data.priceRanges.map((r) => r.totalRevenue), 1);
  const maxRpa = Math.max(...data.revenuePerAttendee.map((r) => r.revenuePerAttendee), 1);

  return (
    <div style={s.wrapper}>
      {/* Price Range Analysis */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Price Range Analysis</div>
        {data.priceRanges.length === 0 ? (
          <div style={s.empty}>No pricing data available</div>
        ) : (
          <div style={s.tableWrapper}>
            <div style={s.tableHeader}>
              <span style={{ ...s.col, ...s.colRange }}>Range</span>
              <span style={{ ...s.col, ...s.colCount }}>Events</span>
              <span style={{ ...s.col, ...s.colFill }}>Avg Fill Rate</span>
              <span style={{ ...s.col, ...s.colAttend }}>Avg Attendance</span>
              <span style={{ ...s.col, ...s.colRevenue }}>Total Revenue</span>
            </div>
            {data.priceRanges.map((row) => {
              const label = RANGE_LABELS[row.range] ?? row.range;
              const accent = RANGE_COLORS[row.range] ?? '#8b5cf6';
              const barWidth = maxRevenue > 0 ? (row.totalRevenue / maxRevenue) * 100 : 0;
              return (
                <div key={row.range} style={s.tableRow}>
                  <span style={{ ...s.col, ...s.colRange }}>
                    <span style={{ ...s.rangeDot, background: accent }} />
                    <span style={{ color: '#fff', fontWeight: 600 }}>{label}</span>
                  </span>
                  <span style={{ ...s.col, ...s.colCount, color: '#ccc' }}>{row.eventCount}</span>
                  <span style={{ ...s.col, ...s.colFill }}>
                    {row.avgFillRate !== null ? (
                      <span style={{ color: fillRateColor(row.avgFillRate), fontWeight: 600 }}>
                        {row.avgFillRate.toFixed(1)}%
                      </span>
                    ) : (
                      <span style={{ color: '#555' }}>—</span>
                    )}
                  </span>
                  <span style={{ ...s.col, ...s.colAttend, color: '#ccc' }}>
                    {row.avgAttendance !== null ? Math.round(row.avgAttendance) : '—'}
                  </span>
                  <span style={{ ...s.col, ...s.colRevenue }}>
                    <div style={s.barTrack}>
                      <div style={{ ...s.barFill, width: `${barWidth}%`, background: accent }} />
                    </div>
                    <span style={{ color: '#ccc', fontSize: 12, minWidth: 60, textAlign: 'right' }}>
                      £{row.totalRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Revenue per Attendee by Platform */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Revenue per Attendee by Platform</div>
        {data.revenuePerAttendee.length === 0 ? (
          <div style={s.empty}>No revenue data available</div>
        ) : (
          <div style={s.platformGrid}>
            {data.revenuePerAttendee.map((row, i) => {
              const color = PLATFORM_COLORS[i % PLATFORM_COLORS.length];
              const barWidth = maxRpa > 0 ? (row.revenuePerAttendee / maxRpa) * 100 : 0;
              return (
                <div key={row.platform} style={{ ...s.platformCard, borderLeft: `4px solid ${color}` }}>
                  <div style={s.platformTop}>
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, textTransform: 'capitalize' }}>
                      {row.platform}
                    </span>
                    <span style={{ color: '#888', fontSize: 12 }}>{row.eventCount} event{row.eventCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ color, fontSize: 26, fontWeight: 700, lineHeight: 1.1, marginBottom: 10 }}>
                    £{row.revenuePerAttendee.toFixed(2)}
                    <span style={{ color: '#666', fontSize: 12, fontWeight: 400, marginLeft: 4 }}>/ attendee</span>
                  </div>
                  <div style={s.barTrack}>
                    <div style={{ ...s.barFill, width: `${barWidth}%`, background: color }} />
                  </div>
                </div>
              );
            })}
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
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8,
    padding: '12px 16px',
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
  tableWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 0 10px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    marginBottom: 4,
  },
  tableRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  col: {
    display: 'flex',
    alignItems: 'center',
    color: '#888',
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  colRange: {
    flex: '0 0 140px',
    gap: 8,
  },
  colCount: {
    flex: '0 0 70px',
    justifyContent: 'center',
    textTransform: 'none' as const,
    fontWeight: 400,
    fontSize: 14,
  },
  colFill: {
    flex: '0 0 110px',
    justifyContent: 'center',
    textTransform: 'none' as const,
    fontWeight: 400,
    fontSize: 14,
  },
  colAttend: {
    flex: '0 0 110px',
    justifyContent: 'center',
    textTransform: 'none' as const,
    fontWeight: 400,
    fontSize: 14,
  },
  colRevenue: {
    flex: 1,
    gap: 10,
    textTransform: 'none' as const,
    fontWeight: 400,
    fontSize: 14,
    minWidth: 0,
  },
  rangeDot: {
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  barTrack: {
    flex: 1,
    height: 6,
    background: 'rgba(255,255,255,0.07)',
    borderRadius: 3,
    overflow: 'hidden',
    minWidth: 0,
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.3s ease',
  },
  platformGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 14,
  },
  platformCard: {
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: '16px 18px',
    border: '1px solid rgba(255,255,255,0.07)',
  },
  platformTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
};
