import { useState, useEffect } from 'react';
import { getEventTimeline, type TimelineEntry } from '../api/events';

const TYPE_ICONS: Record<string, string> = {
  created: '\u2795',
  note: '\uD83D\uDCDD',
  sync: '\uD83D\uDD04',
  score: '\u2B50',
  platform_link: '\uD83D\uDD17',
};

const TYPE_COLORS: Record<string, string> = {
  created: '#2D5F5D',
  note: '#6366f1',
  sync: '#E2725B',
  score: '#f59e0b',
  platform_link: '#22c55e',
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function ActivityTimeline({ eventId }: { eventId: string }) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getEventTimeline(eventId)
      .then(res => { if (!cancelled) setEntries(res.data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eventId]);

  if (loading) return null;
  if (error) return null;
  if (entries.length <= 1) return null; // Only creation entry — not interesting

  const displayed = expanded ? entries : entries.slice(-5);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Activity</h3>
        {entries.length > 5 && (
          <button style={styles.toggleBtn} onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show recent' : `Show all (${entries.length})`}
          </button>
        )}
      </div>
      <div style={styles.timeline}>
        {displayed.map((entry, i) => (
          <div key={i} style={styles.entry}>
            <div style={{ ...styles.dot, background: TYPE_COLORS[entry.type] ?? '#888' }}>
              {TYPE_ICONS[entry.type] ?? '\u25CF'}
            </div>
            <div style={styles.content}>
              <span style={styles.summary}>{entry.summary}</span>
              <span style={styles.timestamp}>{formatTimestamp(entry.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginTop: 8,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 16,
    fontWeight: 700,
    color: '#080810',
    margin: 0,
  },
  toggleBtn: {
    background: 'none',
    border: 'none',
    color: '#2D5F5D',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    borderLeft: '2px solid #e8e6e1',
    paddingLeft: 16,
    marginLeft: 8,
  },
  entry: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    position: 'relative',
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    flexShrink: 0,
    marginLeft: -25,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  summary: {
    fontSize: 13,
    color: '#333',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  timestamp: {
    fontSize: 11,
    color: '#999',
  },
};
