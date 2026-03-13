import { useState, useEffect, useCallback, useRef } from 'react';
import type { ServiceConnection, PlatformName } from '@shared/types';
import {
  getServices,
  connectService,
  disconnectService,
  startAutomation,
  setupService,
} from '../api/events';
import { PLATFORM_COLORS, PLATFORM_ICONS } from '../lib/platforms';

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
      startAutomation: (request: { platform: string; action: string; data?: unknown }) => Promise<void>;
      cancelAutomation: () => Promise<void>;
      resumeAutomation: () => Promise<void>;
      onAutomationStatus: (cb: (status: { step: number; totalSteps: number; description: string; state: string }) => void) => () => void;
      onAutomationResult: (cb: (result: { success: boolean; error?: string }) => void) => () => void;
    };
  }
}

interface AutomationStatus {
  step: number;
  totalSteps: number;
  description: string;
  state: string;
}

export function ServicesPage() {
  const [services, setServices] = useState<ServiceConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<PlatformName | null>(null);
  const connectingRef = useRef<PlatformName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus | null>(null);

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

  // Subscribe to automation status and result events
  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!electronAPI) return;

    const unsubStatus = electronAPI.onAutomationStatus((status) => {
      setAutomationStatus(status);
    });

    const unsubResult = electronAPI.onAutomationResult(async (result) => {
      const platform = connectingRef.current;
      setAutomationStatus(null);
      setConnecting(null);
      connectingRef.current = null;
      if (!result.success) {
        setError(result.error ?? 'Automation failed');
      } else if (platform) {
        // Mark service as connected in the database
        try {
          await connectService(platform, { automationConnected: 'true' });
        } catch { /* ignore */ }

        // Extract platform-specific data from automation result and store it
        try {
          const evalResult = (result.data as Record<string, unknown>)?.lastEvalResult;
          const data = typeof evalResult === 'string' ? JSON.parse(evalResult) : evalResult;
          if (data?.groupUrlname && platform === 'meetup') {
            await setupService(platform, { groupUrlname: data.groupUrlname });
          }
        } catch { /* ignore */ }

        load();
      } else {
        load();
      }
    });

    return () => {
      unsubStatus();
      unsubResult();
    };
  }, [load]);

  const handleConnect = async (platform: PlatformName) => {
    setConnecting(platform);
    connectingRef.current = platform;
    setError(null);
    setAutomationStatus(null);
    try {
      await startAutomation(platform, 'connect');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
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

      {automationStatus && (
        <div style={styles.automationProgress}>
          <div style={styles.automationProgressBar}>
            <div
              style={{
                ...styles.automationProgressFill,
                width: `${Math.round((automationStatus.step / automationStatus.totalSteps) * 100)}%`,
              }}
            />
          </div>
          <p style={styles.automationProgressText}>
            Step {automationStatus.step}/{automationStatus.totalSteps}: {automationStatus.description}
          </p>
        </div>
      )}

      <div style={styles.grid}>
        {services.map((svc) => {
          const color = PLATFORM_COLORS[svc.platform] ?? '#E2725B';
          const icon = PLATFORM_ICONS[svc.platform] ?? '?';

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

              {connecting === svc.platform && automationStatus && (
                <div style={styles.automationSection}>
                  <p style={styles.automationText}>
                    {automationStatus.description}
                  </p>
                </div>
              )}

              <div style={styles.cardActions}>
                {svc.connected ? (
                  <button
                    style={styles.disconnectBtn}
                    onClick={() => handleDisconnect(svc.platform)}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    style={styles.connectBtn}
                    onClick={() => handleConnect(svc.platform)}
                    disabled={connecting === svc.platform}
                  >
                    {connecting === svc.platform ? 'Connecting...' : 'Connect'}
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
  automationProgress: {
    padding: '12px 16px',
    borderRadius: 12,
    background: '#F0F4FF',
    border: '1px solid #D0D8FF',
    marginBottom: 20,
  },
  automationProgressBar: {
    height: 6,
    borderRadius: 3,
    background: '#D0D8FF',
    overflow: 'hidden',
    marginBottom: 8,
  },
  automationProgressFill: {
    height: '100%',
    background: '#4455AA',
    borderRadius: 3,
    transition: 'width 0.3s ease',
  },
  automationProgressText: {
    fontSize: 12,
    color: '#4455AA',
    margin: 0,
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
};
