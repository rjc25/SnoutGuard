'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { cn, formatDate, formatRelativeTime } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { DriftTimeline, type DriftDataPoint } from '@/components/charts/drift-timeline';

interface DriftEvent {
  id: string;
  date: string;
  type: 'violation_spike' | 'new_pattern' | 'decision_override' | 'dependency_change';
  description: string;
  severity: 'high' | 'medium' | 'low';
  driftDelta: number;
  relatedDecisionId?: string;
}

interface DriftData {
  timeline: DriftDataPoint[];
  events: DriftEvent[];
  currentScore: number;
  trend: 'improving' | 'degrading' | 'stable';
  threshold: number;
}

const eventTypeLabels: Record<DriftEvent['type'], string> = {
  violation_spike: 'Violation Spike',
  new_pattern: 'New Pattern Detected',
  decision_override: 'Decision Override',
  dependency_change: 'Dependency Change',
};

const eventTypeColors: Record<DriftEvent['type'], string> = {
  violation_spike: 'border-red-300 bg-red-50',
  new_pattern: 'border-blue-300 bg-blue-50',
  decision_override: 'border-yellow-300 bg-yellow-50',
  dependency_change: 'border-purple-300 bg-purple-50',
};

const severityDot: Record<DriftEvent['severity'], string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
};

export default function DriftPage() {
  const [data, setData] = useState<DriftData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<DriftData>('/drift');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch drift data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        <h1 className="text-2xl font-bold text-gray-900">Architectural Drift</h1>
        <div className="card-padded text-center">
          <p className="text-red-600 text-sm">{error || 'Failed to load drift data'}</p>
          <button type="button" onClick={fetchData} className="btn-secondary gap-2 mt-3">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const TrendIcon = data.trend === 'improving' ? TrendingDown : TrendingUp;
  const trendColor =
    data.trend === 'improving'
      ? 'text-green-600'
      : data.trend === 'degrading'
        ? 'text-red-600'
        : 'text-gray-500';
  const trendLabel =
    data.trend === 'improving'
      ? 'Drift decreasing'
      : data.trend === 'degrading'
        ? 'Drift increasing'
        : 'Stable';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Architectural Drift</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track how your codebase diverges from architectural decisions over time.
          </p>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div>
            <p
              className={cn(
                'text-2xl font-bold',
                data.currentScore <= data.threshold ? 'text-green-600' : 'text-red-600',
              )}
            >
              {data.currentScore.toFixed(1)}%
            </p>
            <p className="text-xs text-gray-500">Current Drift</p>
          </div>
          <div className={cn('flex items-center gap-1', trendColor)}>
            <TrendIcon className="w-4 h-4" />
            <span className="text-xs font-medium">{trendLabel}</span>
          </div>
        </div>
      </div>

      {/* Alert if above threshold */}
      {data.currentScore > data.threshold && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Drift threshold exceeded</p>
            <p className="text-xs text-red-600 mt-1">
              Current drift ({data.currentScore.toFixed(1)}%) is above the threshold (
              {data.threshold}%). Review recent architectural changes to reduce drift.
            </p>
          </div>
        </div>
      )}

      {/* Timeline chart */}
      <div className="card-padded">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Drift Over Time</h2>
        <DriftTimeline data={data.timeline} thresholdValue={data.threshold} height={320} />
      </div>

      {/* Events timeline */}
      <div className="card-padded">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          Drift Events ({data.events.length})
        </h2>
        {data.events.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No drift events recorded.</div>
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

            <div className="space-y-4">
              {data.events
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((event) => (
                  <div key={event.id} className="relative pl-10">
                    {/* Timeline dot */}
                    <div
                      className={cn(
                        'absolute left-3 top-4 w-3 h-3 rounded-full ring-2 ring-white',
                        severityDot[event.severity],
                      )}
                    />

                    <div
                      className={cn(
                        'rounded-lg border p-4',
                        eventTypeColors[event.type],
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-700">
                            {eventTypeLabels[event.type]}
                          </span>
                          <span
                            className={cn(
                              'inline-flex rounded-full px-1.5 py-0.5 text-2xs font-medium uppercase',
                              event.severity === 'high' && 'bg-red-100 text-red-700',
                              event.severity === 'medium' && 'bg-yellow-100 text-yellow-700',
                              event.severity === 'low' && 'bg-gray-100 text-gray-600',
                            )}
                          >
                            {event.severity}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {formatRelativeTime(event.date)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{event.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                        <span>
                          Drift change:{' '}
                          <span
                            className={cn(
                              'font-medium',
                              event.driftDelta > 0 ? 'text-red-600' : 'text-green-600',
                            )}
                          >
                            {event.driftDelta > 0 ? '+' : ''}
                            {event.driftDelta.toFixed(1)}%
                          </span>
                        </span>
                        <span>{formatDate(event.date)}</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
