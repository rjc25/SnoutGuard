'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useReview } from '@/hooks/use-reviews';
import { ReviewSummaryCard } from '@/components/reviews/review-summary';
import { ViolationList } from '@/components/reviews/violation-list';
import { ViolationBreakdown } from '@/components/charts/violation-breakdown';

export default function ReviewDetailPage() {
  const params = useParams<{ id: string }>();
  const { review, loading, error } = useReview(params.id);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="space-y-4">
        <Link href="/reviews" className="btn-ghost gap-2 inline-flex">
          <ArrowLeft className="w-4 h-4" /> Back to Reviews
        </Link>
        <div className="card-padded text-center">
          <p className="text-red-600 text-sm">{error || 'Review not found'}</p>
        </div>
      </div>
    );
  }

  const breakdownData = [
    { name: 'Errors', count: review.violationCounts.error, color: '#ef4444' },
    { name: 'Warnings', count: review.violationCounts.warning, color: '#f59e0b' },
    { name: 'Info', count: review.violationCounts.info, color: '#3b82f6' },
  ].filter((d) => d.count > 0);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back link */}
      <Link href="/reviews" className="btn-ghost gap-2 inline-flex">
        <ArrowLeft className="w-4 h-4" /> Back to Reviews
      </Link>

      {/* Review summary */}
      <ReviewSummaryCard review={review} />

      {/* Charts */}
      {breakdownData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-padded">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Violation Breakdown</h3>
            <ViolationBreakdown data={breakdownData} variant="bar" height={220} />
          </div>
          <div className="card-padded">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Distribution</h3>
            <ViolationBreakdown data={breakdownData} variant="pie" height={220} />
          </div>
        </div>
      )}

      {/* Violations list */}
      <div className="card-padded">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Violations ({review.violations.length})
        </h3>
        <ViolationList violations={review.violations} groupByFile />
      </div>
    </div>
  );
}
