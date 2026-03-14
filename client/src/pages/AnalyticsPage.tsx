import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { SummaryCards } from '../components/analytics/SummaryCards';
import type { AnalyticsSummary } from '../components/analytics/SummaryCards';
import { AttendanceChart } from '../components/analytics/AttendanceChart';
import type { AttendanceDataPoint } from '../components/analytics/AttendanceChart';
import { RevenueChart } from '../components/analytics/RevenueChart';
import type { RevenueDataPoint } from '../components/analytics/RevenueChart';
import { EventTypeChart } from '../components/analytics/EventTypeChart';
import type { FillByTypeData } from '../components/analytics/EventTypeChart';
import { TimingHeatmap } from '../components/analytics/TimingHeatmap';
import type { TimingDataPoint } from '../components/analytics/TimingHeatmap';
import { InsightsPanel } from '../components/analytics/InsightsPanel';
import { getAnalyticsSummary, getAnalyticsTrends } from '../api/events';

export function AnalyticsPage() {
  const [tab, setTab] = useState<'insights' | 'data'>('insights');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [attendanceData, setAttendanceData] = useState<AttendanceDataPoint[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([]);
  const [fillData, setFillData] = useState<FillByTypeData[]>([]);
  const [timingData, setTimingData] = useState<TimingDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [sum, trends] = await Promise.all([getAnalyticsSummary(), getAnalyticsTrends()]);
        if (cancelled) return;
        setSummary(sum);
        setAttendanceData(trends.attendanceByMonth);
        setRevenueData(trends.revenueByMonth);
        setFillData(trends.fillByType);
        setTimingData(trends.timingData);
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div style={styles.loading}>Loading analytics...</div>;
  }

  if (error) {
    return <div style={styles.error}>Failed to load analytics: {error}</div>;
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div>
        <h1 style={styles.title}>Analytics</h1>
        <p style={styles.subtitle}>Event performance insights across all platforms</p>
      </div>

      {/* Summary cards — always visible */}
      {summary && <SummaryCards summary={summary} />}

      {/* Tab bar */}
      <div style={styles.tabBar}>
        <button
          style={tab === 'insights' ? styles.tabActive : styles.tab}
          onClick={() => setTab('insights')}
        >
          Insights & Actions
        </button>
        <button
          style={tab === 'data' ? styles.tabActive : styles.tab}
          onClick={() => setTab('data')}
        >
          Data Explorer
        </button>
      </div>

      {/* Tab content */}
      {tab === 'insights' ? (
        <div style={styles.tabContent}>
          <InsightsPanel />

          {/* Key findings summary cards */}
          <div style={styles.findingsGrid}>
            {timingData.length > 0 && (
              <FindingCard
                title="Best Day & Time"
                value={getBestTiming(timingData)}
                hint="Based on historical attendance"
                color="#3b82f6"
              />
            )}
            {fillData.length > 0 && (
              <FindingCard
                title="Top Platform"
                value={getTopPlatform(fillData)}
                hint="Highest average fill rate"
                color="#22c55e"
              />
            )}
            {summary && (
              <FindingCard
                title="Events Tracked"
                value={String(summary.total_events)}
                hint={`${summary.avg_fill_rate}% avg fill rate`}
                color="#f59e0b"
              />
            )}
            {attendanceData.length > 0 && (
              <FindingCard
                title="Best Month"
                value={getBestMonth(attendanceData)}
                hint="Highest attendance"
                color="#8b5cf6"
              />
            )}
          </div>
        </div>
      ) : (
        <div style={styles.tabContent}>
          <div style={styles.chartGrid}>
            <div style={styles.chartCard}>
              <div style={styles.chartTitle}>Attendance Over Time</div>
              <AttendanceChart data={attendanceData} />
            </div>
            <div style={styles.chartCard}>
              <div style={styles.chartTitle}>Revenue Over Time</div>
              <RevenueChart data={revenueData} />
            </div>
          </div>

          <div style={styles.chartGrid}>
            <div style={styles.chartCard}>
              <div style={styles.chartTitle}>Fill Rate by Platform</div>
              <EventTypeChart data={fillData} />
            </div>
            <div style={styles.chartCard}>
              <div style={styles.chartTitle}>Best Times to Host Events</div>
              <TimingHeatmap data={timingData} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper components and functions

function FindingCard({ title, value, hint, color }: { title: string; value: string; hint: string; color: string }) {
  return (
    <div style={{ ...styles.findingCard, borderLeft: `4px solid ${color}` }}>
      <div style={styles.findingLabel}>{title}</div>
      <div style={styles.findingValue}>{value}</div>
      <div style={styles.findingHint}>{hint}</div>
    </div>
  );
}

function getBestTiming(data: TimingDataPoint[]): string {
  if (data.length === 0) return 'No data';
  const best = data.reduce((a, b) => (a.avg_attendance ?? 0) > (b.avg_attendance ?? 0) ? a : b);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[best.day_of_week]}s at ${best.hour}:00`;
}

function getTopPlatform(data: FillByTypeData[]): string {
  if (data.length === 0) return 'No data';
  const best = data.reduce((a, b) => (a.avg_fill ?? 0) > (b.avg_fill ?? 0) ? a : b);
  return `${best.platform} (${best.avg_fill}%)`;
}

function getBestMonth(data: AttendanceDataPoint[]): string {
  if (data.length === 0) return 'No data';
  const best = data.reduce((a, b) => (a.attendees ?? 0) > (b.attendees ?? 0) ? a : b);
  return best.month || 'No data';
}

// Styles

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 24 },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#888' },
  error: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '20px 24px', color: '#ef4444' },
  title: { fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 700, color: '#080810', margin: 0, marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#7a7a7a', margin: 0 },

  // Tabs
  tabBar: {
    display: 'flex', gap: 4, background: '#f0f0f0', borderRadius: 12, padding: 4, width: 'fit-content',
  },
  tab: {
    padding: '8px 20px', borderRadius: 10, border: 'none', background: 'transparent',
    color: '#7a7a7a', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
  },
  tabActive: {
    padding: '8px 20px', borderRadius: 10, border: 'none', background: '#fff',
    color: '#080810', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },

  tabContent: { display: 'flex', flexDirection: 'column', gap: 20 },

  // Findings
  findingsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 },
  findingCard: {
    background: '#fff', border: '1px solid #e8e6e1', borderRadius: 12, padding: '16px 20px',
  },
  findingLabel: { fontSize: 11, fontWeight: 600, color: '#7a7a7a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 },
  findingValue: { fontSize: 20, fontWeight: 700, color: '#080810', marginBottom: 4, fontFamily: "'Outfit', sans-serif" },
  findingHint: { fontSize: 12, color: '#999' },

  // Charts
  chartGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  chartCard: {
    background: '#1e1e2e', borderRadius: 12, padding: '20px 24px',
  },
  chartTitle: { color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 16 },
};
