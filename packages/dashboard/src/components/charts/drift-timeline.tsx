'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface DriftDataPoint {
  date: string;
  driftScore: number;
  threshold: number;
  eventLabel?: string;
}

interface DriftTimelineProps {
  data: DriftDataPoint[];
  height?: number;
  thresholdValue?: number;
}

export function DriftTimeline({ data, height = 300, thresholdValue }: DriftTimelineProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        No drift data available
      </div>
    );
  }

  const threshold = thresholdValue ?? (data.length > 0 ? data[0].threshold : 50);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="driftGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
          </linearGradient>
        </defs>
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
          label={{
            value: 'Drift Score',
            angle: -90,
            position: 'insideLeft',
            style: { fontSize: 12, fill: '#94a3b8' },
          }}
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
          formatter={(value: number) => [`${value.toFixed(1)}%`, 'Drift Score']}
        />
        <ReferenceLine
          y={threshold}
          stroke="#f59e0b"
          strokeDasharray="8 4"
          label={{
            value: `Threshold (${threshold}%)`,
            position: 'right',
            style: { fontSize: 11, fill: '#f59e0b' },
          }}
        />
        <Area
          type="monotone"
          dataKey="driftScore"
          stroke="#ef4444"
          strokeWidth={2}
          fill="url(#driftGradient)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
