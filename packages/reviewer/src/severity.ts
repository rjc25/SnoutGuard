/**
 * Severity utilities for filtering, sorting, and evaluating violations.
 * Provides functions to determine pass/fail based on severity thresholds
 * and to aggregate violation counts by severity level.
 */

import type { Violation, ViolationSeverity, ReviewResult } from '@snoutguard/core';

/** Numeric weight for each severity level (higher = more severe) */
const SEVERITY_WEIGHT: Record<ViolationSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

/** Ordered severity levels from most to least severe */
const SEVERITY_ORDER: ViolationSeverity[] = ['error', 'warning', 'info'];

/**
 * Filter violations to only those at or above the given severity threshold.
 * For example, threshold 'warning' returns errors and warnings but not infos.
 */
export function filterBySeverity(
  violations: Violation[],
  threshold: ViolationSeverity
): Violation[] {
  const thresholdWeight = SEVERITY_WEIGHT[threshold];
  return violations.filter((v) => SEVERITY_WEIGHT[v.severity] >= thresholdWeight);
}

/**
 * Sort violations by severity (errors first, then warnings, then infos).
 * Within the same severity level, violations are sorted by file path and then line number.
 */
export function sortBySeverity(violations: Violation[]): Violation[] {
  return [...violations].sort((a, b) => {
    const severityDiff = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
    if (severityDiff !== 0) return severityDiff;

    const fileDiff = a.filePath.localeCompare(b.filePath);
    if (fileDiff !== 0) return fileDiff;

    return a.lineStart - b.lineStart;
  });
}

/**
 * Count violations grouped by severity level.
 * Returns an object with counts for each severity.
 */
export function countBySeverity(
  violations: Violation[]
): Record<ViolationSeverity, number> {
  const counts: Record<ViolationSeverity, number> = {
    error: 0,
    warning: 0,
    info: 0,
  };

  for (const v of violations) {
    counts[v.severity]++;
  }

  return counts;
}

/**
 * Determine whether the review passes based on the configured severity threshold.
 * The review fails if there are any violations at or above the threshold severity.
 */
export function determinePassFail(
  violations: Violation[],
  threshold: ViolationSeverity
): boolean {
  const actionable = filterBySeverity(violations, threshold);
  return actionable.length === 0;
}

/**
 * Get the highest severity level present in a list of violations.
 * Returns undefined if the list is empty.
 */
export function getHighestSeverity(
  violations: Violation[]
): ViolationSeverity | undefined {
  if (violations.length === 0) return undefined;

  for (const severity of SEVERITY_ORDER) {
    if (violations.some((v) => v.severity === severity)) {
      return severity;
    }
  }

  return undefined;
}

/**
 * Get the severity icon for terminal/markdown display.
 */
export function getSeverityIcon(severity: ViolationSeverity): string {
  switch (severity) {
    case 'error':
      return '\u2718'; // heavy ballot X
    case 'warning':
      return '\u26A0'; // warning sign
    case 'info':
      return '\u2139'; // information source
  }
}

/**
 * Get a human-readable label for a severity level.
 */
export function getSeverityLabel(severity: ViolationSeverity): string {
  switch (severity) {
    case 'error':
      return 'Error';
    case 'warning':
      return 'Warning';
    case 'info':
      return 'Info';
  }
}

/**
 * Compute an overall severity score for a review result.
 * Score ranges from 0 (no violations) to 100 (many severe violations).
 * Useful for trending and comparison.
 */
export function computeSeverityScore(violations: Violation[]): number {
  if (violations.length === 0) return 0;

  const totalWeight = violations.reduce(
    (sum, v) => sum + SEVERITY_WEIGHT[v.severity],
    0
  );

  // Normalize: cap at 100
  return Math.min(totalWeight, 100);
}

/**
 * Build a summary string describing the violation counts.
 * Example: "3 errors, 5 warnings, 2 infos"
 */
export function buildSeveritySummary(violations: Violation[]): string {
  const counts = countBySeverity(violations);
  const parts: string[] = [];

  if (counts.error > 0) {
    parts.push(`${counts.error} error${counts.error !== 1 ? 's' : ''}`);
  }
  if (counts.warning > 0) {
    parts.push(`${counts.warning} warning${counts.warning !== 1 ? 's' : ''}`);
  }
  if (counts.info > 0) {
    parts.push(`${counts.info} info${counts.info !== 1 ? 's' : ''}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'no violations';
}

/**
 * Check whether a given severity meets or exceeds a threshold.
 */
export function meetsThreshold(
  severity: ViolationSeverity,
  threshold: ViolationSeverity
): boolean {
  return SEVERITY_WEIGHT[severity] >= SEVERITY_WEIGHT[threshold];
}
