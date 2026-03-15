import { useState, useEffect } from 'react';
import {
  getEventChecklist,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  generateChecklist,
  type ChecklistItem,
} from '../api/events';

export function EventChecklist({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (signal?: { cancelled: boolean }) => {
    setError(null);
    try {
      const res = await getEventChecklist(eventId);
      if (signal?.cancelled) return;
      setItems(res.data);
      setTotal(res.total);
      setDone(res.done);
    } catch {
      if (!signal?.cancelled) setError('Failed to load checklist');
    }
    if (!signal?.cancelled) setLoading(false);
  };

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => { signal.cancelled = true; };
  }, [eventId]);

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    try {
      await addChecklistItem(eventId, newLabel.trim());
      setNewLabel('');
      await load();
    } catch { setError('Action failed — please try again'); }
  };

  const handleToggle = async (item: ChecklistItem) => {
    try {
      await updateChecklistItem(eventId, item.id, { completed: !item.completed });
      await load();
    } catch { setError('Action failed — please try again'); }
  };

  const handleDelete = async (itemId: number) => {
    try {
      await deleteChecklistItem(eventId, itemId);
      await load();
    } catch { setError('Action failed — please try again'); }
  };

  const handleGenerate = async () => {
    try {
      await generateChecklist(eventId);
      await load();
    } catch { setError('Action failed — please try again'); }
  };

  if (loading) return (
    <div style={styles.container}>
      <label style={styles.label}>Checklist</label>
      <span style={{ fontSize: 12, color: '#999' }}>Loading...</span>
    </div>
  );

  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <label style={styles.label}>Checklist</label>
        {total > 0 && (
          <span style={styles.progress}>
            {done}/{total} ({progress}%)
          </span>
        )}
      </div>

      {total > 0 && (
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>
      )}

      {error && (
        <div style={styles.errorMsg}>{error}</div>
      )}

      <div style={styles.list}>
        {items.map(item => (
          <div key={item.id} style={styles.item}>
            <input
              type="checkbox"
              checked={item.completed}
              onChange={() => handleToggle(item)}
              style={styles.checkbox}
            />
            <span style={{
              ...styles.itemLabel,
              textDecoration: item.completed ? 'line-through' : 'none',
              color: item.completed ? '#999' : '#333',
            }}>
              {item.label}
            </span>
            <button
              style={styles.deleteBtn}
              onClick={() => handleDelete(item.id)}
              title="Remove"
            >
              x
            </button>
          </div>
        ))}
      </div>

      <div style={styles.addRow}>
        <input
          style={styles.input}
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          placeholder="Add item..."
        />
        {newLabel.trim() && (
          <button style={styles.addBtn} onClick={handleAdd}>Add</button>
        )}
      </div>

      {total === 0 && (
        <button style={styles.generateBtn} onClick={handleGenerate}>
          Generate default checklist
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 8 },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    color: '#555',
  },
  progress: { fontSize: 12, color: '#888' },
  progressBar: {
    height: 4,
    background: '#eee',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#22c55e',
    borderRadius: 2,
    transition: 'width 0.3s',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 4 },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 0',
  },
  checkbox: { cursor: 'pointer', accentColor: '#22c55e' },
  itemLabel: { flex: 1, fontSize: 13 },
  deleteBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#ccc',
    fontSize: 11,
    padding: '2px 4px',
    opacity: 0.5,
  },
  addRow: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    border: '1px solid #ddd',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 12,
    outline: 'none',
  },
  addBtn: {
    background: '#f0f0f0',
    border: '1px solid #ddd',
    borderRadius: 8,
    padding: '5px 12px',
    fontSize: 12,
    cursor: 'pointer',
  },
  generateBtn: {
    background: '#f0f4ff',
    border: '1px solid #c7d2fe',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    color: '#4f46e5',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  errorMsg: { fontSize: 12, color: '#dc2626', padding: '4px 0' },
};
