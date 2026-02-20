/**
 * GitHub App setup and webhook event routing.
 * Creates a GitHub App instance using @octokit/app and registers
 * webhook handlers for pull_request and push events, routing them
 * to the appropriate integration handlers.
 */

import { App } from '@octokit/app';
import type { Octokit } from '@octokit/rest';
import { handlePREvent, type PREventContext } from './pr-bot.js';
import { createSnoutGuardCheckRun, type CheckRunContext } from './check-run.js';
import {
  createGitHubClient,
  getDiff,
  getPR,
  type PRRef,
  type RepoRef,
} from './api.js';

// ─── Types ────────────────────────────────────────────────────────

/** Configuration for creating the GitHub App */
export interface GitHubAppConfig {
  /** GitHub App ID */
  appId: string;
  /** GitHub App private key (PEM format) */
  privateKey: string;
  /** Webhook secret for verifying payloads */
  webhookSecret: string;
  /** Optional GitHub Enterprise base URL */
  baseUrl?: string;
}

/** Handler functions that consumers can provide for custom behavior */
export interface GitHubAppHandlers {
  /** Called when a PR is opened or updated. If not provided, uses default handler. */
  onPullRequest?: (ctx: PREventContext) => Promise<void>;
  /** Called on push events to the default branch */
  onPush?: (ctx: PushEventContext) => Promise<void>;
}

/** Context passed to push event handlers */
export interface PushEventContext {
  octokit: Octokit;
  repo: RepoRef;
  ref: string;
  headSha: string;
  beforeSha: string;
  pusher: string;
  commits: PushCommit[];
  isDefaultBranch: boolean;
}

/** A commit from a push event payload */
export interface PushCommit {
  id: string;
  message: string;
  author: string;
  timestamp: string;
  added: string[];
  removed: string[];
  modified: string[];
}

// ─── App Creation ─────────────────────────────────────────────────

/**
 * Create and configure a GitHub App with SnoutGuard webhook handlers.
 *
 * The app listens for:
 * - `pull_request.opened` - triggers architectural review on new PRs
 * - `pull_request.synchronize` - re-reviews when PR is updated with new commits
 * - `push` - triggers drift analysis on pushes to the default branch
 *
 * @param config - GitHub App credentials and settings
 * @param handlers - Optional custom handler overrides
 * @returns Configured GitHub App instance
 */
export function createGitHubApp(
  config: GitHubAppConfig,
  handlers: GitHubAppHandlers = {}
): App {
  const app = new App({
    appId: config.appId,
    privateKey: config.privateKey,
    webhooks: {
      secret: config.webhookSecret,
    },
    ...(config.baseUrl ? { Octokit: createOctokitDefaults(config.baseUrl) } : {}),
  });

  // ── Pull Request Opened ───────────────────────────────────────
  app.webhooks.on('pull_request.opened', async ({ octokit, payload }) => {
    const repo: RepoRef = {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
    };
    const prRef: PRRef = {
      ...repo,
      pullNumber: payload.pull_request.number,
    };

    try {
      const ctx: PREventContext = {
        octokit: octokit as unknown as Octokit,
        repo,
        prRef,
        action: 'opened',
        headSha: payload.pull_request.head.sha,
        baseRef: payload.pull_request.base.ref,
        author: payload.pull_request.user.login,
        prTitle: payload.pull_request.title,
        prBody: payload.pull_request.body ?? '',
      };

      if (handlers.onPullRequest) {
        await handlers.onPullRequest(ctx);
      } else {
        await handlePREvent(ctx);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[SnoutGuard] Error handling PR opened for ${repo.owner}/${repo.repo}#${prRef.pullNumber}: ${message}`
      );
    }
  });

  // ── Pull Request Synchronize ──────────────────────────────────
  app.webhooks.on('pull_request.synchronize', async ({ octokit, payload }) => {
    const repo: RepoRef = {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
    };
    const prRef: PRRef = {
      ...repo,
      pullNumber: payload.pull_request.number,
    };

    try {
      const ctx: PREventContext = {
        octokit: octokit as unknown as Octokit,
        repo,
        prRef,
        action: 'synchronize',
        headSha: payload.pull_request.head.sha,
        baseRef: payload.pull_request.base.ref,
        author: payload.pull_request.user?.login ?? '',
        prTitle: payload.pull_request.title,
        prBody: payload.pull_request.body ?? '',
      };

      if (handlers.onPullRequest) {
        await handlers.onPullRequest(ctx);
      } else {
        await handlePREvent(ctx);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[SnoutGuard] Error handling PR synchronize for ${repo.owner}/${repo.repo}#${prRef.pullNumber}: ${message}`
      );
    }
  });

  // ── Push Events ───────────────────────────────────────────────
  app.webhooks.on('push', async ({ octokit, payload }) => {
    const repo: RepoRef = {
      owner: payload.repository.owner?.login ?? '',
      repo: payload.repository.name,
    };

    const defaultBranch = payload.repository.default_branch;
    const ref = payload.ref;
    const isDefaultBranch = ref === `refs/heads/${defaultBranch}`;

    // Only process pushes to the default branch for drift analysis
    if (!isDefaultBranch && !handlers.onPush) {
      return;
    }

    try {
      const commits: PushCommit[] = (payload.commits ?? []).map((c: Record<string, unknown>) => ({
        id: c.id as string,
        message: c.message as string,
        author: (c.author as Record<string, string>)?.username ??
          (c.author as Record<string, string>)?.name ?? 'unknown',
        timestamp: c.timestamp as string,
        added: (c.added as string[]) ?? [],
        removed: (c.removed as string[]) ?? [],
        modified: (c.modified as string[]) ?? [],
      }));

      const ctx: PushEventContext = {
        octokit: octokit as unknown as Octokit,
        repo,
        ref,
        headSha: payload.after,
        beforeSha: payload.before,
        pusher: payload.pusher?.name ?? 'unknown',
        commits,
        isDefaultBranch,
      };

      if (handlers.onPush) {
        await handlers.onPush(ctx);
      } else if (isDefaultBranch) {
        // Default: create a check run for the push
        const checkCtx: CheckRunContext = {
          octokit: octokit as unknown as Octokit,
          repo,
          headSha: payload.after,
          violations: [],
          severityThreshold: 'warning',
        };
        await createSnoutGuardCheckRun(checkCtx);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[SnoutGuard] Error handling push to ${repo.owner}/${repo.repo} ref=${ref}: ${message}`
      );
    }
  });

  // ── Error Handler ─────────────────────────────────────────────
  app.webhooks.onError((error) => {
    console.error(`[SnoutGuard] Webhook error: ${error.message}`);
  });

  return app;
}

/**
 * Create an Octokit constructor with default base URL for GitHub Enterprise.
 * This is used to configure the App's Octokit instances.
 */
function createOctokitDefaults(baseUrl: string) {
  // Return a class-like factory that @octokit/app can use
  const { Octokit } = require('@octokit/rest') as typeof import('@octokit/rest');
  return Octokit.defaults({ baseUrl });
}
