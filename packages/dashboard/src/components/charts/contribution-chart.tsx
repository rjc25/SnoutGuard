'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface ContributionDataPoint {
  week: string;
  commits: number;
  prsOpened: number;
  prsMerged: number;
  reviewsDone: number;
}

interface ContributionChartProps {
  data: ContributionDataPoint[];
  height?: number;
}

const COLORS = {
  commits: '#6366f1',
  prsOpened: '#3b82f6',
  prsMerged: '#22c55e',
  reviewsDone: '#f59e0b',
};

export function ContributionChart({ data, height = 320 }: ContributionChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        No contribution data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 12, fill: '#64748b' }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#64748b' }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
          allowDecimals={false}
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
        <Legend
          wrapperStyle={{ fontSize: '13px', paddingTop: '8px' }}
          iconType="rect"
        />
        <Bar
          dataKey="commits"
          name="Commits"
          fill={COLORS.commits}
          radius={[4, 4, 0, 0]}
          maxBarSize={32}
        />
        <Bar
          dataKey="prsOpened"
          name="PRs Opened"
          fill={COLORS.prsOpened}
          radius={[4, 4, 0, 0]}
          maxBarSize={32}
        />
        <Bar
          dataKey="prsMerged"
          name="PRs Merged"
          fill={COLORS.prsMerged}
          radius={[4, 4, 0, 0]}
          maxBarSize={32}
        />
        <Bar
          dataKey="reviewsDone"
          name="Reviews Done"
          fill={COLORS.reviewsDone}
          radius={[4, 4, 0, 0]}
          maxBarSize={32}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
