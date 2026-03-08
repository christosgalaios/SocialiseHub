import { useState, useEffect } from 'react';
import type { ServiceConnection, PlatformName } from '@shared/types';
import { getServices, connectService, disconnectService } from '../api/events';
import { PLATFORM_COLORS, PLATFORM_ICONS, PLATFORM_FIELDS } from '../lib/platforms';

export function ServicesPage() {
  const [services, setServices] = useState<ServiceConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<PlatformName | null>(null);
  const [showForm, setShowForm] = useState<PlatformName | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const data = await getServices();
      setServices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleConnect = async (platform: PlatformName) => {
    setConnecting(platform);
    setError(null);
    try {
      const updated = await connectService(platform, formValues);
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
          const fields = PLATFORM_FIELDS[svc.platform];
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

              {isFormOpen && fields && (
                <div style={styles.formSection}>
                  {fields.map((f) => (
                    <label key={f.key} style={styles.field}>
                      <span style={styles.fieldLabel}>{f.label}</span>
                      <input
                        type={f.type ?? 'text'}
                        style={styles.input}
                        value={formValues[f.key] ?? ''}
                        onChange={(e) =>
                          setFormValues((prev) => ({
                            ...prev,
                            [f.key]: e.target.value,
                          }))
                        }
                        placeholder={f.label}
                      />
                    </label>
                  ))}
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
                ) : isFormOpen ? (
                  <>
                    <button
                      style={styles.connectBtn}
                      disabled={connecting === svc.platform}
                      onClick={() => handleConnect(svc.platform)}
                    >
                      {connecting === svc.platform
                        ? 'Connecting...'
                        : 'Save Connection'}
                    </button>
                    <button
                      style={styles.cancelBtn}
                      onClick={() => {
                        setShowForm(null);
                        setFormValues({});
                      }}
                    >
                      Cancel
                    </button>
                  </>
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
