'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export interface VelocityDataPoint {
  date: string;
  score: number;
  avg7d: number;
  avg30d: number;
}

export interface DeveloperVelocity {
  devId: string;
  name: string;
  avatarUrl?: string;
  score: number;
  trend: 'up' | 'down' | 'stable';
  trendDelta: number;
  prsOpened: number;
  prsMerged: number;
  reviewsDone: number;
  avgCycleTimeHours: number;
  linesAdded: number;
  linesRemoved: number;
}

export interface Blocker {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  assignee?: string;
  createdAt: string;
  prUrl?: string;
  status: 'open' | 'resolved';
}

export interface TeamVelocityData {
  timeline: VelocityDataPoint[];
  developers: DeveloperVelocity[];
  blockers: Blocker[];
  teamAvgScore: number;
  teamTrend: 'up' | 'down' | 'stable';
}

export interface DeveloperDetailData {
  developer: DeveloperVelocity;
  timeline: VelocityDataPoint[];
  prMetrics: {
    totalPrs: number;
    avgTimeToMergeHours: number;
    avgReviewTimeHours: number;
    approvalRate: number;
  };
  contributions: {
    week: string;
    commits: number;
    prsOpened: number;
    prsMerged: number;
    reviewsDone: number;
  }[];
}

export function useTeamVelocity() {
  const [data, setData] = useState<TeamVelocityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<TeamVelocityData>('/velocity/team');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch velocity data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useDeveloperVelocity(devId: string) {
  const [data, setData] = useState<DeveloperDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      setError(null);
      try {
        const result = await apiFetch<DeveloperDetailData>(`/velocity/developers/${devId}`);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch developer data');
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [devId]);

  return { data, loading, error };
}
