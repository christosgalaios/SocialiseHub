import { useNavigate } from 'react-router-dom';
import type { AttentionItem } from '../../api/dashboard';
import { PLATFORM_COLORS } from '../../lib/platforms';

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = new Date(dateStr).getTime() - Date.now();
  const days = Math.round(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 0) return `In ${days}d`;
  return `${Math.abs(days)}d ago`;
}

const URGENCY_COLORS: Record<AttentionItem['urgency'], string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#9ca3af',
};

export function AttentionSection({ items }: { items: AttentionItem[] }) {
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div style={styles.greenBanner}>
        <span style={styles.greenIcon}>✓</span>
        All events look good
      </div>
    );
  }

  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>Attention Required</h2>
        <span style={styles.countBadge}>{items.length}</span>
      </div>
      <div style={styles.list}>
        {items.map((item) => (
          <div
            key={item.eventId}
            style={styles.card}
            onClick={() => navigate(`/events/${item.eventId}`)}
          >
            <div style={styles.cardTop}>
              <span style={styles.eventTitle}>{item.eventTitle}</span>
              {item.date && (
                <span style={styles.dateLabel}>{relativeDate(item.date)}</span>
              )}
            </div>
            <div style={styles.cardBottom}>
              <span
                style={{
                  ...styles.urgencyBadge,
                  background: URGENCY_COLORS[item.urgency],
                }}
              >
                {item.urgency}
              </span>
              <span style={styles.problemLabel}>
                {(item as any).problems
                  ? (item as any).problems.map((p: any) => p.label).join(' · ')
                  : item.problemLabel}
              </span>
              <div style={styles.platforms}>
                {item.platforms.map((p) => (
                  <span
                    key={p}
                    style={{
                      ...styles.platformDot,
                      background: PLATFORM_COLORS[p] ?? '#9ca3af',
                    }}
                    title={p}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  greenBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 20px',
    borderRadius: 16,
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    color: '#15803d',
    fontWeight: 600,
    fontSize: 14,
  },
  greenIcon: {
    fontSize: 18,
    lineHeight: 1,
  },
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
    background: '#ef4444',
    color: '#fff',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    padding: '2px 9px',
    lineHeight: 1.5,
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
    padding: '14px 20px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    transition: 'box-shadow 0.15s',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  eventTitle: {
    fontWeight: 600,
    fontSize: 14,
    color: '#080810',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dateLabel: {
    fontSize: 12,
    color: '#7a7a7a',
    whiteSpace: 'nowrap',
  },
  cardBottom: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  urgencyBadge: {
    color: '#fff',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 8px',
    textTransform: 'capitalize',
  },
  problemLabel: {
    fontSize: 12,
    color: '#6b7280',
    flex: 1,
  },
  platforms: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
  },
  platformDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
  },
};
