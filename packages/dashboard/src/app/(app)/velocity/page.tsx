'use client';

import { ArrowDown, ArrowRight, ArrowUp, TrendingUp, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTeamVelocity } from '@/hooks/use-velocity';
import { VelocityChart } from '@/components/charts/velocity-chart';
import { VelocityCard } from '@/components/velocity/velocity-card';
import { BlockerList } from '@/components/velocity/blocker-list';

export default function VelocityPage() {
  const { data, loading, error } = useTeamVelocity();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card-padded text-center">
        <p className="text-red-600 text-sm">{error || 'Failed to load velocity data'}</p>
      </div>
    );
  }

  const TrendIcon =
    data.teamTrend === 'up' ? ArrowUp : data.teamTrend === 'down' ? ArrowDown : ArrowRight;
  const trendColor =
    data.teamTrend === 'up'
      ? 'text-green-600'
      : data.teamTrend === 'down'
        ? 'text-red-600'
        : 'text-gray-500';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Velocity</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor team performance and identify blockers.
          </p>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand-600" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{data.teamAvgScore}</p>
              <p className="text-xs text-gray-500">Team Average</p>
            </div>
          </div>
          <div className={cn('flex items-center gap-1', trendColor)}>
            <TrendIcon className="w-4 h-4" />
            <span className="text-sm font-medium capitalize">{data.teamTrend}</span>
          </div>
        </div>
      </div>

      {/* Velocity chart */}
      <div className="card-padded">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Rolling Velocity</h2>
        <VelocityChart data={data.timeline} height={320} />
      </div>

      {/* Developer cards + Blockers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Developer cards */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Developers ({data.developers.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.developers
              .sort((a, b) => b.score - a.score)
              .map((dev) => (
                <VelocityCard key={dev.devId} developer={dev} />
              ))}
          </div>
        </div>

        {/* Blockers */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Blockers</h2>
          <div className="card-padded">
            <BlockerList blockers={data.blockers} />
          </div>
        </div>
      </div>
    </div>
  );
}
