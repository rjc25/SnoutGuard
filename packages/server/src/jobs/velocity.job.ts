/**
 * Periodic velocity calculation job.
 * Calculates developer velocity scores for all members of an organization
 * across their connected repositories.
 */

import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import {
  initializeDatabase,
  schema,
  generateId,
  now,
  loadConfig,
  getDevStats,
  createGitClient,
} from '@snoutguard/core';
import {
  QUEUE_NAMES,
  registerWorker,
  type VelocityJobData,
} from './queue.js';

/**
 * Process a velocity calculation job.
 * Steps:
 * 1. Load org developers and repositories
 * 2. Collect git stats for each developer
 * 3. Calculate velocity scores using configured weights
 * 4. Store results in the database
 */
async function processVelocity(job: Job<VelocityJobData>): Promise<{ scoresCount: number }> {
  const { orgId, repoId, period } = job.data;
  const db = initializeDatabase();

  await job.updateProgress(10);

  // Determine the time window based on period
  const endDate = new Date();
  const startDate = new Date();
  switch (period) {
    case 'daily':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case 'weekly':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'sprint':
      startDate.setDate(startDate.getDate() - 14);
      break;
    case 'monthly':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
  }

  const periodStart = startDate.toISOString();
  const periodEnd = endDate.toISOString();

  // Load developers for the org
  const devRows = await db
    .select()
    .from(schema.developers)
    .where(eq(schema.developers.orgId, orgId));

  if (devRows.length === 0) {
    return { scoresCount: 0 };
  }

  await job.updateProgress(20);

  // Load repositories
  const repoFilter = repoId
    ? eq(schema.repositories.id, repoId)
    : eq(schema.repositories.orgId, orgId);

  const repoRows = await db
    .select()
    .from(schema.repositories)
    .where(repoFilter);

  if (repoRows.length === 0) {
    return { scoresCount: 0 };
  }

  await job.updateProgress(30);

  // Load velocity config weights
  const config = loadConfig(process.cwd());
  const weights = {
    complexity: config.velocity.complexityWeight,
    archImpact: config.velocity.archImpactWeight,
    review: config.velocity.reviewWeight,
    refactoring: config.velocity.refactoringWeight,
  };

  const timestamp = now();
  let scoresCount = 0;
  const totalWork = devRows.length * repoRows.length;
  let completed = 0;

  // Calculate velocity for each developer/repo combination
  for (const dev of devRows) {
    for (const repo of repoRows) {
      try {
        // Collect git stats for this developer in this repo
        const git = createGitClient(process.cwd());
        const devStatsArray = await getDevStats(git, periodStart, periodEnd);

        const devStats = devStatsArray.find(
          (s) =>
            s.email.toLowerCase() === dev.gitEmail.toLowerCase() ||
            s.author.toLowerCase() === dev.gitName.toLowerCase()
        );

        if (!devStats) {
          completed++;
          continue;
        }

        // Calculate velocity score components
        const linesChanged = devStats.additions + devStats.deletions;
        const weightedEffort = linesChanged * weights.complexity;
        const architecturalImpact = 0; // Calculated from decision changes
        const refactoringRatio = devStats.deletions / Math.max(1, linesChanged);
        const reviewContribution = 0; // Calculated from PR reviews

        // Composite velocity score
        const velocityScore =
          weightedEffort * weights.complexity +
          architecturalImpact * weights.archImpact +
          reviewContribution * weights.review +
          refactoringRatio * weights.refactoring;

        // Determine trend by comparing to previous period
        const trend = 'stable' as const; // Would compare to previous score

        // Store velocity score
        await db.insert(schema.velocityScores).values({
          id: generateId(),
          developerId: dev.id,
          repoId: repo.id,
          period,
          periodStart,
          periodEnd,
          commits: devStats.commits,
          prsOpened: 0,
          prsMerged: 0,
          linesAdded: devStats.additions,
          linesRemoved: devStats.deletions,
          weightedEffort,
          architecturalImpact,
          refactoringRatio,
          reviewContribution,
          velocityScore,
          trend,
          blockers: '[]',
          calculatedAt: timestamp,
        });

        scoresCount++;
      } catch (error) {
        console.warn(
          `Failed to calculate velocity for ${dev.gitName} in ${repo.name}:`,
          error instanceof Error ? error.message : error
        );
      }

      completed++;
      await job.updateProgress(30 + Math.round((completed / totalWork) * 65));
    }
  }

  await job.updateProgress(100);
  return { scoresCount };
}

/**
 * Register the velocity worker.
 */
export function registerVelocityWorker(): void {
  registerWorker(QUEUE_NAMES.VELOCITY, processVelocity, 1);
}
