'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export type ViolationSeverity = 'error' | 'warning' | 'info';

export interface Violation {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: ViolationSeverity;
  message: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  codeSnippet: string;
  suggestion?: string;
  language: string;
}

export interface ReviewSummaryData {
  id: string;
  repoName: string;
  repoId: string;
  ref: string;
  branch: string;
  commitSha: string;
  triggeredBy: 'push' | 'pull_request' | 'manual' | 'schedule';
  status: 'completed' | 'in_progress' | 'failed';
  createdAt: string;
  completedAt?: string;
  violationCounts: {
    error: number;
    warning: number;
    info: number;
  };
  totalFiles: number;
  filesAnalyzed: number;
}

export interface ReviewDetail extends ReviewSummaryData {
  violations: Violation[];
}

export interface ReviewFilters {
  repoId?: string;
  status?: string;
  triggeredBy?: string;
}

export function useReviews(filters?: ReviewFilters) {
  const [reviews, setReviews] = useState<ReviewSummaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.repoId) params.set('repoId', filters.repoId);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.triggeredBy) params.set('triggeredBy', filters.triggeredBy);
      const query = params.toString();
      const data = await apiFetch<ReviewSummaryData[]>(`/reviews${query ? `?${query}` : ''}`);
      setReviews(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch reviews');
    } finally {
      setLoading(false);
    }
  }, [filters?.repoId, filters?.status, filters?.triggeredBy]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  return { reviews, loading, error, refetch: fetchReviews };
}

export function useReview(id: string) {
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<ReviewDetail>(`/reviews/${id}`);
        setReview(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch review');
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [id]);

  return { review, loading, error };
}
