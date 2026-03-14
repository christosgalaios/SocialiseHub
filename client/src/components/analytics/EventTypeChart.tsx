import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';

export interface FillByTypeData {
  platform: string;
  avg_fill: number;
  event_count: number;
}

interface Props {
  data: FillByTypeData[];
}

const COLORS: Record<string, string> = {
  meetup: '#3b82f6',
  eventbrite: '#f59e0b',
  headfirst: '#10b981',
};

export function EventTypeChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
        No fill rate data available yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 4, right: 40, left: 0, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fill: '#888', fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
        />
        <YAxis
          type="category"
          dataKey="platform"
          tick={{ fill: '#888', fontSize: 13 }}
          tickLine={false}
          axisLine={false}
          width={80}
        />
        <Tooltip
          formatter={(value) => [`${Number(value)}%`, 'Avg Fill Rate']}
          contentStyle={{ background: '#2a2a3e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
          labelStyle={{ color: '#fff' }}
          itemStyle={{ color: '#ccc' }}
        />
        <Bar dataKey="avg_fill" radius={[0, 4, 4, 0]} name="Avg Fill Rate">
          {data.map((entry) => (
            <Cell key={entry.platform} fill={COLORS[entry.platform] ?? '#8b5cf6'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
