import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { EventsPage } from './pages/EventsPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { ServicesPage } from './pages/ServicesPage';
import { EventGeneratorPage } from './pages/EventGeneratorPage';
import { AppTesterPage } from './pages/AppTesterPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { CalendarPage } from './pages/CalendarPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SyncLogPage } from './pages/SyncLogPage';
import { TerminalPanel } from './components/TerminalPanel';
import { ToastProvider } from './context/ToastContext';
import { ToastContainer } from './components/Toast';
import { SyncStatus } from './components/SyncStatus';
import { SettingsPage } from './pages/SettingsPage';
import { ConflictResolutionPage } from './pages/ConflictResolutionPage';
import { ErrorBoundary } from './components/ErrorBoundary';

// Typed Electron API exposed via preload
interface ElectronAPI {
  isElectron: boolean;
  toggleClaudePanel: () => Promise<boolean>;
  focusClaudePanel: () => Promise<void>;
  isClaudePanelOpen: () => Promise<boolean>;
  getClaudePanelWidth: () => Promise<number>;
  resizeClaudePanel: (width: number) => Promise<number>;
  getExtensionStatus: () => Promise<{ loaded: boolean; error?: string; diagnosis?: string; fix?: string }>;
}

// Detect Electron environment
const electronAPI = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
const isElectron = !!electronAPI?.isElectron;

const primaryNav = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/events', label: 'Events', icon: '📅' },
  { to: '/calendar', label: 'Calendar', icon: '🗓' },
  { to: '/analytics', label: 'Analytics', icon: '📈' },
  { to: '/templates', label: 'Templates', icon: '📄' },
  { to: '/generator', label: 'Generator', icon: '💡' },
];

const secondaryNav = [
  { to: '/services', label: 'Services', icon: '🔗' },
  { to: '/sync-log', label: 'Sync Log', icon: '📋' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

const SIDEBAR_EXPANDED = 240;
const SIDEBAR_COLLAPSED = 64;

export function App() {
  const [claudeOpen, setClaudeOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const panelWidthRef = useRef(420);
  const didDrag = useRef(false);

  useEffect(() => {
    if (isElectron && electronAPI) {
      electronAPI.isClaudePanelOpen().then((open) => {
        setClaudeOpen(open);
      });
      electronAPI.getClaudePanelWidth().then((w) => {
        panelWidthRef.current = w;
      });
    }
  }, []);

  const handleToggleClaude = async () => {
    if (isElectron && electronAPI) {
      const newState = await electronAPI.toggleClaudePanel();
      setClaudeOpen(newState);
    }
  };

  // ── Drag-to-resize the Claude panel ──
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!claudeOpen) return;
    e.preventDefault();
    setDragging(true);
    didDrag.current = false;
    dragStartX.current = e.clientX;
    dragStartWidth.current = panelWidthRef.current;
  }, [claudeOpen]);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Only count as drag if moved more than 4px (prevents accidental drag on click)
      const delta = dragStartX.current - e.clientX;
      if (Math.abs(delta) > 4) {
        didDrag.current = true;
      }
      if (didDrag.current) {
        const newWidth = dragStartWidth.current + delta;
        panelWidthRef.current = newWidth;
        electronAPI?.resizeClaudePanel(newWidth);
      }
    };

    const handleMouseUp = () => {
      setDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <ToastProvider>
    <BrowserRouter>
      <div style={styles.layout}>
        <ToastContainer />
        {/* Transparent overlay during drag to prevent iframe stealing mouse events */}
        {dragging && <div style={styles.dragOverlay} />}

        {/* ── Sidebar ── */}
        <nav style={{ ...styles.sidebar, width: sidebarWidth }}>
          <div style={{ ...styles.logo, justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? '0 0 28px' : '0 24px 28px' }}>
            <span style={styles.logoIcon}>S</span>
            {!collapsed && <span style={styles.logoText}>SocialiseHub</span>}
          </div>

          <div style={{ ...styles.navLinks, padding: collapsed ? '12px 8px' : '12px 12px' }}>
            {primaryNav.map((item) => (
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

            <div style={styles.navDivider} />

            {secondaryNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
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

          <div style={{ ...styles.sidebarFooter, padding: collapsed ? '16px 8px' : '16px 24px' }}>
            {/* Sync status */}
            <SyncStatus collapsed={collapsed} />

            {/* Terminal toggle */}
            {isElectron && (
              <button
                style={{
                  ...styles.toggleBtn,
                  ...styles.terminalToggle,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  padding: collapsed ? '10px 0' : '10px 14px',
                }}
                onClick={() => setTerminalOpen((o) => !o)}
                title={terminalOpen ? 'Hide console' : 'Show console'}
              >
                <span style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 800 }}>{'>_'}</span>
                {!collapsed && <span>{terminalOpen ? 'Hide Console' : 'Console'}</span>}
              </button>
            )}

            {/* Claude toggle */}
            {isElectron && (
              <button
                style={{
                  ...styles.toggleBtn,
                  ...styles.claudeToggle,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  padding: collapsed ? '10px 0' : '10px 14px',
                }}
                onClick={handleToggleClaude}
                title={claudeOpen ? 'Hide Claude panel' : 'Show Claude panel'}
              >
                <span style={{ fontSize: 15 }}>🤖</span>
                {!collapsed && <span>{claudeOpen ? 'Hide Claude' : 'Claude'}</span>}
              </button>
            )}

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

        {/* ── Main content area (vertical stack: content + terminal) ── */}
        <div style={styles.contentColumn}>
          <main style={styles.main}>
            <ErrorBoundary>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/events/new" element={<EventDetailPage />} />
              <Route path="/events/:id" element={<EventDetailPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/generator" element={<EventGeneratorPage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/sync-log" element={<SyncLogPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/conflicts/:id" element={<ConflictResolutionPage />} />
              <Route path="/tester" element={<AppTesterPage />} />
            </Routes>
            </ErrorBoundary>
          </main>

          {/* Terminal panel */}
          {terminalOpen && isElectron && <TerminalPanel />}
        </div>

        {/* ── Claude panel resize handle + fold/unfold ── */}
        {isElectron && (
          <div
            style={{
              ...styles.panelHandle,
              cursor: claudeOpen ? (dragging ? 'col-resize' : 'col-resize') : 'pointer',
            }}
            onMouseDown={handleDragStart}
            onClick={() => {
              // Only toggle if it was a pure click, not a drag gesture
              if (!didDrag.current) handleToggleClaude();
            }}
            title={claudeOpen ? 'Drag to resize · Double-click to fold' : 'Click to unfold Claude panel'}
          >
            <span style={styles.handleArrow}>{claudeOpen ? '⋮' : '‹'}</span>
          </div>
        )}
      </div>
    </BrowserRouter>
    </ToastProvider>
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
    padding: '20px 0',
    flexShrink: 0,
    transition: 'width 0.2s ease',
    overflow: 'hidden',
    height: '100vh',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: 8,
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
    gap: 2,
    flex: 1,
    overflow: 'hidden',
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
  navDivider: {
    height: 1,
    background: 'rgba(255,255,255,0.06)',
    margin: '8px 0',
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
    gap: 6,
  },
  toggleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.1)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    width: '100%',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  claudeToggle: {
    background: 'rgba(226,114,91,0.1)',
    color: '#E2725B',
  },
  terminalToggle: {
    background: 'rgba(45,95,93,0.15)',
    color: '#5dafaf',
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

  // Main content area (vertical flex for content + terminal)
  contentColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    minHeight: 0,
    padding: '36px 44px',
    overflowY: 'auto' as const,
  },

  // Transparent overlay during drag to prevent iframe from stealing mouse events
  dragOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    cursor: 'col-resize',
  },

  // Resizable panel handle (between app view and Claude panel)
  panelHandle: {
    width: 6,
    background: '#0d0d1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderLeft: '1px solid rgba(255,255,255,0.06)',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    userSelect: 'none',
    transition: 'background 0.15s',
  },
  handleArrow: {
    color: '#555',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
  },
};
