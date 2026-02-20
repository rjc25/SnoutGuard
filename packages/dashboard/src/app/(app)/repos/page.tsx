'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  GitFork,
  Plus,
  RefreshCw,
  Star,
} from 'lucide-react';
import { cn, formatRelativeTime, getHealthColor, getHealthLevel } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface Repository {
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
}

export default function ReposPage() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRepos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Repository[]>('/repos');
      setRepos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch repositories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Repositories</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage connected repositories and monitor their health.
          </p>
        </div>
        <button type="button" className="btn-primary gap-2">
          <Plus className="w-4 h-4" /> Connect Repository
        </button>
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
          <button type="button" onClick={fetchRepos} className="btn-secondary gap-2 mt-3">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      )}

      {/* Repo grid */}
      {!loading && !error && (
        <>
          <p className="text-sm text-gray-500">
            {repos.length} repositor{repos.length !== 1 ? 'ies' : 'y'} connected
          </p>
          {repos.length === 0 ? (
            <div className="card-padded text-center py-12">
              <GitFork className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700">No repositories connected</h3>
              <p className="text-sm text-gray-500 mt-1 mb-4">
                Connect a repository to start monitoring architectural health.
              </p>
              <button type="button" className="btn-primary gap-2">
                <Plus className="w-4 h-4" /> Connect Repository
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {repos.map((repo) => (
                <Link key={repo.id} href={`/repos/${repo.id}`} className="block">
                  <div className="card p-5 hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {repo.name}
                        </h3>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">{repo.fullName}</p>
                      </div>
                      <a
                        href={repo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-brand-600 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>

                    {/* Health score */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-500">Health Score</span>
                        <span className={cn('font-bold', getHealthColor(repo.healthScore))}>
                          {repo.healthScore}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            repo.healthScore >= 90
                              ? 'bg-green-500'
                              : repo.healthScore >= 70
                                ? 'bg-lime-500'
                                : repo.healthScore >= 50
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500',
                          )}
                          style={{ width: `${repo.healthScore}%` }}
                        />
                      </div>
                      <p className="text-2xs text-gray-400 mt-1 capitalize">
                        {getHealthLevel(repo.healthScore)}
                      </p>
                    </div>

                    {/* Footer info */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5" />
                        {repo.decisionsCount} decisions
                      </span>
                      <span>
                        {repo.lastReviewAt
                          ? `Last review ${formatRelativeTime(repo.lastReviewAt)}`
                          : 'No reviews yet'}
                      </span>
                    </div>

                    {/* Provider badge */}
                    <div className="mt-2">
                      <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-2xs font-medium text-gray-600 capitalize">
                        {repo.provider}
                      </span>
                      <span className="text-2xs text-gray-400 ml-2">
                        {repo.defaultBranch}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
