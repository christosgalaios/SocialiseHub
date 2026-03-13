import { useState, useEffect, useCallback } from 'react';
import type { ServiceConnection, PlatformName } from '@shared/types';
import {
  getServices,
  connectService,
  disconnectService,
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

// Platforms that require browser automation (session-based login)
const AUTOMATION_PLATFORMS: PlatformName[] = ['meetup', 'eventbrite'];

export function ServicesPage() {
  const [services, setServices] = useState<ServiceConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<PlatformName | null>(null);
  const [showForm, setShowForm] = useState<PlatformName | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

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
          const isAutomation = AUTOMATION_PLATFORMS.includes(svc.platform);
          const color = PLATFORM_COLORS[svc.platform] ?? '#E2725B';
          const icon = PLATFORM_ICONS[svc.platform] ?? '?';
          const isFormOpen = showForm === svc.platform;

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
                  {svc.connected ? 'Connected' : 'Not connected'}
                </span>
                {svc.connectedAt && (
                  <span style={styles.connectedAt}>
                    since {new Date(svc.connectedAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Automation note for Meetup/Eventbrite */}
              {isAutomation && !svc.connected && (
                <div style={styles.automationSection}>
                  <p style={styles.automationText}>
                    Uses browser automation — connect via the automation panel.
                  </p>
                </div>
              )}

              {/* Credential form (Headfirst only) */}
              {isFormOpen && !isAutomation && (
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
                ) : isAutomation ? (
                  <button style={styles.disabledBtn} disabled>
                    Via automation
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
  automationSection: {
    padding: '12px 16px',
    background: '#F0F4FF',
    borderRadius: 12,
    border: '1px solid #D0D8FF',
  },
  automationText: {
    fontSize: 12,
    color: '#4455AA',
    margin: 0,
    lineHeight: 1.5,
  },
  cardActions: { display: 'flex', gap: 8, marginTop: 4 },
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
  disabledBtn: {
    padding: '10px 24px',
    borderRadius: 10,
    border: 'none',
    background: '#e0e0e0',
    color: '#999',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'not-allowed',
    fontFamily: "'Outfit', sans-serif",
  },
};
