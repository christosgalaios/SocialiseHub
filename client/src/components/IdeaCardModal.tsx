import type { QueuedIdea } from '@shared/types';

interface IdeaCardModalProps {
  idea: QueuedIdea | null;
  loading: boolean;
  onAccept: (id: number) => void;
  onNext: () => void;
  onClose: () => void;
}

function confidenceColor(c: QueuedIdea['confidence']): string {
  if (c === 'high') return '#16a34a';
  if (c === 'medium') return '#d97706';
  return '#dc2626';
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function IdeaCardModal({ idea, loading, onAccept, onNext, onClose }: IdeaCardModalProps) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.headerTitle}>✦ Magic Event Idea</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div style={styles.loadingBody}>
            <div style={styles.spinner} />
            <p style={styles.loadingText}>Generating ideas...</p>
          </div>
        ) : idea ? (
          <div style={styles.body}>
            <div style={styles.badges}>
              <span style={styles.categoryBadge}>{idea.category}</span>
              <span style={{
                ...styles.confidenceBadge,
                background: confidenceColor(idea.confidence) + '20',
                color: confidenceColor(idea.confidence),
                border: `1px solid ${confidenceColor(idea.confidence)}40`,
              }}>
                {idea.confidence.charAt(0).toUpperCase() + idea.confidence.slice(1)} confidence
              </span>
            </div>

            <h3 style={styles.ideaTitle}>{idea.title}</h3>
            <p style={styles.ideaDesc}>{idea.shortDescription}</p>

            <div style={styles.dateBlock}>
              <span style={styles.dateLabel}>Suggested Date</span>
              <span style={styles.dateValue}>{formatDate(idea.suggestedDate)}</span>
            </div>

            <p style={styles.dateReason}>{idea.dateReason}</p>
          </div>
        ) : (
          <div style={styles.loadingBody}>
            <p style={styles.loadingText}>No ideas available.</p>
          </div>
        )}

        <div style={styles.footer}>
          <button style={styles.nextBtn} onClick={onNext} disabled={loading}>
            Next Idea →
          </button>
          <button
            style={{ ...styles.acceptBtn, opacity: loading || !idea ? 0.5 : 1 }}
            onClick={() => idea && onAccept(idea.id)}
            disabled={loading || !idea}
          >
            Yes — Create This ✦
          </button>
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
    background: 'rgba(8,8,16,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1200,
    padding: 24,
  },
  card: {
    background: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 480,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
    fontFamily: "'Outfit', sans-serif",
    color: '#080810',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #f0eeeb',
  },
  headerTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 17,
    fontWeight: 700,
    color: '#a855f7',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    color: '#999',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 8,
  },
  body: {
    padding: '24px 24px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  loadingBody: {
    padding: '48px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid #f0eeeb',
    borderTop: '3px solid #a855f7',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    color: '#7a7a7a',
    fontSize: 14,
    margin: 0,
    fontFamily: "'Outfit', sans-serif",
  },
  badges: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  categoryBadge: {
    padding: '3px 12px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    background: '#f3e8ff',
    color: '#7e22ce',
    border: '1px solid #e9d5ff',
  },
  confidenceBadge: {
    padding: '3px 12px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
  },
  ideaTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 22,
    fontWeight: 700,
    color: '#080810',
    margin: 0,
    lineHeight: 1.25,
  },
  ideaDesc: {
    fontSize: 14,
    color: '#555',
    margin: 0,
    lineHeight: 1.6,
  },
  dateBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    background: '#f9f7f5',
    borderRadius: 12,
    padding: '12px 16px',
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  dateValue: {
    fontSize: 14,
    fontWeight: 600,
    color: '#080810',
  },
  dateReason: {
    fontSize: 13,
    color: '#7a7a7a',
    margin: 0,
    lineHeight: 1.5,
    fontStyle: 'italic',
  },
  footer: {
    display: 'flex',
    gap: 10,
    padding: '16px 24px 20px',
    borderTop: '1px solid #f0eeeb',
    justifyContent: 'flex-end',
  },
  nextBtn: {
    padding: '10px 20px',
    borderRadius: 10,
    border: '1.5px solid #ddd',
    background: '#fff',
    color: '#555',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
  },
  acceptBtn: {
    padding: '10px 20px',
    borderRadius: 10,
    border: 'none',
    background: '#a855f7',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
  },
};
