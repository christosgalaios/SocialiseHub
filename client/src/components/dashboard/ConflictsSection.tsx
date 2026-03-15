import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getConflicts } from '../../api/dashboard';
import type { Conflict } from '../../api/dashboard';
import { PLATFORM_ORDER } from '../../lib/platforms';

export function ConflictsSection() {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    getConflicts()
      .then((res) => { if (!cancelled) setConflicts(res.data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  if (error) return null;
  if (conflicts.length === 0) return null;

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>
        Platform Conflicts ({conflicts.length})
      </h2>
      <div style={styles.list}>
        {conflicts.slice(0, 5).map((c) => (
          <div
            key={c.eventId}
            style={styles.card}
            onClick={() => navigate(`/conflicts/${c.eventId}`)}
          >
            <div style={styles.cardTop}>
              <span style={styles.eventTitle}>{c.eventTitle}</span>
              <span style={styles.conflictCount}>
                {c.conflictCount} field conflict{c.conflictCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={styles.cardBottom}>
              <div style={styles.platforms}>
                {[...c.platforms].sort((a, b) => PLATFORM_ORDER.indexOf(a) - PLATFORM_ORDER.indexOf(b)).map((p) => (
                  <span key={p} style={styles.platformBadge}>{p}</span>
                ))}
              </div>
              <span style={styles.fields}>{c.fields.join(', ')}</span>
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
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#080810',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  conflictCount: {
    fontSize: 12,
    fontWeight: 700,
    color: '#dc2626',
    whiteSpace: 'nowrap' as const,
  },
  cardBottom: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap' as const,
  },
  platforms: {
    display: 'flex',
    gap: 4,
  },
  platformBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    background: '#6b7280',
    padding: '2px 8px',
    borderRadius: 20,
    textTransform: 'capitalize' as const,
    letterSpacing: 0.3,
  },
  fields: {
    fontSize: 12,
    color: '#6b7280',
  },
};
