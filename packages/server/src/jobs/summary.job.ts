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
  requireApiKey,
  createLlmClient,
  analyzeWithLlm,
} from '@snoutguard/core';
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

  // Load config and validate API key
  const config = loadConfig(process.cwd());
  requireApiKey(config);

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

  // Generate summary content using LLM (always required)
  const llmClient = createLlmClient(config);
  const prompt = buildSummaryPrompt(type, dataPoints, periodStart, periodEnd, developerId);

  const content = await analyzeWithLlm(llmClient, config, {
    userPrompt: prompt,
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    maxTokens: 2048,
  }, 'summary');

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

/** System prompt for summary generation */
const SUMMARY_SYSTEM_PROMPT = `<role>
You are an expert technical writing assistant that generates clear, data-driven
work summaries for engineering teams. Your summaries are concise, actionable,
and backed by specific metrics.
</role>

<guidelines>
- Use markdown formatting with headers and bullet points
- Lead with the most impactful accomplishments
- Include specific numbers from the provided data
- Flag any concerns or blockers prominently
- Keep the tone professional but approachable
- Tailor the depth and focus based on the summary type
</guidelines>`;

/**
 * Build a structured prompt for LLM-based summary generation.
 */
function buildSummaryPrompt(
  type: string,
  dataPoints: Record<string, unknown>,
  periodStart: string,
  periodEnd: string,
  developerId?: string
): string {
  const context = developerId ? `developer ${developerId}` : 'the team';
  const periodLabel = `${new Date(periodStart).toLocaleDateString()} to ${new Date(periodEnd).toLocaleDateString()}`;
  const typeLabel = type.replace(/_/g, ' ');

  return `<summary_request>
<type>${typeLabel}</type>
<scope>${context}</scope>
<period>${periodLabel}</period>
</summary_request>

<activity_data>
${JSON.stringify(dataPoints, null, 2)}
</activity_data>

<format_instructions>
Generate a ${typeLabel} summary for ${context} covering ${periodLabel}.

Structure:
1. **Overview** — One-sentence summary of the period
2. **Key Accomplishments** — Top 3-5 achievements with specific numbers
3. **Concerns** — Any items needing attention (violations, stalled work)
4. **Action Items** — Concrete next steps

Keep it under 500 words. Use the exact numbers from the activity data.
</format_instructions>`;
}

/**
 * Register the summary worker.
 */
export function registerSummaryWorker(): void {
  registerWorker(QUEUE_NAMES.SUMMARY, processSummary, 2);
}
