/**
 * Bitbucket PR comment integration for ArchGuard.
 * Posts inline comments on pull requests via the Bitbucket API when
 * architectural violations are found. Uses Bitbucket Code Insights API
 * to create build statuses reflecting review pass/fail.
 */

import type {
  ReviewResult,
  Violation,
  ViolationSeverity,
} from '@archguard/core';
import {
  getDiff,
  getPR,
  createComment,
  createBuildStatus,
  type BitbucketClient,
  type BitbucketPRRef,
  type BitbucketRepoRef,
  type BitbucketFileDiff,
  type BitbucketBuildState,
  type BitbucketComment,
} from './api.js';

// ─── Types ────────────────────────────────────────────────────────

/** Context for a Bitbucket PR event */
export interface BitbucketPREventContext {
  client: BitbucketClient;
  repoRef: BitbucketRepoRef;
  prRef: BitbucketPRRef;
  action: 'created' | 'updated';
  sourceBranch: string;
  sourceCommitHash: string;
  destinationBranch: string;
  author: string;
  prTitle: string;
  prDescription: string;
}

/** Options for the Bitbucket PR bot */
export interface BitbucketPRBotOptions {
  /** Severity threshold for posting inline comments (default: 'warning') */
  severityThreshold?: ViolationSeverity;
  /** Whether to create a build status (default: true) */
  createBuildStatus?: boolean;
  /** Whether to post a summary comment (default: true) */
  postSummaryComment?: boolean;
  /** Maximum number of inline comments to post (default: 50) */
  maxInlineComments?: number;
  /** URL for the build status link (default: empty) */
  buildStatusUrl?: string;
  /** Custom review function to generate violations from the diff */
  reviewFunction?: (
    files: BitbucketFileDiff[],
    ctx: BitbucketPREventContext
  ) => Promise<ReviewResult>;
}

/** Result of handling a Bitbucket PR event */
export interface BitbucketPRBotResult {
  reviewResult: ReviewResult | null;
  inlineCommentIds: number[];
  summaryCommentId: number | null;
  buildStatusCreated: boolean;
  passed: boolean;
}

// ─── Default Options ──────────────────────────────────────────────

const DEFAULT_OPTIONS: Required<Omit<BitbucketPRBotOptions, 'reviewFunction'>> = {
  severityThreshold: 'warning',
  createBuildStatus: true,
  postSummaryComment: true,
  maxInlineComments: 50,
  buildStatusUrl: '',
};

// ─── Constants ────────────────────────────────────────────────────

const BUILD_STATUS_KEY = 'archguard-review';
const BUILD_STATUS_NAME = 'ArchGuard Architectural Review';

// ─── Main Handler ─────────────────────────────────────────────────

/**
 * Handle a Bitbucket pull request event by running architectural review.
 *
 * Steps:
 * 1. Set build status to INPROGRESS
 * 2. Fetch the PR diff
 * 3. Run architectural review
 * 4. Post inline comments for violations
 * 5. Post a summary comment
 * 6. Update build status to SUCCESSFUL or FAILED
 */
export async function handleBitbucketPREvent(
  ctx: BitbucketPREventContext,
  options: BitbucketPRBotOptions = {}
): Promise<BitbucketPRBotResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const result: BitbucketPRBotResult = {
    reviewResult: null,
    inlineCommentIds: [],
    summaryCommentId: null,
    buildStatusCreated: false,
    passed: true,
  };

  try {
    // Step 1: Set build status to in-progress
    if (opts.createBuildStatus) {
      await setBuildStatus(
        ctx.client,
        ctx.repoRef,
        ctx.sourceCommitHash,
        'INPROGRESS',
        'Architectural review in progress...',
        opts.buildStatusUrl
      );
      result.buildStatusCreated = true;
    }

    // Step 2: Fetch the diff
    const files = await getDiff(ctx.client, ctx.prRef);

    if (files.length === 0) {
      if (opts.createBuildStatus) {
        await setBuildStatus(
          ctx.client,
          ctx.repoRef,
          ctx.sourceCommitHash,
          'SUCCESSFUL',
          'No files changed - no violations found.',
          opts.buildStatusUrl
        );
      }
      return result;
    }

    // Step 3: Run architectural review
    let reviewResult: ReviewResult;

    if (opts.reviewFunction) {
      reviewResult = await opts.reviewFunction(files, ctx);
    } else {
      reviewResult = buildDefaultReviewResult(ctx);
    }

    result.reviewResult = reviewResult;

    // Filter violations by threshold
    const actionableViolations = filterBySeverity(
      reviewResult.violations,
      opts.severityThreshold
    );
    result.passed = actionableViolations.length === 0;

    // Step 4: Post inline comments
    const diffFileSet = buildDiffFileSet(files);
    const inlineViolations = actionableViolations
      .filter((v) => diffFileSet.has(v.filePath))
      .slice(0, opts.maxInlineComments);

    for (const violation of inlineViolations) {
      try {
        const commentId = await createComment(ctx.client, ctx.prRef, {
          content: formatViolationComment(violation),
          inline: {
            path: violation.filePath,
            line: violation.lineEnd,
            side: 'new',
          },
        });
        result.inlineCommentIds.push(commentId);
      } catch (error) {
        // Continue posting other comments even if one fails
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[ArchGuard Bitbucket Bot] Failed to post inline comment: ${message}`
        );
      }
    }

    // Step 5: Post summary comment
    if (opts.postSummaryComment && reviewResult.violations.length > 0) {
      try {
        const summary = buildSummaryComment(reviewResult, result.passed);
        result.summaryCommentId = await createComment(ctx.client, ctx.prRef, {
          content: summary,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[ArchGuard Bitbucket Bot] Failed to post summary comment: ${message}`
        );
      }
    }

    // Step 6: Update build status
    if (opts.createBuildStatus) {
      const state: BitbucketBuildState = result.passed ? 'SUCCESSFUL' : 'FAILED';
      const description = result.passed
        ? 'No architectural violations found.'
        : `${actionableViolations.length} architectural violation(s) found.`;

      await setBuildStatus(
        ctx.client,
        ctx.repoRef,
        ctx.sourceCommitHash,
        state,
        description,
        opts.buildStatusUrl
      );
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[ArchGuard Bitbucket Bot] Error reviewing ${ctx.repoRef.workspace}/${ctx.repoRef.repoSlug}#${ctx.prRef.prId}: ${message}`
    );

    // Update build status to stopped on error
    if (opts.createBuildStatus) {
      try {
        await setBuildStatus(
          ctx.client,
          ctx.repoRef,
          ctx.sourceCommitHash,
          'STOPPED',
          `Review error: ${message}`,
          opts.buildStatusUrl
        );
      } catch {
        // Swallow build status error
      }
    }

    // Post error comment
    try {
      await createComment(ctx.client, ctx.prRef, {
        content: `## ArchGuard Review Error\n\nAn error occurred while running the architectural review:\n\n\`\`\`\n${message}\n\`\`\`\n\nPlease check the ArchGuard configuration and try again.`,
      });
    } catch {
      // Swallow comment error
    }

    return result;
  }
}

// ─── Build Status Helper ──────────────────────────────────────────

/**
 * Set the build status on a commit.
 */
async function setBuildStatus(
  client: BitbucketClient,
  repoRef: BitbucketRepoRef,
  commitHash: string,
  state: BitbucketBuildState,
  description: string,
  url: string
): Promise<void> {
  await createBuildStatus(client, repoRef, commitHash, {
    state,
    key: BUILD_STATUS_KEY,
    name: BUILD_STATUS_NAME,
    description,
    url: url || 'https://archguard.dev',
  });
}

// ─── Comment Formatting ──────────────────────────────────────────

/**
 * Format a violation as an inline PR comment.
 */
function formatViolationComment(violation: Violation): string {
  const icon = getSeverityIcon(violation.severity);
  const parts: string[] = [
    `${icon} **ArchGuard: ${violation.rule}** [${violation.severity}]`,
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
 * Build a summary comment for the PR.
 */
function buildSummaryComment(
  reviewResult: ReviewResult,
  passed: boolean
): string {
  const statusText = passed ? 'Passed' : 'Changes Requested';
  const statusIcon = passed ? '\u2705' : '\u274C';

  const parts: string[] = [
    `## ${statusIcon} ArchGuard Architectural Review: ${statusText}`,
    '',
    `| Severity | Count |`,
    `|----------|-------|`,
    `| Errors   | ${reviewResult.errors} |`,
    `| Warnings | ${reviewResult.warnings} |`,
    `| Info     | ${reviewResult.infos} |`,
    `| **Total** | **${reviewResult.totalViolations}** |`,
  ];

  // Group by rule
  const ruleGroups = new Map<string, number>();
  for (const v of reviewResult.violations) {
    ruleGroups.set(v.rule, (ruleGroups.get(v.rule) ?? 0) + 1);
  }

  if (ruleGroups.size > 0) {
    parts.push('', '### Violations by Rule', '');
    for (const [rule, count] of ruleGroups) {
      parts.push(`- **${rule}**: ${count}x`);
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
    '_Review by [ArchGuard](https://archguard.dev) | Architectural code review_'
  );

  return parts.join('\n');
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Build a set of file paths present in the diff */
function buildDiffFileSet(files: BitbucketFileDiff[]): Set<string> {
  const fileSet = new Set<string>();
  for (const f of files) {
    if (f.new) fileSet.add(f.new.path);
    if (f.old) fileSet.add(f.old.path);
  }
  return fileSet;
}

/** Filter violations by severity threshold */
function filterBySeverity(
  violations: Violation[],
  threshold: ViolationSeverity
): Violation[] {
  const weight = severityWeight(threshold);
  return violations.filter((v) => severityWeight(v.severity) >= weight);
}

/** Get numeric weight for a severity level */
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

/**
 * Build a default empty review result when no review function is provided.
 */
function buildDefaultReviewResult(ctx: BitbucketPREventContext): ReviewResult {
  return {
    id: `review-bb-${ctx.prRef.prId}-${ctx.sourceCommitHash.slice(0, 7)}`,
    repoId: `${ctx.repoRef.workspace}/${ctx.repoRef.repoSlug}`,
    ref: ctx.sourceCommitHash,
    prNumber: ctx.prRef.prId,
    prUrl: '',
    totalViolations: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
    violations: [],
    triggeredBy: 'webhook',
    reviewedAt: new Date().toISOString(),
  };
}
