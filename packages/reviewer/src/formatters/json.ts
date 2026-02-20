/**
 * JSON output formatter for CI/machine consumption.
 * Produces a structured JSON representation of the review result
 * suitable for parsing by CI pipelines, dashboards, and other tools.
 */

import type { ReviewResult, Violation, ViolationSeverity } from '@snoutguard/core';
import {
  countBySeverity,
  sortBySeverity,
  determinePassFail,
  computeSeverityScore,
  getHighestSeverity,
} from '../severity.js';

// ─── Types ────────────────────────────────────────────────────────

/** The structured JSON output format */
export interface JsonReviewOutput {
  /** Schema version for forward compatibility */
  version: string;
  /** Review metadata */
  metadata: {
    reviewId: string;
    repoId: string;
    ref: string;
    prNumber?: number;
    prUrl?: string;
    triggeredBy: string;
    reviewedAt: string;
  };
  /** Summary statistics */
  summary: {
    passed: boolean;
    totalViolations: number;
    errors: number;
    warnings: number;
    infos: number;
    severityScore: number;
    highestSeverity: ViolationSeverity | null;
  };
  /** All violations, sorted by severity */
  violations: JsonViolation[];
  /** Violations grouped by file */
  fileResults: JsonFileResult[];
  /** Violations grouped by rule */
  ruleResults: JsonRuleResult[];
}

/** A violation in JSON output format */
export interface JsonViolation {
  id: string;
  rule: string;
  severity: ViolationSeverity;
  message: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  suggestion: string | null;
  decisionId: string | null;
}

/** Per-file violation summary */
export interface JsonFileResult {
  filePath: string;
  totalViolations: number;
  errors: number;
  warnings: number;
  infos: number;
  violations: JsonViolation[];
}

/** Per-rule violation summary */
export interface JsonRuleResult {
  rule: string;
  totalViolations: number;
  severity: ViolationSeverity;
  violations: JsonViolation[];
}

// ─── Main Formatter ───────────────────────────────────────────────

/**
 * Format a ReviewResult as a JSON string for CI/machine consumption.
 */
export function formatForJson(result: ReviewResult): string {
  const output = buildJsonOutput(result);
  return JSON.stringify(output, null, 2);
}

/**
 * Build the structured JSON output object (useful when you need the object, not the string).
 */
export function buildJsonOutput(result: ReviewResult): JsonReviewOutput {
  const counts = countBySeverity(result.violations);
  const sorted = sortBySeverity(result.violations);
  const severityScore = computeSeverityScore(result.violations);
  const highestSeverity = getHighestSeverity(result.violations) ?? null;
  const passed = result.errors === 0;

  const jsonViolations = sorted.map(toJsonViolation);
  const fileResults = buildFileResults(sorted);
  const ruleResults = buildRuleResults(sorted);

  return {
    version: '1.0.0',
    metadata: {
      reviewId: result.id,
      repoId: result.repoId,
      ref: result.ref,
      prNumber: result.prNumber,
      prUrl: result.prUrl,
      triggeredBy: result.triggeredBy,
      reviewedAt: result.reviewedAt,
    },
    summary: {
      passed,
      totalViolations: result.totalViolations,
      errors: counts.error,
      warnings: counts.warning,
      infos: counts.info,
      severityScore,
      highestSeverity,
    },
    violations: jsonViolations,
    fileResults,
    ruleResults,
  };
}

// ─── Result Builders ──────────────────────────────────────────────

/**
 * Build per-file result summaries.
 */
function buildFileResults(violations: Violation[]): JsonFileResult[] {
  const grouped = new Map<string, Violation[]>();

  for (const v of violations) {
    const key = v.filePath || '(unknown)';
    const existing = grouped.get(key) || [];
    existing.push(v);
    grouped.set(key, existing);
  }

  const results: JsonFileResult[] = [];

  for (const [filePath, fileViolations] of grouped) {
    const counts = countBySeverity(fileViolations);
    results.push({
      filePath,
      totalViolations: fileViolations.length,
      errors: counts.error,
      warnings: counts.warning,
      infos: counts.info,
      violations: fileViolations.map(toJsonViolation),
    });
  }

  // Sort by error count descending, then by total violations
  results.sort((a, b) => {
    if (a.errors !== b.errors) return b.errors - a.errors;
    return b.totalViolations - a.totalViolations;
  });

  return results;
}

/**
 * Build per-rule result summaries.
 */
function buildRuleResults(violations: Violation[]): JsonRuleResult[] {
  const grouped = new Map<string, Violation[]>();

  for (const v of violations) {
    const existing = grouped.get(v.rule) || [];
    existing.push(v);
    grouped.set(v.rule, existing);
  }

  const results: JsonRuleResult[] = [];

  for (const [rule, ruleViolations] of grouped) {
    // Use the highest severity among this rule's violations
    const highestSev = getHighestSeverity(ruleViolations) ?? 'info';
    results.push({
      rule,
      totalViolations: ruleViolations.length,
      severity: highestSev,
      violations: ruleViolations.map(toJsonViolation),
    });
  }

  // Sort by violation count descending
  results.sort((a, b) => b.totalViolations - a.totalViolations);

  return results;
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Convert a Violation to a JsonViolation (normalizing optional fields to null).
 */
function toJsonViolation(v: Violation): JsonViolation {
  return {
    id: v.id,
    rule: v.rule,
    severity: v.severity,
    message: v.message,
    filePath: v.filePath,
    lineStart: v.lineStart,
    lineEnd: v.lineEnd,
    suggestion: v.suggestion ?? null,
    decisionId: v.decisionId ?? null,
  };
}
