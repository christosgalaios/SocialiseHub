import { useState } from 'react';
import type { UnsplashPhoto } from '../api/events';

interface PhotoSearchModalProps {
  eventId: string;
  onClose: () => void;
  onSelect: (photo: UnsplashPhoto) => void;
  onSearch: (query: string) => Promise<UnsplashPhoto[]>;
  initialQuery?: string;
}

export function PhotoSearchModal({
  onClose,
  onSelect,
  onSearch,
  initialQuery = '',
}: PhotoSearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [photos, setPhotos] = useState<UnsplashPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const results = await onSearch(query.trim());
      setPhotos(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (photo: UnsplashPhoto) => {
    setSelected(photo.id);
    onSelect(photo);
    onClose();
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Search Unsplash Photos</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.searchBar}>
          <input
            style={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search photos..."
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            autoFocus
          />
          <button style={styles.searchBtn} onClick={handleSearch} disabled={loading}>
            {loading ? '...' : 'Search'}
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.grid}>
          {photos.map((photo) => (
            <div
              key={photo.id}
              style={{
                ...styles.photoItem,
                outline: selected === photo.id ? '3px solid #a855f7' : '2px solid transparent',
              }}
              onClick={() => handleSelect(photo)}
              title={`Photo by ${photo.photographer}`}
            >
              <img src={photo.thumbUrl} alt={photo.alt} style={styles.photo} />
              <div style={styles.photographer}>{photo.photographer}</div>
            </div>
          ))}
          {photos.length === 0 && !loading && (
            <p style={styles.hint}>
              {error ? '' : 'Type a keyword and press Search'}
            </p>
          )}
        </div>

        <div style={styles.footer}>
          <span style={styles.attribution}>
            Photos provided by{' '}
            <a
              href="https://unsplash.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#a855f7' }}
            >
              Unsplash
            </a>
          </span>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: 24,
  },
  modal: {
    background: '#1e1e2e',
    borderRadius: 16,
    width: '100%',
    maxWidth: 760,
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #2a2a3e',
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 16,
    fontWeight: 700,
    color: '#fff',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#aaa',
    fontSize: 18,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 6,
  },
  searchBar: {
    display: 'flex',
    gap: 8,
    padding: '12px 20px',
    borderBottom: '1px solid #2a2a3e',
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #3a3a4e',
    background: '#2a2a3e',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
  },
  searchBtn: {
    padding: '8px 18px',
    borderRadius: 8,
    border: 'none',
    background: '#a855f7',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  error: {
    padding: '8px 20px',
    color: '#E2725B',
    fontSize: 13,
  },
  grid: {
    flex: 1,
    overflow: 'auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 8,
    padding: '12px 20px',
  },
  photoItem: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    cursor: 'pointer',
    background: '#2a2a3e',
    aspectRatio: '4/3',
    transition: 'outline 0.15s',
  },
  photo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  photographer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'rgba(0,0,0,0.6)',
    color: '#ccc',
    fontSize: 9,
    padding: '2px 4px',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
  hint: {
    color: '#aaa',
    fontSize: 13,
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: 20,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    borderTop: '1px solid #2a2a3e',
  },
  attribution: {
    color: '#aaa',
    fontSize: 12,
  },
  cancelBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid #3a3a4e',
    background: 'none',
    color: '#ccc',
    fontSize: 13,
    cursor: 'pointer',
  },
};
