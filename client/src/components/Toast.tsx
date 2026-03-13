import { useToast } from '../context/ToastContext';

const TYPE_STYLES: Record<string, React.CSSProperties> = {
  success: { background: '#2D5F5D', color: '#fff' },
  error: { background: '#E2725B', color: '#fff' },
  info: { background: '#080810', color: '#fff' },
};

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div style={styles.container}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{ ...styles.toast, ...TYPE_STYLES[toast.type] }}
          onClick={() => dismissToast(toast.id)}
        >
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 16,
    right: 16,
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    pointerEvents: 'none',
  },
  toast: {
    padding: '12px 20px',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Outfit', sans-serif",
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    cursor: 'pointer',
    pointerEvents: 'auto',
    animation: 'slideIn 0.2s ease-out',
    maxWidth: 360,
  },
};
