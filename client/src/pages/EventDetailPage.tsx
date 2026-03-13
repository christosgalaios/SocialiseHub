import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type {
  SocialiseEvent,
  CreateEventInput,
  PlatformName,
  PublishResult,
  ServiceConnection,
} from '@shared/types';
import {
  getEvent,
  createEvent,
  updateEvent,
  publishEvent,
  getServices,
} from '../api/events';
import { PlatformSelector } from '../components/PlatformSelector';
import { StatusBadge } from '../components/StatusBadge';
import { PLATFORM_COLORS } from '../lib/platforms';

function toDatetimeLocal(isoStr?: string): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    // Format as YYYY-MM-DDTHH:mm (local time)
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return isoStr;
  }
}

export function EventDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const isNew = !id;

  const [event, setEvent] = useState<SocialiseEvent | null>(null);
  const [services, setServices] = useState<ServiceConnection[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishResults, setPublishResults] = useState<PublishResult[] | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [venue, setVenue] = useState('');
  const [price, setPrice] = useState(0);
  const [capacity, setCapacity] = useState(50);
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformName[]>([]);

  useEffect(() => {
    // Always load services for platform selector
    getServices().then(setServices).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getEvent(id)
      .then((ev) => {
        setEvent(ev);
        setTitle(ev.title);
        setDescription(ev.description);
        setStartTime(toDatetimeLocal(ev.start_time));
        setEndTime(toDatetimeLocal(ev.end_time));
        setDurationMinutes(ev.duration_minutes);
        setVenue(ev.venue);
        setPrice(ev.price);
        setCapacity(ev.capacity);
        setSelectedPlatforms(ev.platforms.map((p) => p.platform));
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Load failed'),
      )
      .finally(() => setLoading(false));
  }, [id]);

  const buildInput = (): CreateEventInput => ({
    title,
    description,
    start_time: startTime ? new Date(startTime).toISOString() : new Date().toISOString(),
    end_time: endTime ? new Date(endTime).toISOString() : undefined,
    duration_minutes: durationMinutes,
    venue,
    price,
    capacity,
    platforms: selectedPlatforms,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await createEvent(buildInput());
        nav(`/events/${created.id}`);
      } else {
        const updated = await updateEvent(id!, buildInput());
        setEvent(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!id || selectedPlatforms.length === 0) return;
    setPublishing(true);
    setError(null);
    setPublishResults(null);
    try {
      const results = await publishEvent(id, selectedPlatforms);
      setPublishResults(results);
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
        ← Back to Dashboard
      </button>

      <div style={styles.header}>
        <h1 style={styles.title}>
          {isNew ? 'Create Event' : event?.title ?? 'Event'}
        </h1>
        {event && <StatusBadge status={event.status} />}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.grid}>
          <label style={styles.field}>
            <span style={styles.label}>Title</span>
            <input
              style={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event name"
              required
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Venue</span>
            <input
              style={styles.input}
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Venue name"
              required
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Start Time</span>
            <input
              style={styles.input}
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>End Time (optional)</span>
            <input
              style={styles.input}
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Duration (minutes)</span>
            <input
              style={styles.input}
              type="number"
              min="1"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              required
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Price (£)</span>
            <input
              style={styles.input}
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Capacity</span>
            <input
              style={styles.input}
              type="number"
              min="1"
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              required
            />
          </label>
        </div>

        <label style={styles.field}>
          <span style={styles.label}>Description</span>
          <textarea
            style={{ ...styles.input, minHeight: 100, resize: 'vertical' as const }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your event..."
            required
          />
        </label>

        <PlatformSelector
          selected={selectedPlatforms}
          onChange={setSelectedPlatforms}
          services={services}
        />

        <div style={styles.formActions}>
          <button type="submit" disabled={saving} style={styles.saveBtn}>
            {saving ? 'Saving...' : isNew ? 'Create Event' : 'Save Changes'}
          </button>

          {!isNew && (
            <button
              type="button"
              disabled={publishing || selectedPlatforms.length === 0}
              style={{
                ...styles.publishBtn,
                opacity: publishing || selectedPlatforms.length === 0 ? 0.7 : 1,
              }}
              onClick={handlePublish}
            >
              {publishing ? 'Publishing...' : 'Publish'}
            </button>
          )}
        </div>
      </form>

      {/* Publish results panel */}
      {publishResults && publishResults.length > 0 && (
        <div style={styles.publishSection}>
          <h2 style={styles.sectionTitle}>Publish Results</h2>
          <div style={styles.resultsList}>
            {publishResults.map((r) => (
              <div key={r.platform} style={styles.resultRow}>
                <span
                  style={{
                    ...styles.platformDot,
                    background: PLATFORM_COLORS[r.platform] ?? '#888',
                  }}
                />
                <span style={styles.platformLabel}>
                  {r.platform.charAt(0).toUpperCase() + r.platform.slice(1)}
                </span>
                {r.success ? (
                  <span style={styles.successBadge}>Published</span>
                ) : (
                  <span style={styles.errorBadge}>{r.error ?? 'Failed'}</span>
                )}
                {r.externalId && (
                  <span style={styles.externalId}>ID: {r.externalId}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing platforms status */}
      {event && event.platforms.length > 0 && (
        <div style={styles.publishSection}>
          <h2 style={styles.sectionTitle}>Platform Status</h2>
          <div style={styles.resultsList}>
            {event.platforms.map((ps) => (
              <div key={ps.platform} style={styles.resultRow}>
                <span
                  style={{
                    ...styles.platformDot,
                    background: PLATFORM_COLORS[ps.platform] ?? '#888',
                  }}
                />
                <span style={styles.platformLabel}>
                  {ps.platform.charAt(0).toUpperCase() + ps.platform.slice(1)}
                </span>
                {ps.published ? (
                  <span style={styles.successBadge}>Published</span>
                ) : (
                  <span style={{ ...styles.errorBadge, background: '#f0f0f0', color: '#666' }}>
                    Unpublished
                  </span>
                )}
                {ps.publishedAt && (
                  <span style={styles.externalId}>
                    {new Date(ps.publishedAt).toLocaleDateString()}
                  </span>
                )}
                {ps.error && (
                  <span style={styles.errorBadge}>{ps.error}</span>
                )}
              </div>
            ))}
          </div>
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
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    maxWidth: 640,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#555',
    fontFamily: "'Outfit', sans-serif",
  },
  input: {
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid #ddd',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.2s',
    background: '#fff',
  },
  formActions: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  saveBtn: {
    padding: '12px 28px',
    borderRadius: 12,
    border: 'none',
    background: '#E2725B',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'background 0.2s, transform 0.1s',
  },
  publishBtn: {
    padding: '12px 28px',
    borderRadius: 12,
    border: 'none',
    background: '#2D5F5D',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'opacity 0.2s',
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
  resultsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 10,
  },
  platformDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  platformLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#080810',
    flex: 1,
  },
  successBadge: {
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    background: '#e6f4ea',
    color: '#1e7e34',
  },
  errorBadge: {
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    background: '#fce8e6',
    color: '#c0392b',
  },
  externalId: {
    fontSize: 12,
    color: '#aaa',
    fontFamily: 'monospace',
  },
};
