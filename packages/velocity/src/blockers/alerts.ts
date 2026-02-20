/**
 * Blocker alert formatter.
 * Generates blocker alerts in different formats: plain text, Slack blocks, and JSON.
 */

import type { Blocker, BlockerType } from '@snoutguard/core';
import type { AlertFormat, SlackBlock } from '../types.js';

// ─── Severity Indicators ────────────────────────────────────────────

const SEVERITY_LABELS: Record<string, string> = {
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

const SEVERITY_EMOJI: Record<string, string> = {
  high: ':red_circle:',
  medium: ':large_orange_circle:',
  low: ':large_yellow_circle:',
};

const BLOCKER_TYPE_LABELS: Record<BlockerType, string> = {
  stalled_pr: 'Stalled PR',
  long_lived_branch: 'Long-lived Branch',
  review_bottleneck: 'Review Bottleneck',
  high_violation_rate: 'High Violation Rate',
  dependency_block: 'Dependency Block',
};

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Format blockers into the specified output format.
 *
 * @param blockers - Array of detected blockers
 * @param format - Output format: 'text', 'slack', or 'json'
 * @returns Formatted string representation of the blockers
 */
export function formatBlockerAlerts(
  blockers: Blocker[],
  format: AlertFormat
): string {
  if (blockers.length === 0) {
    return formatNoBlockers(format);
  }

  switch (format) {
    case 'text':
      return formatAsText(blockers);
    case 'slack':
      return JSON.stringify(formatAsSlackBlocks(blockers), null, 2);
    case 'json':
      return formatAsJson(blockers);
    default:
      return formatAsText(blockers);
  }
}

/**
 * Format blockers as Slack block kit structures.
 * Useful for sending directly to Slack's Block Kit API.
 *
 * @param blockers - Array of detected blockers
 * @returns Array of Slack block objects
 */
export function formatAsSlackBlocks(blockers: Blocker[]): SlackBlock[] {
  if (blockers.length === 0) {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'No development blockers detected. :white_check_mark:',
        },
      },
    ];
  }

  const blocks: SlackBlock[] = [];

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `Development Blockers (${blockers.length})`,
      emoji: true,
    },
  });

  // Summary line
  const highCount = blockers.filter((b) => b.severity === 'high').length;
  const mediumCount = blockers.filter((b) => b.severity === 'medium').length;
  const lowCount = blockers.filter((b) => b.severity === 'low').length;

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `${highCount > 0 ? `:red_circle: ${highCount} high` : ''}${mediumCount > 0 ? ` :large_orange_circle: ${mediumCount} medium` : ''}${lowCount > 0 ? ` :large_yellow_circle: ${lowCount} low` : ''}`.trim(),
    },
  });

  // Divider
  blocks.push({ type: 'divider' });

  // Group blockers by type
  const grouped = groupByType(blockers);

  for (const [type, typeBlockers] of grouped) {
    const typeLabel = BLOCKER_TYPE_LABELS[type] ?? type;

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${typeLabel}*`,
      },
    });

    for (const blocker of typeBlockers) {
      const emoji = SEVERITY_EMOJI[blocker.severity] ?? ':grey_question:';

      blocks.push({
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `${emoji} *Severity:* ${blocker.severity.toUpperCase()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Related:* ${blocker.relatedEntity}`,
          },
        ],
      });

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: blocker.description,
        },
      });

      if (blocker.staleSince) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Stale since: ${formatDate(blocker.staleSince)}`,
            },
          ],
        });
      }
    }

    blocks.push({ type: 'divider' });
  }

  return blocks;
}

/**
 * Generate a text summary of a single blocker.
 *
 * @param blocker - The blocker to summarize
 * @returns Single-line text summary
 */
export function formatSingleBlocker(blocker: Blocker): string {
  const severity = SEVERITY_LABELS[blocker.severity] ?? 'UNKNOWN';
  const type = BLOCKER_TYPE_LABELS[blocker.type] ?? blocker.type;
  const stale = blocker.staleSince
    ? ` (since ${formatDate(blocker.staleSince)})`
    : '';

  return `[${severity}] ${type}: ${blocker.description}${stale}`;
}

/**
 * Filter blockers by severity level.
 *
 * @param blockers - Array of blockers to filter
 * @param minSeverity - Minimum severity to include ('high', 'medium', 'low')
 * @returns Filtered array of blockers
 */
export function filterBySeverity(
  blockers: Blocker[],
  minSeverity: 'high' | 'medium' | 'low'
): Blocker[] {
  const severityOrder: Record<string, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  const minLevel = severityOrder[minSeverity] ?? 1;

  return blockers.filter(
    (b) => (severityOrder[b.severity] ?? 0) >= minLevel
  );
}

// ─── Internal Formatters ────────────────────────────────────────────

/**
 * Format blockers as plain text.
 */
function formatAsText(blockers: Blocker[]): string {
  const lines: string[] = [];

  lines.push('=== Development Blockers Report ===');
  lines.push(`Total: ${blockers.length} blocker(s) detected`);
  lines.push('');

  // Summary counts
  const highCount = blockers.filter((b) => b.severity === 'high').length;
  const mediumCount = blockers.filter((b) => b.severity === 'medium').length;
  const lowCount = blockers.filter((b) => b.severity === 'low').length;

  lines.push(
    `Severity breakdown: ${highCount} high, ${mediumCount} medium, ${lowCount} low`
  );
  lines.push('');

  // Group by type
  const grouped = groupByType(blockers);

  for (const [type, typeBlockers] of grouped) {
    const typeLabel = BLOCKER_TYPE_LABELS[type] ?? type;
    lines.push(`--- ${typeLabel} (${typeBlockers.length}) ---`);

    for (const blocker of typeBlockers) {
      lines.push(formatSingleBlocker(blocker));
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format blockers as structured JSON.
 */
function formatAsJson(blockers: Blocker[]): string {
  const highCount = blockers.filter((b) => b.severity === 'high').length;
  const mediumCount = blockers.filter((b) => b.severity === 'medium').length;
  const lowCount = blockers.filter((b) => b.severity === 'low').length;

  const grouped = groupByType(blockers);
  const byType: Record<string, Blocker[]> = {};
  for (const [type, typeBlockers] of grouped) {
    byType[type] = typeBlockers;
  }

  const output = {
    timestamp: new Date().toISOString(),
    totalBlockers: blockers.length,
    severity: {
      high: highCount,
      medium: mediumCount,
      low: lowCount,
    },
    blockers: byType,
  };

  return JSON.stringify(output, null, 2);
}

/**
 * Format the response when no blockers are detected.
 */
function formatNoBlockers(format: AlertFormat): string {
  switch (format) {
    case 'text':
      return 'No development blockers detected.';
    case 'slack':
      return JSON.stringify(
        [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'No development blockers detected. :white_check_mark:',
            },
          },
        ],
        null,
        2
      );
    case 'json':
      return JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          totalBlockers: 0,
          severity: { high: 0, medium: 0, low: 0 },
          blockers: {},
        },
        null,
        2
      );
    default:
      return 'No development blockers detected.';
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────

/**
 * Group blockers by their type.
 */
function groupByType(blockers: Blocker[]): Map<BlockerType, Blocker[]> {
  const groups = new Map<BlockerType, Blocker[]>();

  // Sort by severity first (high -> medium -> low)
  const sorted = [...blockers].sort((a, b) => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  for (const blocker of sorted) {
    const existing = groups.get(blocker.type) ?? [];
    existing.push(blocker);
    groups.set(blocker.type, existing);
  }

  return groups;
}

/**
 * Format an ISO date string to a human-readable format.
 */
function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}
