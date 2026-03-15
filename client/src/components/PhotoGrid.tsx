import { useState } from 'react';
import type { EventPhoto } from '../api/events';

interface PhotoGridProps {
  photos: EventPhoto[];
  onDelete: (photoId: number) => void;
  onReorder: (order: number[]) => void;
}

export function PhotoGrid({ photos, onDelete, onReorder }: PhotoGridProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  if (photos.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={{ fontSize: 32 }}>&#128444;</span>
        <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>No photos yet</p>
      </div>
    );
  }

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDrop = (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) return;
    // Only reorder local photos (positive IDs)
    const localPhotos = photos.filter(p => p.id > 0);
    const newOrder = [...localPhotos.map((p) => p.id)];
    // Find the real indices within local photos
    const localDragIdx = localPhotos.findIndex(p => p.id === photos[dragIndex!]?.id);
    const localDropIdx = localPhotos.findIndex(p => p.id === photos[dropIndex]?.id);
    if (localDragIdx === -1 || localDropIdx === -1) return;
    const [moved] = newOrder.splice(localDragIdx, 1);
    newOrder.splice(localDropIdx, 0, moved);
    onReorder(newOrder);
    setDragIndex(null);
  };

  const platformColors: Record<string, string> = {
    meetup: '#f65858',
    eventbrite: '#f05537',
    headfirst: '#2563eb',
  };

  return (
    <div style={styles.grid}>
      {photos.map((photo, index) => {
        const isPlatform = photo.id < 0;
        return (
          <div
            key={photo.id}
            style={{
              ...styles.photoItem,
              opacity: dragIndex === index ? 0.5 : 1,
              border: dragIndex === index ? '2px dashed #a855f7' : isPlatform ? `2px solid ${platformColors[photo.source] ?? '#888'}44` : '2px solid transparent',
              cursor: isPlatform ? 'default' : 'grab',
            }}
            draggable={!isPlatform}
            onDragStart={!isPlatform ? () => handleDragStart(index) : undefined}
            onDragOver={(e) => e.preventDefault()}
            onDrop={!isPlatform ? () => handleDrop(index) : undefined}
          >
            <img
              src={photo.url}
              alt={`Event photo ${index + 1}`}
              style={styles.photo}
              crossOrigin="anonymous"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            {photo.isCover && (
              <span style={styles.coverBadge}>Cover</span>
            )}
            {!isPlatform && (
              <div style={styles.overlay}>
                <button
                  style={styles.deleteBtn}
                  onClick={() => onDelete(photo.id)}
                  title="Delete photo"
                >
                  ✕
                </button>
              </div>
            )}
            <div style={{
              ...styles.sourceLabel,
              background: isPlatform ? (platformColors[photo.source] ?? 'rgba(0,0,0,0.5)') + 'cc' : 'rgba(0,0,0,0.5)',
              color: '#fff',
            }}>
              {isPlatform ? `${photo.source} (live)` : photo.source}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: 10,
  },
  photoItem: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    cursor: 'grab',
    background: '#2a2a3e',
    aspectRatio: '1',
  },
  photo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  coverBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    background: '#a855f7',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 4,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: 4,
  },
  deleteBtn: {
    background: 'rgba(0,0,0,0.6)',
    border: 'none',
    color: '#fff',
    fontSize: 12,
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: 4,
    lineHeight: 1,
  },
  sourceLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'rgba(0,0,0,0.5)',
    color: '#ccc',
    fontSize: 9,
    textAlign: 'center',
    padding: '2px 0',
    textTransform: 'capitalize',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    background: '#2a2a3e',
    borderRadius: 8,
    minHeight: 80,
  },
};
