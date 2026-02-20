/**
 * Scheduled summary generation job.
 * Generates work summaries (standup, 1:1, sprint review, progress report)
 * by collecting data from git, PRs, and velocity scores, then formatting
 * with LLM assistance.
 */

import type { Job } from 'bullmq';
import { eq, and, gte, lte } from 'drizzle-orm';
import {
  initializeDatabase,
  schema,
  generateId,
  now,
  loadConfig,
  createLlmClient,
  analyzeWithLlm,
} from '@archguard/core';
import {
  QUEUE_NAMES,
  registerWorker,
  type SummaryJobData,
} from './queue.js';

/**
 * Process a summary generation job.
 * Steps:
 * 1. Collect relevant data for the period
 * 2. Gather velocity scores and commit history
 * 3. Generate summary content using LLM
 * 4. Store the summary in the database
 */
async function processSummary(job: Job<SummaryJobData>): Promise<{ summaryId: string }> {
  const { orgId, type, developerId, periodStart, periodEnd } = job.data;
  const db = initializeDatabase();

  await job.updateProgress(10);

  // Load config for LLM settings
  const config = loadConfig(process.cwd());

  // Gather velocity scores for the period
  const velocityFilter = developerId
    ? and(
        eq(schema.velocityScores.developerId, developerId),
        gte(schema.velocityScores.periodStart, periodStart),
        lte(schema.velocityScores.periodEnd, periodEnd)
      )
    : gte(schema.velocityScores.periodStart, periodStart);

  const velocityRows = await db
    .select()
    .from(schema.velocityScores)
    .where(velocityFilter);

  await job.updateProgress(25);

  // Gather recent reviews
  const reviewRows = await db
    .select()
    .from(schema.reviews)
    .where(gte(schema.reviews.reviewedAt, periodStart))
    .limit(50);

  await job.updateProgress(40);

  // Build summary data points
  const totalCommits = velocityRows.reduce((sum, v) => sum + v.commits, 0);
  const totalPrsOpened = velocityRows.reduce((sum, v) => sum + v.prsOpened, 0);
  const totalPrsMerged = velocityRows.reduce((sum, v) => sum + v.prsMerged, 0);
  const totalLinesAdded = velocityRows.reduce((sum, v) => sum + v.linesAdded, 0);
  const totalViolations = reviewRows.reduce((sum, r) => sum + r.totalViolations, 0);

  const dataPoints = {
    commits: totalCommits,
    prsOpened: totalPrsOpened,
    prsMerged: totalPrsMerged,
    reviewsGiven: 0,
    violationsIntroduced: totalViolations,
    violationsResolved: 0,
    filesChanged: 0,
    keyPrs: [] as string[],
  };

  await job.updateProgress(50);

  // Generate summary content
  let content: string;

  try {
    // Use LLM to generate a well-formatted summary
    const llmClient = createLlmClient(config);
    const prompt = buildSummaryPrompt(type, dataPoints, periodStart, periodEnd, developerId);

    const response = await analyzeWithLlm(llmClient, config, {
      prompt,
      systemPrompt: 'You are a technical writing assistant that generates clear, data-driven work summaries for engineering teams.',
      maxTokens: 2048,
    });

    content = response;
  } catch {
    // Fallback to template-based summary if LLM is unavailable
    content = buildTemplateSummary(type, dataPoints, periodStart, periodEnd);
  }

  await job.updateProgress(80);

  // Store the summary
  const summaryId = generateId();
  const timestamp = now();

  await db.insert(schema.workSummaries).values({
    id: summaryId,
    developerId: developerId ?? null,
    orgId,
    type,
    periodStart,
    periodEnd,
    content,
    dataPoints: JSON.stringify(dataPoints),
    generatedAt: timestamp,
  });

  await job.updateProgress(100);

  return { summaryId };
}

/**
 * Build a prompt for LLM-based summary generation.
 */
function buildSummaryPrompt(
  type: string,
  dataPoints: Record<string, unknown>,
  periodStart: string,
  periodEnd: string,
  developerId?: string
): string {
  const context = developerId ? `for developer ${developerId}` : 'for the team';
  const periodLabel = `${new Date(periodStart).toLocaleDateString()} to ${new Date(periodEnd).toLocaleDateString()}`;

  return `Generate a ${type.replace(/_/g, ' ')} summary ${context} for the period ${periodLabel}.

Data points:
${JSON.stringify(dataPoints, null, 2)}

Requirements:
- Keep it concise and actionable
- Highlight key accomplishments
- Note any concerns or blockers
- Use bullet points for readability
- Include specific numbers from the data`;
}

/**
 * Build a template-based summary as LLM fallback.
 */
function buildTemplateSummary(
  type: string,
  dataPoints: Record<string, unknown>,
  periodStart: string,
  periodEnd: string
): string {
  const period = `${new Date(periodStart).toLocaleDateString()} - ${new Date(periodEnd).toLocaleDateString()}`;
  const commits = dataPoints.commits as number;
  const prsOpened = dataPoints.prsOpened as number;
  const prsMerged = dataPoints.prsMerged as number;
  const violations = dataPoints.violationsIntroduced as number;

  return `# ${type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Summary

**Period:** ${period}

## Key Metrics
- **Commits:** ${commits}
- **PRs Opened:** ${prsOpened}
- **PRs Merged:** ${prsMerged}
- **Violations Found:** ${violations}

## Highlights
${commits > 0 ? `- ${commits} commits made during this period` : '- No commit activity in this period'}
${prsMerged > 0 ? `- ${prsMerged} pull requests successfully merged` : ''}
${violations > 0 ? `- ${violations} architectural violations detected - review recommended` : '- No architectural violations detected'}

## Action Items
${violations > 0 ? '- Review and address architectural violations' : '- Continue maintaining architectural quality'}
- Review velocity trends for optimization opportunities
`;
}

/**
 * Register the summary worker.
 */
export function registerSummaryWorker(): void {
  registerWorker(QUEUE_NAMES.SUMMARY, processSummary, 2);
}
