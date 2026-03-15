import { useState } from 'react';
import type { PlatformName } from '@shared/types';
import { loadSettings, saveSettings } from '../lib/settings';
import { useToast } from '../context/ToastContext';
import { clearAllData, clearCategory } from '../api/data';

const PLATFORMS: { key: PlatformName; label: string }[] = [
  { key: 'meetup', label: 'Meetup' },
  { key: 'eventbrite', label: 'Eventbrite' },
  { key: 'headfirst', label: 'Headfirst Bristol' },
];

const DURATIONS = [30, 60, 90, 120, 180];

const DATA_CATEGORIES = [
  { key: 'events', label: 'Events', description: 'All events, photos, notes, tags, checklists, scores, and sync history' },
  { key: 'platforms', label: 'Platform Connections', description: 'Disconnect all platforms and clear sync snapshots' },
  { key: 'templates', label: 'Templates', description: 'All saved event templates' },
  { key: 'ideas', label: 'Ideas', description: 'All generated event ideas' },
  { key: 'market', label: 'Market Research', description: 'Cached market analysis data' },
  { key: 'dashboard', label: 'Dashboard Cache', description: 'Dashboard suggestions and cached analytics' },
];

export function SettingsPage() {
  const [settings, setSettings] = useState(loadSettings);
  const { showToast } = useToast();

  const togglePlatform = (p: PlatformName) => {
    setSettings((s) => ({
      ...s,
      defaultPlatforms: s.defaultPlatforms.includes(p)
        ? s.defaultPlatforms.filter((x) => x !== p)
        : [...s.defaultPlatforms, p],
    }));
  };

  const handleSave = () => {
    saveSettings(settings);
    showToast('Settings saved', 'success');
  };

  const [clearing, setClearing] = useState<string | null>(null);

  const handleClear = async (category: string | 'all') => {
    const label = category === 'all'
      ? 'ALL local data including events, platform connections, templates, and history'
      : DATA_CATEGORIES.find(c => c.key === category)?.label?.toLowerCase() ?? category;

    const confirmed = window.confirm(
      `This will permanently delete ${label}. This cannot be undone. Are you sure?`
    );
    if (!confirmed) return;

    setClearing(category);
    try {
      const result = category === 'all'
        ? await clearAllData()
        : await clearCategory(category);
      showToast(result.message, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to clear data', 'error');
    } finally {
      setClearing(null);
    }
  };

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Settings</h1>
        <p style={styles.subtitle}>Configure defaults for new events</p>
      </div>

      <div style={styles.form}>
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Organization</h3>
          <label style={styles.field}>
            <span style={styles.label}>Organization Name</span>
            <input
              style={styles.input}
              value={settings.organizationName}
              onChange={(e) => setSettings((s) => ({ ...s, organizationName: e.target.value }))}
              placeholder="e.g. Socialise Events"
            />
          </label>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Default Platforms</h3>
          <p style={styles.hint}>Pre-selected when creating new events</p>
          <div style={styles.checkboxGroup}>
            {PLATFORMS.map((p) => (
              <label key={p.key} style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={settings.defaultPlatforms.includes(p.key)}
                  onChange={() => togglePlatform(p.key)}
                />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Event Defaults</h3>
          <div style={styles.grid}>
            <label style={styles.field}>
              <span style={styles.label}>Duration (minutes)</span>
              <select
                style={styles.input}
                value={settings.defaultDuration}
                onChange={(e) => setSettings((s) => ({ ...s, defaultDuration: Number(e.target.value) }))}
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
            </label>

            <label style={styles.field}>
              <span style={styles.label}>Default Price (£)</span>
              <input
                style={styles.input}
                type="number"
                min="0"
                step="0.01"
                value={settings.defaultPrice}
                onChange={(e) => setSettings((s) => ({ ...s, defaultPrice: Number(e.target.value) }))}
              />
            </label>

            <label style={styles.field}>
              <span style={styles.label}>Default Venue</span>
              <input
                style={styles.input}
                value={settings.defaultVenue}
                onChange={(e) => setSettings((s) => ({ ...s, defaultVenue: e.target.value }))}
                placeholder="e.g. The Lanes, Bristol"
              />
            </label>
          </div>
        </div>

        <button style={styles.saveBtn} onClick={handleSave}>
          Save Settings
        </button>

        <div style={{ ...styles.section, paddingTop: 32, borderTop: '1px solid #eee' }}>
          <h3 style={styles.sectionTitle}>Data Management</h3>
          <p style={styles.hint}>Clear local data to start fresh. These actions cannot be undone.</p>

          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            {DATA_CATEGORIES.map((cat) => (
              <div key={cat.key} style={dataStyles.card}>
                <div>
                  <div style={dataStyles.cardLabel}>{cat.label}</div>
                  <div style={dataStyles.cardDesc}>{cat.description}</div>
                </div>
                <button
                  style={dataStyles.clearBtn}
                  disabled={clearing !== null}
                  onClick={() => handleClear(cat.key)}
                >
                  {clearing === cat.key ? 'Clearing...' : 'Clear'}
                </button>
              </div>
            ))}
          </div>

          <button
            style={dataStyles.clearAllBtn}
            disabled={clearing !== null}
            onClick={() => handleClear('all')}
          >
            {clearing === 'all' ? 'Clearing...' : 'Clear All Data'}
          </button>
        </div>
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
    marginBottom: 4,
  },
  subtitle: { fontSize: 14, color: '#7a7a7a' },
  form: {
    maxWidth: 560,
    display: 'flex',
    flexDirection: 'column',
    gap: 32,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 16,
    fontWeight: 700,
    color: '#080810',
    margin: 0,
  },
  hint: {
    fontSize: 13,
    color: '#7a7a7a',
    margin: 0,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#555',
    fontFamily: "'Outfit', sans-serif",
  },
  input: {
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid #ddd',
    fontSize: 14,
    outline: 'none',
    background: '#fff',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  checkboxGroup: {
    display: 'flex',
    gap: 20,
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    fontWeight: 600,
    color: '#333',
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '12px 28px',
    borderRadius: 12,
    border: 'none',
    background: '#E2725B',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    alignSelf: 'flex-start',
  },
};

const dataStyles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderRadius: 12,
    border: '1px solid #eee',
    background: '#fafafa',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#333',
    fontFamily: "'Outfit', sans-serif",
  },
  cardDesc: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  clearBtn: {
    padding: '6px 16px',
    borderRadius: 8,
    border: '1px solid #ddd',
    background: '#fff',
    fontSize: 13,
    fontWeight: 600,
    color: '#555',
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    whiteSpace: 'nowrap',
  },
  clearAllBtn: {
    padding: '12px 28px',
    borderRadius: 12,
    border: 'none',
    background: '#dc3545',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    alignSelf: 'flex-start',
    marginTop: 8,
  },
};
