'use client';

import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Clock,
  GitMerge,
  GitPullRequest,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeveloperVelocity } from '@/hooks/use-velocity';

interface DevProfileProps {
  developer: DeveloperVelocity;
  variant?: 'compact' | 'full';
}

function TrendBadge({ trend, delta }: { trend: 'up' | 'down' | 'stable'; delta: number }) {
  const Icon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : ArrowRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium',
        trend === 'up' && 'bg-green-50 text-green-700',
        trend === 'down' && 'bg-red-50 text-red-700',
        trend === 'stable' && 'bg-gray-100 text-gray-600',
      )}
    >
      <Icon className="w-3 h-3" />
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function ScoreCircle({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 22;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 80 ? 'text-green-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500';

  return (
    <div className="relative w-14 h-14">
      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 52 52">
        <circle
          cx="26"
          cy="26"
          r="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-gray-100"
        />
        <circle
          cx="26"
          cy="26"
          r="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={color}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-900">
        {score}
      </span>
    </div>
  );
}

export function DevProfile({ developer, variant = 'full' }: DevProfileProps) {
  const initials = developer.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (variant === 'compact') {
    return (
      <Link href={`/velocity/${developer.devId}`} className="block">
        <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-xs shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{developer.name}</p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Score: {developer.score}</span>
              <TrendBadge trend={developer.trend} delta={developer.trendDelta} />
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="card-padded">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-lg shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-gray-900 truncate">{developer.name}</h3>
            <TrendBadge trend={developer.trend} delta={developer.trendDelta} />
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Developer Profile</p>
        </div>
        <ScoreCircle score={developer.score} />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
            <GitPullRequest className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{developer.prsOpened}</p>
            <p className="text-xs text-gray-500">PRs Opened</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
            <GitMerge className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{developer.prsMerged}</p>
            <p className="text-xs text-gray-500">PRs Merged</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-yellow-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{developer.reviewsDone}</p>
            <p className="text-xs text-gray-500">Reviews</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
            <Clock className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{developer.avgCycleTimeHours}h</p>
            <p className="text-xs text-gray-500">Avg Cycle</p>
          </div>
        </div>
      </div>

      {/* Code output */}
      <div className="flex items-center gap-6 mt-4 pt-3 border-t border-gray-100">
        <div>
          <p className="text-xs text-gray-500">Lines Added</p>
          <p className="text-sm font-bold text-green-600">
            +{developer.linesAdded.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Lines Removed</p>
          <p className="text-sm font-bold text-red-600">
            -{developer.linesRemoved.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Net Change</p>
          <p className="text-sm font-bold text-gray-900">
            {(developer.linesAdded - developer.linesRemoved).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Link to detail */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <Link
          href={`/velocity/${developer.devId}`}
          className="text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
        >
          View full profile
        </Link>
      </div>
    </div>
  );
}
