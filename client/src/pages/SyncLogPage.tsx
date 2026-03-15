import { useState, useEffect, useCallback } from 'react';
import type { SyncLogEntry } from '@shared/types';
import { getSyncLog } from '../api/events';
import { PLATFORM_COLORS } from '../lib/platforms';
import { ListSkeleton } from '../components/Skeleton';

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

const ACTION_LABELS: Record<string, string> = {
  pull: 'Pull',
  push: 'Push',
  publish: 'Publish',
  update: 'Update',
};

export function SyncLogPage() {
  const [entries, setEntries] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSyncLog(50);
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sync log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [load]);

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Sync Log</h1>
          <p style={styles.subtitle}>Recent platform synchronisation activity</p>
        </div>
        <button
          style={{ ...styles.refreshBtn, opacity: loading ? 0.7 : 1 }}
          onClick={load}
          disabled={loading}
        >
          {loading ? 'Loading...' : '↻ Refresh'}
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <ListSkeleton rows={5} />
      ) : entries.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyTitle}>No sync activity yet</p>
          <p style={styles.emptyDesc}>
            Sync activity will appear here once you connect platforms and trigger a sync.
          </p>
        </div>
      ) : (
        <div style={styles.table}>
          {/* Header */}
          <div style={styles.headerRow}>
            <span style={{ ...styles.headerCell, flex: 2 }}>Time</span>
            <span style={{ ...styles.headerCell, flex: 1 }}>Platform</span>
            <span style={{ ...styles.headerCell, flex: 1 }}>Action</span>
            <span style={{ ...styles.headerCell, flex: 2 }}>Event</span>
            <span style={{ ...styles.headerCell, flex: 1 }}>Status</span>
            <span style={{ ...styles.headerCell, flex: 3 }}>Message</span>
          </div>

          {entries.map((entry) => (
            <div key={entry.id} style={styles.row}>
              <span style={{ ...styles.cell, flex: 2, color: '#555' }}>
                {formatTime(entry.createdAt)}
              </span>
              <span style={{ ...styles.cell, flex: 1 }}>
                <span
                  style={{
                    ...styles.platformBadge,
                    background: PLATFORM_COLORS[entry.platform] ?? '#888',
                  }}
                >
                  {entry.platform.charAt(0).toUpperCase() + entry.platform.slice(1)}
                </span>
              </span>
              <span style={{ ...styles.cell, flex: 1, fontWeight: 600, color: '#333' }}>
                {ACTION_LABELS[entry.action] ?? entry.action}
              </span>
              <span style={{ ...styles.cell, flex: 2, color: '#555', fontFamily: 'monospace', fontSize: 12 }}>
                {entry.eventId ?? entry.externalId ?? '—'}
              </span>
              <span style={{ ...styles.cell, flex: 1 }}>
                <span
                  style={{
                    ...styles.statusBadge,
                    background: entry.status === 'success' ? '#e6f4ea' : '#fce8e6',
                    color: entry.status === 'success' ? '#1e7e34' : '#c0392b',
                  }}
                >
                  {entry.status === 'success' ? 'OK' : 'Error'}
                </span>
              </span>
              <span style={{ ...styles.cell, flex: 3, color: '#7a7a7a', fontSize: 12 }}>
                {entry.message ?? '—'}
              </span>
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
    flexWrap: 'wrap' as const,
    gap: 16,
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 28,
    fontWeight: 700,
    color: '#080810',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#7a7a7a',
  },
  refreshBtn: {
    padding: '10px 20px',
    borderRadius: 12,
    border: 'none',
    background: '#E2725B',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'opacity 0.2s',
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
  loading: {
    color: '#7a7a7a',
    fontSize: 14,
    padding: '40px 0',
  },
  empty: {
    textAlign: 'center' as const,
    padding: '80px 0',
  },
  emptyTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 20,
    fontWeight: 600,
    color: '#080810',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: '#7a7a7a',
  },
  table: {
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 16,
    overflow: 'hidden',
  },
  headerRow: {
    display: 'flex',
    padding: '10px 20px',
    background: '#FAFAF6',
    borderBottom: '1px solid #e8e6e1',
  },
  headerCell: {
    fontSize: 11,
    fontWeight: 700,
    color: '#7a7a7a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    fontFamily: "'Outfit', sans-serif",
  },
  row: {
    display: 'flex',
    padding: '12px 20px',
    borderBottom: '1px solid #f0ede8',
    alignItems: 'center',
  },
  cell: {
    fontSize: 13,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    paddingRight: 8,
  },
  platformBadge: {
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    color: '#fff',
    whiteSpace: 'nowrap' as const,
  },
  statusBadge: {
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
  },
};
