'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export type DecisionCategory =
  | 'architecture'
  | 'pattern'
  | 'dependency'
  | 'convention'
  | 'security'
  | 'performance';

export type DecisionStatus = 'active' | 'pending' | 'deprecated' | 'superseded';

export interface DecisionEvidence {
  id: string;
  filePath: string;
  snippet: string;
  language: string;
  lineStart: number;
  lineEnd: number;
  explanation: string;
}

export interface Decision {
  id: string;
  title: string;
  description: string;
  category: DecisionCategory;
  status: DecisionStatus;
  confidence: number;
  tags: string[];
  evidence: DecisionEvidence[];
  relatedDecisionIds: string[];
  constraints: string[];
  createdAt: string;
  updatedAt: string;
  source: 'inferred' | 'manual' | 'imported';
  repoId: string;
}

export interface DecisionFilters {
  category?: DecisionCategory;
  status?: DecisionStatus;
  search?: string;
  repoId?: string;
}

export function useDecisions(filters?: DecisionFilters) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDecisions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.category) params.set('category', filters.category);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.repoId) params.set('repoId', filters.repoId);
      const query = params.toString();
      const data = await apiFetch<Decision[]>(`/decisions${query ? `?${query}` : ''}`);
      setDecisions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch decisions');
    } finally {
      setLoading(false);
    }
  }, [filters?.category, filters?.status, filters?.search, filters?.repoId]);

  useEffect(() => {
    fetchDecisions();
  }, [fetchDecisions]);

  return { decisions, loading, error, refetch: fetchDecisions };
}

export function useDecision(id: string) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<Decision>(`/decisions/${id}`);
        setDecision(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch decision');
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [id]);

  const confirm = useCallback(async () => {
    try {
      const data = await apiFetch<Decision>(`/decisions/${id}/confirm`, { method: 'POST' });
      setDecision(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm decision');
    }
  }, [id]);

  const deprecate = useCallback(async () => {
    try {
      const data = await apiFetch<Decision>(`/decisions/${id}/deprecate`, { method: 'POST' });
      setDecision(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deprecate decision');
    }
  }, [id]);

  return { decision, loading, error, confirm, deprecate };
}
