'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewSummaryData } from '@/hooks/use-reviews';

interface ReviewSummaryCardProps {
  review: ReviewSummaryData;
}

export function ReviewSummaryCard({ review }: ReviewSummaryCardProps) {
  const totalViolations =
    review.violationCounts.error + review.violationCounts.warning + review.violationCounts.info;

  return (
    <div className="card-padded">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Review Summary</h3>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            review.status === 'completed'
              ? 'bg-green-50 text-green-700'
              : review.status === 'in_progress'
                ? 'bg-yellow-50 text-yellow-700'
                : 'bg-red-50 text-red-700',
          )}
        >
          {review.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
          {review.status === 'in_progress' && <Clock className="w-3.5 h-3.5" />}
          {review.status === 'failed' && <AlertCircle className="w-3.5 h-3.5" />}
          {review.status}
        </span>
      </div>

      {/* Violation counts */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <div>
            <p className="text-2xl font-bold text-red-700">{review.violationCounts.error}</p>
            <p className="text-xs text-red-600">Errors</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50">
          <AlertTriangle className="w-5 h-5 text-yellow-600" />
          <div>
            <p className="text-2xl font-bold text-yellow-700">{review.violationCounts.warning}</p>
            <p className="text-xs text-yellow-600">Warnings</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50">
          <Info className="w-5 h-5 text-blue-600" />
          <div>
            <p className="text-2xl font-bold text-blue-700">{review.violationCounts.info}</p>
            <p className="text-xs text-blue-600">Info</p>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Repository</span>
          <span className="font-medium text-gray-900">{review.repoName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Branch</span>
          <span className="font-mono text-gray-700 text-xs">{review.branch}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Commit</span>
          <span className="font-mono text-gray-700 text-xs">{review.commitSha.slice(0, 8)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Triggered By</span>
          <span className="capitalize text-gray-700">{review.triggeredBy.replace('_', ' ')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Files Analyzed</span>
          <span className="text-gray-700">
            {review.filesAnalyzed} / {review.totalFiles}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Total Violations</span>
          <span className="font-medium text-gray-900">{totalViolations}</span>
        </div>
      </div>
    </div>
  );
}
