import { useNavigate } from 'react-router-dom';
import type { PerformanceStats } from '../../api/dashboard';

function TrendArrow({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <span style={{ color: '#22c55e', fontWeight: 700 }}>↑</span>;
  if (trend === 'down') return <span style={{ color: '#ef4444', fontWeight: 700 }}>↓</span>;
  return <span style={{ color: '#9ca3af', fontWeight: 700 }}>→</span>;
}

export function PerformanceSection({ stats }: { stats: PerformanceStats }) {
  const navigate = useNavigate();

  const cards = [
    {
      label: 'Upcoming Events',
      value: String(stats.upcomingCount),
      trend: null as null,
    },
    {
      label: 'Attendees (30d)',
      value: String(stats.attendeesLast30),
      trend: stats.attendeesTrend,
    },
    {
      label: 'Revenue (30d)',
      value: `£${stats.revenueLast30.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      trend: stats.revenueTrend,
    },
    {
      label: 'Avg Fill Rate',
      value: stats.avgFillRate !== null ? `${Math.round(stats.avgFillRate)}%` : '—',
      trend: null as null,
    },
  ];

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>Performance</h2>
      <div style={styles.grid}>
        {cards.map((card) => (
          <div key={card.label} style={styles.card}>
            <span style={styles.cardLabel}>{card.label}</span>
            <div style={styles.cardValueRow}>
              <span style={styles.cardValue}>{card.value}</span>
              {card.trend && <TrendArrow trend={card.trend} />}
            </div>
          </div>
        ))}
      </div>
      <button style={styles.analyticsLink} onClick={() => navigate('/analytics')}>
        View Analytics →
      </button>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 18,
    fontWeight: 700,
    color: '#080810',
    margin: 0,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
  },
  card: {
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 16,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  cardLabel: {
    fontSize: 12,
    color: '#7a7a7a',
    fontWeight: 500,
  },
  cardValueRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  cardValue: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 24,
    fontWeight: 700,
    color: '#080810',
    lineHeight: 1,
  },
  analyticsLink: {
    alignSelf: 'flex-end',
    background: 'none',
    border: 'none',
    color: '#2D5F5D',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '4px 0',
    fontFamily: 'inherit',
  },
};
