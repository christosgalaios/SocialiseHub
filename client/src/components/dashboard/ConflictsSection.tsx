import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getConflicts } from '../../api/dashboard';
import type { Conflict } from '../../api/dashboard';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ConflictsSection() {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getConflicts()
      .then((res) => setConflicts(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (conflicts.length === 0) return null;

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>
        Scheduling Conflicts ({conflicts.length})
      </h2>
      <div style={styles.list}>
        {conflicts.slice(0, 5).map((c, i) => (
          <div key={i} style={styles.card}>
            <div style={styles.reason}>
              {c.reason === 'same_start_time' ? 'Same start time' : 'Overlapping'}
            </div>
            <div style={styles.events}>
              {c.events.map((ev) => (
                <div
                  key={ev.id}
                  style={styles.eventRow}
                  onClick={() => navigate(`/events/${ev.id}`)}
                >
                  <span style={styles.eventTitle}>{ev.title}</span>
                  <span style={styles.eventDate}>{formatDate(ev.start_time)}</span>
                  {ev.venue && <span style={styles.venue}>{ev.venue}</span>}
                </div>
              ))}
            </div>
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
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  card: {
    background: '#fff',
    border: '1px solid #fecaca',
    borderRadius: 12,
    padding: '12px 16px',
  },
  reason: {
    fontSize: 11,
    fontWeight: 700,
    color: '#dc2626',
    textTransform: 'uppercase' as const,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  events: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  eventRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    padding: '4px 0',
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#080810',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  eventDate: {
    fontSize: 12,
    color: '#6b7280',
    whiteSpace: 'nowrap',
  },
  venue: {
    fontSize: 12,
    color: '#9ca3af',
    whiteSpace: 'nowrap',
  },
};
