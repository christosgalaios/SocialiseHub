import type { PlatformName, ServiceConnection } from '@shared/types';
import { PLATFORM_COLORS, PLATFORM_ICONS } from '../lib/platforms';

interface PlatformSelectorProps {
  selected: PlatformName[];
  onChange: (platforms: PlatformName[]) => void;
  services: ServiceConnection[];
}

const ALL_PLATFORMS: { name: PlatformName; label: string }[] = [
  { name: 'meetup', label: 'Meetup' },
  { name: 'eventbrite', label: 'Eventbrite' },
  { name: 'headfirst', label: 'Headfirst Bristol' },
];

export function PlatformSelector({ selected, onChange, services }: PlatformSelectorProps) {
  const connectionMap = new Map(services.map((s) => [s.platform, s]));

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
          const isSelected = selected.includes(name);
          const color = PLATFORM_COLORS[name] ?? '#888';
          const icon = PLATFORM_ICONS[name] ?? '?';

          return (
            <label
              key={name}
              style={{
                ...styles.item,
                opacity: connected ? 1 : 0.5,
                cursor: connected ? 'pointer' : 'not-allowed',
                borderColor: isSelected && connected ? color : '#ddd',
                background: isSelected && connected ? `${color}12` : '#fff',
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
                  background: color,
                }}
              >
                {icon}
              </span>
              <span style={styles.platformName}>{label}</span>
              {!connected && (
                <span style={styles.notConnected}>Not connected</span>
              )}
              {connected && svc?.connectedAt && (
                <span style={styles.connectedSince}>
                  Connected {new Date(svc.connectedAt).toLocaleDateString()}
                </span>
              )}
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
  notConnected: {
    fontSize: 12,
    color: '#aaa',
    fontStyle: 'italic',
  },
  connectedSince: {
    fontSize: 12,
    color: '#7a7a7a',
  },
};
