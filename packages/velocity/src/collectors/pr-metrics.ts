/**
 * Pull request metrics collector.
 * Collects and aggregates PR-level metrics for velocity tracking.
 *
 * Note: Actual GitHub/Bitbucket API calls happen in the integrations package.
 * This module provides the data processing and aggregation logic,
 * operating on PRData[] that has already been fetched.
 */

import type { PRData, DeveloperPRMetrics } from '../types.js';

// ─── PR Aggregation ─────────────────────────────────────────────────

/**
 * Aggregate PR data into per-developer metrics for a given period.
 *
 * @param prs - Array of PRData from the integrations layer
 * @param periodStart - ISO date string for the start of the period
 * @param periodEnd - ISO date string for the end of the period
 * @returns Array of DeveloperPRMetrics, one per developer
 */
export function aggregatePRMetrics(
  prs: PRData[],
  periodStart: string,
  periodEnd: string
): DeveloperPRMetrics[] {
  const startTime = new Date(periodStart).getTime();
  const endTime = new Date(periodEnd).getTime();

  // Filter PRs that fall within the period
  const periodPrs = prs.filter((pr) => {
    const createdTime = new Date(pr.createdAt).getTime();
    return createdTime >= startTime && createdTime <= endTime;
  });

  // Group by author
  const byAuthor = new Map<string, PRData[]>();
  for (const pr of periodPrs) {
    const existing = byAuthor.get(pr.author) ?? [];
    existing.push(pr);
    byAuthor.set(pr.author, existing);
  }

  // Also track reviews given (PRs where a developer appears as reviewer)
  const reviewCounts = new Map<string, number>();
  for (const pr of periodPrs) {
    for (const reviewer of pr.reviewers) {
      reviewCounts.set(reviewer, (reviewCounts.get(reviewer) ?? 0) + 1);
    }
  }

  const metrics: DeveloperPRMetrics[] = [];

  for (const [author, devPrs] of byAuthor) {
    const merged = devPrs.filter((pr) => pr.state === 'merged');
    const closed = devPrs.filter(
      (pr) => pr.state === 'closed' && !pr.mergedAt
    );

    const avgFilesChanged =
      devPrs.length > 0
        ? devPrs.reduce((sum, pr) => sum + pr.filesChanged, 0) / devPrs.length
        : 0;

    const avgLinesChanged =
      devPrs.length > 0
        ? devPrs.reduce(
            (sum, pr) => sum + pr.linesAdded + pr.linesRemoved,
            0
          ) / devPrs.length
        : 0;

    const prsWithMergeTime = merged.filter(
      (pr) => pr.timeToMergeMs !== undefined
    );
    const avgTimeToMergeMs =
      prsWithMergeTime.length > 0
        ? prsWithMergeTime.reduce(
            (sum, pr) => sum + (pr.timeToMergeMs ?? 0),
            0
          ) / prsWithMergeTime.length
        : 0;

    const avgReviewRounds =
      devPrs.length > 0
        ? devPrs.reduce((sum, pr) => sum + pr.reviewRounds, 0) / devPrs.length
        : 0;

    const prsWithViolations = devPrs.filter(
      (pr) => pr.hasArchViolations
    ).length;

    metrics.push({
      developerId: author,
      prsOpened: devPrs.length,
      prsMerged: merged.length,
      prsClosed: closed.length,
      avgFilesChanged: Math.round(avgFilesChanged * 100) / 100,
      avgLinesChanged: Math.round(avgLinesChanged * 100) / 100,
      avgTimeToMergeMs: Math.round(avgTimeToMergeMs),
      avgReviewRounds: Math.round(avgReviewRounds * 100) / 100,
      prsWithViolations,
      reviewsGiven: reviewCounts.get(author) ?? 0,
    });
  }

  // Ensure developers who only reviewed (no authored PRs) are also included
  for (const [reviewer, count] of reviewCounts) {
    if (!byAuthor.has(reviewer)) {
      metrics.push({
        developerId: reviewer,
        prsOpened: 0,
        prsMerged: 0,
        prsClosed: 0,
        avgFilesChanged: 0,
        avgLinesChanged: 0,
        avgTimeToMergeMs: 0,
        avgReviewRounds: 0,
        prsWithViolations: 0,
        reviewsGiven: count,
      });
    }
  }

  return metrics;
}

// ─── PR Size Classification ─────────────────────────────────────────

/** PR size classification */
export type PRSize = 'xs' | 'small' | 'medium' | 'large' | 'xl';

/**
 * Classify a PR by size based on lines changed and files changed.
 * Uses common industry thresholds:
 *   xs:     < 10 lines
 *   small:  10-99 lines
 *   medium: 100-499 lines
 *   large:  500-999 lines
 *   xl:     1000+ lines
 *
 * @param pr - PR data to classify
 * @returns Size classification
 */
export function classifyPRSize(pr: PRData): PRSize {
  const totalLines = pr.linesAdded + pr.linesRemoved;

  if (totalLines < 10) return 'xs';
  if (totalLines < 100) return 'small';
  if (totalLines < 500) return 'medium';
  if (totalLines < 1000) return 'large';
  return 'xl';
}

/**
 * Get PR size distribution for a set of PRs.
 *
 * @param prs - Array of PRData
 * @returns Record mapping size category to count
 */
export function getPRSizeDistribution(
  prs: PRData[]
): Record<PRSize, number> {
  const distribution: Record<PRSize, number> = {
    xs: 0,
    small: 0,
    medium: 0,
    large: 0,
    xl: 0,
  };

  for (const pr of prs) {
    const size = classifyPRSize(pr);
    distribution[size]++;
  }

  return distribution;
}

// ─── Violation Analysis ─────────────────────────────────────────────

/**
 * Get the count and ratio of PRs with architectural violations.
 *
 * @param prs - Array of PRData
 * @returns Object with count and ratio
 */
export function getViolationStats(prs: PRData[]): {
  total: number;
  withViolations: number;
  violationRatio: number;
  totalViolationCount: number;
} {
  const withViolations = prs.filter((pr) => pr.hasArchViolations).length;
  const totalViolationCount = prs.reduce(
    (sum, pr) => sum + pr.violationCount,
    0
  );

  return {
    total: prs.length,
    withViolations,
    violationRatio:
      prs.length > 0
        ? Math.round((withViolations / prs.length) * 1000) / 1000
        : 0,
    totalViolationCount,
  };
}

// ─── Review Throughput ──────────────────────────────────────────────

/**
 * Calculate review throughput metrics.
 *
 * @param prs - Array of PRData
 * @returns Review throughput statistics
 */
export function calculateReviewThroughput(prs: PRData[]): {
  avgTimeToFirstReviewMs: number;
  avgTimeToMergeMs: number;
  avgReviewRounds: number;
  prsWithoutReview: number;
} {
  const withFirstReview = prs.filter(
    (pr) => pr.timeToFirstReviewMs !== undefined
  );
  const withMergeTime = prs.filter(
    (pr) => pr.timeToMergeMs !== undefined
  );
  const withoutReview = prs.filter(
    (pr) => pr.reviewers.length === 0 && pr.state === 'merged'
  );

  const avgTimeToFirstReviewMs =
    withFirstReview.length > 0
      ? withFirstReview.reduce(
          (sum, pr) => sum + (pr.timeToFirstReviewMs ?? 0),
          0
        ) / withFirstReview.length
      : 0;

  const avgTimeToMergeMs =
    withMergeTime.length > 0
      ? withMergeTime.reduce(
          (sum, pr) => sum + (pr.timeToMergeMs ?? 0),
          0
        ) / withMergeTime.length
      : 0;

  const avgReviewRounds =
    prs.length > 0
      ? prs.reduce((sum, pr) => sum + pr.reviewRounds, 0) / prs.length
      : 0;

  return {
    avgTimeToFirstReviewMs: Math.round(avgTimeToFirstReviewMs),
    avgTimeToMergeMs: Math.round(avgTimeToMergeMs),
    avgReviewRounds: Math.round(avgReviewRounds * 100) / 100,
    prsWithoutReview: withoutReview.length,
  };
}
