import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { EventHealth, HealthSummary } from '../../api/dashboard';
import { getHealth } from '../../api/dashboard';
import { ListSkeleton } from '../Skeleton';

const DISPLAY_LIMIT = 8;

function healthColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function healthLabel(score: number): string {
  if (score >= 70) return 'healthy';
  if (score >= 50) return 'fair';
  return 'poor';
}

function HealthBar({ score }: { score: number }) {
  const color = healthColor(score);
  return (
    <div style={styles.healthBarWrap}>
      <div
        style={{
          ...styles.healthBarFill,
          width: `${score}%`,
          background: color,
        }}
      />
    </div>
  );
}

function HealthBadge({ score }: { score: number }) {
  const color = healthColor(score);
  return (
    <span
      style={{
        ...styles.healthBadge,
        background: color + '1a',
        color,
        borderColor: color + '55',
      }}
    >
      {score}%
    </span>
  );
}

function FactorBadge({ label }: { label: string }) {
  return <span style={styles.factorBadge}>{label}</span>;
}

export function HealthSection() {
  const navigate = useNavigate();
  const [data, setData] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    let cancelled = false;
    getHealth()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load health data');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }

  useEffect(() => {
    return load();
  }, []);

  if (loading) {
    return (
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Event Health</h2>
        </div>
        <ListSkeleton rows={5} />
      </section>
    );
  }

  if (error) {
    return (
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Event Health</h2>
        </div>
        <div style={styles.errorBanner}>
          <span style={styles.errorText}>{error}</span>
          <button style={styles.retryButton} onClick={load}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Event Health</h2>
        </div>
        <div style={styles.emptyState}>No events to display health data for.</div>
      </section>
    );
  }

  const { summary } = data;
  const sorted: EventHealth[] = [...data.data].sort((a, b) => a.health - b.health);
  const visible = showAll ? sorted : sorted.slice(0, DISPLAY_LIMIT);
  const hasMore = sorted.length > DISPLAY_LIMIT;

  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>Event Health</h2>
        <span style={styles.countBadge}>{summary.total}</span>
      </div>

      <div style={styles.summaryBar}>
        <span style={styles.summaryItem}>
          <span style={styles.summaryValue}>{summary.total}</span> events
        </span>
        <span style={styles.summarySep}>·</span>
        <span style={styles.summaryItem}>
          Avg health:{' '}
          <span style={{ ...styles.summaryValue, color: healthColor(summary.averageHealth) }}>
            {Math.round(summary.averageHealth)}%
          </span>
        </span>
        <span style={styles.summarySep}>·</span>
        <span style={styles.summaryItem}>
          <span style={{ ...styles.summaryValue, color: '#22c55e' }}>{summary.healthy}</span> healthy
        </span>
        <span style={styles.summarySep}>·</span>
        <span style={styles.summaryItem}>
          <span style={{ ...styles.summaryValue, color: '#ef4444' }}>{summary.needsWork}</span> needs work
        </span>
      </div>

      <div style={styles.list}>
        {visible.map((event) => (
          <div
            key={event.id}
            style={styles.card}
            onClick={() => navigate(`/events/${event.id}`)}
          >
            <div style={styles.cardLeft}>
              <HealthBadge score={event.health} />
              <div style={styles.cardInfo}>
                <span style={styles.eventTitle}>{event.title}</span>
                <div style={styles.factorRow}>
                  {event.factors.length > 0 ? (
                    event.factors.map((f) => <FactorBadge key={f} label={f} />)
                  ) : (
                    <span style={styles.allGoodLabel}>All checks passing</span>
                  )}
                </div>
              </div>
            </div>
            <div style={styles.cardRight}>
              <HealthBar score={event.health} />
              <span
                style={{
                  ...styles.healthLabelText,
                  color: healthColor(event.health),
                }}
              >
                {healthLabel(event.health)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <button style={styles.showAllButton} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show less' : `Show all ${sorted.length} events`}
        </button>
      )}
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 18,
    fontWeight: 700,
    color: '#080810',
    margin: 0,
  },
  countBadge: {
    background: '#2D5F5D',
    color: '#fff',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    padding: '2px 9px',
    lineHeight: 1.5,
  },
  summaryBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 12,
    flexWrap: 'wrap',
  },
  summaryItem: {
    fontSize: 13,
    color: '#7a7a7a',
    fontWeight: 500,
  },
  summaryValue: {
    fontWeight: 700,
    color: '#080810',
  },
  summarySep: {
    color: '#e8e6e1',
    fontWeight: 700,
    fontSize: 16,
    lineHeight: 1,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  card: {
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 16,
    padding: '12px 20px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    transition: 'box-shadow 0.15s',
  },
  cardLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  cardInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    fontWeight: 600,
    fontSize: 14,
    color: '#080810',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  factorRow: {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
  },
  cardRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
    width: 80,
  },
  healthBarWrap: {
    width: 80,
    height: 6,
    borderRadius: 3,
    background: '#f0eeeb',
    overflow: 'hidden',
  },
  healthBarFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.3s',
  },
  healthLabelText: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'capitalize',
  },
  healthBadge: {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    border: '1px solid transparent',
    flexShrink: 0,
    minWidth: 44,
    textAlign: 'center',
  },
  factorBadge: {
    fontSize: 11,
    fontWeight: 500,
    color: '#6b7280',
    background: '#f5f4f2',
    border: '1px solid #e8e6e1',
    borderRadius: 20,
    padding: '1px 7px',
  },
  allGoodLabel: {
    fontSize: 11,
    color: '#22c55e',
    fontWeight: 500,
  },
  showAllButton: {
    alignSelf: 'center',
    background: 'none',
    border: '1px solid #e8e6e1',
    borderRadius: 20,
    color: '#2D5F5D',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '6px 18px',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 16px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    flex: 1,
  },
  retryButton: {
    background: '#E2725B',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '5px 12px',
    fontFamily: 'inherit',
  },
  emptyState: {
    fontSize: 13,
    color: '#9ca3af',
    padding: '16px 0',
    textAlign: 'center',
    fontStyle: 'italic',
  },
};
