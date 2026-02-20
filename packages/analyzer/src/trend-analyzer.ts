/**
 * Trend analysis across time windows.
 * Tracks how architectural decisions, drift scores, and dependency stats
 * change over configurable time periods.
 */

import type { ArchSnapshot, DriftEvent } from '@snoutguard/core';

/** A trend data point for charting */
export interface TrendDataPoint {
  date: string;
  driftScore: number;
  decisionCount: number;
  circularDeps: number;
  avgCoupling: number;
}

/** Trend summary for a time window */
export interface TrendSummary {
  timeWindow: string;
  startDate: string;
  endDate: string;
  dataPoints: TrendDataPoint[];
  driftTrend: 'improving' | 'stable' | 'degrading';
  avgDriftScore: number;
  decisionStability: number;
  couplingTrend: 'improving' | 'stable' | 'degrading';
  topDriftEvents: DriftEvent[];
}

/**
 * Analyze architectural trends over a series of snapshots.
 */
export function analyzeTrends(
  snapshots: ArchSnapshot[],
  driftEvents: DriftEvent[],
  timeWindow: '1mo' | '3mo' | '6mo' | '12mo' = '3mo'
): TrendSummary {
  const windowMs = getWindowMs(timeWindow);
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  // Filter snapshots within the window
  const windowSnapshots = snapshots
    .filter((s) => s.createdAt >= cutoff)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Filter events within the window
  const windowEvents = driftEvents
    .filter((e) => e.detectedAt >= cutoff)
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));

  // Build data points
  const dataPoints: TrendDataPoint[] = windowSnapshots.map((s) => ({
    date: s.createdAt,
    driftScore: s.driftScore,
    decisionCount: s.decisions.length,
    circularDeps: s.dependencyStats.circularDeps,
    avgCoupling: s.dependencyStats.avgCoupling,
  }));

  // Calculate trend directions
  const driftTrend = calculateTrend(dataPoints.map((d) => d.driftScore));
  const couplingTrend = calculateTrend(dataPoints.map((d) => d.avgCoupling));

  // Calculate decision stability (how consistent decisions are)
  const decisionStability = calculateDecisionStability(windowSnapshots);

  // Average drift score
  const avgDriftScore =
    dataPoints.length > 0
      ? dataPoints.reduce((sum, d) => sum + d.driftScore, 0) / dataPoints.length
      : 0;

  return {
    timeWindow,
    startDate: cutoff,
    endDate: new Date().toISOString(),
    dataPoints,
    driftTrend,
    avgDriftScore,
    decisionStability,
    couplingTrend,
    topDriftEvents: windowEvents.slice(0, 10),
  };
}

/** Convert time window string to milliseconds */
function getWindowMs(window: string): number {
  const map: Record<string, number> = {
    '1mo': 30 * 24 * 60 * 60 * 1000,
    '3mo': 90 * 24 * 60 * 60 * 1000,
    '6mo': 180 * 24 * 60 * 60 * 1000,
    '12mo': 365 * 24 * 60 * 60 * 1000,
  };
  return map[window] || map['3mo'];
}

/** Determine trend direction from a series of values */
function calculateTrend(
  values: number[]
): 'improving' | 'stable' | 'degrading' {
  if (values.length < 2) return 'stable';

  // Simple linear regression
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) ** 2;
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;

  // For drift/coupling, increasing = degrading
  if (slope > 0.05) return 'degrading';
  if (slope < -0.05) return 'improving';
  return 'stable';
}

/**
 * Calculate decision stability — how consistent decisions are across snapshots.
 * Returns 0-1 where 1 means perfectly stable.
 */
function calculateDecisionStability(snapshots: ArchSnapshot[]): number {
  if (snapshots.length < 2) return 1;

  let totalChanges = 0;
  let totalComparisons = 0;

  for (let i = 1; i < snapshots.length; i++) {
    const prev = new Set(snapshots[i - 1].decisions.map((d) => d.title));
    const curr = new Set(snapshots[i].decisions.map((d) => d.title));

    const added = [...curr].filter((t) => !prev.has(t)).length;
    const removed = [...prev].filter((t) => !curr.has(t)).length;
    const maxSize = Math.max(prev.size, curr.size, 1);

    totalChanges += (added + removed) / maxSize;
    totalComparisons++;
  }

  const avgChangeRate = totalComparisons > 0 ? totalChanges / totalComparisons : 0;
  return Math.max(0, 1 - avgChangeRate);
}
