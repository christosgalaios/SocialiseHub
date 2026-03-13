import { useState, useEffect, useCallback } from 'react';
import type { ServiceConnection, PlatformName } from '@shared/types';
import { PLATFORM_AUTH_TYPES } from '@shared/types';
import {
  getServices,
  connectService,
  disconnectService,
  startOAuth,
  watchOAuthStatus,
} from '../api/events';
import { PLATFORM_COLORS, PLATFORM_ICONS } from '../lib/platforms';
import { CredentialsForm } from '../components/CredentialsForm';

// Electron API (available when running inside Electron)
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      openExternal: (url: string) => Promise<void>;
      copyToClipboard: (text: string) => Promise<void>;
      toggleClaudePanel: () => Promise<boolean>;
      focusClaudePanel: () => Promise<void>;
      isClaudePanelOpen: () => Promise<boolean>;
    };
  }
}

export function ServicesPage() {
  const [services, setServices] = useState<ServiceConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<PlatformName | null>(null);
  const [showForm, setShowForm] = useState<PlatformName | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [waitingOAuth, setWaitingOAuth] = useState<PlatformName | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getServices();
      setServices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load services');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── OAuth flow ─────────────────────────────────────────
  const handleOAuthConnect = async (platform: PlatformName) => {
    setConnecting(platform);
    setError(null);
    try {
      const { authUrl } = await startOAuth(platform);

      // Open in Electron's default browser or fallback to window.open
      if (window.electronAPI?.isElectron) {
        await window.electronAPI.openExternal(authUrl);
      } else {
        window.open(authUrl, '_blank');
      }

      // Start watching for completion
      setWaitingOAuth(platform);
      setConnecting(null);

      const cleanup = watchOAuthStatus(platform, () => {
        setWaitingOAuth(null);
        load(); // Reload services to get updated status
      });

      // Clean up after 5 minutes max
      setTimeout(() => {
        cleanup();
        setWaitingOAuth((current) =>
          current === platform ? null : current,
        );
      }, 5 * 60 * 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth failed');
      setConnecting(null);
    }
  };

  // ── Credential form flow (Headfirst only) ──────────────
  const handleCredentialConnect = async (platform: PlatformName, credentials?: Record<string, string>) => {
    setConnecting(platform);
    setError(null);
    try {
      const creds = credentials ?? formValues;
      const updated = await connectService(platform, creds);
      setServices((prev) =>
        prev.map((s) => (s.platform === platform ? updated : s)),
      );
      setShowForm(null);
      setFormValues({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (platform: PlatformName) => {
    if (!confirm(`Disconnect from ${platform}?`)) return;
    try {
      const updated = await disconnectService(platform);
      setServices((prev) =>
        prev.map((s) => (s.platform === platform ? updated : s)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    }
  };

  if (loading) return <p style={{ color: '#7a7a7a' }}>Loading services...</p>;

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Connected Services</h1>
        <p style={styles.subtitle}>
          Connect your event platforms to publish across all of them at once.
        </p>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.grid}>
        {services.map((svc) => {
          const authType = PLATFORM_AUTH_TYPES[svc.platform];
          const color = PLATFORM_COLORS[svc.platform] ?? '#E2725B';
          const icon = PLATFORM_ICONS[svc.platform] ?? '?';
          const isFormOpen = showForm === svc.platform;
          const isWaiting = waitingOAuth === svc.platform;

          return (
            <div key={svc.platform} style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ ...styles.icon, background: color }}>
                  {icon}
                </div>
                <div>
                  <h3 style={styles.cardTitle}>{svc.label}</h3>
                  <p style={styles.cardDesc}>{svc.description}</p>
                </div>
              </div>

              <div style={styles.cardStatus}>
                <span
                  style={{
                    ...styles.statusDot,
                    background: svc.connected ? '#2D5F5D' : '#ddd',
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: svc.connected ? '#2D5F5D' : '#7a7a7a',
                  }}
                >
                  {svc.connected
                    ? 'Connected'
                    : isWaiting
                      ? 'Waiting for login...'
                      : 'Not connected'}
                </span>
                {svc.connectedAt && (
                  <span style={styles.connectedAt}>
                    since {new Date(svc.connectedAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Waiting for OAuth — show spinner */}
              {isWaiting && (
                <div style={styles.waitingSection}>
                  <div style={styles.spinner} />
                  <span style={{ fontSize: 13, color: '#7a7a7a' }}>
                    Complete the login in your browser, then return here.
                  </span>
                </div>
              )}

              {/* Credential form (Headfirst only) */}
              {isFormOpen && authType === 'credentials' && (
                <CredentialsForm
                  loading={connecting === svc.platform}
                  error={error ?? undefined}
                  onSubmit={(email, password) => {
                    handleCredentialConnect(svc.platform, { email, password });
                  }}
                />
              )}

              <div style={styles.cardActions}>
                {svc.connected ? (
                  <button
                    style={styles.disconnectBtn}
                    onClick={() => handleDisconnect(svc.platform)}
                  >
                    Disconnect
                  </button>
                ) : isWaiting ? null : authType === 'oauth' ? (
                  <button
                    style={styles.oauthBtn}
                    disabled={connecting === svc.platform}
                    onClick={() => handleOAuthConnect(svc.platform)}
                  >
                    {connecting === svc.platform
                      ? 'Opening login...'
                      : `Login with ${svc.label}`}
                  </button>
                ) : isFormOpen ? (
                  <button
                    style={styles.cancelBtn}
                    onClick={() => {
                      setShowForm(null);
                      setFormValues({});
                    }}
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    style={styles.connectBtn}
                    onClick={() => {
                      setShowForm(svc.platform);
                      setFormValues({});
                    }}
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { marginBottom: 32 },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 28,
    fontWeight: 700,
    color: '#080810',
    marginBottom: 6,
  },
  subtitle: { fontSize: 14, color: '#7a7a7a' },
  error: {
    padding: '12px 16px',
    borderRadius: 12,
    background: '#fce8e6',
    color: '#E2725B',
    fontSize: 14,
    marginBottom: 20,
    fontWeight: 500,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '24px',
    border: '1px solid #e8e6e1',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  cardHeader: { display: 'flex', gap: 14, alignItems: 'flex-start' },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    color: '#fff',
    fontWeight: 800,
    fontSize: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontFamily: "'Outfit', sans-serif",
  },
  cardTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 16,
    fontWeight: 600,
    color: '#080810',
    marginBottom: 2,
  },
  cardDesc: { fontSize: 13, color: '#7a7a7a', lineHeight: 1.4 },
  cardStatus: { display: 'flex', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: '50%' },
  connectedAt: { fontSize: 12, color: '#aaa' },
  waitingSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '16px',
    background: '#f0f9f0',
    borderRadius: 12,
  },
  spinner: {
    width: 18,
    height: 18,
    border: '2.5px solid #ddd',
    borderTopColor: '#2D5F5D',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    flexShrink: 0,
  },
  formSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '16px',
    background: '#FAFAF6',
    borderRadius: 12,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#555',
    fontFamily: "'Outfit', sans-serif",
  },
  input: {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #ddd',
    fontSize: 14,
    outline: 'none',
  },
  cardActions: { display: 'flex', gap: 8, marginTop: 4 },
  oauthBtn: {
    padding: '10px 24px',
    borderRadius: 10,
    border: 'none',
    background: '#2D5F5D',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
  },
  connectBtn: {
    padding: '8px 20px',
    borderRadius: 10,
    border: 'none',
    background: '#E2725B',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
  },
  disconnectBtn: {
    padding: '8px 20px',
    borderRadius: 10,
    border: '1.5px solid #E2725B',
    background: 'transparent',
    color: '#E2725B',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
  },
  cancelBtn: {
    padding: '8px 20px',
    borderRadius: 10,
    border: '1px solid #ddd',
    background: '#fff',
    color: '#7a7a7a',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
