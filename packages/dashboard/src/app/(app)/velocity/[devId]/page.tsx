'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clock,
  GitMerge,
  GitPullRequest,
  MessageSquare,
  ThumbsUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDeveloperVelocity } from '@/hooks/use-velocity';
import { VelocityChart } from '@/components/charts/velocity-chart';
import { ContributionChart } from '@/components/charts/contribution-chart';

export default function DeveloperVelocityPage() {
  const params = useParams<{ devId: string }>();
  const { data, loading, error } = useDeveloperVelocity(params.devId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/velocity" className="btn-ghost gap-2 inline-flex">
          <ArrowLeft className="w-4 h-4" /> Back to Team Velocity
        </Link>
        <div className="card-padded text-center">
          <p className="text-red-600 text-sm">{error || 'Developer not found'}</p>
        </div>
      </div>
    );
  }

  const { developer, timeline, prMetrics, contributions } = data;

  const TrendIcon =
    developer.trend === 'up' ? ArrowUp : developer.trend === 'down' ? ArrowDown : ArrowRight;
  const trendColor =
    developer.trend === 'up'
      ? 'text-green-600'
      : developer.trend === 'down'
        ? 'text-red-600'
        : 'text-gray-500';

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back link */}
      <Link href="/velocity" className="btn-ghost gap-2 inline-flex">
        <ArrowLeft className="w-4 h-4" /> Back to Team Velocity
      </Link>

      {/* Developer header */}
      <div className="card-padded">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-lg">
            {developer.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{developer.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-3xl font-bold text-gray-900">{developer.score}</span>
              <span className="text-sm text-gray-500">velocity score</span>
              <span className={cn('flex items-center gap-0.5 text-sm font-medium', trendColor)}>
                <TrendIcon className="w-4 h-4" />
                {Math.abs(developer.trendDelta).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <GitPullRequest className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{developer.prsOpened}</p>
              <p className="text-xs text-gray-500">PRs Opened</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <GitMerge className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{developer.prsMerged}</p>
              <p className="text-xs text-gray-500">PRs Merged</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{developer.reviewsDone}</p>
              <p className="text-xs text-gray-500">Reviews Done</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{developer.avgCycleTimeHours}h</p>
              <p className="text-xs text-gray-500">Avg Cycle Time</p>
            </div>
          </div>
        </div>
      </div>

      {/* Velocity trend */}
      <div className="card-padded">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Velocity Trend</h2>
        <VelocityChart data={timeline} height={300} />
      </div>

      {/* PR Metrics */}
      <div className="card-padded">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Pull Request Metrics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div className="text-center p-4 rounded-lg bg-gray-50">
            <GitPullRequest className="w-5 h-5 text-gray-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{prMetrics.totalPrs}</p>
            <p className="text-xs text-gray-500 mt-1">Total PRs</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-gray-50">
            <GitMerge className="w-5 h-5 text-gray-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{prMetrics.avgTimeToMergeHours}h</p>
            <p className="text-xs text-gray-500 mt-1">Avg Time to Merge</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-gray-50">
            <Clock className="w-5 h-5 text-gray-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{prMetrics.avgReviewTimeHours}h</p>
            <p className="text-xs text-gray-500 mt-1">Avg Review Time</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-gray-50">
            <ThumbsUp className="w-5 h-5 text-gray-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">
              {(prMetrics.approvalRate * 100).toFixed(0)}%
            </p>
            <p className="text-xs text-gray-500 mt-1">Approval Rate</p>
          </div>
        </div>
      </div>

      {/* Contribution breakdown */}
      <div className="card-padded">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Contribution Breakdown</h2>
        <ContributionChart data={contributions} height={300} />
      </div>

      {/* Lines changed */}
      <div className="card-padded">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Code Output</h2>
        <div className="flex items-center gap-8">
          <div>
            <p className="text-sm text-gray-500">Lines Added</p>
            <p className="text-2xl font-bold text-green-600">
              +{developer.linesAdded.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Lines Removed</p>
            <p className="text-2xl font-bold text-red-600">
              -{developer.linesRemoved.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Net Change</p>
            <p className="text-2xl font-bold text-gray-900">
              {(developer.linesAdded - developer.linesRemoved).toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
