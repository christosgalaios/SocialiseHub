import { useState, useEffect, useCallback } from 'react';
import { syncPull } from '../api/events';
import { getAttentionItems, getUpcomingEvents, getPerformance } from '../api/dashboard';
import type { AttentionItem, UpcomingEvent, PerformanceStats } from '../api/dashboard';
import { AttentionSection } from '../components/dashboard/AttentionSection';
import { UpcomingSection } from '../components/dashboard/UpcomingSection';
import { PerformanceSection } from '../components/dashboard/PerformanceSection';
import { SuggestionsSection } from '../components/dashboard/SuggestionsSection';
import { WeekSection } from '../components/dashboard/WeekSection';
import { ConflictsSection } from '../components/dashboard/ConflictsSection';
import { useToast } from '../context/ToastContext';
import { ListSkeleton } from '../components/Skeleton';

const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

interface DashboardData {
  attentionItems: AttentionItem[];
  attentionTotalCount: number;
  upcomingEvents: UpcomingEvent[];
  performance: PerformanceStats;
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [attentionRes, upcomingRes, perfRes] = await Promise.all([
        getAttentionItems().catch(() => ({ items: [], count: 0 })),
        getUpcomingEvents().catch(() => ({ events: [] })),
        getPerformance().catch(() => ({
          data: {
            upcomingCount: 0,
            attendeesLast30: 0,
            attendeesTrend: 'flat' as const,
            revenueLast30: 0,
            revenueTrend: 'flat' as const,
            avgFillRate: null,
          },
        })),
      ]);
      setData({
        attentionItems: attentionRes.items,
        attentionTotalCount: attentionRes.count,
        upcomingEvents: upcomingRes.events,
        performance: perfRes.data,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

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
      {/* Header */}
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

      {/* Loading */}
      {loading && <ListSkeleton rows={8} />}

      {/* Error */}
      {!loading && error && (
        <div style={styles.errorBanner}>
          {error}
          <button style={styles.retryBtn} onClick={load}>Retry</button>
        </div>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <div style={styles.sections}>
          <ConflictsSection />
          <WeekSection />
          <AttentionSection items={data.attentionItems} totalCount={data.attentionTotalCount} />
          <UpcomingSection events={data.upcomingEvents} />
          <PerformanceSection stats={data.performance} />
          <SuggestionsSection />
        </div>
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
  errorBanner: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 12,
    padding: '14px 20px',
    color: '#dc2626',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  retryBtn: {
    padding: '6px 16px',
    borderRadius: 8,
    border: '1px solid #fecaca',
    background: '#fff',
    color: '#dc2626',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: 32,
  },
};
