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

const sectionStyle: CSSProperties = {
  background: '#1e1e2e',
  borderRadius: 12,
  padding: '20px 24px',
};

const sectionTitleStyle: CSSProperties = {
  color: '#fff',
  fontWeight: 700,
  fontSize: 15,
  marginBottom: 16,
};

export function AnalyticsPage() {
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
        const [sum, trends] = await Promise.all([
          getAnalyticsSummary(),
          getAnalyticsTrends(),
        ]);
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
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#888' }}>
        Loading analytics...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '20px 24px', color: '#ef4444' }}>
        Failed to load analytics: {error}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, margin: 0, marginBottom: 6 }}>Analytics</h1>
        <p style={{ color: '#888', fontSize: 14, margin: 0 }}>Event performance insights across all platforms</p>
      </div>

      {summary && <SummaryCards summary={summary} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Attendance Over Time</div>
          <AttendanceChart data={attendanceData} />
        </div>
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Revenue Over Time</div>
          <RevenueChart data={revenueData} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Fill Rate by Platform</div>
          <EventTypeChart data={fillData} />
        </div>
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Best Times to Host Events</div>
          <TimingHeatmap data={timingData} />
        </div>
      </div>

      <InsightsPanel />
    </div>
  );
}
