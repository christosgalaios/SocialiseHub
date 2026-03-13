import { useNavigate } from 'react-router-dom';
import type { SocialiseEvent } from '@shared/types';
import { StatusBadge } from './StatusBadge';
import { PlatformBadge } from './PlatformBadge';

export function EventCard({
  event,
  onDelete,
  onDuplicate,
}: {
  event: SocialiseEvent;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
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
          <StatusBadge status={event.status} />
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
};
