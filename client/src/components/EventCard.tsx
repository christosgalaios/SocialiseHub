import { useNavigate } from 'react-router-dom';
import type { SocialiseEvent } from '@shared/types';
import { StatusBadge } from './StatusBadge';
import { PlatformBadge } from './PlatformBadge';

export function EventCard({
  event,
  onDelete,
  onDuplicate,
  onPush,
  onOptimize,
}: {
  event: SocialiseEvent;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onPush?: (id: string) => void;
  onOptimize?: (id: string) => void;
}) {
  const nav = useNavigate();

  return (
    <div
      style={styles.card}
      onClick={() => nav(`/events/${event.id}`)}
      role="button"
      tabIndex={0}
    >
      {event.imageUrl && (
        <img
          src={event.imageUrl}
          alt={event.title}
          style={styles.cardImage}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div style={{ ...styles.cardBody, paddingTop: event.imageUrl ? 12 : 22 }}>
        <div style={styles.header}>
          <h3 style={styles.title}>{event.title}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {event.sync_status === 'synced' && (
              <span style={styles.syncDotGreen} title="In sync" />
            )}
            {event.sync_status === 'modified' && (
              <span style={styles.syncDotOrange} title="Needs push" />
            )}
            {onOptimize && (
              <button
                style={styles.wandBtn}
                title="Optimize with AI"
                onClick={(e) => {
                  e.stopPropagation();
                  onOptimize(event.id);
                }}
              >
                ✦
              </button>
            )}
            <StatusBadge status={event.status} />
          </div>
        </div>

        <div style={styles.meta}>
          <span>
            {new Date(event.start_time).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span style={styles.dot} />
          <span>{event.venue}</span>
        </div>

        <p style={styles.desc}>
          {event.description.length > 100
            ? event.description.slice(0, 100) + '...'
            : event.description}
        </p>

        {((event.checklistTotal ?? 0) > 0 || (event.notesCount ?? 0) > 0) && (
          <div style={styles.progressRow}>
            {(event.checklistTotal ?? 0) > 0 && (
              <span style={{
                ...styles.progressBadge,
                background: event.checklistDone === event.checklistTotal ? '#dcfce7' : '#fef3c7',
                color: event.checklistDone === event.checklistTotal ? '#16a34a' : '#d97706',
              }}>
                {event.checklistDone}/{event.checklistTotal} tasks
              </span>
            )}
            {(event.notesCount ?? 0) > 0 && (
              <span style={styles.notesBadge}>
                {event.notesCount} note{event.notesCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        <div style={styles.footer}>
          <div style={styles.platforms}>
            {event.platforms.map((ps) => (
              <PlatformBadge key={ps.platform} ps={ps} />
            ))}
          </div>
          <div style={styles.actions}>
            <span style={styles.price}>
              {event.price === 0 ? 'Free' : `£${event.price}`}
            </span>
            {event.sync_status === 'modified' && event.platforms?.length > 0 && (
              <button
                style={styles.pushBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onPush?.(event.id);
                }}
              >
                Push ↑
              </button>
            )}
            <button
              style={styles.dupBtn}
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(event.id);
              }}
            >
              Duplicate
            </button>
            <button
              style={styles.deleteBtn}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(event.id);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    borderRadius: 16,
    border: '1px solid #e8e6e1',
    cursor: 'pointer',
    transition: 'box-shadow 0.2s, transform 0.2s',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    overflow: 'hidden',
    padding: '0 0 0 0',
  },
  cardImage: {
    width: '100%',
    height: 140,
    objectFit: 'cover' as const,
  },
  cardBody: {
    padding: '0 22px 22px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 17,
    fontWeight: 600,
    lineHeight: 1.3,
    color: '#080810',
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: '#7a7a7a',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: '50%',
    background: '#ccc',
  },
  desc: {
    fontSize: 13,
    color: '#555',
    lineHeight: 1.6,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  platforms: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  price: {
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "'Outfit', sans-serif",
    color: '#2D5F5D',
  },
  syncDotGreen: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#22c55e',
    flexShrink: 0,
  },
  syncDotOrange: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#f97316',
    flexShrink: 0,
  },
  pushBtn: {
    fontSize: 12,
    color: '#fff',
    background: '#f97316',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 10px',
    borderRadius: 6,
    fontWeight: 700,
  },
  dupBtn: {
    fontSize: 12,
    color: '#2D5F5D',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 6,
    fontWeight: 600,
  },
  deleteBtn: {
    fontSize: 12,
    color: '#E2725B',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 6,
    fontWeight: 600,
  },
  wandBtn: {
    fontSize: 14,
    color: '#a855f7',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 4px',
    borderRadius: 4,
    lineHeight: 1,
    fontWeight: 700,
  },
  progressRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  progressBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 8,
  },
  notesBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 8,
    background: '#f0f0ff',
    color: '#6366f1',
  },
};
