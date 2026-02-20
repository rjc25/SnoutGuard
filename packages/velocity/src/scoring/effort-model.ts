/**
 * Effort scoring model.
 * Weights lines of code changed by the complexity of the code being changed.
 * Changing a high-complexity function scores higher than simple changes.
 * Scores are normalized to a 0-100 scale.
 */

import { clamp } from '@snoutguard/core';
import type { GitMetrics, ComplexityDelta, EffortScore } from '../types.js';

// ─── Configuration ──────────────────────────────────────────────────

/** Default complexity multiplier ranges */
const COMPLEXITY_TIERS = {
  /** Complexity <= 5: simple code, base multiplier */
  low: { maxComplexity: 5, multiplier: 1.0 },
  /** Complexity 6-10: moderate code */
  medium: { maxComplexity: 10, multiplier: 1.5 },
  /** Complexity 11-20: complex code */
  high: { maxComplexity: 20, multiplier: 2.5 },
  /** Complexity > 20: very complex code */
  veryHigh: { maxComplexity: Infinity, multiplier: 4.0 },
} as const;

/**
 * Base effort score reference point for normalization.
 * A developer who changes 500 LOC of medium complexity code in a period
 * would score approximately 50 on the 0-100 scale.
 */
const NORMALIZATION_REFERENCE = 750;

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Calculate weighted effort scores for all developers based on their
 * git metrics and the complexity of the code they changed.
 *
 * @param gitMetrics - Per-developer git metrics for the period
 * @param complexityDeltas - Complexity deltas for changed files
 * @returns Array of EffortScore, one per developer, normalized 0-100
 */
export function calculateEffortScores(
  gitMetrics: GitMetrics[],
  complexityDeltas: ComplexityDelta[]
): EffortScore[] {
  // Build a map of file path -> average complexity from deltas
  const fileComplexityMap = new Map<string, number>();
  for (const delta of complexityDeltas) {
    // Use the after-change complexity as the current state
    fileComplexityMap.set(delta.filePath, delta.afterAvgComplexity);
  }

  // Calculate raw weighted effort per developer
  const rawScores: EffortScore[] = gitMetrics.map((metrics) => {
    const rawLines = metrics.linesAdded + metrics.linesRemoved;
    const weightedEffort = calculateWeightedEffort(
      metrics,
      fileComplexityMap
    );

    return {
      developerId: metrics.developerId,
      rawLinesChanged: rawLines,
      complexityWeightedEffort: weightedEffort,
      normalizedScore: 0, // Will be set after normalization
    };
  });

  // Normalize scores to 0-100
  return normalizeEffortScores(rawScores);
}

/**
 * Calculate effort score for a single developer.
 *
 * @param metrics - Git metrics for the developer
 * @param complexityDeltas - Complexity deltas for changed files
 * @returns EffortScore for the developer
 */
export function calculateSingleEffortScore(
  metrics: GitMetrics,
  complexityDeltas: ComplexityDelta[]
): EffortScore {
  const fileComplexityMap = new Map<string, number>();
  for (const delta of complexityDeltas) {
    fileComplexityMap.set(delta.filePath, delta.afterAvgComplexity);
  }

  const rawLines = metrics.linesAdded + metrics.linesRemoved;
  const weightedEffort = calculateWeightedEffort(metrics, fileComplexityMap);

  const normalizedScore = clamp(
    Math.round((weightedEffort / NORMALIZATION_REFERENCE) * 50 * 100) / 100,
    0,
    100
  );

  return {
    developerId: metrics.developerId,
    rawLinesChanged: rawLines,
    complexityWeightedEffort: Math.round(weightedEffort * 100) / 100,
    normalizedScore,
  };
}

/**
 * Get the complexity multiplier for a given cyclomatic complexity value.
 * Higher complexity means the code is harder to change safely.
 *
 * @param complexity - Cyclomatic complexity value
 * @returns Multiplier to weight LOC by
 */
export function getComplexityMultiplier(complexity: number): number {
  if (complexity <= COMPLEXITY_TIERS.low.maxComplexity) {
    return COMPLEXITY_TIERS.low.multiplier;
  }
  if (complexity <= COMPLEXITY_TIERS.medium.maxComplexity) {
    return COMPLEXITY_TIERS.medium.multiplier;
  }
  if (complexity <= COMPLEXITY_TIERS.high.maxComplexity) {
    return COMPLEXITY_TIERS.high.multiplier;
  }
  return COMPLEXITY_TIERS.veryHigh.multiplier;
}

// ─── Internal Helpers ───────────────────────────────────────────────

/**
 * Calculate the complexity-weighted effort for a developer.
 * If complexity data is available for changed files, weight LOC by
 * the complexity multiplier. Otherwise, use a default multiplier of 1.0.
 */
function calculateWeightedEffort(
  metrics: GitMetrics,
  fileComplexityMap: Map<string, number>
): number {
  const totalLines = metrics.linesAdded + metrics.linesRemoved;

  if (fileComplexityMap.size === 0 || metrics.filesChanged === 0) {
    // No complexity data available; use raw LOC
    return totalLines;
  }

  // Calculate the average complexity of files this developer touched.
  // We use the file types touched as a proxy for which files were changed.
  // Since we don't have per-developer per-file mapping in GitMetrics,
  // we use the overall average complexity from all changed files.
  let totalComplexity = 0;
  let complexityCount = 0;

  for (const [, complexity] of fileComplexityMap) {
    totalComplexity += complexity;
    complexityCount++;
  }

  if (complexityCount === 0) {
    return totalLines;
  }

  const avgComplexity = totalComplexity / complexityCount;
  const multiplier = getComplexityMultiplier(avgComplexity);

  return totalLines * multiplier;
}

/**
 * Normalize effort scores to a 0-100 scale.
 * Uses the reference point for absolute scoring, then ensures
 * the maximum in the group doesn't exceed 100.
 */
function normalizeEffortScores(scores: EffortScore[]): EffortScore[] {
  if (scores.length === 0) return [];

  // First pass: calculate normalized scores relative to reference
  for (const score of scores) {
    score.normalizedScore =
      (score.complexityWeightedEffort / NORMALIZATION_REFERENCE) * 50;
  }

  // Find the max to check if any exceed 100
  const maxScore = Math.max(...scores.map((s) => s.normalizedScore));

  // If any score exceeds 100, scale all down proportionally
  if (maxScore > 100) {
    const scaleFactor = 100 / maxScore;
    for (const score of scores) {
      score.normalizedScore *= scaleFactor;
    }
  }

  // Round and clamp
  for (const score of scores) {
    score.normalizedScore = clamp(
      Math.round(score.normalizedScore * 100) / 100,
      0,
      100
    );
    score.complexityWeightedEffort =
      Math.round(score.complexityWeightedEffort * 100) / 100;
  }

  return scores;
}
