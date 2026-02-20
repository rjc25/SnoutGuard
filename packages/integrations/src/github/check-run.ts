/**
 * GitHub Check Run integration for ArchGuard.
 * Creates check runs on commits with pass/fail status based on
 * violation severity thresholds. Includes a summary of all violations
 * in the check output with annotations mapped to specific files and lines.
 */

import type { Octokit } from '@octokit/rest';
import type { Violation, ViolationSeverity } from '@archguard/core';
import {
  createCheckRun,
  type RepoRef,
  type CheckRunOptions,
  type CheckAnnotation,
  type CheckConclusion,
} from './api.js';

// ─── Types ────────────────────────────────────────────────────────

/** Context for creating an ArchGuard check run */
export interface CheckRunContext {
  octokit: Octokit;
  repo: RepoRef;
  headSha: string;
  violations: Violation[];
  severityThreshold: ViolationSeverity;
}

/** Result of creating a check run */
export interface CheckRunResult {
  /** ID of the created check run */
  checkRunId: number;
  /** Whether the check passed */
  passed: boolean;
  /** The conclusion applied to the check run */
  conclusion: CheckConclusion;
  /** Total annotations created */
  annotationCount: number;
}

// ─── Constants ────────────────────────────────────────────────────

/** Name used for the ArchGuard check run */
const CHECK_RUN_NAME = 'ArchGuard Architectural Review';

/** Maximum length for the check run text field */
const MAX_TEXT_LENGTH = 65535;

// ─── Main Function ────────────────────────────────────────────────

/**
 * Create a GitHub Check Run for the ArchGuard architectural review.
 *
 * The check run includes:
 * - A pass/fail conclusion based on the severity threshold
 * - A summary with violation counts
 * - Detailed text with violation descriptions grouped by file
 * - Annotations on specific lines where violations were found
 *
 * @param ctx - Check run context with violations and threshold
 * @returns The ID of the created check run
 */
export async function createArchGuardCheckRun(
  ctx: CheckRunContext
): Promise<number> {
  const { octokit, repo, headSha, violations, severityThreshold } = ctx;

  // Determine pass/fail based on threshold
  const actionableViolations = filterBySeverity(violations, severityThreshold);
  const passed = actionableViolations.length === 0;
  const conclusion = determineConclusion(violations, passed);

  // Build check run summary
  const summary = buildCheckSummary(violations, severityThreshold, passed);

  // Build detailed text
  const text = buildCheckText(violations);

  // Build annotations from violations
  const annotations = buildAnnotations(violations);

  // Create the check run
  const options: CheckRunOptions = {
    name: CHECK_RUN_NAME,
    headSha,
    status: 'completed',
    conclusion,
    title: passed
      ? 'No architectural violations found'
      : `${actionableViolations.length} architectural violation(s) found`,
    summary,
    text: text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH - 3) + '...' : text,
    annotations,
  };

  const checkRunId = await createCheckRun(octokit, repo, options);
  return checkRunId;
}

/**
 * Create a check run that indicates the review is in progress.
 * Useful to show the user that ArchGuard is analyzing the code.
 */
export async function createInProgressCheckRun(
  octokit: Octokit,
  repo: RepoRef,
  headSha: string
): Promise<number> {
  const options: CheckRunOptions = {
    name: CHECK_RUN_NAME,
    headSha,
    status: 'in_progress',
    title: 'ArchGuard is reviewing...',
    summary: 'Architectural review is in progress. Results will be posted shortly.',
  };

  return createCheckRun(octokit, repo, options);
}

// ─── Summary & Text Builders ──────────────────────────────────────

/**
 * Build the check run summary text.
 * This appears prominently in the GitHub UI.
 */
function buildCheckSummary(
  violations: Violation[],
  threshold: ViolationSeverity,
  passed: boolean
): string {
  const counts = countBySeverity(violations);
  const statusLine = passed
    ? 'No architectural violations above the configured threshold.'
    : 'Architectural violations were found that require attention.';

  const lines: string[] = [
    `### ArchGuard Architectural Review`,
    '',
    statusLine,
    '',
    '| Severity | Count |',
    '|----------|-------|',
    `| Errors   | ${counts.error} |`,
    `| Warnings | ${counts.warning} |`,
    `| Info     | ${counts.info} |`,
    `| **Total** | **${violations.length}** |`,
    '',
    `**Threshold:** ${threshold}`,
  ];

  if (!passed) {
    lines.push(
      '',
      'Violations at or above the threshold must be resolved before merging.'
    );
  }

  return lines.join('\n');
}

/**
 * Build the detailed check run text.
 * Groups violations by file and provides full details.
 */
function buildCheckText(violations: Violation[]): string {
  if (violations.length === 0) {
    return 'No violations detected. The code changes conform to the established architectural decisions.';
  }

  const lines: string[] = ['## Violation Details', ''];

  // Group by file
  const fileGroups = new Map<string, Violation[]>();
  for (const v of violations) {
    const group = fileGroups.get(v.filePath) ?? [];
    group.push(v);
    fileGroups.set(v.filePath, group);
  }

  for (const [filePath, fileViolations] of fileGroups) {
    lines.push(`### \`${filePath}\``, '');

    for (const v of fileViolations) {
      const icon = getSeverityIcon(v.severity);
      lines.push(`${icon} **${v.rule}** (${v.severity}) - Line ${v.lineStart}${v.lineEnd !== v.lineStart ? `-${v.lineEnd}` : ''}`);
      lines.push(`> ${v.message}`);

      if (v.suggestion) {
        lines.push(`> **Suggestion:** ${v.suggestion}`);
      }

      if (v.decisionId) {
        lines.push(`> _Decision: \`${v.decisionId}\`_`);
      }

      lines.push('');
    }
  }

  // Add rule summary
  const ruleCounts = new Map<string, number>();
  for (const v of violations) {
    ruleCounts.set(v.rule, (ruleCounts.get(v.rule) ?? 0) + 1);
  }

  lines.push('## Rule Summary', '');
  lines.push('| Rule | Count |');
  lines.push('|------|-------|');
  for (const [rule, count] of [...ruleCounts.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${rule} | ${count} |`);
  }

  return lines.join('\n');
}

// ─── Annotation Builder ──────────────────────────────────────────

/**
 * Convert violations to GitHub Check Run annotations.
 * Each annotation appears inline in the GitHub diff view.
 */
function buildAnnotations(violations: Violation[]): CheckAnnotation[] {
  return violations.map((v) => ({
    path: v.filePath,
    startLine: v.lineStart,
    endLine: v.lineEnd,
    annotationLevel: mapSeverityToAnnotationLevel(v.severity),
    message: v.message + (v.suggestion ? `\n\nSuggestion: ${v.suggestion}` : ''),
    title: `${v.rule} (${v.severity})`,
    rawDetails: v.decisionId ? `Related decision: ${v.decisionId}` : undefined,
  }));
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Map violation severity to GitHub annotation level */
function mapSeverityToAnnotationLevel(
  severity: ViolationSeverity
): 'notice' | 'warning' | 'failure' {
  switch (severity) {
    case 'error': return 'failure';
    case 'warning': return 'warning';
    case 'info': return 'notice';
  }
}

/** Determine the check run conclusion based on violations */
function determineConclusion(
  violations: Violation[],
  passed: boolean
): CheckConclusion {
  if (passed) {
    return violations.length > 0 ? 'neutral' : 'success';
  }

  // If there are errors, use failure; for warnings-only, use action_required
  const hasErrors = violations.some((v) => v.severity === 'error');
  return hasErrors ? 'failure' : 'action_required';
}

/** Filter violations to those at or above a severity threshold */
function filterBySeverity(
  violations: Violation[],
  threshold: ViolationSeverity
): Violation[] {
  const weight = severityWeight(threshold);
  return violations.filter((v) => severityWeight(v.severity) >= weight);
}

/** Get numeric weight for a severity level */
function severityWeight(severity: ViolationSeverity): number {
  switch (severity) {
    case 'error': return 3;
    case 'warning': return 2;
    case 'info': return 1;
  }
}

/** Count violations grouped by severity */
function countBySeverity(violations: Violation[]): Record<ViolationSeverity, number> {
  const counts: Record<ViolationSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const v of violations) {
    counts[v.severity]++;
  }
  return counts;
}

/** Get icon for a severity level */
function getSeverityIcon(severity: ViolationSeverity): string {
  switch (severity) {
    case 'error': return '\u274C';
    case 'warning': return '\u26A0\uFE0F';
    case 'info': return '\u2139\uFE0F';
  }
}
