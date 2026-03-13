// Inject shimmer keyframes once into <head> on module load
if (typeof document !== 'undefined' && !document.getElementById('shimmer-keyframes')) {
  const tag = document.createElement('style');
  tag.id = 'shimmer-keyframes';
  tag.textContent = '@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }';
  document.head.appendChild(tag);
}

export function Skeleton({ width, height = 16, style }: { width?: string | number; height?: number; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        width: width ?? '100%',
        height,
        borderRadius: 8,
        background: 'linear-gradient(90deg, #f0eeeb 25%, #e8e6e1 50%, #f0eeeb 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        ...style,
      }}
    />
  );
}

export function CardSkeleton() {
  return (
    <div style={styles.card}>
      <Skeleton height={140} />
      <div style={styles.body}>
        <Skeleton width="70%" height={20} />
        <Skeleton width="50%" height={14} />
        <Skeleton width="90%" height={14} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton width={60} height={24} />
          <Skeleton width={60} height={24} />
        </div>
      </div>
    </div>
  );
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div style={styles.grid}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Skeleton width={40} height={40} style={{ borderRadius: '50%' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="40%" height={12} />
          </div>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    border: '1px solid #e8e6e1',
    overflow: 'hidden',
  },
  body: {
    padding: '16px 22px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
};
