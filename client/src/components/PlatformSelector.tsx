import type { PlatformName, ServiceConnection, PlatformPublishStatus } from '@shared/types';
import { PLATFORM_COLORS, PLATFORM_ICONS, PLATFORM_ORDER } from '../lib/platforms';

interface PlatformSelectorProps {
  selected: PlatformName[];
  onChange: (platforms: PlatformName[]) => void;
  services: ServiceConnection[];
  /** Current publish statuses for this event — used for smart publish hints */
  platformStatuses?: PlatformPublishStatus[];
}

const ALL_PLATFORMS: { name: PlatformName; label: string }[] = PLATFORM_ORDER.map((name) => ({
  name: name as PlatformName,
  label: name === 'meetup' ? 'Meetup' : name === 'headfirst' ? 'Headfirst Bristol' : 'Eventbrite',
}));

export function PlatformSelector({ selected, onChange, services, platformStatuses }: PlatformSelectorProps) {
  const connectionMap = new Map(services.map((s) => [s.platform, s]));
  const statusMap = new Map((platformStatuses ?? []).map((p) => [p.platform, p]));

  const toggle = (platform: PlatformName) => {
    if (selected.includes(platform)) {
      onChange(selected.filter((p) => p !== platform));
    } else {
      onChange([...selected, platform]);
    }
  };

  return (
    <div style={styles.container}>
      <span style={styles.label}>Publish to Platforms</span>
      <div style={styles.list}>
        {ALL_PLATFORMS.map(({ name, label }) => {
          const svc = connectionMap.get(name);
          const connected = svc?.connected ?? false;
          const ps = statusMap.get(name);
          const isSelected = selected.includes(name);
          const color = PLATFORM_COLORS[name] ?? '#888';
          const icon = PLATFORM_ICONS[name] ?? '?';

          // Smart publish logic
          const isPublished = ps?.published ?? false;
          const syncStatus = ps?.syncStatus;
          const isSynced = isPublished && syncStatus === 'synced';
          const isModified = isPublished && syncStatus === 'modified';
          const isPlatformChanged = isPublished && syncStatus === 'platform_changed';
          const notPublished = !isPublished;

          // Hint text
          let statusHint = '';
          let statusColor = '#7a7a7a';
          if (!connected) {
            statusHint = 'Not connected';
            statusColor = '#aaa';
          } else if (isSynced) {
            statusHint = 'In sync — no changes to push';
            statusColor = '#22c55e';
          } else if (isModified) {
            statusHint = 'Local changes — needs push';
            statusColor = '#f59e0b';
          } else if (isPlatformChanged) {
            statusHint = 'Platform has newer version';
            statusColor = '#E2725B';
          } else if (notPublished) {
            statusHint = 'Not published yet';
            statusColor = '#3b82f6';
          } else if (isPublished) {
            statusHint = 'Published';
            statusColor = '#22c55e';
          }

          return (
            <label
              key={name}
              style={{
                ...styles.item,
                opacity: connected ? 1 : 0.4,
                cursor: connected ? 'pointer' : 'not-allowed',
                borderColor: isSelected && connected ? color : isSynced ? '#22c55e44' : '#ddd',
                background: isSelected && connected ? `${color}12` : isSynced ? '#22c55e08' : '#fff',
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={!connected}
                onChange={() => toggle(name)}
                style={styles.checkbox}
              />
              <span
                style={{
                  ...styles.icon,
                  background: connected ? color : '#ccc',
                }}
              >
                {icon}
              </span>
              <span style={styles.platformName}>{label}</span>
              <span style={{ fontSize: 12, color: statusColor, fontWeight: isSynced ? 400 : 600 }}>
                {statusHint}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#555',
    fontFamily: "'Outfit', sans-serif",
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderRadius: 12,
    border: '1.5px solid #ddd',
    transition: 'all 0.2s',
    userSelect: 'none' as const,
  },
  checkbox: {
    width: 16,
    height: 16,
    cursor: 'inherit',
    flexShrink: 0,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    color: '#fff',
    fontWeight: 800,
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontFamily: "'Outfit', sans-serif",
  },
  platformName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#080810',
    flex: 1,
  },
};
