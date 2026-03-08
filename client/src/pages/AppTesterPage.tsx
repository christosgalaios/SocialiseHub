import { useState } from 'react';

type Environment = 'prod' | 'dev';

const ENV_URLS: Record<Environment, string> = {
  prod: 'https://app.socialise.events/prod/',
  dev: 'https://app.socialise.events/dev/',
};

export function AppTesterPage() {
  const [env, setEnv] = useState<Environment>('dev');

  return (
    <div style={styles.container}>
      {/* ── Header bar ── */}
      <div style={styles.header}>
        <h2 style={styles.title}>App Tester</h2>
        <div style={styles.envToggle}>
          {(['dev', 'prod'] as Environment[]).map((e) => (
            <button
              key={e}
              style={{
                ...styles.envBtn,
                ...(env === e ? styles.envBtnActive : {}),
                ...(e === 'prod' && env === 'prod' ? styles.envBtnProd : {}),
              }}
              onClick={() => setEnv(e)}
            >
              <span style={styles.envDot(e === env, e)} />
              {e === 'dev' ? 'Development' : 'Production'}
            </button>
          ))}
        </div>
        <span style={styles.urlLabel}>{ENV_URLS[env]}</span>
      </div>

      {/* ── Embedded app iframe ── */}
      <div style={styles.iframeContainer}>
        <iframe
          key={env}
          src={ENV_URLS[env]}
          style={styles.iframe}
          title={`Socialise App — ${env}`}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    gap: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '0 0 20px',
    borderBottom: '1px solid #e8e5e0',
    flexShrink: 0,
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 700,
    fontSize: 22,
    color: '#1a1a2e',
    margin: 0,
  },
  envToggle: {
    display: 'flex',
    gap: 6,
    background: '#f0ede8',
    borderRadius: 10,
    padding: 4,
  },
  envBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "'Outfit', sans-serif",
    color: '#888',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  envBtnActive: {
    background: '#fff',
    color: '#1a1a2e',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  envBtnProd: {
    color: '#E2725B',
  },
  envDot: (active: boolean, env: Environment): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: active
      ? env === 'prod' ? '#E2725B' : '#2D5F5D'
      : '#ccc',
    flexShrink: 0,
  }),
  urlLabel: {
    marginLeft: 'auto',
    fontSize: 12,
    color: '#999',
    fontFamily: "'Cascadia Code', 'Consolas', monospace",
  } as React.CSSProperties,
  iframeContainer: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    border: '1px solid #e8e5e0',
    marginTop: 16,
    background: '#fff',
  } as React.CSSProperties,
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
  } as React.CSSProperties,
};
