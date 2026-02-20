/**
 * Bitbucket PR comment formatter for architectural review results.
 * Generates markdown compatible with the Bitbucket Code Insights API format,
 * including report data and inline annotations.
 */

import type { ReviewResult, Violation, ViolationSeverity } from '@archguard/core';
import {
  getSeverityIcon,
  getSeverityLabel,
  countBySeverity,
  sortBySeverity,
  buildSeveritySummary,
  computeSeverityScore,
} from '../severity.js';

// ─── Types ────────────────────────────────────────────────────────

/** Bitbucket Code Insights report data */
export interface BitbucketReport {
  /** Unique external ID for the report */
  external_id: string;
  /** Report title */
  title: string;
  /** Reporter name */
  reporter: string;
  /** Link to more details */
  link?: string;
  /** Report type */
  report_type: 'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'SECURITY';
  /** Result status */
  result: 'PASSED' | 'FAILED';
  /** Report data entries (key-value pairs shown in UI) */
  data: BitbucketReportData[];
  /** Detailed markdown description */
  details: string;
}

/** A key-value data entry for a Bitbucket report */
export interface BitbucketReportData {
  title: string;
  type: 'BOOLEAN' | 'DATE' | 'DURATION' | 'LINK' | 'NUMBER' | 'PERCENTAGE' | 'TEXT';
  value: unknown;
}

/** Bitbucket Code Insights annotation */
export interface BitbucketAnnotation {
  /** Unique external ID for the annotation */
  external_id: string;
  /** File path relative to repo root */
  path: string;
  /** Line number */
  line: number;
  /** Annotation message */
  message: string;
  /** Severity level */
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Annotation type */
  type: 'BUG' | 'VULNERABILITY' | 'CODE_SMELL';
  /** Link to more details */
  link?: string;
}

/** Full formatted output for Bitbucket integration */
export interface BitbucketFormattedOutput {
  /** Markdown comment for the PR */
  comment: string;
  /** Code Insights report data */
  report: BitbucketReport;
  /** Code Insights annotations */
  annotations: BitbucketAnnotation[];
}

// ─── Main Formatter ───────────────────────────────────────────────

/**
 * Format a ReviewResult as a Bitbucket PR comment (markdown).
 */
export function formatForBitbucketPr(result: ReviewResult): string {
  return buildPrComment(result);
}

/**
 * Format a ReviewResult for full Bitbucket Code Insights integration.
 */
export function formatForBitbucketFull(result: ReviewResult): BitbucketFormattedOutput {
  const comment = buildPrComment(result);
  const report = buildCodeInsightsReport(result);
  const annotations = buildCodeInsightsAnnotations(result.violations);

  return {
    comment,
    report,
    annotations,
  };
}

// ─── PR Comment ───────────────────────────────────────────────────

/**
 * Build the main PR comment in Bitbucket-compatible markdown.
 */
function buildPrComment(result: ReviewResult): string {
  const lines: string[] = [];

  // Header
  lines.push('## ArchGuard Architectural Review');
  lines.push('');

  // Status
  const status = result.errors > 0 ? 'FAILED' : 'PASSED';
  const statusIcon = result.errors > 0 ? getSeverityIcon('error') : getSeverityIcon('info');
  lines.push(`**Status:** ${statusIcon} ${status}`);
  lines.push('');

  // Summary
  lines.push(`**Summary:** ${buildSeveritySummary(result.violations)}`);
  lines.push('');

  if (result.violations.length === 0) {
    lines.push('All changes comply with established architectural decisions.');
    lines.push('');
    return lines.join('\n');
  }

  // Counts
  const counts = countBySeverity(result.violations);
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  lines.push(`| ${getSeverityIcon('error')} Errors | ${counts.error} |`);
  lines.push(`| ${getSeverityIcon('warning')} Warnings | ${counts.warning} |`);
  lines.push(`| ${getSeverityIcon('info')} Info | ${counts.info} |`);
  lines.push(`| **Total** | **${result.totalViolations}** |`);
  lines.push('');

  // Violations grouped by file
  const sorted = sortBySeverity(result.violations);
  const grouped = groupByFile(sorted);

  for (const [filePath, violations] of grouped) {
    lines.push(`### \`${filePath}\``);
    lines.push('');

    for (const v of violations) {
      const icon = getSeverityIcon(v.severity);
      const lineRef = v.lineStart === v.lineEnd
        ? `line ${v.lineStart}`
        : `lines ${v.lineStart}-${v.lineEnd}`;

      lines.push(`- ${icon} **${getSeverityLabel(v.severity)}** (${lineRef}) \`${v.rule}\``);
      lines.push(`  ${v.message}`);

      if (v.suggestion) {
        lines.push(`  > **Suggestion:** ${v.suggestion}`);
      }

      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push(`*Reviewed at ${result.reviewedAt} | Ref: \`${result.ref}\`*`);

  return lines.join('\n');
}

// ─── Code Insights Report ─────────────────────────────────────────

/**
 * Build a Bitbucket Code Insights report object.
 */
function buildCodeInsightsReport(result: ReviewResult): BitbucketReport {
  const counts = countBySeverity(result.violations);
  const score = computeSeverityScore(result.violations);

  const data: BitbucketReportData[] = [
    {
      title: 'Total Violations',
      type: 'NUMBER',
      value: result.totalViolations,
    },
    {
      title: 'Errors',
      type: 'NUMBER',
      value: counts.error,
    },
    {
      title: 'Warnings',
      type: 'NUMBER',
      value: counts.warning,
    },
    {
      title: 'Info',
      type: 'NUMBER',
      value: counts.info,
    },
    {
      title: 'Severity Score',
      type: 'NUMBER',
      value: score,
    },
    {
      title: 'Reviewed At',
      type: 'DATE',
      value: result.reviewedAt,
    },
  ];

  // Build detailed markdown for the report
  const detailLines: string[] = [];
  detailLines.push(`Architectural review of ref \`${result.ref}\`.`);
  detailLines.push('');

  if (result.violations.length > 0) {
    detailLines.push(`Found ${buildSeveritySummary(result.violations)}.`);
    detailLines.push('');

    // List top violations
    const topViolations = sortBySeverity(result.violations).slice(0, 10);
    for (const v of topViolations) {
      const icon = getSeverityIcon(v.severity);
      detailLines.push(`${icon} \`${v.filePath}\` L${v.lineStart}: ${v.message}`);
    }

    if (result.violations.length > 10) {
      detailLines.push(`... and ${result.violations.length - 10} more violations.`);
    }
  } else {
    detailLines.push('No violations found. All changes comply with architectural decisions.');
  }

  return {
    external_id: `archguard-review-${result.id}`,
    title: 'ArchGuard Architectural Review',
    reporter: 'ArchGuard',
    report_type: 'CODE_SMELL',
    result: result.errors > 0 ? 'FAILED' : 'PASSED',
    data,
    details: detailLines.join('\n'),
  };
}

// ─── Code Insights Annotations ────────────────────────────────────

/**
 * Build Bitbucket Code Insights annotations from violations.
 */
function buildCodeInsightsAnnotations(violations: Violation[]): BitbucketAnnotation[] {
  const annotations: BitbucketAnnotation[] = [];

  for (const v of violations) {
    // Skip violations without valid file/line info
    if (!v.filePath || v.lineStart <= 0) continue;

    let message = `[${v.rule}] ${v.message}`;
    if (v.suggestion) {
      message += `\n\nSuggestion: ${v.suggestion}`;
    }

    annotations.push({
      external_id: `archguard-${v.id}`,
      path: v.filePath,
      line: v.lineStart,
      message,
      severity: mapSeverityToBitbucket(v.severity),
      type: 'CODE_SMELL',
    });
  }

  // Bitbucket API limits annotations to 1000 per report
  return annotations.slice(0, 1000);
}

/**
 * Map ViolationSeverity to Bitbucket annotation severity.
 */
function mapSeverityToBitbucket(severity: ViolationSeverity): 'HIGH' | 'MEDIUM' | 'LOW' {
  switch (severity) {
    case 'error':
      return 'HIGH';
    case 'warning':
      return 'MEDIUM';
    case 'info':
      return 'LOW';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Group violations by file path.
 */
function groupByFile(violations: Violation[]): Map<string, Violation[]> {
  const grouped = new Map<string, Violation[]>();

  for (const v of violations) {
    const key = v.filePath || '(unknown file)';
    const existing = grouped.get(key) || [];
    existing.push(v);
    grouped.set(key, existing);
  }

  return grouped;
}
