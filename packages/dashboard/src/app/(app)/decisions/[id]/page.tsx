'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Clock,
  ExternalLink,
  Link2,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { cn, formatDate, formatRelativeTime } from '@/lib/utils';
import { useDecision, type DecisionCategory, type DecisionStatus } from '@/hooks/use-decisions';
import { EvidenceViewer } from '@/components/decisions/evidence-viewer';

const categoryColors: Record<DecisionCategory, string> = {
  architecture: 'bg-purple-100 text-purple-700',
  pattern: 'bg-blue-100 text-blue-700',
  dependency: 'bg-cyan-100 text-cyan-700',
  convention: 'bg-green-100 text-green-700',
  security: 'bg-red-100 text-red-700',
  performance: 'bg-orange-100 text-orange-700',
};

const statusConfig: Record<DecisionStatus, { color: string; icon: typeof Check }> = {
  active: { color: 'bg-green-50 text-green-700 ring-green-600/20', icon: Check },
  pending: { color: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20', icon: Clock },
  deprecated: { color: 'bg-gray-100 text-gray-600 ring-gray-500/20', icon: XCircle },
  superseded: { color: 'bg-blue-50 text-blue-700 ring-blue-600/20', icon: ExternalLink },
};

export default function DecisionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { decision, loading, error, confirm, deprecate } = useDecision(params.id);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (error || !decision) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-ghost gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="card-padded text-center">
          <p className="text-red-600 text-sm">{error || 'Decision not found'}</p>
        </div>
      </div>
    );
  }

  const statusConf = statusConfig[decision.status];
  const StatusIcon = statusConf.icon;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back link */}
      <Link href="/decisions" className="btn-ghost gap-2 inline-flex">
        <ArrowLeft className="w-4 h-4" /> Back to Decisions
      </Link>

      {/* Header */}
      <div className="card-padded">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className={cn(
                  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                  categoryColors[decision.category],
                )}
              >
                {decision.category}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
                  statusConf.color,
                )}
              >
                <StatusIcon className="w-3.5 h-3.5" />
                {decision.status}
              </span>
              <span className="text-xs text-gray-400 capitalize">{decision.source}</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mt-3">{decision.title}</h1>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">{decision.description}</p>
          </div>
        </div>

        {/* Confidence */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-gray-500">Confidence</span>
            <span className="font-semibold text-gray-900">{decision.confidence}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                decision.confidence >= 80
                  ? 'bg-green-500'
                  : decision.confidence >= 60
                    ? 'bg-yellow-500'
                    : 'bg-red-500',
              )}
              style={{ width: `${decision.confidence}%` }}
            />
          </div>
        </div>

        {/* Tags */}
        {decision.tags.length > 0 && (
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            {decision.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100 text-sm">
          <div>
            <span className="text-gray-400 text-xs">Created</span>
            <p className="font-medium text-gray-700">{formatDate(decision.createdAt)}</p>
          </div>
          <div>
            <span className="text-gray-400 text-xs">Updated</span>
            <p className="font-medium text-gray-700">{formatRelativeTime(decision.updatedAt)}</p>
          </div>
          <div>
            <span className="text-gray-400 text-xs">Repository</span>
            <p className="font-medium text-gray-700 font-mono text-xs">{decision.repoId}</p>
          </div>
          <div>
            <span className="text-gray-400 text-xs">Evidence</span>
            <p className="font-medium text-gray-700">{decision.evidence.length} items</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-gray-100">
          {decision.status === 'pending' && (
            <button type="button" onClick={confirm} className="btn-primary gap-2">
              <Check className="w-4 h-4" /> Confirm Decision
            </button>
          )}
          {(decision.status === 'active' || decision.status === 'pending') && (
            <button type="button" onClick={deprecate} className="btn-secondary gap-2">
              <XCircle className="w-4 h-4" /> Deprecate
            </button>
          )}
        </div>
      </div>

      {/* Evidence */}
      <div className="card-padded">
        <EvidenceViewer evidence={decision.evidence} />
      </div>

      {/* Related Decisions */}
      {decision.relatedDecisionIds.length > 0 && (
        <div className="card-padded">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Related Decisions ({decision.relatedDecisionIds.length})
          </h3>
          <div className="space-y-2">
            {decision.relatedDecisionIds.map((relId) => (
              <Link
                key={relId}
                href={`/decisions/${relId}`}
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-sm"
              >
                <ExternalLink className="w-4 h-4 text-gray-400" />
                <span className="font-mono text-gray-600">{relId}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Constraints */}
      {decision.constraints.length > 0 && (
        <div className="card-padded">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" />
            Constraints ({decision.constraints.length})
          </h3>
          <ul className="space-y-2">
            {decision.constraints.map((constraint, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-gray-700 p-3 rounded-lg bg-amber-50 border border-amber-200"
              >
                <span className="shrink-0 w-5 h-5 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </span>
                {constraint}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
