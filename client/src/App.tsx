import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { EventsPage } from './pages/EventsPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { ServicesPage } from './pages/ServicesPage';
import { EventGeneratorPage } from './pages/EventGeneratorPage';

// Detect Electron environment
const isElectron = !!(window as any).electronAPI?.isElectron;

const navItems = [
  { to: '/', label: 'Events', icon: '📅' },
  { to: '/generator', label: 'Event Generator', icon: '💡' },
  { to: '/services', label: 'Services', icon: '🔗' },
];

const SIDEBAR_EXPANDED = 240;
const SIDEBAR_COLLAPSED = 64;

export function App() {
  const [claudeOpen, setClaudeOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (isElectron) {
      (window as any).electronAPI.isClaudePanelOpen().then((open: boolean) => {
        setClaudeOpen(open);
      });
    }
  }, []);

  const handleToggleClaude = async () => {
    if (isElectron) {
      const newState = await (window as any).electronAPI.toggleClaudePanel();
      setClaudeOpen(newState);
    }
  };

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <BrowserRouter>
      <div style={styles.layout}>
        <nav style={{ ...styles.sidebar, width: sidebarWidth }}>
          {/* Logo */}
          <div style={{ ...styles.logo, justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? '0 0 28px' : '0 24px 28px' }}>
            <span style={styles.logoIcon}>S</span>
            {!collapsed && <span style={styles.logoText}>SocialiseHub</span>}
          </div>

          {/* Nav Links */}
          <div style={{ ...styles.navLinks, padding: collapsed ? '12px 8px' : '12px 12px' }}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                title={collapsed ? item.label : undefined}
                style={({ isActive }) => ({
                  ...styles.navLink,
                  ...(isActive ? styles.navLinkActive : {}),
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  padding: collapsed ? '12px 0' : '12px 14px',
                })}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {!collapsed && item.label}
              </NavLink>
            ))}
          </div>

          {/* Footer */}
          <div style={{ ...styles.sidebarFooter, padding: collapsed ? '16px 8px' : '16px 24px' }}>
            {/* Claude toggle — Electron only */}
            {isElectron && (
              <button
                style={{
                  ...styles.claudeToggle,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  padding: collapsed ? '10px 0' : '10px 14px',
                }}
                onClick={handleToggleClaude}
                title={claudeOpen ? 'Hide Claude panel' : 'Show Claude panel'}
              >
                <span style={{ fontSize: 15 }}>🤖</span>
                {!collapsed && <span>{claudeOpen ? 'Hide Claude' : 'Show Claude'}</span>}
              </button>
            )}

            {/* Sidebar collapse toggle */}
            <button
              style={styles.collapseBtn}
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? '»' : '«'}
            </button>

            {!collapsed && <span style={styles.version}>v0.1.0</span>}
          </div>
        </nav>
        <main style={styles.main}>
          <Routes>
            <Route path="/" element={<EventsPage />} />
            <Route path="/events/new" element={<EventDetailPage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route path="/generator" element={<EventGeneratorPage />} />
            <Route path="/services" element={<ServicesPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: 'flex',
    minHeight: '100vh',
    background: '#FAFAF6',
    color: '#1a1a2e',
    margin: 0,
  },
  sidebar: {
    background: '#080810',
    color: '#e0e0e0',
    display: 'flex',
    flexDirection: 'column',
    padding: '28px 0',
    flexShrink: 0,
    transition: 'width 0.2s ease',
    overflow: 'hidden',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: 12,
  },
  logoIcon: {
    width: 36,
    height: 36,
    background: '#E2725B',
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    lineHeight: '36px',
    fontFamily: "'Outfit', sans-serif",
    flexShrink: 0,
  },
  logoText: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 700,
    fontSize: 16,
    letterSpacing: '-0.3px',
    color: '#fff',
    whiteSpace: 'nowrap',
  },
  navLinks: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: 1,
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    color: '#888',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  navLinkActive: {
    background: 'rgba(226,114,91,0.15)',
    color: '#E2725B',
  },
  sidebarFooter: {
    borderTop: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  claudeToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(226,114,91,0.1)',
    color: '#E2725B',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    width: '100%',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  collapseBtn: {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    color: '#666',
    fontSize: 14,
    cursor: 'pointer',
    padding: '6px 0',
    width: '100%',
    textAlign: 'center',
    transition: 'all 0.2s',
    fontWeight: 700,
  },
  version: {
    fontSize: 11,
    color: '#555',
    textAlign: 'center',
  },
  main: {
    flex: 1,
    padding: '36px 44px',
    overflowY: 'auto' as const,
  },
};
