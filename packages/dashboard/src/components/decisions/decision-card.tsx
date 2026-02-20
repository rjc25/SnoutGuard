'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Decision, DecisionCategory, DecisionStatus } from '@/hooks/use-decisions';

interface DecisionCardProps {
  decision: Decision;
}

const categoryColors: Record<DecisionCategory, string> = {
  architecture: 'bg-purple-100 text-purple-700',
  pattern: 'bg-blue-100 text-blue-700',
  dependency: 'bg-cyan-100 text-cyan-700',
  convention: 'bg-green-100 text-green-700',
  security: 'bg-red-100 text-red-700',
  performance: 'bg-orange-100 text-orange-700',
};

const statusColors: Record<DecisionStatus, string> = {
  active: 'bg-green-50 text-green-700 ring-green-600/20',
  pending: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20',
  deprecated: 'bg-gray-100 text-gray-600 ring-gray-500/20',
  superseded: 'bg-blue-50 text-blue-700 ring-blue-600/20',
};

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-yellow-500' : 'bg-red-500',
          )}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 tabular-nums w-8 text-right">{value}%</span>
    </div>
  );
}

export function DecisionCard({ decision }: DecisionCardProps) {
  return (
    <Link href={`/decisions/${decision.id}`} className="block">
      <div className="card p-5 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{decision.title}</h3>
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{decision.description}</p>
          </div>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset shrink-0',
              statusColors[decision.status],
            )}
          >
            {decision.status}
          </span>
        </div>

        <div className="mt-3">
          <ConfidenceBar value={decision.confidence} />
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              'inline-flex items-center rounded-md px-1.5 py-0.5 text-2xs font-medium',
              categoryColors[decision.category],
            )}
          >
            {decision.category}
          </span>
          {decision.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-2xs font-medium text-gray-600"
            >
              {tag}
            </span>
          ))}
          {decision.tags.length > 3 && (
            <span className="text-2xs text-gray-400">+{decision.tags.length - 3}</span>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-2xs text-gray-400">
          <span className="capitalize">{decision.source}</span>
          <span>{new Date(decision.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </Link>
  );
}
