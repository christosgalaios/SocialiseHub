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
import {
  getAnalyticsSummary,
  getAnalyticsTrends,
  getAnalyticsTopEvents,
  getAnalyticsDayOfWeek,
  getAnalyticsDrillDown,
  getAnalyticsOrganizers,
  getAnalyticsCategories,
  getAnalyticsPricingEffectiveness,
} from '../api/events';
import type {
  TopEvent,
  DayOfWeekAnalytics,
  DrillDownEvent,
  OrganizerAnalytics,
  CategoryAnalytics,
  PricingEffectivenessItem,
} from '../api/events';
import { ListSkeleton } from '../components/Skeleton';

type TabId = 'overview' | 'data' | 'performance';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return '—';
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n)}%`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return d;
  }
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ── FindingCard ───────────────────────────────────────────────────────────────

function FindingCard({ title, value, hint, color }: { title: string; value: string; hint: string; color: string }) {
  return (
    <div style={{ ...tableStyles.findingCard, borderLeft: `4px solid ${color}` }}>
      <div style={tableStyles.findingLabel}>{title}</div>
      <div style={tableStyles.findingValue}>{value}</div>
      <div style={tableStyles.findingHint}>{hint}</div>
    </div>
  );
}

// ── TopEventsTable ────────────────────────────────────────────────────────────

function TopEventsTable({ events }: { events: TopEvent[] }) {
  if (!events.length) {
    return <div style={tableStyles.empty}>No event data available</div>;
  }
  return (
    <div style={tableStyles.tableWrap}>
      <table style={tableStyles.table}>
        <thead>
          <tr style={tableStyles.thead}>
            <th style={{ ...tableStyles.th, textAlign: 'left' }}>#</th>
            <th style={{ ...tableStyles.th, textAlign: 'left' }}>Title</th>
            <th style={{ ...tableStyles.th, textAlign: 'left' }}>Date</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Attendance</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Capacity</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Fill Rate</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Price</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Revenue</th>
            <th style={{ ...tableStyles.th, textAlign: 'left' }}>Organizer</th>
            <th style={{ ...tableStyles.th, textAlign: 'left' }}>Platform</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev, i) => (
            <tr key={i} style={i % 2 === 0 ? tableStyles.rowEven : tableStyles.rowOdd}>
              <td style={{ ...tableStyles.td, color: '#7a7a7a', width: 32 }}>{i + 1}</td>
              <td style={{ ...tableStyles.td, maxWidth: 240 }}>
                {ev.external_url ? (
                  <a href={ev.external_url} target="_blank" rel="noreferrer" style={tableStyles.link}>
                    {ev.title}
                  </a>
                ) : (
                  ev.title
                )}
              </td>
              <td style={{ ...tableStyles.td, whiteSpace: 'nowrap' }}>{formatDate(ev.date)}</td>
              <td style={{ ...tableStyles.td, textAlign: 'right', fontWeight: 600 }}>{ev.attendance.toLocaleString()}</td>
              <td style={{ ...tableStyles.td, textAlign: 'right', color: '#7a7a7a' }}>
                {ev.capacity != null ? ev.capacity.toLocaleString() : '—'}
              </td>
              <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                <FillRateBadge rate={ev.fill_rate} />
              </td>
              <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                {ev.ticket_price != null ? formatCurrency(ev.ticket_price) : 'Free'}
              </td>
              <td style={{ ...tableStyles.td, textAlign: 'right', color: '#22c55e' }}>
                {ev.revenue != null && ev.revenue > 0 ? formatCurrency(ev.revenue) : '—'}
              </td>
              <td style={{ ...tableStyles.td, color: '#7a7a7a', maxWidth: 120 }}>{ev.organizer_name ?? '—'}</td>
              <td style={{ ...tableStyles.td }}>
                <PlatformBadge platform={ev.platform} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── DayOfWeekChart (inline SVG horizontal bars) ───────────────────────────────

function DayOfWeekChart({ data }: { data: DayOfWeekAnalytics[] }) {
  if (!data.length) {
    return <div style={tableStyles.empty}>No day-of-week data available</div>;
  }

  // Sort by day_index so Monday first
  const sorted = [...data].sort((a, b) => a.day_index - b.day_index);
  const maxAvg = Math.max(...sorted.map((d) => d.avg_attendance), 1);
  const bestIdx = sorted.reduce((best, d, i) => (d.avg_attendance > sorted[best].avg_attendance ? i : best), 0);
  const worstIdx = sorted.reduce((worst, d, i) => (d.avg_attendance < sorted[worst].avg_attendance ? i : worst), 0);

  const BAR_MAX_WIDTH = 260;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {sorted.map((d, i) => {
        const barWidth = Math.round((d.avg_attendance / maxAvg) * BAR_MAX_WIDTH);
        const color = i === bestIdx ? '#22c55e' : i === worstIdx ? '#dc2626' : '#3b82f6';
        const dayName = DAY_NAMES[d.day_index] ?? `Day ${d.day_index}`;
        return (
          <div key={d.day_index} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
            <div style={{ width: 90, fontSize: 13, color: i === bestIdx ? '#22c55e' : '#ccc', fontWeight: i === bestIdx ? 700 : 400, textAlign: 'right', flexShrink: 0 }}>
              {dayName}
            </div>
            <div style={{ flex: 1, position: 'relative', height: 20 }}>
              <div style={{ width: barWidth, height: 20, background: color, borderRadius: 4, opacity: 0.85 }} />
            </div>
            <div style={{ width: 72, fontSize: 13, color: '#ccc', flexShrink: 0 }}>
              <span style={{ fontWeight: 600, color: i === bestIdx ? '#22c55e' : '#fff' }}>
                {Math.round(d.avg_attendance)}
              </span>
              <span style={{ color: '#666', fontSize: 11 }}> avg</span>
            </div>
            <div style={{ width: 52, fontSize: 11, color: '#666', flexShrink: 0 }}>
              {d.event_count} event{d.event_count !== 1 ? 's' : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── DrillDownPanel ────────────────────────────────────────────────────────────

function DrillDownPanel({
  month,
  events,
  loading,
  onClose,
}: {
  month: string;
  events: DrillDownEvent[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div style={tableStyles.drillDownPanel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>
          Events in {month}
          {!loading && <span style={{ color: '#888', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>({events.length} events)</span>}
        </div>
        <button style={tableStyles.closeBtn} onClick={onClose}>✕ Close</button>
      </div>

      {loading ? (
        <div style={{ color: '#888', padding: '20px 0', textAlign: 'center' }}>Loading...</div>
      ) : events.length === 0 ? (
        <div style={{ color: '#888', padding: '20px 0', textAlign: 'center' }}>No events found for this month</div>
      ) : (
        <div style={tableStyles.tableWrap}>
          <table style={{ ...tableStyles.table, background: 'transparent' }}>
            <thead>
              <tr style={{ ...tableStyles.thead, background: 'rgba(255,255,255,0.05)' }}>
                <th style={{ ...tableStyles.th, color: '#aaa', textAlign: 'left' }}>Title</th>
                <th style={{ ...tableStyles.th, color: '#aaa', textAlign: 'left' }}>Date</th>
                <th style={{ ...tableStyles.th, color: '#aaa', textAlign: 'right' }}>Attendance</th>
                <th style={{ ...tableStyles.th, color: '#aaa', textAlign: 'right' }}>Price</th>
                <th style={{ ...tableStyles.th, color: '#aaa', textAlign: 'right' }}>Revenue</th>
                <th style={{ ...tableStyles.th, color: '#aaa', textAlign: 'left' }}>Venue</th>
                <th style={{ ...tableStyles.th, color: '#aaa', textAlign: 'left' }}>Platform</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => (
                <tr key={i} style={i % 2 === 0
                  ? { background: 'rgba(255,255,255,0.02)' }
                  : { background: 'transparent' }
                }>
                  <td style={{ ...tableStyles.td, color: '#e8e6e1', maxWidth: 220 }}>
                    {ev.external_url ? (
                      <a href={ev.external_url} target="_blank" rel="noreferrer" style={{ ...tableStyles.link, color: '#60a5fa' }}>
                        {ev.title}
                      </a>
                    ) : ev.title}
                  </td>
                  <td style={{ ...tableStyles.td, color: '#aaa', whiteSpace: 'nowrap' }}>{formatDate(ev.date)}</td>
                  <td style={{ ...tableStyles.td, textAlign: 'right', color: '#fff', fontWeight: 600 }}>
                    {ev.attendance != null ? ev.attendance.toLocaleString() : '—'}
                  </td>
                  <td style={{ ...tableStyles.td, textAlign: 'right', color: '#aaa' }}>
                    {ev.ticket_price != null && ev.ticket_price > 0 ? formatCurrency(ev.ticket_price) : 'Free'}
                  </td>
                  <td style={{ ...tableStyles.td, textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>
                    {ev.revenue != null && ev.revenue > 0 ? formatCurrency(ev.revenue) : '—'}
                  </td>
                  <td style={{ ...tableStyles.td, color: '#aaa', maxWidth: 140 }}>{ev.venue ?? '—'}</td>
                  <td style={{ ...tableStyles.td }}>
                    <PlatformBadge platform={ev.platform} dark />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── OrganizerTable ────────────────────────────────────────────────────────────

function OrganizerTable({ data }: { data: OrganizerAnalytics[] }) {
  if (!data.length) return <div style={tableStyles.empty}>No organizer data available</div>;

  const topIdx = data.reduce((best, d, i) => (d.totalAttendance > data[best].totalAttendance ? i : best), 0);

  return (
    <div style={tableStyles.tableWrap}>
      <table style={tableStyles.table}>
        <thead>
          <tr style={tableStyles.thead}>
            <th style={{ ...tableStyles.th, textAlign: 'left' }}>Organizer</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Events</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Total Attendance</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Avg Attendance</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Fill Rate</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} style={i % 2 === 0 ? tableStyles.rowEven : tableStyles.rowOdd}>
              <td style={{ ...tableStyles.td, fontWeight: i === topIdx ? 700 : 400 }}>
                {i === topIdx && <span style={{ color: '#f59e0b', marginRight: 6 }}>★</span>}
                {row.organizerName || '(Unknown)'}
              </td>
              <td style={{ ...tableStyles.td, textAlign: 'right' }}>{row.eventCount}</td>
              <td style={{ ...tableStyles.td, textAlign: 'right', fontWeight: 600 }}>{row.totalAttendance.toLocaleString()}</td>
              <td style={{ ...tableStyles.td, textAlign: 'right' }}>{Math.round(row.avgAttendance)}</td>
              <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                <FillRateBadge rate={row.avgFillRate} />
              </td>
              <td style={{ ...tableStyles.td, textAlign: 'right', color: '#22c55e' }}>
                {row.totalRevenue > 0 ? formatCurrency(row.totalRevenue) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── CategoryTable ─────────────────────────────────────────────────────────────

function CategoryTable({ data }: { data: CategoryAnalytics[] }) {
  if (!data.length) return <div style={tableStyles.empty}>No category data available</div>;

  return (
    <div style={tableStyles.tableWrap}>
      <table style={tableStyles.table}>
        <thead>
          <tr style={tableStyles.thead}>
            <th style={{ ...tableStyles.th, textAlign: 'left' }}>Category</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Events</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Total Attendance</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Fill Rate</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Avg Price</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} style={i % 2 === 0 ? tableStyles.rowEven : tableStyles.rowOdd}>
              <td style={tableStyles.td}>{capitalize(row.category) || '(Uncategorized)'}</td>
              <td style={{ ...tableStyles.td, textAlign: 'right' }}>{row.eventCount}</td>
              <td style={{ ...tableStyles.td, textAlign: 'right', fontWeight: 600 }}>{row.totalAttendance.toLocaleString()}</td>
              <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                <FillRateBadge rate={row.avgFillRate} />
              </td>
              <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                {row.avgPrice > 0 ? formatCurrency(row.avgPrice) : 'Free'}
              </td>
              <td style={{ ...tableStyles.td, textAlign: 'right', color: '#22c55e' }}>
                {row.totalRevenue > 0 ? formatCurrency(row.totalRevenue) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── PricingTable ──────────────────────────────────────────────────────────────

function PricingEffectivenessTable({ data }: { data: PricingEffectivenessItem[] }) {
  if (!data.length) return <div style={tableStyles.empty}>No pricing data available</div>;

  const maxRevenue = Math.max(...data.map((d) => d.totalRevenue), 1);
  const maxAttendance = Math.max(...data.map((d) => d.avgAttendance), 1);

  return (
    <div style={tableStyles.tableWrap}>
      <table style={tableStyles.table}>
        <thead>
          <tr style={tableStyles.thead}>
            <th style={{ ...tableStyles.th, textAlign: 'left' }}>Price Bucket</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Events</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Avg Attendance</th>
            <th style={{ ...tableStyles.th, textAlign: 'left', minWidth: 120 }}>Attendance vs Max</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Fill Rate</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Total Revenue</th>
            <th style={{ ...tableStyles.th, textAlign: 'left', minWidth: 120 }}>Revenue vs Max</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} style={i % 2 === 0 ? tableStyles.rowEven : tableStyles.rowOdd}>
              <td style={{ ...tableStyles.td, fontWeight: 600 }}>{row.priceBucket}</td>
              <td style={{ ...tableStyles.td, textAlign: 'right' }}>{row.eventCount}</td>
              <td style={{ ...tableStyles.td, textAlign: 'right', fontWeight: 600 }}>{Math.round(row.avgAttendance)}</td>
              <td style={tableStyles.td}>
                <MiniBar value={row.avgAttendance} max={maxAttendance} color="#3b82f6" />
              </td>
              <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                <FillRateBadge rate={row.avgFillRate} />
              </td>
              <td style={{ ...tableStyles.td, textAlign: 'right', color: '#22c55e' }}>
                {row.totalRevenue > 0 ? formatCurrency(row.totalRevenue) : '—'}
              </td>
              <td style={tableStyles.td}>
                <MiniBar value={row.totalRevenue} max={maxRevenue} color="#22c55e" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Shared micro-components ────────────────────────────────────────────────────

function FillRateBadge({ rate }: { rate: number | null | undefined }) {
  if (rate == null) return <span style={{ color: '#7a7a7a' }}>—</span>;
  const r = Math.round(rate);
  const color = r >= 80 ? '#22c55e' : r >= 50 ? '#f59e0b' : '#ef4444';
  return <span style={{ color, fontWeight: 600 }}>{r}%</span>;
}

function PlatformBadge({ platform, dark }: { platform: string; dark?: boolean }) {
  const colors: Record<string, string> = {
    meetup: '#e74c3c',
    eventbrite: '#f05537',
    headfirst: '#6366f1',
  };
  const color = colors[platform?.toLowerCase()] ?? '#7a7a7a';
  return (
    <span style={{
      background: dark ? `${color}33` : `${color}18`,
      color,
      border: `1px solid ${color}44`,
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: 'nowrap' as const,
    }}>
      {capitalize(platform)}
    </span>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ height: 8, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden', minWidth: 80 }}>
      <div style={{ height: 8, width: `${pct}%`, background: color, borderRadius: 4 }} />
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 17, fontWeight: 700, color: '#080810', margin: 0 }}>
        {title}
      </h3>
      {subtitle && <div style={{ fontSize: 13, color: '#7a7a7a', marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const [tab, setTab] = useState<TabId>('overview');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [attendanceData, setAttendanceData] = useState<AttendanceDataPoint[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([]);
  const [fillData, setFillData] = useState<FillByTypeData[]>([]);
  const [timingData, setTimingData] = useState<TimingDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Overview tab extras
  const [topEvents, setTopEvents] = useState<TopEvent[]>([]);
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeekAnalytics[]>([]);
  const [overviewExtrasLoading, setOverviewExtrasLoading] = useState(false);
  const [overviewExtrasLoaded, setOverviewExtrasLoaded] = useState(false);

  // Drill-down
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [drillDownEvents, setDrillDownEvents] = useState<DrillDownEvent[]>([]);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  // Performance tab
  const [organizers, setOrganizers] = useState<OrganizerAnalytics[]>([]);
  const [categories, setCategories] = useState<CategoryAnalytics[]>([]);
  const [pricingEffectiveness, setPricingEffectiveness] = useState<PricingEffectivenessItem[]>([]);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceLoaded, setPerformanceLoaded] = useState(false);

  // Load base data on mount
  const loadData = async (signal?: { cancelled: boolean }) => {
    try {
      setLoading(true);
      setError(null);
      const [sum, trends] = await Promise.all([getAnalyticsSummary(), getAnalyticsTrends()]);
      if (signal?.cancelled) return;
      setSummary(sum);
      setAttendanceData(trends.attendanceByMonth);
      setRevenueData(trends.revenueByMonth);
      setFillData(trends.fillByType);
      setTimingData(trends.timingData);
    } catch (err) {
      if (!signal?.cancelled) setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  };

  // Load overview extras (top events + day-of-week) lazily — only once
  const loadOverviewExtras = async (signal: { cancelled: boolean }) => {
    if (overviewExtrasLoaded) return;
    setOverviewExtrasLoading(true);
    try {
      const [top, dow] = await Promise.all([getAnalyticsTopEvents(), getAnalyticsDayOfWeek()]);
      if (signal.cancelled) return;
      setTopEvents(top);
      setDayOfWeek(dow);
      setOverviewExtrasLoaded(true);
    } catch {
      // non-fatal
    } finally {
      if (!signal.cancelled) setOverviewExtrasLoading(false);
    }
  };

  // Load performance data lazily — only once
  const loadPerformance = async (signal: { cancelled: boolean }) => {
    if (performanceLoaded) return;
    setPerformanceLoading(true);
    try {
      const [orgs, cats, pricing] = await Promise.all([
        getAnalyticsOrganizers(),
        getAnalyticsCategories(),
        getAnalyticsPricingEffectiveness(),
      ]);
      if (signal.cancelled) return;
      setOrganizers(orgs);
      setCategories(cats);
      setPricingEffectiveness(pricing);
      setPerformanceLoaded(true);
    } catch {
      // non-fatal
    } finally {
      if (!signal.cancelled) setPerformanceLoading(false);
    }
  };

  useEffect(() => {
    const signal = { cancelled: false };
    loadData(signal);
    return () => { signal.cancelled = true; };
  }, []);

  // Load overview extras whenever overview tab is shown
  useEffect(() => {
    if (tab !== 'overview') return;
    const signal = { cancelled: false };
    loadOverviewExtras(signal);
    return () => { signal.cancelled = true; };
  }, [tab]);

  // Load performance data when performance tab is first shown
  useEffect(() => {
    if (tab !== 'performance') return;
    const signal = { cancelled: false };
    loadPerformance(signal);
    return () => { signal.cancelled = true; };
  }, [tab]);

  // Load drill-down data when a month is selected
  useEffect(() => {
    if (!selectedMonth) return;
    const signal = { cancelled: false };
    setDrillDownLoading(true);
    setDrillDownEvents([]);
    getAnalyticsDrillDown(selectedMonth)
      .then((data) => { if (!signal.cancelled) setDrillDownEvents(data); })
      .catch(() => { if (!signal.cancelled) setDrillDownEvents([]); })
      .finally(() => { if (!signal.cancelled) setDrillDownLoading(false); });
    return () => { signal.cancelled = true; };
  }, [selectedMonth]);

  const handleMonthClick = (month: string) => {
    setSelectedMonth((prev) => (prev === month ? null : month));
  };

  const handleCardClick = (card: string) => {
    const cardToTab: Record<string, TabId> = {
      events: 'overview',
      attendees: 'data',
      revenue: 'data',
      fillRate: 'data',
      pricing: 'performance',
      organizers: 'performance',
    };
    const target = cardToTab[card] ?? 'overview';
    setTab(target);
  };

  if (loading) {
    return <ListSkeleton rows={4} />;
  }

  if (error) {
    return (
      <div style={styles.error}>
        <span>{error}</span>
        <button style={styles.retryBtn} onClick={() => loadData({ cancelled: false })}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div>
        <h1 style={styles.title}>Analytics</h1>
        <p style={styles.subtitle}>Event performance insights across all platforms</p>
      </div>

      {/* Summary cards — always visible, clickable to drill down */}
      {summary && <SummaryCards summary={summary} onCardClick={handleCardClick} />}

      {/* Tab bar */}
      <div style={styles.tabBar}>
        {(['overview', 'data', 'performance'] as TabId[]).map((t) => (
          <button
            key={t}
            style={tab === t ? styles.tabActive : styles.tab}
            onClick={() => setTab(t)}
          >
            {t === 'overview' ? 'Overview' : t === 'data' ? 'Data Explorer' : 'Performance'}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ── */}
      {tab === 'overview' && (
        <div style={styles.tabContent}>
          <InsightsPanel />

          {/* Key findings grid */}
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

          {/* Day of Week chart */}
          <div style={styles.section}>
            <SectionHeader
              title="Best Days to Host Events"
              subtitle="Average attendance by day of week"
            />
            <div style={{ ...styles.chartCard, background: '#1e1e2e' }}>
              <div style={styles.chartTitle}>Day of Week Performance</div>
              {overviewExtrasLoading ? (
                <div style={{ color: '#888', textAlign: 'center', padding: 32 }}>Loading...</div>
              ) : (
                <DayOfWeekChart data={dayOfWeek} />
              )}
            </div>
          </div>

          {/* Top Events table */}
          <div style={styles.section}>
            <SectionHeader
              title="Top Events by Attendance"
              subtitle={`Top ${Math.min(topEvents.length, 20)} events ranked by attendee count`}
            />
            {overviewExtrasLoading ? (
              <ListSkeleton rows={5} />
            ) : (
              <TopEventsTable events={topEvents.slice(0, 20)} />
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Data Explorer ── */}
      {tab === 'data' && (
        <div style={styles.tabContent}>
          <div style={styles.chartGrid}>
            <div style={styles.chartCard}>
              <div style={styles.chartTitle}>Attendance Over Time</div>
              <AttendanceChart
                data={attendanceData}
                onMonthClick={handleMonthClick}
                selectedMonth={selectedMonth}
              />
            </div>
            <div style={styles.chartCard}>
              <div style={styles.chartTitle}>Revenue Over Time</div>
              <RevenueChart
                data={revenueData}
                onMonthClick={handleMonthClick}
                selectedMonth={selectedMonth}
              />
            </div>
          </div>

          {/* Drill-down panel */}
          {selectedMonth && (
            <DrillDownPanel
              month={selectedMonth}
              events={drillDownEvents}
              loading={drillDownLoading}
              onClose={() => setSelectedMonth(null)}
            />
          )}

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

      {/* ── Tab: Performance ── */}
      {tab === 'performance' && (
        <div style={styles.tabContent}>
          {performanceLoading ? (
            <ListSkeleton rows={8} />
          ) : (
            <>
              <div style={styles.section}>
                <SectionHeader
                  title="Organizer Performance"
                  subtitle="Sorted by total attendance"
                />
                <OrganizerTable data={organizers} />
              </div>

              <div style={styles.section}>
                <SectionHeader
                  title="Category Breakdown"
                  subtitle="Performance metrics by event category"
                />
                <CategoryTable data={categories} />
              </div>

              <div style={styles.section}>
                <SectionHeader
                  title="Pricing Effectiveness"
                  subtitle="Attendance and revenue by price tier"
                />
                <PricingEffectivenessTable data={pricingEffectiveness} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helper functions ──────────────────────────────────────────────────────────

function getBestTiming(data: TimingDataPoint[]): string {
  if (data.length === 0) return 'No data';
  const best = data.reduce((a, b) => (a.avg_attendance ?? 0) > (b.avg_attendance ?? 0) ? a : b);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[best.day_of_week] ?? 'Unknown'}s at ${best.hour}:00`;
}

function getTopPlatform(data: FillByTypeData[]): string {
  if (data.length === 0) return 'No data';
  const best = data.reduce((a, b) => (a.avg_fill ?? 0) > (b.avg_fill ?? 0) ? a : b);
  return `${best.platform} (${best.avg_fill ?? 0}%)`;
}

function getBestMonth(data: AttendanceDataPoint[]): string {
  if (data.length === 0) return 'No data';
  const best = data.reduce((a, b) => (a.attendees ?? 0) > (b.attendees ?? 0) ? a : b);
  return best.month || 'No data';
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 24 },
  error: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '14px 20px', color: '#dc2626', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  retryBtn: { padding: '6px 16px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  title: { fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 700, color: '#080810', margin: 0, marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#7a7a7a', margin: 0 },

  tabBar: { display: 'flex', gap: 4, background: '#f0f0f0', borderRadius: 12, padding: 4, width: 'fit-content' },
  tab: { padding: '8px 20px', borderRadius: 10, border: 'none', background: 'transparent', color: '#7a7a7a', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'Outfit', sans-serif" },
  tabActive: { padding: '8px 20px', borderRadius: 10, border: 'none', background: '#fff', color: '#080810', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Outfit', sans-serif", boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },

  tabContent: { display: 'flex', flexDirection: 'column', gap: 24 },
  section: { display: 'flex', flexDirection: 'column', gap: 0 },

  findingsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 },

  chartGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  chartCard: { background: '#1e1e2e', borderRadius: 12, padding: '20px 24px' },
  chartTitle: { color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 16 },
};

const tableStyles: Record<string, CSSProperties> = {
  findingCard: { background: '#fff', border: '1px solid #e8e6e1', borderRadius: 12, padding: '16px 20px' },
  findingLabel: { fontSize: 11, fontWeight: 600, color: '#7a7a7a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 },
  findingValue: { fontSize: 20, fontWeight: 700, color: '#080810', marginBottom: 4, fontFamily: "'Outfit', sans-serif" },
  findingHint: { fontSize: 12, color: '#999' },

  tableWrap: { overflowX: 'auto', borderRadius: 12, border: '1px solid #e8e6e1' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: 13, borderRadius: 12, overflow: 'hidden' },
  thead: { background: '#f8f7f4' },
  th: { padding: '10px 14px', fontWeight: 700, color: '#7a7a7a', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid #e8e6e1', whiteSpace: 'nowrap' },
  td: { padding: '10px 14px', color: '#080810', verticalAlign: 'middle', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowEven: { background: '#fff' },
  rowOdd: { background: '#fafaf6' },
  empty: { padding: '32px 0', textAlign: 'center', color: '#7a7a7a', fontSize: 14 },
  link: { color: '#3b82f6', textDecoration: 'none' },

  drillDownPanel: { background: '#1e1e2e', borderRadius: 12, padding: '20px 24px', border: '1px solid rgba(255,255,255,0.1)' },
  closeBtn: { padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#aaa', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
};
