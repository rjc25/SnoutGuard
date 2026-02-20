'use client';

import { AlertCircle, CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { Blocker } from '@/hooks/use-velocity';

interface BlockerListProps {
  blockers: Blocker[];
  onResolve?: (id: string) => void;
}

const severityConfig: Record<
  Blocker['severity'],
  { color: string; bgColor: string; ringColor: string }
> = {
  critical: {
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    ringColor: 'ring-red-600/20',
  },
  high: {
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    ringColor: 'ring-orange-600/20',
  },
  medium: {
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    ringColor: 'ring-yellow-600/20',
  },
  low: {
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    ringColor: 'ring-gray-500/20',
  },
};

export function BlockerList({ blockers, onResolve }: BlockerListProps) {
  const openBlockers = blockers.filter((b) => b.status === 'open');
  const resolvedBlockers = blockers.filter((b) => b.status === 'resolved');

  if (blockers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
        <CheckCircle2 className="w-8 h-8 mb-2 text-green-400" />
        <p className="text-sm">No blockers - great job!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Open blockers */}
      {openBlockers.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Open ({openBlockers.length})
          </h4>
          {openBlockers.map((blocker) => {
            const config = severityConfig[blocker.severity];
            return (
              <div
                key={blocker.id}
                className={cn(
                  'rounded-lg border p-4 ring-1 ring-inset',
                  config.bgColor,
                  config.ringColor,
                )}
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className={cn('w-4 h-4 mt-0.5 shrink-0', config.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h5 className="text-sm font-medium text-gray-900">{blocker.title}</h5>
                      <span
                        className={cn(
                          'inline-flex rounded-full px-1.5 py-0.5 text-2xs font-medium uppercase',
                          config.color,
                          config.bgColor,
                        )}
                      >
                        {blocker.severity}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{blocker.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      {blocker.assignee && (
                        <span className="text-2xs text-gray-500">
                          Assigned to <strong>{blocker.assignee}</strong>
                        </span>
                      )}
                      <span className="text-2xs text-gray-400">
                        {formatRelativeTime(blocker.createdAt)}
                      </span>
                      {blocker.prUrl && (
                        <a
                          href={blocker.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-2xs text-brand-600 hover:text-brand-700"
                        >
                          View PR <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  {onResolve && (
                    <button
                      type="button"
                      onClick={() => onResolve(blocker.id)}
                      className="shrink-0 text-xs text-gray-500 hover:text-green-600 transition-colors"
                      title="Mark as resolved"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Resolved blockers */}
      {resolvedBlockers.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Resolved ({resolvedBlockers.length})
          </h4>
          {resolvedBlockers.map((blocker) => (
            <div
              key={blocker.id}
              className="rounded-lg border border-gray-200 p-3 bg-gray-50/50 opacity-70"
            >
              <div className="flex items-center gap-3">
                <XCircle className="w-4 h-4 text-gray-400 shrink-0 line-through" />
                <span className="text-sm text-gray-500 line-through">{blocker.title}</span>
                <span className="text-2xs text-gray-400 ml-auto">
                  {formatRelativeTime(blocker.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
