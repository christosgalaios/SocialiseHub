import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export interface AttendanceDataPoint {
  month: string;
  attendees: number;
  events_with_data: number;
}

interface Props {
  data: AttendanceDataPoint[];
}

export function AttendanceChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
        No attendance data available yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
        <XAxis
          dataKey="month"
          tick={{ fill: '#888', fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
        />
        <YAxis
          tick={{ fill: '#888', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{ background: '#2a2a3e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
          labelStyle={{ color: '#fff' }}
          itemStyle={{ color: '#ccc' }}
        />
        <Legend wrapperStyle={{ color: '#888', fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="attendees"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ fill: '#3b82f6', r: 4 }}
          activeDot={{ r: 6 }}
          name="Attendees"
        />
        <Line
          type="monotone"
          dataKey="events_with_data"
          stroke="#10b981"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={{ fill: '#10b981', r: 3 }}
          name="Events"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
