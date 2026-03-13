import type { DashboardSummary } from '@shared/types';
import { PLATFORM_COLORS } from '../lib/platforms';

interface DashboardSummaryProps {
  summary: DashboardSummary;
}

export function DashboardSummaryCards({ summary }: DashboardSummaryProps) {
  const platformEntries = Object.entries(summary.byPlatform) as [string, number][];

  return (
    <div style={styles.row}>
      <StatCard label="Total Events" value={summary.totalEvents} />
      <StatCard label="This Week" value={summary.eventsThisWeek} />
      <StatCard label="This Month" value={summary.eventsThisMonth} />
      <div style={styles.card}>
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
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.card}>
      <span style={styles.cardLabel}>{label}</span>
      <span style={styles.cardValue}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 32,
  },
  card: {
    flex: '1 1 160px',
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
};
