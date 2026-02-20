/**
 * Issue tracker integration interface.
 * Provides an abstraction layer for optional issue tracker systems
 * (Jira, Linear, GitHub Issues, etc.) to feed into velocity tracking.
 *
 * This module defines the IssueTrackerProvider interface that integrations
 * can implement, and provides aggregation utilities for issue metrics.
 */

import type { IssueData, DeveloperIssueMetrics } from '../types.js';

// ─── Issue Tracker Provider Interface ───────────────────────────────

/**
 * Interface for issue tracker integrations.
 * Implementations should be provided by the integrations package
 * for specific platforms (Jira, Linear, GitHub Issues, etc.).
 */
export interface IssueTrackerProvider {
  /** Unique name of the provider (e.g., 'jira', 'linear', 'github-issues') */
  readonly name: string;

  /**
   * Fetch issues updated or created within a time window.
   *
   * @param projectKey - Project/board identifier
   * @param since - ISO date string start
   * @param until - ISO date string end
   * @returns Array of IssueData
   */
  fetchIssues(
    projectKey: string,
    since: string,
    until: string
  ): Promise<IssueData[]>;

  /**
   * Fetch issues assigned to a specific developer.
   *
   * @param assignee - Developer identifier (email or username)
   * @param since - ISO date string start
   * @param until - ISO date string end
   * @returns Array of IssueData
   */
  fetchIssuesForDeveloper(
    assignee: string,
    since: string,
    until: string
  ): Promise<IssueData[]>;

  /**
   * Check if the provider is configured and available.
   * @returns true if the provider can make API calls
   */
  isAvailable(): Promise<boolean>;
}

// ─── Issue Metrics Aggregation ──────────────────────────────────────

/**
 * Aggregate issue data into per-developer metrics.
 *
 * @param issues - Array of IssueData from any tracker
 * @param periodStart - ISO date string for the start of the period
 * @param periodEnd - ISO date string for the end of the period
 * @returns Array of DeveloperIssueMetrics, one per developer
 */
export function aggregateIssueMetrics(
  issues: IssueData[],
  periodStart: string,
  periodEnd: string
): DeveloperIssueMetrics[] {
  const startTime = new Date(periodStart).getTime();
  const endTime = new Date(periodEnd).getTime();

  // Filter issues resolved within the period
  const periodIssues = issues.filter((issue) => {
    if (!issue.resolvedAt) return false;
    const resolvedTime = new Date(issue.resolvedAt).getTime();
    return resolvedTime >= startTime && resolvedTime <= endTime;
  });

  // Group by assignee
  const byAssignee = new Map<string, IssueData[]>();
  for (const issue of periodIssues) {
    if (!issue.assignee) continue;
    const existing = byAssignee.get(issue.assignee) ?? [];
    existing.push(issue);
    byAssignee.set(issue.assignee, existing);
  }

  const metrics: DeveloperIssueMetrics[] = [];

  for (const [assignee, devIssues] of byAssignee) {
    const completed = devIssues.filter(
      (i) => i.status === 'done' || i.status === 'closed'
    );

    const totalStoryPoints = devIssues.reduce(
      (sum, i) => sum + (i.storyPoints ?? 0),
      0
    );

    // Average cycle time: from creation to resolution
    const cycleTimes = devIssues
      .filter((i) => i.resolvedAt)
      .map(
        (i) =>
          new Date(i.resolvedAt!).getTime() -
          new Date(i.createdAt).getTime()
      );

    const avgCycleTimeMs =
      cycleTimes.length > 0
        ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
        : 0;

    const bugFixCount = devIssues.filter((i) => i.type === 'bug').length;
    const featureCount = devIssues.filter(
      (i) => i.type === 'feature' || i.type === 'story'
    ).length;

    metrics.push({
      developerId: assignee,
      issuesCompleted: completed.length,
      totalStoryPoints,
      avgCycleTimeMs: Math.round(avgCycleTimeMs),
      bugFixCount,
      featureCount,
    });
  }

  return metrics;
}

/**
 * Calculate team-level issue throughput.
 *
 * @param issues - All issues for the team in the period
 * @returns Aggregate throughput metrics
 */
export function calculateIssuesThroughput(issues: IssueData[]): {
  totalResolved: number;
  totalStoryPoints: number;
  avgCycleTimeMs: number;
  bugRatio: number;
  featureRatio: number;
} {
  const resolved = issues.filter(
    (i) => i.status === 'done' || i.status === 'closed'
  );

  const totalStoryPoints = resolved.reduce(
    (sum, i) => sum + (i.storyPoints ?? 0),
    0
  );

  const cycleTimes = resolved
    .filter((i) => i.resolvedAt)
    .map(
      (i) =>
        new Date(i.resolvedAt!).getTime() -
        new Date(i.createdAt).getTime()
    );

  const avgCycleTimeMs =
    cycleTimes.length > 0
      ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
      : 0;

  const bugs = resolved.filter((i) => i.type === 'bug').length;
  const features = resolved.filter(
    (i) => i.type === 'feature' || i.type === 'story'
  ).length;

  return {
    totalResolved: resolved.length,
    totalStoryPoints,
    avgCycleTimeMs: Math.round(avgCycleTimeMs),
    bugRatio:
      resolved.length > 0
        ? Math.round((bugs / resolved.length) * 1000) / 1000
        : 0,
    featureRatio:
      resolved.length > 0
        ? Math.round((features / resolved.length) * 1000) / 1000
        : 0,
  };
}

/**
 * Create a no-op issue tracker provider for when no tracker is configured.
 * Returns empty results for all queries.
 */
export function createNoopIssueTracker(): IssueTrackerProvider {
  return {
    name: 'noop',

    async fetchIssues(): Promise<IssueData[]> {
      return [];
    },

    async fetchIssuesForDeveloper(): Promise<IssueData[]> {
      return [];
    },

    async isAvailable(): Promise<boolean> {
      return false;
    },
  };
}
