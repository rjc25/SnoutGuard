/**
 * Async PR review job.
 * Processes code review requests from the queue, running the
 * rule engine against diffs and storing review results.
 */

import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import {
  initializeDatabase,
  schema,
  generateId,
  now,
  loadConfig,
} from '@snoutguard/core';
import {
  QUEUE_NAMES,
  registerWorker,
  type ReviewJobData,
} from './queue.js';

/**
 * Process a review job.
 * Steps:
 * 1. Load repository and architectural decisions
 * 2. Fetch diff (from git or GitHub API)
 * 3. Run rule engine against the diff
 * 4. Store review results
 * 5. Post results back to PR if applicable
 */
async function processReview(job: Job<ReviewJobData>): Promise<{ reviewId: string; violationCount: number }> {
  const { repoId, orgId, prNumber, ref, triggeredBy } = job.data;
  const db = initializeDatabase();

  await job.updateProgress(10);

  // Load repository
  const repoRows = await db
    .select()
    .from(schema.repositories)
    .where(eq(schema.repositories.id, repoId))
    .limit(1);

  if (repoRows.length === 0) {
    throw new Error(`Repository ${repoId} not found`);
  }

  const repo = repoRows[0];
  await job.updateProgress(20);

  // Load architectural decisions for the repo
  const decisionRows = await db
    .select()
    .from(schema.decisions)
    .where(eq(schema.decisions.repoId, repoId));

  const decisions = decisionRows.map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description,
    category: d.category as import('@snoutguard/core').ArchCategory,
    status: d.status as import('@snoutguard/core').DecisionStatus,
    confidence: d.confidence,
    evidence: [],
    constraints: JSON.parse(d.constraints ?? '[]') as string[],
    relatedDecisions: JSON.parse(d.relatedDecisions ?? '[]') as string[],
    tags: JSON.parse(d.tags ?? '[]') as string[],
    detectedAt: d.detectedAt,
    confirmedBy: d.confirmedBy ?? undefined,
  }));

  await job.updateProgress(30);

  // Load config
  const config = loadConfig(process.cwd());

  // Dynamically import reviewer
  const { checkRules } = await import('@snoutguard/reviewer');

  await job.updateProgress(40);

  // In a full implementation, we would:
  // 1. Clone/pull the repo
  // 2. Get the diff via git or GitHub API
  // 3. Parse the diff into DiffAnalysis format
  // For now, we create a minimal review with empty violations

  // Run rule engine (placeholder - actual diff analysis would happen here)
  const violations = checkRules(
    { fileDiffs: [], categorized: { newFiles: [], modifications: [], deletions: [], renames: [] }, changeContexts: [], summary: { totalFiles: 0, totalAdditions: 0, totalDeletions: 0, newFileCount: 0, modifiedCount: 0, deletedCount: 0, renamedCount: 0, fileExtensions: [], touchedDirectories: [] } },
    { decisions, customRules: config.rules }
  );

  await job.updateProgress(70);

  // Count violations by severity
  const errors = violations.filter((v) => v.severity === 'error').length;
  const warnings = violations.filter((v) => v.severity === 'warning').length;
  const infos = violations.filter((v) => v.severity === 'info').length;

  // Store review result
  const reviewId = generateId();
  const timestamp = now();

  await db.insert(schema.reviews).values({
    id: reviewId,
    repoId,
    ref,
    prNumber: prNumber ?? null,
    prUrl: prNumber ? `${repo.cloneUrl.replace('.git', '')}/pull/${prNumber}` : null,
    totalViolations: violations.length,
    errors,
    warnings,
    infos,
    results: JSON.stringify(violations),
    triggeredBy,
    reviewedAt: timestamp,
  });

  await job.updateProgress(90);

  // If this is a PR review triggered by webhook, post results back to GitHub
  if (prNumber && triggeredBy === 'webhook' && repo.provider === 'github') {
    try {
      const { createGitHubClient, createGitHubComment } = await import('@snoutguard/integrations');
      const token = process.env.GITHUB_TOKEN;
      if (token) {
        const octokit = createGitHubClient({ token });
        const [owner, repoName] = repo.fullName.split('/');
        const summary = `## SnoutGuard Review\n\n` +
          `**${violations.length}** violations found: ` +
          `${errors} errors, ${warnings} warnings, ${infos} info\n`;
        await createGitHubComment(octokit, { owner, repo: repoName, pullNumber: prNumber }, summary);
      }
    } catch {
      // Non-fatal: log but don't fail the job
      console.warn(`Failed to post review comment to PR #${prNumber}`);
    }
  }

  await job.updateProgress(100);

  return { reviewId, violationCount: violations.length };
}

/**
 * Register the review worker.
 */
export function registerReviewWorker(): void {
  registerWorker(QUEUE_NAMES.REVIEW, processReview, 3);
}
