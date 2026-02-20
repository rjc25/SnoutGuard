'use client';

import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUp, GitPullRequest, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeveloperVelocity } from '@/hooks/use-velocity';

interface VelocityCardProps {
  developer: DeveloperVelocity;
}

function TrendArrow({ trend, delta }: { trend: 'up' | 'down' | 'stable'; delta: number }) {
  const Icon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : ArrowRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        trend === 'up' && 'text-green-600',
        trend === 'down' && 'text-red-600',
        trend === 'stable' && 'text-gray-500',
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 80 ? 'text-green-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500';

  return (
    <div className="relative w-16 h-16">
      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-gray-100"
        />
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
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

export function VelocityCard({ developer }: VelocityCardProps) {
  return (
    <Link href={`/velocity/${developer.devId}`} className="block">
      <div className="card p-5 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm shrink-0">
            {developer.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900 truncate">{developer.name}</h4>
              <TrendArrow trend={developer.trend} delta={developer.trendDelta} />
            </div>

            {/* Metrics row */}
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <GitPullRequest className="w-3.5 h-3.5" />
                {developer.prsMerged} merged
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" />
                {developer.reviewsDone} reviews
              </span>
            </div>
          </div>

          <ScoreRing score={developer.score} />
        </div>

        {/* Bottom metrics */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-gray-100">
          <div className="text-center">
            <p className="text-xs text-gray-400">PRs Opened</p>
            <p className="text-sm font-semibold text-gray-900">{developer.prsOpened}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">Avg Cycle</p>
            <p className="text-sm font-semibold text-gray-900">
              {developer.avgCycleTimeHours}h
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">Lines +/-</p>
            <p className="text-sm font-semibold text-gray-900">
              <span className="text-green-600">+{developer.linesAdded}</span>
              {' / '}
              <span className="text-red-600">-{developer.linesRemoved}</span>
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
