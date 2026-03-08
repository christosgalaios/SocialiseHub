import { useState } from 'react';
import type { EventIdea } from '@shared/types';
import { saveIdeaAsDraft } from '../api/events';

export function IdeaCard({
  idea,
  onSaved,
}: {
  idea: EventIdea;
  onSaved?: (id: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const event = await saveIdeaAsDraft({
        title: idea.title,
        description: idea.description,
        venue: idea.suggestedVenue,
        date: idea.suggestedDate,
      });
      setSaved(true);
      onSaved?.(event.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.category}>{idea.category}</span>
        {idea.estimatedAttendance && (
          <span style={styles.attendance}>
            ~{idea.estimatedAttendance} people
          </span>
        )}
      </div>

      <h3 style={styles.title}>{idea.title}</h3>
      <p style={styles.description}>{idea.description}</p>

      <div style={styles.rationale}>
        <span style={styles.rationaleLabel}>💡 Why this works:</span>
        <p style={styles.rationaleText}>{idea.rationale}</p>
      </div>

      <div style={styles.details}>
        {idea.suggestedDate && (
          <div style={styles.detail}>
            <span style={styles.detailLabel}>Date</span>
            <span style={styles.detailValue}>{idea.suggestedDate}</span>
          </div>
        )}
        {idea.suggestedVenue && (
          <div style={styles.detail}>
            <span style={styles.detailLabel}>Venue</span>
            <span style={styles.detailValue}>{idea.suggestedVenue}</span>
          </div>
        )}
      </div>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.footer}>
        {saved ? (
          <span style={styles.savedLabel}>✅ Saved as draft</span>
        ) : (
          <button
            style={styles.saveBtn}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : '📝 Save as Draft'}
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '22px 26px',
    border: '1px solid #e8e6e1',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    transition: 'box-shadow 0.2s',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  category: {
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: 8,
    background: 'rgba(45,95,93,0.1)',
    color: '#2D5F5D',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  attendance: {
    fontSize: 12,
    color: '#7a7a7a',
    fontWeight: 600,
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 17,
    fontWeight: 600,
    color: '#080810',
    lineHeight: 1.3,
    margin: 0,
  },
  description: {
    fontSize: 13,
    color: '#555',
    lineHeight: 1.6,
    margin: 0,
  },
  rationale: {
    padding: '10px 14px',
    borderRadius: 10,
    background: '#fffbf0',
    border: '1px solid #f0e8d0',
  },
  rationaleLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#b8860b',
  },
  rationaleText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 1.5,
    margin: '4px 0 0',
  },
  details: {
    display: 'flex',
    gap: 16,
  },
  detail: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  detailValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: 600,
  },
  error: {
    fontSize: 12,
    color: '#E2725B',
    margin: 0,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: 4,
  },
  saveBtn: {
    padding: '8px 16px',
    borderRadius: 10,
    border: '1.5px solid #2D5F5D',
    background: 'transparent',
    color: '#2D5F5D',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'background 0.15s, color 0.15s',
  },
  savedLabel: {
    fontSize: 13,
    color: '#2D5F5D',
    fontWeight: 600,
  },
};
