/**
 * Automated Slack notification functions for ArchGuard.
 * Provides functions to send various types of notifications to Slack
 * channels, including violation alerts, drift alerts, velocity digests,
 * work summaries, and blocker alerts.
 */

import type { WebClient, KnownBlock } from '@slack/web-api';
import type {
  ReviewResult,
  DriftEvent,
  TeamVelocity,
  WorkSummary,
  Blocker,
} from '@archguard/core';
import {
  buildViolationAlertBlocks,
  buildDriftAlertBlocks,
  buildVelocityDigestBlocks,
  buildWorkSummaryBlocks,
  buildBlockerAlertBlocks,
  type SlackMessage,
} from './blocks.js';

// ─── Types ────────────────────────────────────────────────────────

/** Result of sending a Slack notification */
export interface NotificationResult {
  /** Whether the message was sent successfully */
  ok: boolean;
  /** The Slack timestamp of the sent message (used as message ID) */
  ts?: string;
  /** The channel the message was sent to */
  channel: string;
  /** Error message if sending failed */
  error?: string;
}

/** Slack client instance - the WebClient from @slack/web-api */
export type SlackClient = WebClient;

// ─── Notification Functions ───────────────────────────────────────

/**
 * Send a violation alert to a Slack channel.
 * Posts a rich message with violation details, severity breakdown,
 * and links to the PR if available.
 *
 * @param client - Slack WebClient instance
 * @param channel - Slack channel ID or name
 * @param reviewResult - The review result containing violations
 * @returns Result of the notification send
 */
export async function sendViolationAlert(
  client: SlackClient,
  channel: string,
  reviewResult: ReviewResult
): Promise<NotificationResult> {
  const message = buildViolationAlertBlocks(reviewResult);
  return sendMessage(client, channel, message);
}

/**
 * Send a drift alert to a Slack channel.
 * Posts a message when architectural drift events are detected,
 * with severity breakdown and event details.
 *
 * @param client - Slack WebClient instance
 * @param channel - Slack channel ID or name
 * @param driftEvents - The drift events to report
 * @param repoId - Repository identifier
 * @returns Result of the notification send
 */
export async function sendDriftAlert(
  client: SlackClient,
  channel: string,
  driftEvents: DriftEvent[],
  repoId: string
): Promise<NotificationResult> {
  if (driftEvents.length === 0) {
    return { ok: true, channel, ts: undefined };
  }

  const message = buildDriftAlertBlocks(driftEvents, repoId);
  return sendMessage(client, channel, message);
}

/**
 * Send a velocity digest to a Slack channel.
 * Posts a rich message with team velocity scores, top contributors,
 * highlights, and active blockers.
 *
 * @param client - Slack WebClient instance
 * @param channel - Slack channel ID or name
 * @param teamVelocity - The team velocity data to report
 * @returns Result of the notification send
 */
export async function sendVelocityDigest(
  client: SlackClient,
  channel: string,
  teamVelocity: TeamVelocity
): Promise<NotificationResult> {
  const message = buildVelocityDigestBlocks(teamVelocity);
  return sendMessage(client, channel, message);
}

/**
 * Send a work summary to a Slack channel.
 * Posts the generated work summary with key data points
 * and the full summary content.
 *
 * @param client - Slack WebClient instance
 * @param channel - Slack channel ID or name
 * @param workSummary - The work summary to send
 * @returns Result of the notification send
 */
export async function sendSummary(
  client: SlackClient,
  channel: string,
  workSummary: WorkSummary
): Promise<NotificationResult> {
  const message = buildWorkSummaryBlocks(workSummary);
  return sendMessage(client, channel, message);
}

/**
 * Send a blocker alert to a Slack channel.
 * Posts a message highlighting active blockers that are
 * impeding development velocity.
 *
 * @param client - Slack WebClient instance
 * @param channel - Slack channel ID or name
 * @param blockers - The blockers to report
 * @param teamId - Optional team identifier
 * @returns Result of the notification send
 */
export async function sendBlockerAlert(
  client: SlackClient,
  channel: string,
  blockers: Blocker[],
  teamId?: string
): Promise<NotificationResult> {
  if (blockers.length === 0) {
    return { ok: true, channel, ts: undefined };
  }

  const message = buildBlockerAlertBlocks(blockers, teamId);
  return sendMessage(client, channel, message);
}

// ─── Core Send Function ──────────────────────────────────────────

/**
 * Send a Slack message using the WebClient.
 * Handles formatting of blocks and attachments, and wraps
 * errors into a consistent result format.
 */
async function sendMessage(
  client: SlackClient,
  channel: string,
  message: SlackMessage
): Promise<NotificationResult> {
  try {
    const response = await client.chat.postMessage({
      channel,
      text: message.text,
      blocks: message.blocks as unknown as KnownBlock[],
      ...(message.attachments && {
        attachments: message.attachments.map((a) => ({
          color: a.color,
          blocks: a.blocks as unknown as KnownBlock[],
        })),
      }),
    });

    return {
      ok: response.ok ?? false,
      ts: response.ts,
      channel,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[ArchGuard Slack] Failed to send message to ${channel}: ${errorMessage}`
    );

    return {
      ok: false,
      channel,
      error: errorMessage,
    };
  }
}

/**
 * Send a threaded reply to an existing message.
 * Useful for posting follow-up details to an alert.
 */
export async function sendThreadedReply(
  client: SlackClient,
  channel: string,
  threadTs: string,
  message: SlackMessage
): Promise<NotificationResult> {
  try {
    const response = await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: message.text,
      blocks: message.blocks as unknown as KnownBlock[],
      ...(message.attachments && {
        attachments: message.attachments.map((a) => ({
          color: a.color,
          blocks: a.blocks as unknown as KnownBlock[],
        })),
      }),
    });

    return {
      ok: response.ok ?? false,
      ts: response.ts,
      channel,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[ArchGuard Slack] Failed to send threaded reply to ${channel}: ${errorMessage}`
    );

    return {
      ok: false,
      channel,
      error: errorMessage,
    };
  }
}

/**
 * Update an existing Slack message.
 * Useful for updating in-progress notifications with final results.
 */
export async function updateMessage(
  client: SlackClient,
  channel: string,
  ts: string,
  message: SlackMessage
): Promise<NotificationResult> {
  try {
    const response = await client.chat.update({
      channel,
      ts,
      text: message.text,
      blocks: message.blocks as unknown as KnownBlock[],
      ...(message.attachments && {
        attachments: message.attachments.map((a) => ({
          color: a.color,
          blocks: a.blocks as unknown as KnownBlock[],
        })),
      }),
    });

    return {
      ok: response.ok ?? false,
      ts: response.ts,
      channel,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[ArchGuard Slack] Failed to update message in ${channel}: ${errorMessage}`
    );

    return {
      ok: false,
      channel,
      error: errorMessage,
    };
  }
}
