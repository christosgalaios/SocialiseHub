import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Template } from '@shared/types';
import { getTemplates, deleteTemplate, createEventFromTemplate } from '../api/events';

export function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTemplates()
      .then(data => { if (!cancelled) setTemplates(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    try {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleCreateEvent = async (id: string) => {
    try {
      const event = await createEventFromTemplate(id);
      nav(`/events/${event.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event');
    }
  };

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Templates</h1>
          <p style={styles.subtitle}>
            {templates.length} template{templates.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <p style={styles.loading}>Loading templates...</p>
      ) : templates.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyTitle}>No templates yet</p>
          <p style={styles.emptyDesc}>Save an event as a template to reuse it later.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {templates.map((t) => (
            <div key={t.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <h3 style={styles.cardTitle}>{t.name}</h3>
              </div>
              <p style={styles.cardMeta}>{t.title}</p>
              <div style={styles.cardDetails}>
                {t.venue && <span>{t.venue}</span>}
                <span>{t.durationMinutes} min</span>
                <span>{t.price === 0 ? 'Free' : `£${t.price}`}</span>
                {t.capacity > 0 && <span>Cap: {t.capacity}</span>}
              </div>
              {t.platforms.length > 0 && (
                <div style={styles.platforms}>
                  {t.platforms.map((p) => (
                    <span key={p} style={styles.platformTag}>{p}</span>
                  ))}
                </div>
              )}
              <div style={styles.cardActions}>
                <button style={styles.useBtn} onClick={() => handleCreateEvent(t.id)}>
                  Create Event
                </button>
                <button style={styles.deleteBtn} onClick={() => handleDelete(t.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 32,
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 28,
    fontWeight: 700,
    color: '#080810',
    marginBottom: 4,
  },
  subtitle: { fontSize: 14, color: '#7a7a7a' },
  error: {
    padding: '12px 16px',
    borderRadius: 12,
    background: '#fce8e6',
    color: '#E2725B',
    fontSize: 14,
    marginBottom: 20,
    fontWeight: 500,
  },
  loading: { color: '#7a7a7a', fontSize: 14 },
  empty: { textAlign: 'center' as const, padding: '80px 0' },
  emptyTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 20,
    fontWeight: 600,
    color: '#080810',
    marginBottom: 8,
  },
  emptyDesc: { fontSize: 14, color: '#7a7a7a' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    border: '1px solid #e8e6e1',
    padding: 22,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 17,
    fontWeight: 600,
    color: '#080810',
  },
  cardMeta: {
    fontSize: 14,
    color: '#555',
  },
  cardDetails: {
    display: 'flex',
    gap: 12,
    fontSize: 13,
    color: '#7a7a7a',
    flexWrap: 'wrap' as const,
  },
  platforms: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  platformTag: {
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: 6,
    background: '#f0eeeb',
    color: '#555',
    textTransform: 'capitalize' as const,
  },
  cardActions: {
    display: 'flex',
    gap: 10,
    marginTop: 4,
  },
  useBtn: {
    padding: '8px 16px',
    borderRadius: 10,
    border: 'none',
    background: '#2D5F5D',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
  },
  deleteBtn: {
    fontSize: 12,
    color: '#E2725B',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    fontWeight: 600,
  },
};
