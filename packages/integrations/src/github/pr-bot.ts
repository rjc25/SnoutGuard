/**
 * GitHub PR bot for architectural review.
 * On pull request events, triggers an architectural review of the changed files
 * and posts review comments with inline annotations for each violation found.
 * Uses the Octokit client to create pull request reviews.
 */

import type { Octokit } from '@octokit/rest';
import type {
  ReviewResult,
  Violation,
  ViolationSeverity,
} from '@archguard/core';
import {
  getDiff,
  getPR,
  createComment,
  createReview,
  type PRRef,
  type RepoRef,
  type ReviewComment,
  type GitHubFileDiff,
} from './api.js';
import { createArchGuardCheckRun, type CheckRunContext } from './check-run.js';

// ─── Types ────────────────────────────────────────────────────────

/** Context for a pull request event */
export interface PREventContext {
  octokit: Octokit;
  repo: RepoRef;
  prRef: PRRef;
  action: 'opened' | 'synchronize';
  headSha: string;
  baseRef: string;
  author: string;
  prTitle: string;
  prBody: string;
}

/** Options for controlling PR review behavior */
export interface PRBotOptions {
  /** Severity threshold for posting inline comments (default: 'warning') */
  severityThreshold?: ViolationSeverity;
  /** Whether to create a check run alongside the review (default: true) */
  createCheckRun?: boolean;
  /** Whether to post a summary comment on the PR (default: true) */
  postSummaryComment?: boolean;
  /** Maximum number of inline comments to post (default: 50) */
  maxInlineComments?: number;
  /** Custom review function to generate violations from the diff */
  reviewFunction?: (
    files: GitHubFileDiff[],
    ctx: PREventContext
  ) => Promise<ReviewResult>;
}

/** Result of handling a PR event */
export interface PRBotResult {
  /** The review result with all violations */
  reviewResult: ReviewResult | null;
  /** ID of the GitHub review created, if any */
  reviewId: number | null;
  /** ID of the check run created, if any */
  checkRunId: number | null;
  /** ID of the summary comment created, if any */
  commentId: number | null;
  /** Whether the review passed (no actionable violations) */
  passed: boolean;
}

// ─── Default Options ──────────────────────────────────────────────

const DEFAULT_OPTIONS: Required<Omit<PRBotOptions, 'reviewFunction'>> = {
  severityThreshold: 'warning',
  createCheckRun: true,
  postSummaryComment: true,
  maxInlineComments: 50,
};

// ─── Main Handler ─────────────────────────────────────────────────

/**
 * Handle a pull request event by running architectural review.
 * This is the default handler called by the GitHub App when no
 * custom onPullRequest handler is provided.
 *
 * Steps:
 * 1. Fetch the PR diff
 * 2. Run architectural review (via provided review function or stub)
 * 3. Post inline review comments for violations
 * 4. Create a check run with pass/fail status
 * 5. Post a summary comment
 */
export async function handlePREvent(
  ctx: PREventContext,
  options: PRBotOptions = {}
): Promise<PRBotResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const result: PRBotResult = {
    reviewResult: null,
    reviewId: null,
    checkRunId: null,
    commentId: null,
    passed: true,
  };

  try {
    // Step 1: Fetch the diff
    const files = await getDiff(ctx.octokit, ctx.prRef);

    if (files.length === 0) {
      return result;
    }

    // Step 2: Run architectural review
    let reviewResult: ReviewResult;

    if (opts.reviewFunction) {
      reviewResult = await opts.reviewFunction(files, ctx);
    } else {
      // Default: produce an empty review when no review function is wired up
      reviewResult = buildDefaultReviewResult(ctx, files);
    }

    result.reviewResult = reviewResult;

    // Filter violations by severity threshold
    const actionableViolations = filterViolationsBySeverity(
      reviewResult.violations,
      opts.severityThreshold
    );
    result.passed = actionableViolations.length === 0;

    // Step 3: Post inline review comments
    if (actionableViolations.length > 0) {
      const reviewId = await postReviewWithAnnotations(
        ctx,
        reviewResult,
        actionableViolations,
        files,
        opts.maxInlineComments
      );
      result.reviewId = reviewId;
    }

    // Step 4: Create check run
    if (opts.createCheckRun) {
      const checkCtx: CheckRunContext = {
        octokit: ctx.octokit,
        repo: ctx.repo,
        headSha: ctx.headSha,
        violations: reviewResult.violations,
        severityThreshold: opts.severityThreshold,
      };
      result.checkRunId = await createArchGuardCheckRun(checkCtx);
    }

    // Step 5: Post summary comment
    if (opts.postSummaryComment && reviewResult.violations.length > 0) {
      const summary = buildSummaryComment(reviewResult, result.passed);
      result.commentId = await createComment(ctx.octokit, ctx.prRef, summary);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[ArchGuard PR Bot] Error reviewing ${ctx.repo.owner}/${ctx.repo.repo}#${ctx.prRef.pullNumber}: ${message}`
    );

    // Attempt to post an error comment so the PR author knows something went wrong
    try {
      await createComment(
        ctx.octokit,
        ctx.prRef,
        `## ArchGuard Review Error\n\nAn error occurred while running the architectural review:\n\n\`\`\`\n${message}\n\`\`\`\n\nPlease check the ArchGuard configuration and try again.`
      );
    } catch {
      // Swallow comment posting error
    }

    return result;
  }
}

// ─── Review Posting ───────────────────────────────────────────────

/**
 * Post a pull request review with inline comments mapped to file positions.
 * Violations are mapped to the specific files and lines in the diff where
 * they were found.
 */
async function postReviewWithAnnotations(
  ctx: PREventContext,
  reviewResult: ReviewResult,
  violations: Violation[],
  files: GitHubFileDiff[],
  maxComments: number
): Promise<number> {
  // Build a set of files in the diff for quick lookup
  const diffFileSet = new Set(files.map((f) => f.filename));

  // Map violations to inline review comments
  const comments: ReviewComment[] = [];

  for (const violation of violations) {
    // Only post inline comments for files that are in the diff
    if (!diffFileSet.has(violation.filePath)) {
      continue;
    }

    if (comments.length >= maxComments) {
      break;
    }

    const body = formatViolationComment(violation);
    comments.push({
      path: violation.filePath,
      line: violation.lineEnd,
      side: 'RIGHT',
      startLine: violation.lineStart !== violation.lineEnd ? violation.lineStart : undefined,
      startSide: violation.lineStart !== violation.lineEnd ? 'RIGHT' : undefined,
      body,
    });
  }

  // Determine review event type based on pass/fail
  const event = violations.some((v) => v.severity === 'error')
    ? 'REQUEST_CHANGES' as const
    : 'COMMENT' as const;

  const reviewBody = buildReviewBody(reviewResult, violations);

  return createReview(ctx.octokit, ctx.prRef, {
    body: reviewBody,
    event,
    comments: comments.length > 0 ? comments : undefined,
    commitId: ctx.headSha,
  });
}

// ─── Comment Formatting ──────────────────────────────────────────

/**
 * Format a single violation as an inline review comment body.
 */
function formatViolationComment(violation: Violation): string {
  const severityIcon = getSeverityIcon(violation.severity);
  const parts: string[] = [
    `${severityIcon} **ArchGuard: ${violation.rule}** [${violation.severity}]`,
    '',
    violation.message,
  ];

  if (violation.suggestion) {
    parts.push('', `**Suggestion:** ${violation.suggestion}`);
  }

  if (violation.decisionId) {
    parts.push('', `_Related decision: \`${violation.decisionId}\`_`);
  }

  return parts.join('\n');
}

/**
 * Build the review body summarizing all violations.
 */
function buildReviewBody(
  reviewResult: ReviewResult,
  actionableViolations: Violation[]
): string {
  const parts: string[] = [
    '## ArchGuard Architectural Review',
    '',
    `Found **${reviewResult.totalViolations}** total violation(s): ` +
      `${reviewResult.errors} error(s), ${reviewResult.warnings} warning(s), ` +
      `${reviewResult.infos} info(s).`,
  ];

  if (actionableViolations.length > 0) {
    parts.push(
      '',
      `**${actionableViolations.length}** violation(s) require attention.`,
      '',
      'Please review the inline comments below for details on each violation.'
    );
  }

  return parts.join('\n');
}

/**
 * Build a summary comment posted on the PR conversation.
 */
function buildSummaryComment(reviewResult: ReviewResult, passed: boolean): string {
  const statusIcon = passed ? '\u2705' : '\u274C';
  const statusText = passed ? 'Passed' : 'Changes Requested';

  const parts: string[] = [
    `## ${statusIcon} ArchGuard Architectural Review: ${statusText}`,
    '',
    '| Severity | Count |',
    '|----------|-------|',
    `| Errors   | ${reviewResult.errors} |`,
    `| Warnings | ${reviewResult.warnings} |`,
    `| Info     | ${reviewResult.infos} |`,
    `| **Total** | **${reviewResult.totalViolations}** |`,
  ];

  // Group violations by rule
  const ruleGroups = new Map<string, Violation[]>();
  for (const v of reviewResult.violations) {
    const group = ruleGroups.get(v.rule) ?? [];
    group.push(v);
    ruleGroups.set(v.rule, group);
  }

  if (ruleGroups.size > 0) {
    parts.push('', '### Violations by Rule', '');

    for (const [rule, violations] of ruleGroups) {
      const highestSeverity = violations.reduce(
        (highest, v) => (severityWeight(v.severity) > severityWeight(highest) ? v.severity : highest),
        'info' as ViolationSeverity
      );
      parts.push(
        `- **${rule}** (${violations.length}x) ${getSeverityIcon(highestSeverity)}`
      );
    }
  }

  // List affected files
  const affectedFiles = [...new Set(reviewResult.violations.map((v) => v.filePath))];
  if (affectedFiles.length > 0) {
    parts.push('', '### Affected Files', '');
    for (const file of affectedFiles.slice(0, 20)) {
      parts.push(`- \`${file}\``);
    }
    if (affectedFiles.length > 20) {
      parts.push(`- _...and ${affectedFiles.length - 20} more_`);
    }
  }

  parts.push(
    '',
    '---',
    '_Review by [ArchGuard](https://github.com/archguard) | Architectural code review bot_'
  );

  return parts.join('\n');
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Severity weight for comparison */
function severityWeight(severity: ViolationSeverity): number {
  switch (severity) {
    case 'error': return 3;
    case 'warning': return 2;
    case 'info': return 1;
  }
}

/** Get icon for a severity level */
function getSeverityIcon(severity: ViolationSeverity): string {
  switch (severity) {
    case 'error': return '\u274C';
    case 'warning': return '\u26A0\uFE0F';
    case 'info': return '\u2139\uFE0F';
  }
}

/** Filter violations to only those at or above a severity threshold */
function filterViolationsBySeverity(
  violations: Violation[],
  threshold: ViolationSeverity
): Violation[] {
  const thresholdWeight = severityWeight(threshold);
  return violations.filter((v) => severityWeight(v.severity) >= thresholdWeight);
}

/**
 * Build a default empty review result when no review function is provided.
 * This allows the PR bot to run without a full review pipeline wired up.
 */
function buildDefaultReviewResult(
  ctx: PREventContext,
  _files: GitHubFileDiff[]
): ReviewResult {
  return {
    id: `review-${ctx.prRef.pullNumber}-${ctx.headSha.slice(0, 7)}`,
    repoId: `${ctx.repo.owner}/${ctx.repo.repo}`,
    ref: ctx.headSha,
    prNumber: ctx.prRef.pullNumber,
    prUrl: `https://github.com/${ctx.repo.owner}/${ctx.repo.repo}/pull/${ctx.prRef.pullNumber}`,
    totalViolations: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
    violations: [],
    triggeredBy: 'webhook',
    reviewedAt: new Date().toISOString(),
  };
}
