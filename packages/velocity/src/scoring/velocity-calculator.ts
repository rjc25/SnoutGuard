/**
 * Rolling velocity calculator.
 * Combines weighted effort, architectural impact, review contribution,
 * and refactoring ratio into per-developer and team velocity scores.
 *
 * Uses configurable weights from SnoutGuardConfig.velocity.
 */

import { clamp } from '@snoutguard/core';
import type {
  SnoutGuardConfig,
  VelocityScore,
  VelocityPeriod,
  VelocityTrend,
  TeamVelocity,
  Blocker,
} from '../types.js';
import type { EffortScore, ImpactScore, GitMetrics, DeveloperPRMetrics } from '../types.js';

// ─── Configuration ──────────────────────────────────────────────────

/** Default weights if config is not available */
const DEFAULT_WEIGHTS = {
  complexityWeight: 0.4,
  archImpactWeight: 0.3,
  reviewWeight: 0.15,
  refactoringWeight: 0.15,
};

/** Number of recent periods to use for trend detection */
const TREND_WINDOW_SIZE = 3;

/** Threshold for significant score change to trigger trend change */
const TREND_CHANGE_THRESHOLD = 10;

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Input data for velocity calculation.
 */
export interface VelocityInput {
  gitMetrics: GitMetrics[];
  effortScores: EffortScore[];
  impactScores: ImpactScore[];
  prMetrics: DeveloperPRMetrics[];
  refactoringRatios: Map<string, number>;
  blockers: Blocker[];
  period: VelocityPeriod;
  periodStart: string;
  periodEnd: string;
  previousScores?: VelocityScore[];
}

/**
 * Calculate velocity scores for all developers in the period.
 *
 * @param input - All collected metrics and scores
 * @param config - SnoutGuard configuration with velocity weights
 * @returns Array of VelocityScore, one per developer
 */
export function calculateDeveloperVelocityScores(
  input: VelocityInput,
  config?: SnoutGuardConfig
): VelocityScore[] {
  const weights = extractWeights(config);
  const scores: VelocityScore[] = [];

  // Get all unique developer IDs
  const developerIds = new Set<string>();
  for (const m of input.gitMetrics) developerIds.add(m.developerId);
  for (const e of input.effortScores) developerIds.add(e.developerId);
  for (const i of input.impactScores) developerIds.add(i.developerId);
  for (const p of input.prMetrics) developerIds.add(p.developerId);

  for (const devId of developerIds) {
    const git = input.gitMetrics.find((m) => m.developerId === devId);
    const effort = input.effortScores.find((e) => e.developerId === devId);
    const impact = input.impactScores.find((i) => i.developerId === devId);
    const pr = input.prMetrics.find((p) => p.developerId === devId);
    const refactoringRatio = input.refactoringRatios.get(devId) ?? 0;

    // Calculate the weighted velocity score
    const weightedEffort = (effort?.normalizedScore ?? 0) * weights.complexityWeight;
    const architecturalImpact = (impact?.normalizedScore ?? 0) * weights.archImpactWeight;
    const reviewContribution = calculateReviewScore(pr) * weights.reviewWeight;
    const refactoringScore = refactoringRatio * 100 * weights.refactoringWeight;

    const velocityScoreRaw =
      weightedEffort + architecturalImpact + reviewContribution + refactoringScore;

    const velocityScore = clamp(
      Math.round(velocityScoreRaw * 100) / 100,
      0,
      100
    );

    // Determine trend from previous scores
    const previousDeveloperScores = (input.previousScores ?? []).filter(
      (s) => s.developerId === devId
    );
    const trend = determineTrend(velocityScore, previousDeveloperScores);

    // Find blockers related to this developer
    const devBlockers = input.blockers.filter(
      (b) => b.relatedEntity === devId || b.relatedEntity.includes(devId)
    );

    scores.push({
      developerId: devId,
      period: input.period,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      commits: git?.commits ?? 0,
      prsOpened: pr?.prsOpened ?? 0,
      prsMerged: pr?.prsMerged ?? 0,
      linesAdded: git?.linesAdded ?? 0,
      linesRemoved: git?.linesRemoved ?? 0,
      weightedEffort: effort?.normalizedScore ?? 0,
      architecturalImpact: impact?.normalizedScore ?? 0,
      refactoringRatio: Math.round(refactoringRatio * 1000) / 1000,
      reviewContribution: Math.round(calculateReviewScore(pr) * 100) / 100,
      velocityScore,
      trend,
      blockers: devBlockers,
    });
  }

  return scores;
}

/**
 * Calculate aggregated team velocity from individual developer scores.
 *
 * @param developerScores - Per-developer velocity scores
 * @param teamId - Team identifier
 * @param blockers - All detected blockers
 * @param archHealthScore - Architectural health score (0-100, optional)
 * @returns TeamVelocity aggregate
 */
export function calculateTeamVelocity(
  developerScores: VelocityScore[],
  teamId: string,
  blockers: Blocker[],
  archHealthScore?: number
): TeamVelocity {
  if (developerScores.length === 0) {
    return {
      teamId,
      period: 'weekly',
      periodStart: new Date().toISOString(),
      periodEnd: new Date().toISOString(),
      members: [],
      teamVelocityScore: 0,
      topBlockers: [],
      architecturalHealth: archHealthScore ?? 100,
      highlights: ['No developer activity recorded for this period.'],
    };
  }

  // Aggregate team score as weighted average
  const teamVelocityScore =
    developerScores.reduce((sum, s) => sum + s.velocityScore, 0) /
    developerScores.length;

  // Sort blockers by severity for top blockers
  const sortedBlockers = [...blockers].sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
  const topBlockers = sortedBlockers.slice(0, 5);

  // Generate highlights
  const highlights = generateHighlights(developerScores, blockers);

  // Determine the period from the first developer score
  const period = developerScores[0].period;
  const periodStart = developerScores[0].periodStart;
  const periodEnd = developerScores[0].periodEnd;

  return {
    teamId,
    period,
    periodStart,
    periodEnd,
    members: developerScores,
    teamVelocityScore: Math.round(teamVelocityScore * 100) / 100,
    topBlockers,
    architecturalHealth: archHealthScore ?? calculateDefaultArchHealth(developerScores),
    highlights,
  };
}

/**
 * Calculate the rolling velocity trend by comparing the current score
 * to recent historical scores.
 *
 * @param currentScore - The current period's velocity score
 * @param previousScores - Previous period scores (most recent first)
 * @returns VelocityTrend direction
 */
export function determineTrend(
  currentScore: number,
  previousScores: VelocityScore[]
): VelocityTrend {
  if (previousScores.length < 2) {
    return 'stable';
  }

  // Take the most recent scores for trend analysis
  const recentScores = previousScores
    .slice(0, TREND_WINDOW_SIZE)
    .map((s) => s.velocityScore);

  const avgPrevious =
    recentScores.reduce((sum, s) => sum + s, 0) / recentScores.length;

  const delta = currentScore - avgPrevious;

  if (delta > TREND_CHANGE_THRESHOLD) {
    return 'accelerating';
  }
  if (delta < -TREND_CHANGE_THRESHOLD) {
    return 'decelerating';
  }
  return 'stable';
}

// ─── Internal Helpers ───────────────────────────────────────────────

/**
 * Extract velocity weights from config, falling back to defaults.
 */
function extractWeights(config?: SnoutGuardConfig): {
  complexityWeight: number;
  archImpactWeight: number;
  reviewWeight: number;
  refactoringWeight: number;
} {
  if (!config?.velocity) {
    return DEFAULT_WEIGHTS;
  }

  const v = config.velocity;

  // Ensure weights sum to 1.0
  const total =
    v.complexityWeight +
    v.archImpactWeight +
    v.reviewWeight +
    v.refactoringWeight;

  if (Math.abs(total - 1.0) > 0.01) {
    // Normalize weights to sum to 1.0
    return {
      complexityWeight: v.complexityWeight / total,
      archImpactWeight: v.archImpactWeight / total,
      reviewWeight: v.reviewWeight / total,
      refactoringWeight: v.refactoringWeight / total,
    };
  }

  return {
    complexityWeight: v.complexityWeight,
    archImpactWeight: v.archImpactWeight,
    reviewWeight: v.reviewWeight,
    refactoringWeight: v.refactoringWeight,
  };
}

/**
 * Calculate a review contribution score from PR metrics.
 * Considers reviews given, PRs merged, and review thoroughness.
 * Returns a score on the 0-100 scale.
 */
function calculateReviewScore(pr: DeveloperPRMetrics | undefined): number {
  if (!pr) return 0;

  // Reviews given is the primary metric
  const reviewScore = Math.min(pr.reviewsGiven * 10, 50);

  // PRs merged with few review rounds indicates clean code
  const mergeEfficiency =
    pr.prsMerged > 0 && pr.avgReviewRounds > 0
      ? Math.min((pr.prsMerged / Math.max(pr.avgReviewRounds, 1)) * 10, 30)
      : 0;

  // Penalty for PRs with violations
  const violationPenalty =
    pr.prsOpened > 0
      ? (pr.prsWithViolations / pr.prsOpened) * 20
      : 0;

  return clamp(
    Math.round((reviewScore + mergeEfficiency - violationPenalty) * 100) / 100,
    0,
    100
  );
}

/**
 * Generate human-readable highlights for the team velocity report.
 */
function generateHighlights(
  scores: VelocityScore[],
  blockers: Blocker[]
): string[] {
  const highlights: string[] = [];

  if (scores.length === 0) return highlights;

  // Top contributor
  const sorted = [...scores].sort(
    (a, b) => b.velocityScore - a.velocityScore
  );
  if (sorted[0]) {
    highlights.push(
      `Top contributor: ${sorted[0].developerId} (velocity score: ${sorted[0].velocityScore})`
    );
  }

  // Team average
  const avgScore =
    scores.reduce((sum, s) => sum + s.velocityScore, 0) / scores.length;
  highlights.push(
    `Team average velocity: ${Math.round(avgScore * 100) / 100}`
  );

  // Trend summary
  const accelerating = scores.filter(
    (s) => s.trend === 'accelerating'
  ).length;
  const decelerating = scores.filter(
    (s) => s.trend === 'decelerating'
  ).length;

  if (accelerating > 0) {
    highlights.push(
      `${accelerating} team member${accelerating > 1 ? 's' : ''} accelerating`
    );
  }
  if (decelerating > 0) {
    highlights.push(
      `${decelerating} team member${decelerating > 1 ? 's' : ''} decelerating`
    );
  }

  // Blockers summary
  const highBlockers = blockers.filter((b) => b.severity === 'high').length;
  if (highBlockers > 0) {
    highlights.push(
      `${highBlockers} high-severity blocker${highBlockers > 1 ? 's' : ''} detected`
    );
  }

  // Total activity
  const totalCommits = scores.reduce((sum, s) => sum + s.commits, 0);
  const totalPRsMerged = scores.reduce((sum, s) => sum + s.prsMerged, 0);
  highlights.push(
    `Total: ${totalCommits} commits, ${totalPRsMerged} PRs merged`
  );

  return highlights;
}

/**
 * Calculate a default architectural health score from developer scores.
 * Based on refactoring ratio and violation-related blockers.
 */
function calculateDefaultArchHealth(scores: VelocityScore[]): number {
  if (scores.length === 0) return 100;

  const avgRefactoring =
    scores.reduce((sum, s) => sum + s.refactoringRatio, 0) / scores.length;

  // Base health starts at 80 and goes up with refactoring
  const healthBoost = avgRefactoring * 20;

  // Penalty for blockers
  const totalBlockers = scores.reduce(
    (sum, s) => sum + s.blockers.length,
    0
  );
  const blockerPenalty = Math.min(totalBlockers * 5, 30);

  return clamp(
    Math.round((80 + healthBoost - blockerPenalty) * 100) / 100,
    0,
    100
  );
}
