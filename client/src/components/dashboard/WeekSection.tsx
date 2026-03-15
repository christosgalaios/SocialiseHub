import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getWeekView } from '../../api/dashboard';
import type { WeekDayEvent } from '../../api/dashboard';

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = d.getTime() - today.getTime();
  const days = Math.round(diff / 86400000);

  const dayName = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  if (days === 0) return `Today — ${dayName}`;
  if (days === 1) return `Tomorrow — ${dayName}`;
  return dayName;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function WeekSection() {
  const [days, setDays] = useState<Record<string, WeekDayEvent[]> | null>(null);
  const [totalEvents, setTotalEvents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    getWeekView()
      .then((res) => {
        if (!cancelled) {
          setDays(res.data);
          setTotalEvents(res.totalEvents);
        }
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>This Week</h2>
        <div style={styles.loadingText}>Loading...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>This Week</h2>
        <div style={styles.empty}>
          <p style={styles.emptyText}>Unable to load week view</p>
        </div>
      </section>
    );
  }

  if (!days || totalEvents === 0) {
    return (
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>This Week</h2>
        <div style={styles.empty}>
          <p style={styles.emptyText}>No events this week</p>
        </div>
      </section>
    );
  }

  const sortedDays = Object.entries(days).sort(([a], [b]) => a.localeCompare(b));

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>This Week ({totalEvents} event{totalEvents !== 1 ? 's' : ''})</h2>
      <div style={styles.dayList}>
        {sortedDays.map(([dayKey, events]) => (
          <div key={dayKey} style={styles.dayGroup}>
            <div style={styles.dayLabel}>{formatDayLabel(dayKey)}</div>
            {events.map((ev) => (
              <div
                key={ev.id}
                style={styles.eventRow}
                onClick={() => navigate(`/events/${ev.id}`)}
              >
                <div style={styles.eventMain}>
                  <span style={styles.eventTime}>{formatTime(ev.startTime)}</span>
                  <span style={styles.eventTitle}>{ev.title}</span>
                </div>
                <div style={styles.eventMeta}>
                  {ev.venue && <span style={styles.venue}>{ev.venue}</span>}
                  {ev.checklist && (
                    <span style={{
                      ...styles.checklistBadge,
                      background: ev.checklist.done === ev.checklist.total ? '#dcfce7' : '#fef3c7',
                      color: ev.checklist.done === ev.checklist.total ? '#16a34a' : '#d97706',
                    }}>
                      {ev.checklist.done}/{ev.checklist.total} tasks
                    </span>
                  )}
                  {ev.status === 'draft' && <span style={styles.draftBadge}>draft</span>}
                </div>
              </div>
            ))}
          </div>
        ))}
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
  loadingText: {
    fontSize: 13,
    color: '#9ca3af',
    padding: 16,
  },
  empty: {
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 16,
    padding: '24px',
    textAlign: 'center' as const,
  },
  emptyText: {
    fontSize: 14,
    color: '#7a7a7a',
    margin: 0,
  },
  dayList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  dayGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: '#2D5F5D',
    fontFamily: "'Outfit', sans-serif",
  },
  eventRow: {
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 12,
    padding: '12px 16px',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    transition: 'border-color 0.15s',
  },
  eventMain: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  eventTime: {
    fontSize: 13,
    fontWeight: 600,
    color: '#6b7280',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#080810',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  eventMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  venue: {
    fontSize: 12,
    color: '#9ca3af',
    whiteSpace: 'nowrap',
  },
  checklistBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 8,
  },
  draftBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 8,
    background: '#f3f4f6',
    color: '#9ca3af',
  },
};
