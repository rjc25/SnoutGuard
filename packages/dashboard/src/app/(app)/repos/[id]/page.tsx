'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ExternalLink,
  GitBranch,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { cn, formatDate, formatRelativeTime, getHealthColor, getHealthLevel } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useDecisions, type Decision } from '@/hooks/use-decisions';
import { DecisionTable } from '@/components/decisions/decision-table';

interface RepoDetail {
  id: string;
  name: string;
  fullName: string;
  provider: 'github' | 'bitbucket' | 'gitlab';
  defaultBranch: string;
  healthScore: number;
  decisionsCount: number;
  lastReviewAt: string | null;
  isActive: boolean;
  url: string;
  description?: string;
  language?: string;
  createdAt: string;
  healthBreakdown: {
    architectureScore: number;
    conventionScore: number;
    securityScore: number;
    dependencyScore: number;
  };
}

export default function RepoDetailPage() {
  const params = useParams<{ id: string }>();
  const [repo, setRepo] = useState<RepoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { decisions, loading: decisionsLoading } = useDecisions({ repoId: params.id });

  const fetchRepo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<RepoDetail>(`/repos/${params.id}`);
      setRepo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch repository');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchRepo();
  }, [fetchRepo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (error || !repo) {
    return (
      <div className="space-y-4">
        <Link href="/repos" className="btn-ghost gap-2 inline-flex">
          <ArrowLeft className="w-4 h-4" /> Back to Repositories
        </Link>
        <div className="card-padded text-center">
          <p className="text-red-600 text-sm">{error || 'Repository not found'}</p>
        </div>
      </div>
    );
  }

  const healthScores = [
    { label: 'Architecture', score: repo.healthBreakdown.architectureScore },
    { label: 'Conventions', score: repo.healthBreakdown.conventionScore },
    { label: 'Security', score: repo.healthBreakdown.securityScore },
    { label: 'Dependencies', score: repo.healthBreakdown.dependencyScore },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back link */}
      <Link href="/repos" className="btn-ghost gap-2 inline-flex">
        <ArrowLeft className="w-4 h-4" /> Back to Repositories
      </Link>

      {/* Repo header */}
      <div className="card-padded">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{repo.name}</h1>
              <a
                href={repo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-brand-600 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
            <p className="text-sm text-gray-500 font-mono mt-1">{repo.fullName}</p>
            {repo.description && (
              <p className="text-sm text-gray-600 mt-2">{repo.description}</p>
            )}
          </div>
          <button type="button" onClick={fetchRepo} className="btn-secondary gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
          <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 capitalize">
            {repo.provider}
          </span>
          <span className="flex items-center gap-1">
            <GitBranch className="w-3.5 h-3.5" />
            {repo.defaultBranch}
          </span>
          {repo.language && <span>{repo.language}</span>}
          <span>Connected {formatDate(repo.createdAt)}</span>
        </div>
      </div>

      {/* Health Score */}
      <div className="card-padded">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">Health Score</h2>
        </div>

        {/* Overall */}
        <div className="flex items-center gap-4 mb-6">
          <div
            className={cn(
              'text-4xl font-bold',
              getHealthColor(repo.healthScore),
            )}
          >
            {repo.healthScore}
          </div>
          <div>
            <p className="text-sm text-gray-500 capitalize">{getHealthLevel(repo.healthScore)}</p>
            {repo.lastReviewAt && (
              <p className="text-xs text-gray-400">
                Last analyzed {formatRelativeTime(repo.lastReviewAt)}
              </p>
            )}
          </div>
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {healthScores.map(({ label, score }) => (
            <div key={label} className="p-3 rounded-lg bg-gray-50">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={cn('text-xl font-bold', getHealthColor(score))}>{score}</p>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mt-2">
                <div
                  className={cn(
                    'h-full rounded-full',
                    score >= 90
                      ? 'bg-green-500'
                      : score >= 70
                        ? 'bg-lime-500'
                        : score >= 50
                          ? 'bg-yellow-500'
                          : 'bg-red-500',
                  )}
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Repo decisions */}
      <div className="card-padded">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          Decisions ({decisions.length})
        </h2>
        {decisionsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
          </div>
        ) : (
          <DecisionTable decisions={decisions} />
        )}
      </div>
    </div>
  );
}
