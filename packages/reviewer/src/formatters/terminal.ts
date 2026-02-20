/**
 * Terminal output formatter for architectural review results.
 * Uses ANSI escape codes for colored output. Groups violations by file,
 * shows line numbers, severity icons, and suggestions.
 */

import type { ReviewResult, Violation, ViolationSeverity } from '@archguard/core';
import {
  getSeverityIcon,
  getSeverityLabel,
  buildSeveritySummary,
  countBySeverity,
  sortBySeverity,
  determinePassFail,
} from '../severity.js';

// ─── ANSI Color Codes ─────────────────────────────────────────────

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  underline: '\x1b[4m',

  // Foreground colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

// ─── Color Helpers ────────────────────────────────────────────────

function colorize(text: string, ...codes: string[]): string {
  return `${codes.join('')}${text}${ANSI.reset}`;
}

function severityColor(severity: ViolationSeverity): string {
  switch (severity) {
    case 'error':
      return ANSI.red;
    case 'warning':
      return ANSI.yellow;
    case 'info':
      return ANSI.blue;
  }
}

function severityBgColor(severity: ViolationSeverity): string {
  switch (severity) {
    case 'error':
      return ANSI.bgRed;
    case 'warning':
      return ANSI.bgYellow;
    case 'info':
      return '';
  }
}

// ─── Main Formatter ───────────────────────────────────────────────

/**
 * Format a ReviewResult for terminal output with colors and grouping.
 */
export function formatForTerminal(result: ReviewResult): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(colorize('  ArchGuard Review Results  ', ANSI.bold, ANSI.white));
  lines.push(colorize('─'.repeat(60), ANSI.dim));
  lines.push('');

  // Summary line
  const counts = countBySeverity(result.violations);
  lines.push(formatSummaryBar(counts, result));
  lines.push('');

  if (result.violations.length === 0) {
    lines.push(colorize('  No violations found. Great job!', ANSI.green, ANSI.bold));
    lines.push('');
    return lines.join('\n');
  }

  // Group violations by file
  const sorted = sortBySeverity(result.violations);
  const groupedByFile = groupViolationsByFile(sorted);

  for (const [filePath, violations] of groupedByFile) {
    lines.push(formatFileSection(filePath, violations));
  }

  // Footer with pass/fail
  lines.push(colorize('─'.repeat(60), ANSI.dim));
  lines.push(formatPassFail(result));
  lines.push('');

  return lines.join('\n');
}

// ─── Section Formatters ───────────────────────────────────────────

/**
 * Format the summary bar showing violation counts.
 */
function formatSummaryBar(
  counts: Record<ViolationSeverity, number>,
  result: ReviewResult
): string {
  const parts: string[] = [];

  if (counts.error > 0) {
    parts.push(colorize(` ${counts.error} error${counts.error !== 1 ? 's' : ''} `, ANSI.bold, ANSI.red));
  }
  if (counts.warning > 0) {
    parts.push(colorize(` ${counts.warning} warning${counts.warning !== 1 ? 's' : ''} `, ANSI.bold, ANSI.yellow));
  }
  if (counts.info > 0) {
    parts.push(colorize(` ${counts.info} info `, ANSI.bold, ANSI.blue));
  }

  const total = colorize(`${result.totalViolations} total violation${result.totalViolations !== 1 ? 's' : ''}`, ANSI.bold);
  const ref = result.ref ? colorize(` (ref: ${result.ref})`, ANSI.dim) : '';

  return `  ${total}${ref}  ${parts.join('  ')}`;
}

/**
 * Format a file section with all its violations.
 */
function formatFileSection(filePath: string, violations: Violation[]): string {
  const lines: string[] = [];

  // File header
  lines.push(colorize(`  ${filePath}`, ANSI.underline, ANSI.cyan));
  lines.push('');

  for (const violation of violations) {
    lines.push(formatViolation(violation));
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Format a single violation for terminal display.
 */
function formatViolation(violation: Violation): string {
  const lines: string[] = [];
  const icon = getSeverityIcon(violation.severity);
  const label = getSeverityLabel(violation.severity);
  const color = severityColor(violation.severity);

  // Violation header: icon + severity + rule + line numbers
  const lineRange = violation.lineStart === violation.lineEnd
    ? `L${violation.lineStart}`
    : `L${violation.lineStart}-${violation.lineEnd}`;

  lines.push(
    `    ${colorize(`${icon} ${label}`, ANSI.bold, color)} ` +
    `${colorize(`[${violation.rule}]`, ANSI.dim)} ` +
    `${colorize(lineRange, ANSI.gray)}`
  );

  // Violation message
  lines.push(`    ${violation.message}`);

  // Suggestion (if present)
  if (violation.suggestion) {
    lines.push(
      `    ${colorize('Suggestion:', ANSI.green, ANSI.bold)} ${colorize(violation.suggestion, ANSI.green)}`
    );
  }

  // Related decision (if present)
  if (violation.decisionId) {
    lines.push(
      `    ${colorize(`Decision: ${violation.decisionId}`, ANSI.dim)}`
    );
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Format the pass/fail footer.
 */
function formatPassFail(result: ReviewResult): string {
  const hasErrors = result.errors > 0;

  if (hasErrors) {
    return colorize(
      `  FAIL  Review failed with ${result.errors} error${result.errors !== 1 ? 's' : ''}`,
      ANSI.bold,
      ANSI.red
    );
  }

  if (result.warnings > 0) {
    return colorize(
      `  WARN  Review passed with ${result.warnings} warning${result.warnings !== 1 ? 's' : ''}`,
      ANSI.bold,
      ANSI.yellow
    );
  }

  return colorize('  PASS  Review passed', ANSI.bold, ANSI.green);
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Group violations by their file path, maintaining sort order within each group.
 */
function groupViolationsByFile(violations: Violation[]): Map<string, Violation[]> {
  const grouped = new Map<string, Violation[]>();

  for (const v of violations) {
    const key = v.filePath || '(no file)';
    const existing = grouped.get(key) || [];
    existing.push(v);
    grouped.set(key, existing);
  }

  return grouped;
}
