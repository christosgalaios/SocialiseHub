import { useState, useEffect } from 'react';
import { getEventTags, addEventTag, removeEventTag } from '../api/events';

export function EventTags({ eventId }: { eventId: string }) {
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEventTags(eventId)
      .then(data => { if (!cancelled) setTags(data); })
      .catch(() => { if (!cancelled) setError('Failed to load tags'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eventId]);

  const handleAdd = async () => {
    if (!newTag.trim()) return;
    try {
      const updated = await addEventTag(eventId, newTag.trim());
      setTags(updated);
      setNewTag('');
    } catch { setError('Failed to add tag'); }
  };

  const handleRemove = async (tag: string) => {
    try {
      await removeEventTag(eventId, tag);
      setTags(prev => prev.filter(t => t !== tag));
    } catch { setError('Failed to remove tag'); }
  };

  if (loading) return (
    <div style={styles.container}>
      <label style={styles.label}>Tags</label>
      <span style={{ fontSize: 12, color: '#999' }}>Loading...</span>
    </div>
  );

  return (
    <div style={styles.container}>
      <label style={styles.label}>Tags</label>
      {error && <span style={styles.errorMsg}>{error}</span>}
      <div style={styles.tagList}>
        {tags.map(tag => (
          <span key={tag} style={styles.tag}>
            {tag}
            <button
              style={styles.removeBtn}
              onClick={() => handleRemove(tag)}
              title="Remove tag"
            >
              x
            </button>
          </span>
        ))}
        <div style={styles.addRow}>
          <input
            style={styles.input}
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
            placeholder="Add tag..."
          />
          {newTag.trim() && (
            <button style={styles.addBtn} onClick={handleAdd}>+</button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    color: '#555',
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: '#f0f0f0',
    borderRadius: 12,
    padding: '3px 10px',
    fontSize: 12,
    color: '#333',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#999',
    fontSize: 11,
    padding: 0,
    lineHeight: 1,
  },
  addRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  input: {
    border: '1px solid #ddd',
    borderRadius: 12,
    padding: '3px 10px',
    fontSize: 12,
    width: 100,
    outline: 'none',
  },
  addBtn: {
    background: '#eee',
    border: '1px solid #ddd',
    borderRadius: '50%',
    width: 22,
    height: 22,
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorMsg: { fontSize: 12, color: '#dc2626' },
};
