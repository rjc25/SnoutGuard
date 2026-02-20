/**
 * GitHub PR comment formatter for architectural review results.
 * Generates markdown for PR review comments with inline code annotations.
 * Also formats output for the GitHub Check Run API.
 */

import type { ReviewResult, Violation, ViolationSeverity } from '@snoutguard/core';
import {
  getSeverityIcon,
  getSeverityLabel,
  countBySeverity,
  sortBySeverity,
  buildSeveritySummary,
} from '../severity.js';

// ─── Types ────────────────────────────────────────────────────────

/** A GitHub PR inline review comment */
export interface GitHubInlineComment {
  /** File path relative to the repository root */
  path: string;
  /** The line number in the diff to comment on */
  line: number;
  /** Side of the diff to comment on */
  side: 'RIGHT';
  /** Markdown-formatted comment body */
  body: string;
}

/** A GitHub Check Run annotation */
export interface GitHubCheckAnnotation {
  /** File path relative to the repository root */
  path: string;
  /** Start line */
  start_line: number;
  /** End line */
  end_line: number;
  /** Annotation level */
  annotation_level: 'failure' | 'warning' | 'notice';
  /** Title of the annotation */
  title: string;
  /** Annotation message */
  message: string;
  /** Raw details (e.g., suggestion) */
  raw_details?: string;
}

/** Formatted output for GitHub integration */
export interface GitHubFormattedOutput {
  /** Markdown summary comment for the PR */
  summary: string;
  /** Inline review comments for specific lines */
  inlineComments: GitHubInlineComment[];
  /** Check Run annotations */
  annotations: GitHubCheckAnnotation[];
  /** Check Run conclusion */
  conclusion: 'success' | 'failure' | 'neutral';
}

// ─── Main Formatter ───────────────────────────────────────────────

/**
 * Format a ReviewResult as a GitHub PR comment (markdown summary).
 */
export function formatForGitHubPr(result: ReviewResult): string {
  return buildSummaryComment(result);
}

/**
 * Format a ReviewResult for full GitHub integration (summary, inline comments, and check annotations).
 */
export function formatForGitHubFull(result: ReviewResult): GitHubFormattedOutput {
  const summary = buildSummaryComment(result);
  const inlineComments = buildInlineComments(result.violations);
  const annotations = buildCheckAnnotations(result.violations);
  const conclusion = determineConclusion(result);

  return {
    summary,
    inlineComments,
    annotations,
    conclusion,
  };
}

// ─── Summary Comment ──────────────────────────────────────────────

/**
 * Build the main PR summary comment in markdown.
 */
function buildSummaryComment(result: ReviewResult): string {
  const lines: string[] = [];

  // Header
  lines.push('## SnoutGuard Architectural Review');
  lines.push('');

  // Status badge
  const statusEmoji = getStatusBadge(result);
  lines.push(statusEmoji);
  lines.push('');

  // Summary table
  lines.push(buildSummaryTable(result));
  lines.push('');

  if (result.violations.length === 0) {
    lines.push('No architectural violations detected. All changes comply with established decisions.');
    lines.push('');
    return lines.join('\n');
  }

  // Violations by severity
  const sorted = sortBySeverity(result.violations);

  // Errors section
  const errors = sorted.filter((v) => v.severity === 'error');
  if (errors.length > 0) {
    lines.push(buildViolationSection('Errors', errors, 'error'));
    lines.push('');
  }

  // Warnings section
  const warnings = sorted.filter((v) => v.severity === 'warning');
  if (warnings.length > 0) {
    lines.push(buildViolationSection('Warnings', warnings, 'warning'));
    lines.push('');
  }

  // Info section (collapsed)
  const infos = sorted.filter((v) => v.severity === 'info');
  if (infos.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>Info (${infos.length})</summary>`);
    lines.push('');
    lines.push(buildViolationSection('Info', infos, 'info'));
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push(`*Reviewed at ${result.reviewedAt} | Ref: \`${result.ref}\`*`);

  return lines.join('\n');
}

/**
 * Get the status badge text.
 */
function getStatusBadge(result: ReviewResult): string {
  if (result.errors > 0) {
    return `**${getSeverityIcon('error')} FAILED** - ${buildSeveritySummary(result.violations)}`;
  }
  if (result.warnings > 0) {
    return `**${getSeverityIcon('warning')} PASSED WITH WARNINGS** - ${buildSeveritySummary(result.violations)}`;
  }
  return `**PASSED** - No violations found`;
}

/**
 * Build the summary table.
 */
function buildSummaryTable(result: ReviewResult): string {
  const lines: string[] = [];
  lines.push('| Metric | Count |');
  lines.push('|--------|-------|');
  lines.push(`| Total Violations | ${result.totalViolations} |`);
  lines.push(`| ${getSeverityIcon('error')} Errors | ${result.errors} |`);
  lines.push(`| ${getSeverityIcon('warning')} Warnings | ${result.warnings} |`);
  lines.push(`| ${getSeverityIcon('info')} Info | ${result.infos} |`);
  return lines.join('\n');
}

/**
 * Build a violation section for a given severity level.
 */
function buildViolationSection(
  title: string,
  violations: Violation[],
  severity: ViolationSeverity
): string {
  const lines: string[] = [];
  const icon = getSeverityIcon(severity);

  lines.push(`### ${icon} ${title} (${violations.length})`);
  lines.push('');

  // Group by file
  const grouped = groupByFile(violations);

  for (const [filePath, fileViolations] of grouped) {
    lines.push(`**\`${filePath}\`**`);
    lines.push('');

    for (const v of fileViolations) {
      const lineRef = v.lineStart === v.lineEnd
        ? `L${v.lineStart}`
        : `L${v.lineStart}-${v.lineEnd}`;

      lines.push(`- **${lineRef}** \`${v.rule}\`: ${v.message}`);

      if (v.suggestion) {
        lines.push(`  > ${getSeverityIcon('info')} **Suggestion:** ${v.suggestion}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ─── Inline Comments ──────────────────────────────────────────────

/**
 * Build inline review comments for each violation.
 */
function buildInlineComments(violations: Violation[]): GitHubInlineComment[] {
  const comments: GitHubInlineComment[] = [];

  for (const v of violations) {
    // Skip violations without a valid file path or line number
    if (!v.filePath || v.lineStart <= 0) continue;

    const icon = getSeverityIcon(v.severity);
    const label = getSeverityLabel(v.severity);

    let body = `${icon} **${label}** \`${v.rule}\`\n\n${v.message}`;

    if (v.suggestion) {
      body += `\n\n**Suggestion:** ${v.suggestion}`;
    }

    if (v.decisionId) {
      body += `\n\n*Related decision: \`${v.decisionId}\`*`;
    }

    comments.push({
      path: v.filePath,
      line: v.lineStart,
      side: 'RIGHT',
      body,
    });
  }

  return comments;
}

// ─── Check Run Annotations ────────────────────────────────────────

/**
 * Build GitHub Check Run annotations from violations.
 */
function buildCheckAnnotations(violations: Violation[]): GitHubCheckAnnotation[] {
  const annotations: GitHubCheckAnnotation[] = [];

  for (const v of violations) {
    // Skip violations without valid file/line info
    if (!v.filePath || v.lineStart <= 0) continue;

    annotations.push({
      path: v.filePath,
      start_line: v.lineStart,
      end_line: v.lineEnd,
      annotation_level: mapSeverityToAnnotationLevel(v.severity),
      title: `[${v.rule}] ${getSeverityLabel(v.severity)}`,
      message: v.message,
      raw_details: v.suggestion || undefined,
    });
  }

  // GitHub API limits annotations to 50 per check run
  return annotations.slice(0, 50);
}

/**
 * Map ViolationSeverity to GitHub Check annotation level.
 */
function mapSeverityToAnnotationLevel(
  severity: ViolationSeverity
): 'failure' | 'warning' | 'notice' {
  switch (severity) {
    case 'error':
      return 'failure';
    case 'warning':
      return 'warning';
    case 'info':
      return 'notice';
  }
}

/**
 * Determine the Check Run conclusion based on the review result.
 */
function determineConclusion(result: ReviewResult): 'success' | 'failure' | 'neutral' {
  if (result.errors > 0) return 'failure';
  if (result.warnings > 0) return 'neutral';
  return 'success';
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
