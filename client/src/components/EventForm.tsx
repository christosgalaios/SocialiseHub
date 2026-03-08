import { useState } from 'react';
import type { CreateEventInput, PlatformName } from '@shared/types';

const PLATFORMS: { name: PlatformName; label: string }[] = [
  { name: 'meetup', label: 'Meetup' },
  { name: 'eventbrite', label: 'Eventbrite' },
  { name: 'headfirst', label: 'Headfirst Bristol' },
];

interface EventFormProps {
  initial?: Partial<CreateEventInput>;
  onSubmit: (values: CreateEventInput) => void;
  saving: boolean;
  submitLabel?: string;
}

export function EventForm({
  initial = {},
  onSubmit,
  saving,
  submitLabel = 'Create Event',
}: EventFormProps) {
  const [title, setTitle] = useState(initial.title ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [date, setDate] = useState(initial.date ?? '');
  const [time, setTime] = useState(initial.time ?? '');
  const [venue, setVenue] = useState(initial.venue ?? '');
  const [price, setPrice] = useState(initial.price ?? 0);
  const [capacity, setCapacity] = useState(initial.capacity ?? 50);
  const [platforms, setPlatforms] = useState<PlatformName[]>(
    initial.platforms ?? [],
  );

  const toggle = (p: PlatformName) =>
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ title, description, date, time, venue, price, capacity, platforms });
  };

  return (
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
          <span style={styles.label}>Date</span>
          <input
            style={styles.input}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>

        <label style={styles.field}>
          <span style={styles.label}>Time</span>
          <input
            style={styles.input}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
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

      <div style={styles.field}>
        <span style={styles.label}>Publish to platforms</span>
        <div style={styles.chips}>
          {PLATFORMS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => toggle(p.name)}
              style={{
                ...styles.chip,
                ...(platforms.includes(p.name) ? styles.chipActive : {}),
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <button type="submit" disabled={saving} style={styles.submit}>
        {saving ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  chips: {
    display: 'flex',
    gap: 8,
  },
  chip: {
    padding: '8px 18px',
    borderRadius: 20,
    border: '1.5px solid #ddd',
    background: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    color: '#7a7a7a',
  },
  chipActive: {
    background: '#E2725B',
    borderColor: '#E2725B',
    color: '#fff',
  },
  submit: {
    padding: '12px 28px',
    borderRadius: 12,
    border: 'none',
    background: '#E2725B',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    alignSelf: 'flex-start',
    transition: 'background 0.2s, transform 0.1s',
    fontFamily: "'Outfit', sans-serif",
  },
};
