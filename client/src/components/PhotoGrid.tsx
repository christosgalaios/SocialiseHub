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
    const newOrder = [...photos.map((p) => p.id)];
    const [moved] = newOrder.splice(dragIndex, 1);
    newOrder.splice(dropIndex, 0, moved);
    onReorder(newOrder);
    setDragIndex(null);
  };

  return (
    <div style={styles.grid}>
      {photos.map((photo, index) => (
        <div
          key={photo.id}
          style={{
            ...styles.photoItem,
            opacity: dragIndex === index ? 0.5 : 1,
            border: dragIndex === index ? '2px dashed #a855f7' : '2px solid transparent',
          }}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(index)}
        >
          <img
            src={photo.url}
            alt={`Event photo ${index + 1}`}
            style={styles.photo}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          {photo.isCover && (
            <span style={styles.coverBadge}>Cover</span>
          )}
          <div style={styles.overlay}>
            <button
              style={styles.deleteBtn}
              onClick={() => onDelete(photo.id)}
              title="Delete photo"
            >
              ✕
            </button>
          </div>
          <div style={styles.sourceLabel}>{photo.source}</div>
        </div>
      ))}
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
