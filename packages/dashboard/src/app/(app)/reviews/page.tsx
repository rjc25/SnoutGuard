'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  GitBranch,
  Info,
  Search,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useReviews } from '@/hooks/use-reviews';

const triggerOptions = [
  { value: '', label: 'All Triggers' },
  { value: 'push', label: 'Push' },
  { value: 'pull_request', label: 'Pull Request' },
  { value: 'manual', label: 'Manual' },
  { value: 'schedule', label: 'Scheduled' },
];

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'failed', label: 'Failed' },
];

export default function ReviewsPage() {
  const [triggeredBy, setTriggeredBy] = useState('');
  const [status, setStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const { reviews, loading, error } = useReviews({
    triggeredBy: triggeredBy || undefined,
    status: status || undefined,
  });

  const filtered = searchQuery
    ? reviews.filter(
        (r) =>
          r.repoName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.branch.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.commitSha.includes(searchQuery.toLowerCase()),
      )
    : reviews;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Review History</h1>
        <p className="text-sm text-gray-500 mt-1">
          Browse architectural reviews across your repositories.
        </p>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by repo, branch, or commit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-9"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="input-field w-full sm:w-40"
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={triggeredBy}
            onChange={(e) => setTriggeredBy(e.target.value)}
            className="input-field w-full sm:w-44"
          >
            {triggerOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card-padded text-center">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <>
          <p className="text-sm text-gray-500">
            {filtered.length} review{filtered.length !== 1 ? 's' : ''} found
          </p>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Repository</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Ref</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Violations</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Triggered By</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((review) => {
                    const total =
                      review.violationCounts.error +
                      review.violationCounts.warning +
                      review.violationCounts.info;
                    return (
                      <tr
                        key={review.id}
                        className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="py-3 px-4 text-gray-500 whitespace-nowrap">
                          {formatRelativeTime(review.createdAt)}
                        </td>
                        <td className="py-3 px-4">
                          <Link
                            href={`/reviews/${review.id}`}
                            className="font-medium text-gray-900 hover:text-brand-600 transition-colors"
                          >
                            {review.repoName}
                          </Link>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <GitBranch className="w-3.5 h-3.5 text-gray-400" />
                            <span className="font-mono text-xs text-gray-600">
                              {review.branch}
                            </span>
                            <span className="font-mono text-2xs text-gray-400">
                              ({review.commitSha.slice(0, 7)})
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {review.violationCounts.error > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs text-red-600">
                                <AlertCircle className="w-3.5 h-3.5" />
                                {review.violationCounts.error}
                              </span>
                            )}
                            {review.violationCounts.warning > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs text-yellow-600">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {review.violationCounts.warning}
                              </span>
                            )}
                            {review.violationCounts.info > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                                <Info className="w-3.5 h-3.5" />
                                {review.violationCounts.info}
                              </span>
                            )}
                            {total === 0 && (
                              <span className="text-xs text-green-600">Clean</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="capitalize text-gray-600 text-xs">
                            {review.triggeredBy.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                              review.status === 'completed' &&
                                'bg-green-50 text-green-700',
                              review.status === 'in_progress' &&
                                'bg-yellow-50 text-yellow-700',
                              review.status === 'failed' &&
                                'bg-red-50 text-red-700',
                            )}
                          >
                            {review.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                            {review.status === 'in_progress' && <Clock className="w-3 h-3" />}
                            {review.status === 'failed' && <AlertCircle className="w-3 h-3" />}
                            {review.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-sm">
                No reviews found matching your filters.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
