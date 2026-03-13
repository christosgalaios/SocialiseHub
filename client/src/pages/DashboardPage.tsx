import { useState, useEffect, useCallback } from 'react';
import type { SocialiseEvent, DashboardSummary } from '@shared/types';
import { getEvents, getDashboardSummary, syncPull } from '../api/events';
import { DashboardSummaryCards } from '../components/DashboardSummary';
import { EventTimeline } from '../components/EventTimeline';

export function DashboardPage() {
  const [events, setEvents] = useState<SocialiseEvent[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [evts, summ] = await Promise.all([
        getEvents(),
        getDashboardSummary().catch(() => null),
      ]);
      setEvents(evts);
      setSummary(summ);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const result = await syncPull();
      setSyncMsg(`Synced ${result.pulled} event${result.pulled !== 1 ? 's' : ''}`);
      await load();
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Dashboard</h1>
          <p style={styles.subtitle}>Overview of your events and platforms</p>
        </div>
        <div style={styles.headerActions}>
          {syncMsg && (
            <span style={styles.syncMsg}>{syncMsg}</span>
          )}
          <button
            style={{ ...styles.syncBtn, opacity: syncing ? 0.7 : 1 }}
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? 'Syncing...' : '↻ Sync Now'}
          </button>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : (
        <>
          {summary ? (
            <DashboardSummaryCards summary={summary} />
          ) : (
            <div style={styles.fallbackSummary}>
              <DashboardSummaryCards
                summary={{
                  totalEvents: events.length,
                  eventsThisWeek: 0,
                  eventsThisMonth: 0,
                  byPlatform: { meetup: 0, eventbrite: 0, headfirst: 0 },
                  upcomingEvents: 0,
                  pastEvents: 0,
                  monthlyTrend: [],
                }}
              />
            </div>
          )}

          {events.length === 0 ? (
            <div style={styles.empty}>
              <p style={styles.emptyTitle}>No events yet</p>
              <p style={styles.emptyDesc}>
                Connect your platforms in Services to get started.
              </p>
            </div>
          ) : (
            <div>
              <h2 style={styles.sectionTitle}>All Events</h2>
              <EventTimeline events={events} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 32,
    flexWrap: 'wrap' as const,
    gap: 16,
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 28,
    fontWeight: 700,
    color: '#080810',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#7a7a7a',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  syncMsg: {
    fontSize: 13,
    color: '#2D5F5D',
    fontWeight: 600,
  },
  syncBtn: {
    padding: '10px 20px',
    borderRadius: 12,
    border: 'none',
    background: '#E2725B',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'opacity 0.2s',
  },
  error: {
    padding: '12px 16px',
    borderRadius: 12,
    background: '#fce8e6',
    color: '#E2725B',
    fontSize: 14,
    marginBottom: 20,
    fontWeight: 500,
  },
  loading: {
    color: '#7a7a7a',
    fontSize: 14,
    padding: '40px 0',
  },
  fallbackSummary: {},
  sectionTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 18,
    fontWeight: 600,
    color: '#080810',
    marginBottom: 16,
  },
  empty: {
    textAlign: 'center' as const,
    padding: '80px 0',
  },
  emptyTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 20,
    fontWeight: 600,
    color: '#080810',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: '#7a7a7a',
  },
};
