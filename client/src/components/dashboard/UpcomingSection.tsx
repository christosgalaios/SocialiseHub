import { useNavigate } from 'react-router-dom';
import type { UpcomingEvent } from '../../api/dashboard';
import { PLATFORM_COLORS } from '../../lib/platforms';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// No longer needed — API returns missing labels directly

export function UpcomingSection({ events }: { events: UpcomingEvent[] }) {
  const navigate = useNavigate();

  if (events.length === 0) {
    return (
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Upcoming Events</h2>
        <div style={styles.empty}>
          <p style={styles.emptyText}>No upcoming events — create one with Magic ✦</p>
          <button style={styles.emptyBtn} onClick={() => navigate('/events')}>
            Go to Events
          </button>
        </div>
      </section>
    );
  }

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>Upcoming Events</h2>
      <div style={styles.list}>
        {events.map((ev) => {
          const { missing = [], passed = 0, total = 7 } = ev;
          const readinessPct = total > 0 ? Math.round((passed / total) * 100) : 0;
          return (
            <div
              key={ev.eventId}
              style={styles.card}
              onClick={() => navigate(`/events/${ev.eventId}`)}
            >
              <div style={styles.cardHeader}>
                <span style={styles.eventTitle}>{ev.eventTitle}</span>
                <span style={styles.countdown}>{ev.timeUntil}</span>
              </div>

              {ev.venue && (
                <span style={styles.venue}>📍 {ev.venue}</span>
              )}

              <span style={styles.dateText}>{formatDate(ev.startTime)}</span>

              <div style={styles.readinessRow}>
                <span style={styles.readinessLabel}>
                  Readiness {passed}/{total}
                </span>
                <div style={styles.progressTrack}>
                  <div
                    style={{
                      ...styles.progressBar,
                      width: `${readinessPct}%`,
                      background:
                        readinessPct >= 80
                          ? '#22c55e'
                          : readinessPct >= 50
                          ? '#f59e0b'
                          : '#ef4444',
                    }}
                  />
                </div>
              </div>

              {missing.length > 0 && (
                <span style={styles.missingText}>
                  needs: {missing.join(', ')}
                </span>
              )}

              {ev.platforms.length > 0 && (
                <div style={styles.platforms}>
                  {ev.platforms.map((p) => (
                    <span
                      key={p}
                      style={{
                        ...styles.platformBadge,
                        borderColor: PLATFORM_COLORS[p] ?? '#9ca3af',
                        color: PLATFORM_COLORS[p] ?? '#9ca3af',
                      }}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
  empty: {
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 16,
    padding: '40px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#7a7a7a',
    margin: 0,
  },
  emptyBtn: {
    padding: '10px 20px',
    borderRadius: 12,
    border: 'none',
    background: '#E2725B',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
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
    padding: '16px 20px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  eventTitle: {
    fontWeight: 700,
    fontSize: 15,
    color: '#080810',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  countdown: {
    fontSize: 12,
    fontWeight: 600,
    color: '#2D5F5D',
    whiteSpace: 'nowrap',
  },
  venue: {
    fontSize: 12,
    color: '#6b7280',
  },
  dateText: {
    fontSize: 12,
    color: '#7a7a7a',
  },
  readinessRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  readinessLabel: {
    fontSize: 11,
    color: '#9ca3af',
    whiteSpace: 'nowrap',
    minWidth: 80,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 4,
    background: '#f3f4f6',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.3s',
  },
  missingText: {
    fontSize: 11,
    color: '#ef4444',
  },
  platforms: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  platformBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 20,
    border: '1.5px solid',
    textTransform: 'capitalize',
  },
};
