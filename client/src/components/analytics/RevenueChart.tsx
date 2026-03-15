import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
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
  onMonthClick?: (month: string) => void;
  selectedMonth?: string | null;
}

const formatCurrency = (value: number) =>
  `£${value.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function RevenueChart({ data, onMonthClick, selectedMonth }: Props) {
  if (!data || data.length === 0) {
    return (
      <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
        No revenue data available yet
      </div>
    );
  }

  // Highlight selected bar
  const chartData = data.map(d => ({
    ...d,
    fill: selectedMonth === d.month ? '#E2725B' : '#f59e0b',
  }));

  return (
    <div>
      {onMonthClick && (
        <div style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
          Click a bar to see that month's events
        </div>
      )}
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
          onClick={(state: Record<string, unknown>) => {
            const ap = state?.activePayload as Array<{ payload?: { month?: string } }> | undefined;
            if (onMonthClick && ap?.[0]?.payload?.month) {
              onMonthClick(ap[0].payload.month);
            }
          }}
          style={{ cursor: onMonthClick ? 'pointer' : 'default' }}
        >
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
          <Bar dataKey="revenue" radius={[4, 4, 0, 0]} name="Revenue">
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
