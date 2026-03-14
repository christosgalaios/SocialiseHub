import type { CSSProperties } from 'react';

const PLATFORM_COLORS: Record<string, string> = {
  meetup: '#E2725B',
  eventbrite: '#F05537',
  headfirst: '#2D5F5D',
};

interface PlatformSyncRowProps {
  platform: string;
  published: boolean;
  externalUrl?: string;
  syncStatus?: 'synced' | 'modified' | 'platform_changed';
  publishedAt?: string;
  onPush: () => void;
  onPull: () => void;
  onView: () => void;
  pushing?: boolean;
  pulling?: boolean;
}

export function PlatformSyncRow({
  platform,
  published,
  externalUrl,
  syncStatus,
  publishedAt,
  onPush,
  onPull,
  onView,
  pushing = false,
  pulling = false,
}: PlatformSyncRowProps) {
  const platformColor = PLATFORM_COLORS[platform] ?? '#888';
  const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);

  const isSynced = syncStatus === 'synced';

  let statusEl: React.ReactNode;
  if (syncStatus === 'synced') {
    statusEl = (
      <span style={styles.statusSynced}>✓ In sync</span>
    );
  } else if (syncStatus === 'modified') {
    statusEl = (
      <span style={styles.statusModified}>● Local changes</span>
    );
  } else if (syncStatus === 'platform_changed') {
    statusEl = (
      <span style={styles.statusPlatformChanged}>● Platform updated</span>
    );
  } else {
    statusEl = (
      <span style={styles.statusNone}>Not synced</span>
    );
  }

  return (
    <div style={styles.row}>
      {/* Left: platform dot + name */}
      <div style={styles.left}>
        <span style={{ ...styles.dot, background: platformColor }} />
        <span style={styles.platformName}>{platformLabel}</span>
        {published && publishedAt && (
          <span style={styles.publishedAt}>
            {new Date(publishedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Middle: sync status */}
      <div style={styles.middle}>
        {statusEl}
      </div>

      {/* Right: action buttons */}
      <div style={styles.right}>
        <button
          style={{ ...styles.btn, ...styles.viewBtn }}
          onClick={onView}
          disabled={!externalUrl}
          title={externalUrl ? `View on ${platformLabel}` : 'No URL available'}
        >
          View →
        </button>
        <button
          style={{
            ...styles.btn,
            ...styles.pushBtn,
            opacity: isSynced || pushing ? 0.5 : 1,
            cursor: isSynced || pushing ? 'not-allowed' : 'pointer',
          }}
          onClick={onPush}
          disabled={isSynced || pushing}
          title="Push local changes to platform"
        >
          {pushing ? 'Pushing...' : 'Push →'}
        </button>
        <button
          style={{
            ...styles.btn,
            ...styles.pullBtn,
            opacity: isSynced || pulling ? 0.5 : 1,
            cursor: isSynced || pulling ? 'not-allowed' : 'pointer',
          }}
          onClick={onPull}
          disabled={isSynced || pulling}
          title="Pull platform version (overwrites local)"
        >
          {pulling ? 'Pulling...' : 'Pull ←'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 12,
    padding: '12px 16px',
    marginBottom: 8,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 160,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  platformName: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 14,
    fontWeight: 600,
    color: '#080810',
  },
  publishedAt: {
    fontSize: 12,
    color: '#999',
    marginLeft: 4,
  },
  middle: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
  },
  statusSynced: {
    fontSize: 13,
    fontWeight: 500,
    color: '#22c55e',
  },
  statusModified: {
    fontSize: 13,
    fontWeight: 500,
    color: '#f97316',
  },
  statusPlatformChanged: {
    fontSize: 13,
    fontWeight: 500,
    color: '#3b82f6',
  },
  statusNone: {
    fontSize: 13,
    color: '#999',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  btn: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    padding: '6px 14px',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  viewBtn: {
    background: '#2D5F5D',
    color: '#fff',
  },
  pushBtn: {
    background: '#E2725B',
    color: '#fff',
  },
  pullBtn: {
    background: '#3b82f6',
    color: '#fff',
  },
};
