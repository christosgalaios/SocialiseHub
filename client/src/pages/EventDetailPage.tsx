import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { SocialiseEvent, CreateEventInput, PlatformName } from '@shared/types';
import { getEvent, createEvent, updateEvent, publishEvent } from '../api/events';
import { EventForm } from '../components/EventForm';
import { PlatformBadge } from '../components/PlatformBadge';
import { StatusBadge } from '../components/StatusBadge';

export function EventDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const isNew = !id;

  const [event, setEvent] = useState<SocialiseEvent | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getEvent(id)
      .then(setEvent)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Load failed'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (values: CreateEventInput) => {
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await createEvent(values);
        nav(`/events/${created.id}`);
      } else {
        const updated = await updateEvent(id!, values);
        setEvent(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (platforms: PlatformName[]) => {
    if (!id) return;
    setPublishing(true);
    setError(null);
    try {
      await publishEvent(id, platforms);
      const updated = await getEvent(id);
      setEvent(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <p style={{ color: '#7a7a7a' }}>Loading...</p>;

  return (
    <div>
      <button onClick={() => nav('/')} style={styles.back}>
        ← Back to Events
      </button>

      <div style={styles.header}>
        <h1 style={styles.title}>
          {isNew ? 'Create Event' : event?.title ?? 'Event'}
        </h1>
        {event && <StatusBadge status={event.status} />}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <EventForm
        key={event?.id ?? 'new'}
        initial={event ?? undefined}
        onSubmit={handleSubmit}
        saving={saving}
        submitLabel={isNew ? 'Create Event' : 'Save Changes'}
      />

      {event && (
        <div style={styles.publishSection}>
          <h2 style={styles.sectionTitle}>Platform Publishing</h2>
          <div style={styles.platformList}>
            {event.platforms.length > 0 ? (
              event.platforms.map((ps) => (
                <div key={ps.platform} style={styles.platformRow}>
                  <PlatformBadge ps={ps} />
                  {ps.publishedAt && (
                    <span style={styles.publishedAt}>
                      Published {new Date(ps.publishedAt).toLocaleDateString()}
                    </span>
                  )}
                  {ps.error && <span style={styles.publishError}>{ps.error}</span>}
                </div>
              ))
            ) : (
              <p style={styles.noPlatforms}>
                No platforms selected. Edit the event to choose platforms.
              </p>
            )}
          </div>
          {event.platforms.some((p) => !p.published) && (
            <button
              style={styles.publishBtn}
              disabled={publishing}
              onClick={() =>
                handlePublish(
                  event.platforms
                    .filter((p) => !p.published)
                    .map((p) => p.platform),
                )
              }
            >
              {publishing ? 'Publishing...' : 'Publish to All Platforms'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  back: {
    background: 'none',
    border: 'none',
    color: '#E2725B',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    marginBottom: 20,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 28,
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 26,
    fontWeight: 700,
    color: '#080810',
  },
  error: {
    padding: '12px 16px',
    borderRadius: 12,
    background: '#fce8e6',
    color: '#E2725B',
    fontSize: 14,
    marginBottom: 20,
    fontWeight: 500,
  },
  publishSection: {
    marginTop: 40,
    paddingTop: 32,
    borderTop: '1px solid #e8e6e1',
    maxWidth: 640,
  },
  sectionTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 16,
    color: '#080810',
  },
  platformList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  platformRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  publishedAt: {
    fontSize: 12,
    color: '#7a7a7a',
  },
  publishError: {
    fontSize: 12,
    color: '#E2725B',
  },
  noPlatforms: {
    fontSize: 14,
    color: '#7a7a7a',
  },
  publishBtn: {
    marginTop: 20,
    padding: '12px 24px',
    borderRadius: 12,
    border: 'none',
    background: '#2D5F5D',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'transform 0.1s',
  },
};
