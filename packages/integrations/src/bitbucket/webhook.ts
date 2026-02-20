/**
 * Bitbucket webhook handler for SnoutGuard.
 * Handles incoming Bitbucket webhook payloads for pull request events
 * (pullrequest:created, pullrequest:updated) and routes them to the
 * Bitbucket PR bot for architectural review.
 */

import type { ReviewResult, ViolationSeverity } from '@snoutguard/core';
import {
  createBitbucketClient,
  type BitbucketClient,
  type BitbucketPRRef,
  type BitbucketRepoRef,
  type BitbucketFileDiff,
} from './api.js';
import {
  handleBitbucketPREvent,
  type BitbucketPREventContext,
  type BitbucketPRBotOptions,
  type BitbucketPRBotResult,
} from './pr-bot.js';

// ─── Types ────────────────────────────────────────────────────────

/** Supported Bitbucket webhook event types */
export type BitbucketWebhookEvent =
  | 'pullrequest:created'
  | 'pullrequest:updated';

/** Configuration for the Bitbucket webhook handler */
export interface BitbucketWebhookConfig {
  /** OAuth access token for the Bitbucket API */
  token: string;
  /** Default workspace slug */
  workspace: string;
  /** Optional base URL for Bitbucket Server */
  baseUrl?: string;
  /** Webhook secret for verifying payloads (optional) */
  webhookSecret?: string;
  /** PR bot options */
  botOptions?: BitbucketPRBotOptions;
}

/** Custom handlers that consumers can provide */
export interface BitbucketWebhookHandlers {
  /** Called when a PR is created or updated. If not provided, uses default handler. */
  onPullRequest?: (ctx: BitbucketPREventContext) => Promise<void>;
}

/** Raw Bitbucket webhook payload for pull request events */
export interface BitbucketPRWebhookPayload {
  pullrequest: {
    id: number;
    title: string;
    description?: string;
    state: string;
    source: {
      branch: { name: string };
      commit: { hash: string };
      repository: {
        full_name: string;
        name: string;
        uuid: string;
      };
    };
    destination: {
      branch: { name: string };
      commit: { hash: string };
      repository: {
        full_name: string;
        name: string;
        uuid: string;
      };
    };
    author: {
      display_name: string;
      nickname?: string;
      uuid: string;
    };
    links: {
      html: { href: string };
    };
    created_on: string;
    updated_on: string;
  };
  repository: {
    full_name: string;
    name: string;
    uuid: string;
    workspace: {
      slug: string;
      uuid: string;
    };
  };
  actor: {
    display_name: string;
    nickname?: string;
    uuid: string;
  };
}

/** Result of processing a webhook event */
export interface WebhookHandlerResult {
  /** Whether the event was handled successfully */
  handled: boolean;
  /** The event type that was processed */
  eventType: string;
  /** The PR bot result, if a PR event was handled */
  botResult?: BitbucketPRBotResult;
  /** Error message if handling failed */
  error?: string;
}

// ─── Webhook Handler ──────────────────────────────────────────────

/**
 * Create a Bitbucket webhook handler function.
 *
 * Returns a function that accepts an event type and payload,
 * validates the event, and routes it to the appropriate handler.
 *
 * @param config - Webhook handler configuration
 * @param handlers - Optional custom handler overrides
 * @returns Handler function for Bitbucket webhooks
 */
export function createBitbucketWebhookHandler(
  config: BitbucketWebhookConfig,
  handlers: BitbucketWebhookHandlers = {}
): (eventType: string, payload: unknown) => Promise<WebhookHandlerResult> {
  const client = createBitbucketClient({
    token: config.token,
    workspace: config.workspace,
    baseUrl: config.baseUrl,
  });

  return async (eventType: string, payload: unknown): Promise<WebhookHandlerResult> => {
    // Validate event type
    if (!isSupportedEvent(eventType)) {
      return {
        handled: false,
        eventType,
        error: `Unsupported event type: ${eventType}`,
      };
    }

    // Validate payload structure
    if (!isValidPRPayload(payload)) {
      return {
        handled: false,
        eventType,
        error: 'Invalid webhook payload: missing required fields',
      };
    }

    try {
      const prPayload = payload as BitbucketPRWebhookPayload;
      const result = await handlePRWebhookEvent(
        client,
        eventType as BitbucketWebhookEvent,
        prPayload,
        config,
        handlers
      );

      return {
        handled: true,
        eventType,
        botResult: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[SnoutGuard Bitbucket Webhook] Error handling ${eventType}: ${message}`
      );

      return {
        handled: false,
        eventType,
        error: message,
      };
    }
  };
}

/**
 * Verify the Bitbucket webhook signature.
 * Bitbucket uses a shared secret that is sent in the payload.
 * For Bitbucket Cloud, webhook signatures are not natively supported
 * like GitHub, but some setups use IP whitelisting or custom secrets.
 *
 * @param secret - The expected webhook secret
 * @param signature - The signature from the request headers (X-Hub-Signature)
 * @param body - The raw request body
 * @returns Whether the signature is valid
 */
export function verifyWebhookSignature(
  secret: string,
  signature: string | undefined,
  body: string
): boolean {
  if (!secret) {
    // No secret configured, skip verification
    return true;
  }

  if (!signature) {
    return false;
  }

  // Bitbucket Cloud doesn't natively sign webhooks the same way GitHub does.
  // This is a placeholder for custom signature verification if needed.
  // For Bitbucket Server, HMAC-SHA256 is used.
  try {
    const crypto = require('crypto') as typeof import('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body, 'utf-8')
      .digest('hex');

    // Constant-time comparison
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

// ─── Internal Handlers ────────────────────────────────────────────

/**
 * Handle a pull request webhook event.
 */
async function handlePRWebhookEvent(
  client: BitbucketClient,
  eventType: BitbucketWebhookEvent,
  payload: BitbucketPRWebhookPayload,
  config: BitbucketWebhookConfig,
  handlers: BitbucketWebhookHandlers
): Promise<BitbucketPRBotResult | undefined> {
  const pr = payload.pullrequest;
  const repo = payload.repository;

  const workspace = repo.workspace.slug;
  const repoSlug = repo.name;

  const repoRef: BitbucketRepoRef = {
    workspace,
    repoSlug,
  };

  const prRef: BitbucketPRRef = {
    ...repoRef,
    prId: pr.id,
  };

  const action = eventType === 'pullrequest:created' ? 'created' as const : 'updated' as const;

  const ctx: BitbucketPREventContext = {
    client,
    repoRef,
    prRef,
    action,
    sourceBranch: pr.source.branch.name,
    sourceCommitHash: pr.source.commit.hash,
    destinationBranch: pr.destination.branch.name,
    author: pr.author.display_name,
    prTitle: pr.title,
    prDescription: pr.description ?? '',
  };

  if (handlers.onPullRequest) {
    await handlers.onPullRequest(ctx);
    return undefined;
  }

  return handleBitbucketPREvent(ctx, config.botOptions);
}

// ─── Validation ──────────────────────────────────────────────────

/** Check if an event type is supported */
function isSupportedEvent(eventType: string): boolean {
  return eventType === 'pullrequest:created' || eventType === 'pullrequest:updated';
}

/** Validate that a payload has the expected PR webhook structure */
function isValidPRPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const p = payload as Record<string, unknown>;

  // Check required top-level fields
  if (!p.pullrequest || typeof p.pullrequest !== 'object') {
    return false;
  }

  if (!p.repository || typeof p.repository !== 'object') {
    return false;
  }

  const pr = p.pullrequest as Record<string, unknown>;

  // Check required PR fields
  if (typeof pr.id !== 'number') {
    return false;
  }

  if (!pr.source || typeof pr.source !== 'object') {
    return false;
  }

  if (!pr.destination || typeof pr.destination !== 'object') {
    return false;
  }

  return true;
}
