import type { DashboardSummary } from '@shared/types';
import { PLATFORM_COLORS } from '../lib/platforms';

interface DashboardSummaryProps {
  summary: DashboardSummary;
}

export function DashboardSummaryCards({ summary }: DashboardSummaryProps) {
  const platformEntries = Object.entries(summary.byPlatform) as [string, number][];
  const trend = summary.monthlyTrend ?? [];
  const maxTrend = Math.max(...trend.map((t) => t.count), 1);

  return (
    <div>
      {/* Top stat cards */}
      <div style={styles.row}>
        <StatCard label="Total Events" value={summary.totalEvents} />
        <StatCard label="Upcoming" value={summary.upcomingEvents ?? 0} accent="#2D5F5D" />
        <StatCard label="Drafts" value={summary.draftEvents ?? 0} accent="#d4a017" />
        <StatCard label="Past" value={summary.pastEvents ?? 0} accent="#7a7a7a" />
        <StatCard label="This Week" value={summary.eventsThisWeek} />
        <StatCard label="This Month" value={summary.eventsThisMonth} />
      </div>

      {/* Bottom row: platform breakdown + monthly trend */}
      <div style={styles.row}>
        <div style={{ ...styles.card, flex: '1 1 200px' }}>
          <span style={styles.cardLabel}>By Platform</span>
          <div style={styles.platformList}>
            {platformEntries.length === 0 ? (
              <span style={styles.noPlatforms}>None yet</span>
            ) : (
              platformEntries.map(([platform, count]) => (
                <div key={platform} style={styles.platformRow}>
                  <span
                    style={{
                      ...styles.dot,
                      background: PLATFORM_COLORS[platform] ?? '#aaa',
                    }}
                  />
                  <span style={styles.platformName}>
                    {platform.charAt(0).toUpperCase() + platform.slice(1)}
                  </span>
                  <span style={styles.platformCount}>{count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {trend.length > 0 && (
          <div style={{ ...styles.card, flex: '2 1 300px' }}>
            <span style={styles.cardLabel}>Monthly Trend (6 months)</span>
            <div style={styles.chartContainer}>
              {trend.map((t) => {
                const height = Math.max((t.count / maxTrend) * 100, 4);
                const label = new Date(t.month + '-01').toLocaleDateString('en-GB', {
                  month: 'short',
                });
                return (
                  <div key={t.month} style={styles.barCol}>
                    <span style={styles.barValue}>{t.count}</span>
                    <div
                      style={{
                        ...styles.bar,
                        height: `${height}%`,
                      }}
                    />
                    <span style={styles.barLabel}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={styles.card}>
      <span style={styles.cardLabel}>{label}</span>
      <span style={{ ...styles.cardValue, color: accent ?? '#080810' }}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  card: {
    flex: '1 1 140px',
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 16,
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#7a7a7a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    fontFamily: "'Outfit', sans-serif",
  },
  cardValue: {
    fontSize: 36,
    fontWeight: 700,
    color: '#080810',
    fontFamily: "'Outfit', sans-serif",
    lineHeight: 1,
  },
  platformList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 4,
  },
  platformRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  platformName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#333',
    flex: 1,
  },
  platformCount: {
    fontSize: 13,
    fontWeight: 700,
    color: '#080810',
  },
  noPlatforms: {
    fontSize: 13,
    color: '#aaa',
  },
  chartContainer: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 12,
    height: 120,
    marginTop: 8,
    paddingTop: 4,
  },
  barCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    height: '100%',
    justifyContent: 'flex-end',
  },
  barValue: {
    fontSize: 11,
    fontWeight: 700,
    color: '#080810',
    fontFamily: "'Outfit', sans-serif",
  },
  bar: {
    width: '100%',
    maxWidth: 48,
    background: 'linear-gradient(180deg, #E2725B 0%, #e89a89 100%)',
    borderRadius: '6px 6px 0 0',
    transition: 'height 0.3s ease',
    minHeight: 4,
  },
  barLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#7a7a7a',
    fontFamily: "'Outfit', sans-serif",
  },
};
