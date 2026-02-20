/**
 * @archguard/velocity - Management Agent: Team Velocity Tracker
 *
 * Orchestrates collection of git stats, complexity analysis, PR metrics,
 * and issue tracking data to produce per-developer and team velocity scores.
 *
 * Main entry point: calculateVelocity()
 */

import type { SimpleGit } from 'simple-git';
import {
  createGitClient,
  getDiff,
  loadConfig,
  type ArchGuardConfig,
  type ArchDecision,
  type Violation,
  type VelocityScore,
  type VelocityPeriod,
  type TeamVelocity,
  type Blocker,
} from '@archguard/core';
import type { DependencyGraph } from '@archguard/analyzer';

// Re-export types
export * from './types.js';

// Re-export collectors
export { collectGitStats, collectGitStatsForDeveloper, totalLinesChanged, getDominantFileType } from './collectors/git-stats.js';
export {
  calculateFunctionComplexity,
  calculateFileComplexity,
  calculateComplexityDeltas,
  calculateComplexityFromDiffs,
  calculateRefactoringRatio,
} from './collectors/complexity.js';
export {
  aggregatePRMetrics,
  classifyPRSize,
  getPRSizeDistribution,
  getViolationStats,
  calculateReviewThroughput,
  type PRSize,
} from './collectors/pr-metrics.js';
export {
  aggregateIssueMetrics,
  calculateIssuesThroughput,
  createNoopIssueTracker,
  type IssueTrackerProvider,
} from './collectors/issue-tracker.js';

// Re-export scoring
export { calculateEffortScores, calculateSingleEffortScore, getComplexityMultiplier } from './scoring/effort-model.js';
export { calculateImpactScores, calculateSingleImpactScore, identifyCoreModules } from './scoring/impact-score.js';
export {
  calculateDeveloperVelocityScores,
  calculateTeamVelocity,
  determineTrend,
  type VelocityInput,
} from './scoring/velocity-calculator.js';

// Re-export blockers
export {
  detectBlockers,
  detectStalledPrs,
  detectLongLivedBranches,
  detectReviewBottlenecks,
  detectHighViolationRates,
  type BlockerDetectionConfig,
} from './blockers/detector.js';
export {
  formatBlockerAlerts,
  formatAsSlackBlocks,
  formatSingleBlocker,
  filterBySeverity,
} from './blockers/alerts.js';

// Internal imports for the orchestrator
import { collectGitStats } from './collectors/git-stats.js';
import { calculateComplexityFromDiffs, calculateRefactoringRatio } from './collectors/complexity.js';
import { aggregatePRMetrics } from './collectors/pr-metrics.js';
import { calculateEffortScores } from './scoring/effort-model.js';
import { calculateImpactScores } from './scoring/impact-score.js';
import {
  calculateDeveloperVelocityScores,
  calculateTeamVelocity,
  type VelocityInput,
} from './scoring/velocity-calculator.js';
import { detectBlockers } from './blockers/detector.js';
import type { PRData, DeveloperPRMetrics } from './types.js';

// ─── Orchestrator Options ───────────────────────────────────────────

/**
 * Options for the calculateVelocity orchestrator function.
 */
export interface CalculateVelocityOptions {
  /** Path to the git repository */
  projectDir: string;

  /** Team identifier */
  teamId: string;

  /** Velocity calculation period type */
  period: VelocityPeriod;

  /** Start of the measurement period (ISO date string) */
  periodStart: string;

  /** End of the measurement period (ISO date string) */
  periodEnd: string;

  /** ArchGuard configuration (loaded from .archguard.yml if not provided) */
  config?: ArchGuardConfig;

  /** Pre-fetched PR data (from integrations package) */
  prData?: PRData[];

  /** Architectural decisions for impact scoring */
  decisions?: ArchDecision[];

  /** Dependency graph for impact scoring */
  dependencyGraph?: DependencyGraph | null;

  /** Violations introduced during the period */
  violations?: Violation[];

  /** Previous velocity scores for trend detection */
  previousScores?: VelocityScore[];

  /** Architectural health score (0-100), calculated externally */
  archHealthScore?: number;
}

/**
 * Result of the calculateVelocity orchestrator.
 */
export interface VelocityResult {
  /** Per-developer velocity scores */
  scores: VelocityScore[];

  /** Aggregated team velocity */
  teamVelocity: TeamVelocity;

  /** Detected blockers */
  blockers: Blocker[];
}

// ─── Main Orchestrator ──────────────────────────────────────────────

/**
 * Calculate velocity scores for all developers and the team.
 *
 * This is the main entry point for the velocity package. It orchestrates:
 * 1. Git statistics collection
 * 2. Complexity analysis from diffs
 * 3. PR metrics aggregation (if PR data is provided)
 * 4. Effort scoring (LOC weighted by complexity)
 * 5. Impact scoring (architectural boundary analysis)
 * 6. Blocker detection
 * 7. Final velocity score calculation per developer and team
 *
 * @param options - Configuration and data inputs for velocity calculation
 * @returns VelocityResult with developer scores, team velocity, and blockers
 */
export async function calculateVelocity(
  options: CalculateVelocityOptions
): Promise<VelocityResult> {
  const {
    projectDir,
    teamId,
    period,
    periodStart,
    periodEnd,
    prData = [],
    decisions = [],
    dependencyGraph = null,
    violations = [],
    previousScores = [],
    archHealthScore,
  } = options;

  // Load config from project directory if not provided
  const config = options.config ?? loadConfig(projectDir);

  // Step 1: Create git client and collect git stats
  const git: SimpleGit = createGitClient(projectDir);
  const gitMetrics = await collectGitStats(git, periodStart, periodEnd);

  // Step 2: Get diffs for complexity analysis
  // We analyze the diff between the period start and end to calculate
  // complexity changes during this period
  let complexityDeltas: import('./types.js').ComplexityDelta[];
  try {
    const diffs = await getDiff(git, periodStart, periodEnd);
    complexityDeltas = calculateComplexityFromDiffs(diffs);
  } catch {
    // If diff fails (e.g., refs not available), use empty deltas
    complexityDeltas = [];
  }

  // Step 3: Calculate refactoring ratios per developer
  const refactoringRatioOverall = calculateRefactoringRatio(complexityDeltas);
  const refactoringRatios = new Map<string, number>();
  for (const metric of gitMetrics) {
    // Each developer gets the overall ratio as a baseline.
    // Per-developer ratios would require per-developer diffs,
    // which we approximate with the overall ratio.
    refactoringRatios.set(metric.developerId, refactoringRatioOverall);
  }

  // Step 4: Aggregate PR metrics
  const prMetrics: DeveloperPRMetrics[] =
    prData.length > 0
      ? aggregatePRMetrics(prData, periodStart, periodEnd)
      : [];

  // Step 5: Calculate effort scores (LOC weighted by complexity)
  const effortScores = calculateEffortScores(gitMetrics, complexityDeltas);

  // Step 6: Calculate impact scores (architectural boundary analysis)
  const impactScores = calculateImpactScores(
    gitMetrics,
    dependencyGraph,
    decisions,
    violations
  );

  // Step 7: Detect blockers
  const openPrs = prData.filter((pr) => pr.state === 'open');
  const blockers = detectBlockers(openPrs, prMetrics, config);

  // Step 8: Calculate developer velocity scores
  const velocityInput: VelocityInput = {
    gitMetrics,
    effortScores,
    impactScores,
    prMetrics,
    refactoringRatios,
    blockers,
    period,
    periodStart,
    periodEnd,
    previousScores,
  };

  const scores = calculateDeveloperVelocityScores(velocityInput, config);

  // Step 9: Calculate team velocity
  const teamVelocity = calculateTeamVelocity(
    scores,
    teamId,
    blockers,
    archHealthScore
  );

  return {
    scores,
    teamVelocity,
    blockers,
  };
}
