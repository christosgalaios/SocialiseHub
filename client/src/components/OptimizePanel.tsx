import { useState, useRef, useEffect } from 'react';
import type { EventPhoto, UnsplashPhoto } from '../api/events';
import { PhotoGrid } from './PhotoGrid';
import { PhotoSearchModal } from './PhotoSearchModal';
import {
  getEventPhotos,
  uploadEventPhoto,
  reorderPhotos,
  deletePhoto,
  searchUnsplashPhotos,
  getPhotoGenPrompt,
} from '../api/events';

interface OptimizePanelProps {
  eventId: string;
  eventTitle?: string;
}

export function OptimizePanel({ eventId, eventTitle }: OptimizePanelProps) {
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [photosLoaded, setPhotosLoaded] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [genPrompt, setGenPrompt] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Lazy load photos
  const ensurePhotos = async (signal?: { cancelled: boolean }) => {
    if (!photosLoaded) {
      try {
        const loaded = await getEventPhotos(eventId);
        if (signal?.cancelled) return;
        setPhotos(loaded);
        setPhotosLoaded(true);
      } catch {
        if (!signal?.cancelled) setError('Failed to load photos');
      }
    }
  };

  useEffect(() => {
    const signal = { cancelled: false };
    ensurePhotos(signal);
    return () => { signal.cancelled = true; };
  }, [eventId]);

  const handleUploadFiles = async (files: FileList | File[], source = 'upload') => {
    setUploading(true);
    setError(null);
    try {
      const uploaded: EventPhoto[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const photo = await uploadEventPhoto(eventId, file, source);
        uploaded.push(photo);
      }
      setPhotos((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) await handleUploadFiles(files);
  };

  const handleDeletePhoto = async (photoId: number) => {
    try {
      await deletePhoto(eventId, photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleReorder = async (order: number[]) => {
    try {
      const updated = await reorderPhotos(eventId, order);
      setPhotos(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reorder failed');
    }
  };

  const handleUnsplashSelect = async (photo: UnsplashPhoto) => {
    setUploading(true);
    setError(null);
    try {
      // Download via proxy to avoid CORS issues in Electron
      const imgRes = await fetch(photo.url);
      const blob = await imgRes.blob();
      const file = new File([blob], `unsplash_${photo.id}.jpg`, { type: 'image/jpeg' });
      const uploaded = await uploadEventPhoto(eventId, file, 'unsplash');
      setPhotos((prev) => [...prev, uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import Unsplash photo');
    } finally {
      setUploading(false);
    }
  };

  const handleGetGenPrompt = async () => {
    setError(null);
    try {
      const { prompt } = await getPhotoGenPrompt(eventId);
      setGenPrompt(prompt);
      setPromptCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get prompt');
    }
  };

  const handleCopyPrompt = async () => {
    if (!genPrompt) return;
    try {
      await navigator.clipboard.writeText(genPrompt);
      setPromptCopied(true);
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  return (
    <div style={styles.panel}>
      <h3 style={styles.heading}>Photos</h3>

      {error && <div style={styles.error}>{error}</div>}

      <PhotoGrid photos={photos} onDelete={handleDeletePhoto} onReorder={handleReorder} />

      {/* Drop zone */}
      <div
        style={{
          ...styles.dropZone,
          ...(dragging ? styles.dropZoneActive : {}),
        }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <span style={{ fontSize: 24 }}>&#8593;</span>
        <p style={{ margin: 0, fontSize: 13, color: '#aaa' }}>
          {uploading ? 'Uploading...' : 'Drop images here or click to upload'}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
        />
      </div>

      {/* Action buttons */}
      <div style={styles.actions}>
        <button style={styles.actionBtn} onClick={() => setShowSearch(true)}>
          &#128247; Search Web
        </button>
        <button style={styles.actionBtn} onClick={() => folderInputRef.current?.click()}>
          &#128193; From Folder
        </button>
        <button style={styles.actionBtn} onClick={handleGetGenPrompt}>
          &#10024; AI Prompt
        </button>
        <input
          ref={folderInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && handleUploadFiles(e.target.files, 'folder')}
        />
      </div>

      {/* AI gen prompt display */}
      {genPrompt && (
        <div style={styles.promptBox}>
          <div style={styles.promptHeader}>
            <span style={{ fontSize: 13, color: '#a855f7', fontWeight: 600 }}>AI Image Generation Prompt</span>
            <button style={styles.copyBtn} onClick={handleCopyPrompt}>
              {promptCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre style={styles.promptText}>{genPrompt}</pre>
        </div>
      )}

      {/* Unsplash search modal */}
      {showSearch && (
        <PhotoSearchModal
          eventId={eventId}
          onClose={() => setShowSearch(false)}
          onSelect={handleUnsplashSelect}
          onSearch={(query) => searchUnsplashPhotos(eventId, query)}
          initialQuery={eventTitle ?? ''}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: '#1e1e2e',
    borderRadius: 16,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    marginTop: 24,
  },
  heading: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 16,
    fontWeight: 700,
    color: '#fff',
    margin: 0,
  },
  error: {
    padding: '8px 12px',
    borderRadius: 8,
    background: 'rgba(226,114,91,0.15)',
    color: '#E2725B',
    fontSize: 13,
  },
  dropZone: {
    border: '2px dashed #3a3a4e',
    borderRadius: 10,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    transition: 'border-color 0.2s, background 0.2s',
    color: '#aaa',
  },
  dropZoneActive: {
    borderColor: '#a855f7',
    background: 'rgba(168,85,247,0.1)',
  },
  actions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  actionBtn: {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid #3a3a4e',
    background: '#2a2a3e',
    color: '#ccc',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'background 0.15s',
  },
  promptBox: {
    background: '#2a2a3e',
    borderRadius: 10,
    overflow: 'hidden',
  },
  promptHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid #3a3a4e',
  },
  copyBtn: {
    padding: '4px 10px',
    borderRadius: 6,
    border: 'none',
    background: '#a855f7',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  promptText: {
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    lineHeight: 1.6,
    color: '#ccc',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
    padding: 12,
    maxHeight: 200,
    overflow: 'auto',
  },
};
