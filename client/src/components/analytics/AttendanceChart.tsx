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
  onMonthClick?: (month: string) => void;
  selectedMonth?: string | null;
}

// Custom dot that handles click and highlights selected month
function ClickableDot(props: {
  cx?: number;
  cy?: number;
  payload?: AttendanceDataPoint;
  onMonthClick?: (month: string) => void;
  selectedMonth?: string | null;
  fill?: string;
}) {
  const { cx, cy, payload, onMonthClick, selectedMonth, fill } = props;
  if (cx == null || cy == null || !payload) return null;
  const isSelected = selectedMonth === payload.month;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={isSelected ? 7 : 4}
      fill={isSelected ? '#E2725B' : (fill ?? '#3b82f6')}
      stroke={isSelected ? '#fff' : 'none'}
      strokeWidth={isSelected ? 2 : 0}
      style={{ cursor: onMonthClick ? 'pointer' : 'default' }}
      onClick={() => onMonthClick && payload.month && onMonthClick(payload.month)}
    />
  );
}

export function AttendanceChart({ data, onMonthClick, selectedMonth }: Props) {
  if (!data || data.length === 0) {
    return (
      <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
        No attendance data available yet
      </div>
    );
  }

  return (
    <div>
      {onMonthClick && (
        <div style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
          Click a point to drill down into that month's events
        </div>
      )}
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
            dot={(dotProps) => (
              <ClickableDot
                key={`dot-${dotProps.index}`}
                {...dotProps}
                fill="#3b82f6"
                onMonthClick={onMonthClick}
                selectedMonth={selectedMonth}
              />
            )}
            activeDot={{ r: 6, fill: '#3b82f6' }}
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
    </div>
  );
}
