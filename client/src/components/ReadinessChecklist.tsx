import type { ReadinessCheck } from '../../../src/lib/event-readiness';

export function ReadinessChecklist({
  checks,
  ready,
}: {
  checks: ReadinessCheck[];
  ready: boolean;
}) {
  const required = checks.filter((c) => c.severity === 'required');
  const recommended = checks.filter((c) => c.severity === 'recommended');
  const missingRequired = required.filter((c) => !c.passed).length;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={{ ...styles.status, color: ready ? '#2D5F5D' : '#E2725B' }}>
          {ready ? 'Ready to publish' : `${missingRequired} required item${missingRequired !== 1 ? 's' : ''} missing`}
        </span>
      </div>

      <div style={styles.section}>
        <p style={styles.sectionTitle}>Required</p>
        {required.map((c) => (
          <CheckItem key={c.field} check={c} />
        ))}
      </div>

      <div style={styles.section}>
        <p style={styles.sectionTitle}>Recommended</p>
        {recommended.map((c) => (
          <CheckItem key={c.field} check={c} />
        ))}
      </div>
    </div>
  );
}

function CheckItem({ check }: { check: ReadinessCheck }) {
  return (
    <div style={styles.item}>
      <span style={{ ...styles.icon, color: check.passed ? '#2D5F5D' : '#E2725B' }}>
        {check.passed ? '\u2713' : '\u2717'}
      </span>
      <span style={{ ...styles.label, color: check.passed ? '#555' : '#080810' }}>
        {check.label}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#fff',
    borderRadius: 16,
    border: '1px solid #e8e6e1',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  status: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 15,
    fontWeight: 700,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    color: '#7a7a7a',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 14,
  },
  icon: {
    fontSize: 16,
    fontWeight: 700,
    width: 20,
    textAlign: 'center' as const,
  },
  label: {
    fontSize: 14,
  },
};
