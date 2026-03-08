import type { PlatformPublishStatus } from '@shared/types';
import { PLATFORM_COLORS } from '../lib/platforms';

export function PlatformBadge({ ps }: { ps: PlatformPublishStatus }) {
  const accent = PLATFORM_COLORS[ps.platform] ?? '#E2725B';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'capitalize',
        border: `1.5px solid ${accent}`,
        color: ps.published ? '#fff' : accent,
        background: ps.published ? accent : 'transparent',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: ps.published ? '#fff' : accent,
        }}
      />
      {ps.platform}
    </span>
  );
}
