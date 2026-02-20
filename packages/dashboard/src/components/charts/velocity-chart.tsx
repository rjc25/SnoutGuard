'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface VelocityChartDataPoint {
  date: string;
  score: number;
  avg7d: number;
  avg30d: number;
}

interface VelocityChartProps {
  data: VelocityChartDataPoint[];
  height?: number;
  showLegend?: boolean;
}

export function VelocityChart({ data, height = 320, showLegend = true }: VelocityChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        No velocity data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: '#64748b' }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#64748b' }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
          domain={[0, 100]}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '13px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          }}
          labelStyle={{ fontWeight: 600, marginBottom: '4px' }}
        />
        {showLegend && (
          <Legend
            wrapperStyle={{ fontSize: '13px', paddingTop: '8px' }}
            iconType="line"
          />
        )}
        <Line
          type="monotone"
          dataKey="score"
          stroke="#94a3b8"
          strokeWidth={1}
          dot={false}
          name="Daily Score"
          opacity={0.5}
        />
        <Line
          type="monotone"
          dataKey="avg7d"
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
          name="7-Day Average"
        />
        <Line
          type="monotone"
          dataKey="avg30d"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={false}
          name="30-Day Average"
          strokeDasharray="5 5"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
