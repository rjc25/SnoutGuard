/**
 * Slack Block Kit message builders for ArchGuard.
 * Constructs rich formatted messages using Slack's Block Kit format
 * with sections, action buttons, and color-coded severity indicators.
 * Each builder function returns an array of blocks and optional attachments.
 */

import type {
  ReviewResult,
  Violation,
  ViolationSeverity,
  DriftEvent,
  TeamVelocity,
  VelocityScore,
  WorkSummary,
  Blocker,
  ArchDecision,
} from '@archguard/core';

// ─── Types ────────────────────────────────────────────────────────

/** A Slack block element */
export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  block_id?: string;
  elements?: SlackElement[];
  fields?: SlackTextField[];
  accessory?: SlackElement;
}

/** A text field within a Slack block */
export interface SlackTextField {
  type: string;
  text: string;
}

/** A Slack interactive element (button, etc.) */
export interface SlackElement {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  action_id?: string;
  url?: string;
  value?: string;
  style?: 'primary' | 'danger';
}

/** Slack attachment for colored sidebar */
export interface SlackAttachment {
  color: string;
  blocks: SlackBlock[];
}

/** Complete Slack message payload */
export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

// ─── Color Constants ──────────────────────────────────────────────

const COLORS = {
  error: '#E01E5A',
  warning: '#ECB22E',
  info: '#36C5F0',
  success: '#2EB67D',
  neutral: '#868686',
} as const;

const SEVERITY_COLORS: Record<ViolationSeverity, string> = {
  error: COLORS.error,
  warning: COLORS.warning,
  info: COLORS.info,
};

// ─── Violation Alert Blocks ───────────────────────────────────────

/**
 * Build Slack blocks for a violation alert message.
 */
export function buildViolationAlertBlocks(
  reviewResult: ReviewResult
): SlackMessage {
  const passed = reviewResult.errors === 0;
  const statusIcon = passed ? ':white_check_mark:' : ':x:';
  const statusText = passed ? 'Passed' : 'Violations Found';
  const color = passed ? COLORS.success : (reviewResult.errors > 0 ? COLORS.error : COLORS.warning);

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${statusIcon} ArchGuard Review: ${statusText}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Repository:*\n${reviewResult.repoId}` },
        { type: 'mrkdwn', text: `*Ref:*\n\`${reviewResult.ref.slice(0, 10)}\`` },
        { type: 'mrkdwn', text: `*Errors:*\n${reviewResult.errors}` },
        { type: 'mrkdwn', text: `*Warnings:*\n${reviewResult.warnings}` },
        { type: 'mrkdwn', text: `*Info:*\n${reviewResult.infos}` },
        { type: 'mrkdwn', text: `*Total:*\n${reviewResult.totalViolations}` },
      ],
    },
  ];

  // Add PR link if available
  if (reviewResult.prUrl) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*PR:* <${reviewResult.prUrl}|#${reviewResult.prNumber ?? ''} - View Pull Request>`,
      },
    });
  }

  // Add top violations (max 5)
  const topViolations = reviewResult.violations
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
    .slice(0, 5);

  if (topViolations.length > 0) {
    blocks.push({ type: 'divider' });

    const violationText = topViolations
      .map((v) => `${getSeverityEmoji(v.severity)} *${v.rule}* - \`${v.filePath}\`:${v.lineStart}\n${v.message}`)
      .join('\n\n');

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: topViolations.length < reviewResult.totalViolations
          ? `*Top ${topViolations.length} of ${reviewResult.totalViolations} violations:*\n\n${violationText}`
          : `*Violations:*\n\n${violationText}`,
      },
    });
  }

  // Add action buttons
  if (reviewResult.prUrl) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View PR', emoji: true },
          url: reviewResult.prUrl,
          action_id: 'view_pr',
        },
      ],
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Reviewed at ${reviewResult.reviewedAt} | Triggered by ${reviewResult.triggeredBy}`,
      } as unknown as SlackElement,
    ],
  });

  return {
    text: `ArchGuard Review: ${statusText} - ${reviewResult.totalViolations} violation(s)`,
    blocks,
    attachments: [{ color, blocks: [] }],
  };
}

// ─── Drift Alert Blocks ──────────────────────────────────────────

/**
 * Build Slack blocks for a drift alert message.
 */
export function buildDriftAlertBlocks(
  driftEvents: DriftEvent[],
  repoId: string
): SlackMessage {
  const highCount = driftEvents.filter((e) => e.severity === 'high').length;
  const medCount = driftEvents.filter((e) => e.severity === 'medium').length;
  const lowCount = driftEvents.filter((e) => e.severity === 'low').length;

  const color = highCount > 0 ? COLORS.error : medCount > 0 ? COLORS.warning : COLORS.info;

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: ':warning: Architectural Drift Detected',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Repository:*\n${repoId}` },
        { type: 'mrkdwn', text: `*Events:*\n${driftEvents.length}` },
        { type: 'mrkdwn', text: `*High:*\n${highCount}` },
        { type: 'mrkdwn', text: `*Medium:*\n${medCount}` },
        { type: 'mrkdwn', text: `*Low:*\n${lowCount}` },
      ],
    },
    { type: 'divider' },
  ];

  // List drift events
  for (const event of driftEvents.slice(0, 10)) {
    const severityEmoji = getDriftSeverityEmoji(event.severity);
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${severityEmoji} *${formatDriftType(event.type)}*\n${event.description}`,
      },
    });
  }

  if (driftEvents.length > 10) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `...and ${driftEvents.length - 10} more drift events`,
        } as unknown as SlackElement,
      ],
    });
  }

  return {
    text: `Architectural Drift Detected: ${driftEvents.length} event(s) in ${repoId}`,
    blocks,
    attachments: [{ color, blocks: [] }],
  };
}

// ─── Velocity Digest Blocks ──────────────────────────────────────

/**
 * Build Slack blocks for a velocity digest message.
 */
export function buildVelocityDigestBlocks(
  teamVelocity: TeamVelocity
): SlackMessage {
  const healthColor = teamVelocity.architecturalHealth >= 80
    ? COLORS.success
    : teamVelocity.architecturalHealth >= 60
      ? COLORS.warning
      : COLORS.error;

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: ':chart_with_upwards_trend: Team Velocity Digest',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Team:*\n${teamVelocity.teamId}` },
        { type: 'mrkdwn', text: `*Period:*\n${teamVelocity.period}` },
        { type: 'mrkdwn', text: `*Team Score:*\n${teamVelocity.teamVelocityScore}/100` },
        { type: 'mrkdwn', text: `*Arch Health:*\n${teamVelocity.architecturalHealth}/100` },
      ],
    },
  ];

  // Add highlights
  if (teamVelocity.highlights.length > 0) {
    blocks.push({ type: 'divider' });
    const highlightText = teamVelocity.highlights
      .map((h) => `:star: ${h}`)
      .join('\n');

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Highlights:*\n${highlightText}`,
      },
    });
  }

  // Add top contributors (top 5 by velocity score)
  const topMembers = [...teamVelocity.members]
    .sort((a, b) => b.velocityScore - a.velocityScore)
    .slice(0, 5);

  if (topMembers.length > 0) {
    blocks.push({ type: 'divider' });

    const memberText = topMembers
      .map((m, i) => {
        const trendEmoji = getTrendEmoji(m.trend);
        return `${i + 1}. *${m.developerId}* - Score: ${m.velocityScore} ${trendEmoji} | Commits: ${m.commits} | PRs: ${m.prsMerged} merged`;
      })
      .join('\n');

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Top Contributors:*\n${memberText}`,
      },
    });
  }

  // Add blockers
  if (teamVelocity.topBlockers.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push(...buildBlockerBlocks(teamVelocity.topBlockers));
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Period: ${teamVelocity.periodStart} to ${teamVelocity.periodEnd}`,
      } as unknown as SlackElement,
    ],
  });

  return {
    text: `Team Velocity Digest - Score: ${teamVelocity.teamVelocityScore}/100`,
    blocks,
    attachments: [{ color: healthColor, blocks: [] }],
  };
}

// ─── Work Summary Blocks ──────────────────────────────────────────

/**
 * Build Slack blocks for a work summary message.
 */
export function buildWorkSummaryBlocks(
  workSummary: WorkSummary
): SlackMessage {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `:memo: Work Summary: ${formatSummaryType(workSummary.type)}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Developer:*\n${workSummary.developerId ?? 'Team'}` },
        { type: 'mrkdwn', text: `*Period:*\n${workSummary.periodStart} - ${workSummary.periodEnd}` },
        { type: 'mrkdwn', text: `*Commits:*\n${workSummary.dataPoints.commits}` },
        { type: 'mrkdwn', text: `*PRs Merged:*\n${workSummary.dataPoints.prsMerged}` },
        { type: 'mrkdwn', text: `*Files Changed:*\n${workSummary.dataPoints.filesChanged}` },
        { type: 'mrkdwn', text: `*Reviews Given:*\n${workSummary.dataPoints.reviewsGiven}` },
      ],
    },
    { type: 'divider' },
  ];

  // Add the summary content (may be markdown, truncate for Slack)
  const content = workSummary.editedContent ?? workSummary.content;
  const truncatedContent = content.length > 2900
    ? content.slice(0, 2900) + '\n\n_... (truncated)_'
    : content;

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: truncatedContent,
    },
  });

  // Add key PRs
  if (workSummary.dataPoints.keyPrs.length > 0) {
    blocks.push({ type: 'divider' });
    const prText = workSummary.dataPoints.keyPrs
      .map((pr) => `:merged: ${pr}`)
      .join('\n');

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Key PRs:*\n${prText}`,
      },
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Generated at ${workSummary.generatedAt}`,
      } as unknown as SlackElement,
    ],
  });

  return {
    text: `Work Summary: ${formatSummaryType(workSummary.type)} for ${workSummary.developerId ?? 'Team'}`,
    blocks,
    attachments: [{ color: COLORS.info, blocks: [] }],
  };
}

// ─── Blocker Alert Blocks ─────────────────────────────────────────

/**
 * Build Slack blocks for a blocker alert message.
 */
export function buildBlockerAlertBlocks(
  blockers: Blocker[],
  teamId?: string
): SlackMessage {
  const highBlockers = blockers.filter((b) => b.severity === 'high');
  const color = highBlockers.length > 0 ? COLORS.error : COLORS.warning;

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: ':rotating_light: Blocker Alert',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        ...(teamId ? [{ type: 'mrkdwn' as const, text: `*Team:*\n${teamId}` }] : []),
        { type: 'mrkdwn', text: `*Total Blockers:*\n${blockers.length}` },
        { type: 'mrkdwn', text: `*High Severity:*\n${highBlockers.length}` },
      ],
    },
    { type: 'divider' },
    ...buildBlockerBlocks(blockers),
  ];

  return {
    text: `Blocker Alert: ${blockers.length} blocker(s) detected${teamId ? ` for ${teamId}` : ''}`,
    blocks,
    attachments: [{ color, blocks: [] }],
  };
}

// ─── Decision List Blocks ─────────────────────────────────────────

/**
 * Build Slack blocks for a list of architectural decisions.
 */
export function buildDecisionListBlocks(
  decisions: ArchDecision[],
  title?: string
): SlackMessage {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: title ?? ':classical_building: Architectural Decisions',
        emoji: true,
      },
    },
  ];

  if (decisions.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'No architectural decisions found.',
      },
    });
  } else {
    for (const decision of decisions.slice(0, 10)) {
      const statusEmoji = getDecisionStatusEmoji(decision.status);
      const confidenceBar = buildConfidenceBar(decision.confidence);

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${statusEmoji} *${decision.title}*\n${decision.description}\n` +
            `Category: \`${decision.category}\` | Confidence: ${confidenceBar} ${(decision.confidence * 100).toFixed(0)}%` +
            (decision.tags.length > 0 ? `\nTags: ${decision.tags.map((t) => `\`${t}\``).join(' ')}` : ''),
        },
      });
    }

    if (decisions.length > 10) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Showing 10 of ${decisions.length} decisions`,
          } as unknown as SlackElement,
        ],
      });
    }
  }

  return {
    text: `Architectural Decisions: ${decisions.length} found`,
    blocks,
  };
}

// ─── Status Blocks ────────────────────────────────────────────────

/**
 * Build Slack blocks for an architectural health status message.
 */
export function buildStatusBlocks(
  healthScore: number,
  violationSummary: { errors: number; warnings: number; infos: number },
  velocityScore: number | null,
  repoId: string
): SlackMessage {
  const healthColor = healthScore >= 80
    ? COLORS.success
    : healthScore >= 60
      ? COLORS.warning
      : COLORS.error;

  const healthEmoji = healthScore >= 80 ? ':green_circle:' : healthScore >= 60 ? ':yellow_circle:' : ':red_circle:';

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: ':bar_chart: ArchGuard Status',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Repository:*\n${repoId}` },
        { type: 'mrkdwn', text: `*Arch Health:*\n${healthEmoji} ${healthScore}/100` },
        ...(velocityScore !== null ? [{ type: 'mrkdwn' as const, text: `*Velocity:*\n${velocityScore}/100` }] : []),
        { type: 'mrkdwn', text: `*Errors:*\n${violationSummary.errors}` },
        { type: 'mrkdwn', text: `*Warnings:*\n${violationSummary.warnings}` },
        { type: 'mrkdwn', text: `*Info:*\n${violationSummary.infos}` },
      ],
    },
  ];

  return {
    text: `ArchGuard Status: Health ${healthScore}/100`,
    blocks,
    attachments: [{ color: healthColor, blocks: [] }],
  };
}

// ─── Helper Blocks ────────────────────────────────────────────────

/**
 * Build blocks for a list of blockers.
 */
function buildBlockerBlocks(blockers: Blocker[]): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  for (const blocker of blockers.slice(0, 10)) {
    const severityEmoji = getDriftSeverityEmoji(blocker.severity);
    const typeLabel = formatBlockerType(blocker.type);

    let text = `${severityEmoji} *${typeLabel}*\n${blocker.description}`;
    text += `\n_Related: \`${blocker.relatedEntity}\`_`;

    if (blocker.staleSince) {
      text += ` | _Stale since: ${blocker.staleSince}_`;
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text,
      },
    });
  }

  return blocks;
}

// ─── Formatting Helpers ──────────────────────────────────────────

/** Get severity emoji for violations */
function getSeverityEmoji(severity: ViolationSeverity): string {
  switch (severity) {
    case 'error': return ':red_circle:';
    case 'warning': return ':warning:';
    case 'info': return ':information_source:';
  }
}

/** Get severity emoji for drift/blocker severity */
function getDriftSeverityEmoji(severity: 'high' | 'medium' | 'low'): string {
  switch (severity) {
    case 'high': return ':red_circle:';
    case 'medium': return ':large_orange_circle:';
    case 'low': return ':yellow_circle:';
  }
}

/** Get trend direction emoji */
function getTrendEmoji(trend: string): string {
  switch (trend) {
    case 'accelerating': return ':arrow_upper_right:';
    case 'stable': return ':arrow_right:';
    case 'decelerating': return ':arrow_lower_right:';
    default: return ':grey_question:';
  }
}

/** Get decision status emoji */
function getDecisionStatusEmoji(status: string): string {
  switch (status) {
    case 'confirmed': return ':white_check_mark:';
    case 'detected': return ':mag:';
    case 'deprecated': return ':no_entry_sign:';
    case 'custom': return ':pencil2:';
    default: return ':grey_question:';
  }
}

/** Build a visual confidence bar */
function buildConfidenceBar(confidence: number): string {
  const filled = Math.round(confidence * 5);
  const empty = 5 - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

/** Get numeric weight for a severity level */
function severityWeight(severity: ViolationSeverity): number {
  switch (severity) {
    case 'error': return 3;
    case 'warning': return 2;
    case 'info': return 1;
  }
}

/** Format a drift event type for display */
function formatDriftType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format a blocker type for display */
function formatBlockerType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format a summary type for display */
function formatSummaryType(type: string): string {
  switch (type) {
    case 'one_on_one': return '1:1 Meeting Prep';
    case 'standup': return 'Standup';
    case 'sprint_review': return 'Sprint Review';
    case 'progress_report': return 'Progress Report';
    default: return type;
  }
}
