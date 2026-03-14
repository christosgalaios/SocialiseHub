import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

export interface RevenueDataPoint {
  month: string;
  revenue: number;
}

interface Props {
  data: RevenueDataPoint[];
}

const formatCurrency = (value: number) =>
  `£${value.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function RevenueChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
        No revenue data available yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fill: '#888', fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
        />
        <YAxis
          tickFormatter={formatCurrency}
          tick={{ fill: '#888', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(value) => [formatCurrency(Number(value)), 'Revenue']}
          contentStyle={{ background: '#2a2a3e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
          labelStyle={{ color: '#fff' }}
          itemStyle={{ color: '#f59e0b' }}
        />
        <Bar dataKey="revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Revenue" />
      </BarChart>
    </ResponsiveContainer>
  );
}
