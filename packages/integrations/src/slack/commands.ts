/**
 * Slack slash commands for ArchGuard.
 * Implements the /archguard slash command with subcommands for
 * checking architectural health, listing decisions, triggering reviews,
 * generating summaries, and listing blockers.
 */

import type {
  SlackCommandMiddlewareArgs,
  AllMiddlewareArgs,
} from '@slack/bolt';
import type {
  ReviewResult,
  ArchDecision,
  TeamVelocity,
  WorkSummary,
  Blocker,
  ViolationSeverity,
} from '@archguard/core';
import {
  buildStatusBlocks,
  buildDecisionListBlocks,
  buildViolationAlertBlocks,
  buildWorkSummaryBlocks,
  buildBlockerAlertBlocks,
  buildVelocityDigestBlocks,
  type SlackMessage,
} from './blocks.js';

// ─── Types ────────────────────────────────────────────────────────

/** Data provider interface for slash commands to fetch data */
export interface SlackCommandDataProvider {
  /** Get architectural health score and violation summary */
  getHealthStatus(repoId?: string): Promise<{
    healthScore: number;
    violations: { errors: number; warnings: number; infos: number };
    velocityScore: number | null;
    repoId: string;
  }>;

  /** Get recent architectural decisions */
  getDecisions(repoId?: string, limit?: number): Promise<ArchDecision[]>;

  /** Trigger a review for a PR URL */
  triggerReview(prUrl: string, userId: string): Promise<ReviewResult>;

  /** Generate a work summary for a developer and period */
  generateSummary(
    developerName: string,
    period: string,
    userId: string
  ): Promise<WorkSummary>;

  /** Get active blockers */
  getBlockers(teamId?: string): Promise<Blocker[]>;

  /** Get team velocity */
  getTeamVelocity(teamId?: string): Promise<TeamVelocity | null>;
}

/** Parsed slash command arguments */
interface ParsedCommand {
  subcommand: string;
  args: string[];
  rawArgs: string;
}

// ─── Command Registration ─────────────────────────────────────────

/**
 * Create the /archguard slash command handler.
 *
 * Subcommands:
 * - `/archguard status` - Show architectural health and velocity
 * - `/archguard decisions` - List top architectural decisions
 * - `/archguard review <pr-url>` - Trigger a review for a PR
 * - `/archguard summary <dev-name> <period>` - Generate a work summary
 * - `/archguard blockers` - List active blockers
 * - `/archguard help` - Show help text
 *
 * @param dataProvider - Functions to fetch data for each subcommand
 * @returns Slack command handler function
 */
export function createArchGuardCommandHandler(
  dataProvider: SlackCommandDataProvider
): (args: SlackCommandMiddlewareArgs & AllMiddlewareArgs) => Promise<void> {
  return async ({ command, ack, respond }) => {
    // Acknowledge the command immediately
    await ack();

    const parsed = parseCommand(command.text ?? '');

    try {
      switch (parsed.subcommand) {
        case 'status':
          await handleStatusCommand(dataProvider, respond, parsed);
          break;

        case 'decisions':
          await handleDecisionsCommand(dataProvider, respond, parsed);
          break;

        case 'review':
          await handleReviewCommand(dataProvider, respond, parsed, command.user_id);
          break;

        case 'summary':
          await handleSummaryCommand(dataProvider, respond, parsed, command.user_id);
          break;

        case 'blockers':
          await handleBlockersCommand(dataProvider, respond, parsed);
          break;

        case 'help':
        case '':
          await handleHelpCommand(respond);
          break;

        default:
          await respond({
            response_type: 'ephemeral',
            text: `Unknown subcommand: \`${parsed.subcommand}\`. Use \`/archguard help\` to see available commands.`,
          });
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ArchGuard Slack Command] Error handling /${command.command} ${command.text}: ${message}`);

      await respond({
        response_type: 'ephemeral',
        text: `:x: An error occurred: ${message}`,
      });
    }
  };
}

// ─── Subcommand Handlers ──────────────────────────────────────────

/**
 * Handle /archguard status - Show architectural health and velocity.
 */
async function handleStatusCommand(
  dataProvider: SlackCommandDataProvider,
  respond: RespondFn,
  parsed: ParsedCommand
): Promise<void> {
  const repoId = parsed.args[0];

  const status = await dataProvider.getHealthStatus(repoId);
  const message = buildStatusBlocks(
    status.healthScore,
    status.violations,
    status.velocityScore,
    status.repoId
  );

  // Also include velocity if available
  let velocityMessage: SlackMessage | null = null;
  const teamVelocity = await dataProvider.getTeamVelocity();
  if (teamVelocity) {
    velocityMessage = buildVelocityDigestBlocks(teamVelocity);
  }

  await respond({
    response_type: 'in_channel',
    text: message.text,
    blocks: message.blocks as Record<string, unknown>[],
    attachments: message.attachments?.map((a) => ({
      color: a.color,
      blocks: a.blocks as Record<string, unknown>[],
    })),
  });

  // Post velocity as a follow-up if available
  if (velocityMessage) {
    await respond({
      response_type: 'in_channel',
      text: velocityMessage.text,
      blocks: velocityMessage.blocks as Record<string, unknown>[],
    });
  }
}

/**
 * Handle /archguard decisions - List top architectural decisions.
 */
async function handleDecisionsCommand(
  dataProvider: SlackCommandDataProvider,
  respond: RespondFn,
  parsed: ParsedCommand
): Promise<void> {
  const limit = parsed.args[0] ? parseInt(parsed.args[0], 10) : 10;
  const validLimit = isNaN(limit) ? 10 : Math.min(limit, 25);

  const decisions = await dataProvider.getDecisions(undefined, validLimit);
  const message = buildDecisionListBlocks(decisions);

  await respond({
    response_type: 'in_channel',
    text: message.text,
    blocks: message.blocks as Record<string, unknown>[],
  });
}

/**
 * Handle /archguard review <pr-url> - Trigger a review for a PR.
 */
async function handleReviewCommand(
  dataProvider: SlackCommandDataProvider,
  respond: RespondFn,
  parsed: ParsedCommand,
  userId: string
): Promise<void> {
  const prUrl = parsed.args[0];

  if (!prUrl) {
    await respond({
      response_type: 'ephemeral',
      text: ':warning: Please provide a PR URL. Usage: `/archguard review <pr-url>`',
    });
    return;
  }

  // Validate URL format
  if (!isValidPRUrl(prUrl)) {
    await respond({
      response_type: 'ephemeral',
      text: ':warning: Invalid PR URL. Please provide a valid GitHub or Bitbucket PR URL.',
    });
    return;
  }

  // Acknowledge that review is starting
  await respond({
    response_type: 'in_channel',
    text: `:hourglass_flowing_sand: Starting architectural review for <${prUrl}|PR>...`,
  });

  // Trigger the review
  const reviewResult = await dataProvider.triggerReview(prUrl, userId);
  const message = buildViolationAlertBlocks(reviewResult);

  await respond({
    response_type: 'in_channel',
    text: message.text,
    blocks: message.blocks as Record<string, unknown>[],
    attachments: message.attachments?.map((a) => ({
      color: a.color,
      blocks: a.blocks as Record<string, unknown>[],
    })),
  });
}

/**
 * Handle /archguard summary <dev-name> <period> - Generate a work summary.
 */
async function handleSummaryCommand(
  dataProvider: SlackCommandDataProvider,
  respond: RespondFn,
  parsed: ParsedCommand,
  userId: string
): Promise<void> {
  const developerName = parsed.args[0];
  const period = parsed.args.slice(1).join(' ') || 'weekly';

  if (!developerName) {
    await respond({
      response_type: 'ephemeral',
      text: ':warning: Please provide a developer name. Usage: `/archguard summary <dev-name> <period>`\n' +
        'Period can be: `daily`, `weekly`, `sprint`, `monthly`, or a date range like `2024-01-01 2024-01-15`',
    });
    return;
  }

  // Acknowledge that summary generation is starting
  await respond({
    response_type: 'ephemeral',
    text: `:hourglass_flowing_sand: Generating ${period} summary for *${developerName}*...`,
  });

  const workSummary = await dataProvider.generateSummary(developerName, period, userId);
  const message = buildWorkSummaryBlocks(workSummary);

  await respond({
    response_type: 'in_channel',
    text: message.text,
    blocks: message.blocks as Record<string, unknown>[],
    attachments: message.attachments?.map((a) => ({
      color: a.color,
      blocks: a.blocks as Record<string, unknown>[],
    })),
  });
}

/**
 * Handle /archguard blockers - List active blockers.
 */
async function handleBlockersCommand(
  dataProvider: SlackCommandDataProvider,
  respond: RespondFn,
  parsed: ParsedCommand
): Promise<void> {
  const teamId = parsed.args[0];

  const blockers = await dataProvider.getBlockers(teamId);

  if (blockers.length === 0) {
    await respond({
      response_type: 'in_channel',
      text: ':white_check_mark: No active blockers found.',
    });
    return;
  }

  const message = buildBlockerAlertBlocks(blockers, teamId);

  await respond({
    response_type: 'in_channel',
    text: message.text,
    blocks: message.blocks as Record<string, unknown>[],
    attachments: message.attachments?.map((a) => ({
      color: a.color,
      blocks: a.blocks as Record<string, unknown>[],
    })),
  });
}

/**
 * Handle /archguard help - Show help text.
 */
async function handleHelpCommand(respond: RespondFn): Promise<void> {
  await respond({
    response_type: 'ephemeral',
    text: 'ArchGuard Slash Commands',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':classical_building: ArchGuard Commands',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            '*Available commands:*',
            '',
            '`/archguard status [repo]` - Show architectural health and velocity metrics',
            '`/archguard decisions [limit]` - List top architectural decisions',
            '`/archguard review <pr-url>` - Trigger an architectural review for a PR',
            '`/archguard summary <dev-name> <period>` - Generate a work summary',
            '`/archguard blockers [team]` - List active blockers',
            '`/archguard help` - Show this help message',
            '',
            '*Period formats:*',
            '`daily`, `weekly`, `sprint`, `monthly`, or date range like `2024-01-01 2024-01-15`',
          ].join('\n'),
        },
      },
    ] as Record<string, unknown>[],
  });
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Parse the command text into subcommand and arguments */
function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim();
  if (!trimmed) {
    return { subcommand: '', args: [], rawArgs: '' };
  }

  const parts = trimmed.split(/\s+/);
  const subcommand = parts[0].toLowerCase();
  const args = parts.slice(1);
  const rawArgs = parts.slice(1).join(' ');

  return { subcommand, args, rawArgs };
}

/** Validate that a URL looks like a PR URL */
function isValidPRUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // GitHub PR URL pattern
    if (parsed.hostname === 'github.com' || parsed.hostname.includes('github')) {
      return /\/pull\/\d+/.test(parsed.pathname);
    }

    // Bitbucket PR URL pattern
    if (parsed.hostname === 'bitbucket.org' || parsed.hostname.includes('bitbucket')) {
      return /\/pull-requests\/\d+/.test(parsed.pathname);
    }

    return false;
  } catch {
    return false;
  }
}

/** Type for the respond function from Slack Bolt */
type RespondFn = (message: Record<string, unknown>) => Promise<unknown>;
