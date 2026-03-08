import type { EventStatus } from '@shared/types';

const colors: Record<EventStatus, { bg: string; text: string }> = {
  draft: { bg: '#f0efeb', text: '#7a7a7a' },
  published: { bg: '#e6f4ea', text: '#2D5F5D' },
  cancelled: { bg: '#fce8e6', text: '#E2725B' },
};

export function StatusBadge({ status }: { status: EventStatus }) {
  const c = colors[status];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        textTransform: 'capitalize',
        background: c.bg,
        color: c.text,
      }}
    >
      {status}
    </span>
  );
}
