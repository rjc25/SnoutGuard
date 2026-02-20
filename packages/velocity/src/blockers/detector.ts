/**
 * Development blocker detector.
 * Identifies blockers that impede team velocity:
 *   - Stalled PRs (no activity for >N days, configurable)
 *   - Long-lived branches (open >N days)
 *   - Review bottlenecks (devs with >3 PRs awaiting review)
 *   - High violation rates
 *
 * Returns Blocker[] with types from @archguard/core.
 */

import type {
  Blocker,
  BlockerType,
  ArchGuardConfig,
} from '@archguard/core';
import type { PRData, DeveloperPRMetrics } from '../types.js';

// ─── Configuration Defaults ─────────────────────────────────────────

/** Default number of days before a PR is considered stalled */
const DEFAULT_STALE_PR_DAYS = 3;

/** Default number of days before a branch is considered long-lived */
const DEFAULT_LONG_BRANCH_DAYS = 7;

/** Default threshold for review bottleneck (PRs awaiting review) */
const DEFAULT_REVIEW_BOTTLENECK_THRESHOLD = 3;

/** Default violation rate threshold (ratio of PRs with violations) */
const DEFAULT_HIGH_VIOLATION_RATE = 0.5;

/** Milliseconds in a day */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Configuration for blocker detection thresholds.
 */
export interface BlockerDetectionConfig {
  stalePrDays: number;
  longBranchDays: number;
  reviewBottleneckThreshold: number;
  highViolationRate: number;
}

/**
 * Detect all blockers from current PR data and metrics.
 *
 * @param openPrs - Currently open PRs
 * @param prMetrics - Aggregated developer PR metrics
 * @param config - ArchGuard configuration (optional, for thresholds)
 * @returns Array of detected Blocker objects
 */
export function detectBlockers(
  openPrs: PRData[],
  prMetrics: DeveloperPRMetrics[],
  config?: ArchGuardConfig
): Blocker[] {
  const thresholds = extractThresholds(config);
  const now = Date.now();

  const blockers: Blocker[] = [];

  // Detect each type of blocker
  blockers.push(...detectStalledPrs(openPrs, thresholds.stalePrDays, now));
  blockers.push(
    ...detectLongLivedBranches(openPrs, thresholds.longBranchDays, now)
  );
  blockers.push(
    ...detectReviewBottlenecks(
      openPrs,
      thresholds.reviewBottleneckThreshold
    )
  );
  blockers.push(
    ...detectHighViolationRates(prMetrics, openPrs, thresholds.highViolationRate)
  );

  return blockers;
}

/**
 * Detect stalled PRs (no activity for more than N days).
 *
 * @param openPrs - Currently open PRs
 * @param staleDays - Number of days of inactivity before a PR is stalled
 * @param nowMs - Current timestamp in milliseconds
 * @returns Array of Blocker for stalled PRs
 */
export function detectStalledPrs(
  openPrs: PRData[],
  staleDays: number = DEFAULT_STALE_PR_DAYS,
  nowMs: number = Date.now()
): Blocker[] {
  const staleThresholdMs = staleDays * MS_PER_DAY;
  const blockers: Blocker[] = [];

  for (const pr of openPrs) {
    if (pr.state !== 'open') continue;

    const lastActivity = new Date(pr.updatedAt).getTime();
    const inactivityMs = nowMs - lastActivity;

    if (inactivityMs > staleThresholdMs) {
      const staleDaysCount = Math.floor(inactivityMs / MS_PER_DAY);

      blockers.push({
        type: 'stalled_pr' as BlockerType,
        description: `PR #${pr.number} "${pr.title}" has had no activity for ${staleDaysCount} days (author: ${pr.author})`,
        severity: staleDaysCount > staleDays * 2 ? 'high' : 'medium',
        relatedEntity: pr.author,
        staleSince: pr.updatedAt,
      });
    }
  }

  return blockers;
}

/**
 * Detect long-lived branches (open for more than N days).
 *
 * @param openPrs - Currently open PRs
 * @param longBranchDays - Maximum days a branch should be open
 * @param nowMs - Current timestamp in milliseconds
 * @returns Array of Blocker for long-lived branches
 */
export function detectLongLivedBranches(
  openPrs: PRData[],
  longBranchDays: number = DEFAULT_LONG_BRANCH_DAYS,
  nowMs: number = Date.now()
): Blocker[] {
  const branchThresholdMs = longBranchDays * MS_PER_DAY;
  const blockers: Blocker[] = [];

  for (const pr of openPrs) {
    if (pr.state !== 'open') continue;

    const createdAt = new Date(pr.createdAt).getTime();
    const ageMs = nowMs - createdAt;

    if (ageMs > branchThresholdMs) {
      const ageDays = Math.floor(ageMs / MS_PER_DAY);

      blockers.push({
        type: 'long_lived_branch' as BlockerType,
        description: `Branch "${pr.branchName}" has been open for ${ageDays} days via PR #${pr.number} (author: ${pr.author})`,
        severity: ageDays > longBranchDays * 2 ? 'high' : 'medium',
        relatedEntity: pr.author,
        staleSince: pr.createdAt,
      });
    }
  }

  return blockers;
}

/**
 * Detect review bottlenecks (developers with too many PRs awaiting their review).
 *
 * @param openPrs - Currently open PRs
 * @param threshold - Number of PRs before a reviewer is a bottleneck
 * @returns Array of Blocker for review bottlenecks
 */
export function detectReviewBottlenecks(
  openPrs: PRData[],
  threshold: number = DEFAULT_REVIEW_BOTTLENECK_THRESHOLD
): Blocker[] {
  const blockers: Blocker[] = [];

  // Count how many open PRs each reviewer has pending
  const reviewerCounts = new Map<string, number>();
  const reviewerPrs = new Map<string, PRData[]>();

  for (const pr of openPrs) {
    if (pr.state !== 'open') continue;

    for (const reviewer of pr.reviewers) {
      reviewerCounts.set(
        reviewer,
        (reviewerCounts.get(reviewer) ?? 0) + 1
      );

      const existing = reviewerPrs.get(reviewer) ?? [];
      existing.push(pr);
      reviewerPrs.set(reviewer, existing);
    }
  }

  for (const [reviewer, count] of reviewerCounts) {
    if (count > threshold) {
      const prNumbers = (reviewerPrs.get(reviewer) ?? [])
        .map((pr) => `#${pr.number}`)
        .join(', ');

      blockers.push({
        type: 'review_bottleneck' as BlockerType,
        description: `${reviewer} has ${count} PRs awaiting review (${prNumbers}), exceeding the threshold of ${threshold}`,
        severity: count > threshold * 2 ? 'high' : 'medium',
        relatedEntity: reviewer,
      });
    }
  }

  return blockers;
}

/**
 * Detect developers or teams with high violation rates.
 *
 * @param prMetrics - Aggregated developer PR metrics
 * @param allPrs - All PRs for the period
 * @param violationRateThreshold - Ratio of PRs with violations that triggers a blocker
 * @returns Array of Blocker for high violation rates
 */
export function detectHighViolationRates(
  prMetrics: DeveloperPRMetrics[],
  allPrs: PRData[],
  violationRateThreshold: number = DEFAULT_HIGH_VIOLATION_RATE
): Blocker[] {
  const blockers: Blocker[] = [];

  for (const metrics of prMetrics) {
    if (metrics.prsOpened === 0) continue;

    const violationRate = metrics.prsWithViolations / metrics.prsOpened;

    if (violationRate >= violationRateThreshold && metrics.prsWithViolations > 0) {
      // Find the actual PRs with violations for detail
      const violatingPrs = allPrs.filter(
        (pr) =>
          pr.author === metrics.developerId && pr.hasArchViolations
      );
      const totalViolations = violatingPrs.reduce(
        (sum, pr) => sum + pr.violationCount,
        0
      );

      blockers.push({
        type: 'high_violation_rate' as BlockerType,
        description: `${metrics.developerId} has architectural violations in ${metrics.prsWithViolations} of ${metrics.prsOpened} PRs (${Math.round(violationRate * 100)}% rate, ${totalViolations} total violations)`,
        severity:
          violationRate >= 0.75 ? 'high' : violationRate >= 0.5 ? 'medium' : 'low',
        relatedEntity: metrics.developerId,
      });
    }
  }

  // Also check team-wide violation rate
  const totalPrs = allPrs.length;
  const totalWithViolations = allPrs.filter(
    (pr) => pr.hasArchViolations
  ).length;

  if (
    totalPrs > 0 &&
    totalWithViolations / totalPrs >= violationRateThreshold
  ) {
    blockers.push({
      type: 'high_violation_rate' as BlockerType,
      description: `Team-wide architectural violation rate is ${Math.round((totalWithViolations / totalPrs) * 100)}% (${totalWithViolations} of ${totalPrs} PRs)`,
      severity: 'high',
      relatedEntity: 'team',
    });
  }

  return blockers;
}

// ─── Internal Helpers ───────────────────────────────────────────────

/**
 * Extract blocker detection thresholds from config.
 */
function extractThresholds(
  config?: ArchGuardConfig
): BlockerDetectionConfig {
  if (!config?.velocity) {
    return {
      stalePrDays: DEFAULT_STALE_PR_DAYS,
      longBranchDays: DEFAULT_LONG_BRANCH_DAYS,
      reviewBottleneckThreshold: DEFAULT_REVIEW_BOTTLENECK_THRESHOLD,
      highViolationRate: DEFAULT_HIGH_VIOLATION_RATE,
    };
  }

  return {
    stalePrDays: config.velocity.stalePrDays ?? DEFAULT_STALE_PR_DAYS,
    longBranchDays:
      config.velocity.longBranchDays ?? DEFAULT_LONG_BRANCH_DAYS,
    reviewBottleneckThreshold: DEFAULT_REVIEW_BOTTLENECK_THRESHOLD,
    highViolationRate: DEFAULT_HIGH_VIOLATION_RATE,
  };
}
