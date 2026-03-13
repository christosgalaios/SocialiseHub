import { useState, useCallback } from 'react';
import { syncPull } from '../api/events';
import { useToast } from '../context/ToastContext';

export function SyncStatus({ collapsed }: { collapsed: boolean }) {
  const [syncing, setSyncing] = useState(false);
  const { showToast } = useToast();

  const lastSyncStr = localStorage.getItem('lastSyncAt');
  const lastSync = lastSyncStr ? new Date(lastSyncStr) : null;

  const timeAgo = lastSync ? formatTimeAgo(lastSync) : 'Never';

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncPull();
      localStorage.setItem('lastSyncAt', new Date().toISOString());
      showToast(`Synced ${result.pulled} event${result.pulled !== 1 ? 's' : ''}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  }, [showToast]);

  return (
    <button
      style={styles.container}
      onClick={handleSync}
      disabled={syncing}
      title={collapsed ? `Last synced: ${timeAgo}` : undefined}
    >
      <span style={{ ...styles.dot, background: syncing ? '#d4a017' : '#2D5F5D' }} />
      {!collapsed && (
        <span style={styles.text}>
          {syncing ? 'Syncing...' : `Synced: ${timeAgo}`}
        </span>
      )}
    </button>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(45,95,93,0.1)',
    cursor: 'pointer',
    width: '100%',
    fontSize: 12,
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 600,
    color: '#5dafaf',
    transition: 'opacity 0.2s',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  text: {
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
};
