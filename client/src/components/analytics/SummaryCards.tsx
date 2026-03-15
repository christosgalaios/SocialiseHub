import type { CSSProperties } from 'react';

export interface AnalyticsSummary {
  total_events: number;
  total_attendees: number;
  total_revenue: number;
  avg_fill_rate: number;
  revenue_per_attendee?: number;
  total_organizers?: number;
  avg_ticket_price?: number;
  paid_events_count?: number;
  free_events_count?: number;
}

interface CardProps {
  label: string;
  value: string;
  sub?: string;
  color: string;
}

function Card({ label, value, sub, color }: CardProps) {
  const cardStyle: CSSProperties = {
    background: '#1e1e2e',
    borderRadius: 12,
    padding: '20px 24px',
    flex: 1,
    minWidth: 160,
    borderLeft: `4px solid ${color}`,
  };

  return (
    <div style={cardStyle}>
      <div style={{ color: '#888', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ color: '#fff', fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

interface Props {
  summary: AnalyticsSummary;
}

export function SummaryCards({ summary }: Props) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <Card
        label="Total Events"
        value={String(summary.total_events)}
        color="#3b82f6"
      />
      <Card
        label="Total Attendees"
        value={(summary.total_attendees ?? 0).toLocaleString()}
        color="#10b981"
      />
      <Card
        label="Total Revenue"
        value={`£${(summary.total_revenue ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        color="#f59e0b"
      />
      <Card
        label="Avg Fill Rate"
        value={`${summary.avg_fill_rate ?? 0}%`}
        sub="attendance / capacity"
        color="#8b5cf6"
      />
      {summary.revenue_per_attendee != null && summary.revenue_per_attendee > 0 && (
        <Card
          label="Revenue / Attendee"
          value={`£${summary.revenue_per_attendee.toFixed(2)}`}
          sub="ticket yield"
          color="#ef4444"
        />
      )}
      {summary.avg_ticket_price != null && summary.avg_ticket_price > 0 && (
        <Card
          label="Avg Ticket Price"
          value={`£${summary.avg_ticket_price.toFixed(2)}`}
          sub={summary.paid_events_count != null ? `${summary.paid_events_count} paid / ${summary.free_events_count ?? 0} free` : undefined}
          color="#E2725B"
        />
      )}
      {summary.total_organizers != null && summary.total_organizers > 0 && (
        <Card
          label="Organizers"
          value={String(summary.total_organizers)}
          sub="tracked organizers"
          color="#06b6d4"
        />
      )}
    </div>
  );
}
