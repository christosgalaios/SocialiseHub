import { useState, useEffect, useCallback } from 'react';
import type { SocialiseEvent, DashboardSummary } from '@shared/types';
import { getEvents, getDashboardSummary, syncPull } from '../api/events';
import { DashboardSummaryCards } from '../components/DashboardSummary';
import { EventTimeline } from '../components/EventTimeline';
import { useToast } from '../context/ToastContext';
import { ListSkeleton } from '../components/Skeleton';

const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export function DashboardPage() {
  const [events, setEvents] = useState<SocialiseEvent[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [evts, summ] = await Promise.all([
        getEvents(),
        getDashboardSummary().catch(() => null),
      ]);
      setEvents(evts);
      setSummary(summ);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load dashboard', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncPull();
      localStorage.setItem('lastSyncAt', new Date().toISOString());
      showToast(`Synced ${result.pulled} event${result.pulled !== 1 ? 's' : ''}`, 'success');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  }, [showToast, load]);

  useEffect(() => { load(); }, [load]);

  // Auto-sync on mount if >30min since last sync
  useEffect(() => {
    const lastSyncStr = localStorage.getItem('lastSyncAt');
    const lastSync = lastSyncStr ? new Date(lastSyncStr).getTime() : 0;
    if (Date.now() - lastSync > SYNC_INTERVAL_MS) {
      handleSync();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Dashboard</h1>
          <p style={styles.subtitle}>Overview of your events and platforms</p>
        </div>
        <div style={styles.headerActions}>
          {syncing && <span style={styles.syncMsg}>Syncing...</span>}
          <button
            style={{ ...styles.syncBtn, opacity: syncing ? 0.7 : 1 }}
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? 'Syncing...' : '\u21bb Sync Now'}
          </button>
        </div>
      </div>

      {loading ? (
        <ListSkeleton rows={6} />
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
                  draftEvents: 0,
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
