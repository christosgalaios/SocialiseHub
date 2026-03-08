import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { EventsPage } from './pages/EventsPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { ServicesPage } from './pages/ServicesPage';
import { EventGeneratorPage } from './pages/EventGeneratorPage';

const navItems = [
  { to: '/', label: 'Events', icon: '📅' },
  { to: '/generator', label: 'Event Generator', icon: '💡' },
  { to: '/services', label: 'Services', icon: '🔗' },
];

export function App() {
  return (
    <BrowserRouter>
      <div style={styles.layout}>
        <nav style={styles.sidebar}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>S</span>
            <span style={styles.logoText}>SocialiseHub</span>
          </div>
          <div style={styles.navLinks}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                style={({ isActive }) => ({
                  ...styles.navLink,
                  ...(isActive ? styles.navLinkActive : {}),
                })}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
          <div style={styles.sidebarFooter}>
            <span style={styles.version}>v0.1.0</span>
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
    width: 240,
    background: '#080810',
    color: '#e0e0e0',
    display: 'flex',
    flexDirection: 'column',
    padding: '28px 0',
    flexShrink: 0,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 24px 28px',
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
  },
  logoText: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 700,
    fontSize: 16,
    letterSpacing: '-0.3px',
    color: '#fff',
  },
  navLinks: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '12px 12px',
    flex: 1,
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 14px',
    borderRadius: 12,
    color: '#888',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    transition: 'all 0.2s',
  },
  navLinkActive: {
    background: 'rgba(226,114,91,0.15)',
    color: '#E2725B',
  },
  sidebarFooter: {
    padding: '16px 24px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  version: {
    fontSize: 11,
    color: '#555',
  },
  main: {
    flex: 1,
    padding: '36px 44px',
    overflowY: 'auto' as const,
  },
};
