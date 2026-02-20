/**
 * LLM-powered work summary generation.
 *
 * Takes collected developer activity data and a summary type, constructs
 * XML-tagged structured prompts with velocity metrics and architectural
 * impact scores, and sends them to Claude (Sonnet via the 'summary'
 * operation) to produce rich, evidence-backed markdown summaries.
 *
 * LLM is always required — there are no fallback paths.
 */

import {
  createLlmClient,
  analyzeWithLlm,
  loadConfig,
  generateId,
  now,
  type ArchGuardConfig,
  type SummaryType,
  type WorkSummary,
} from '@archguard/core';

/** LLM client type inferred from the core createLlmClient factory */
type LlmClient = ReturnType<typeof createLlmClient>;

import type { CollectedData } from './collector.js';
import { buildOneOnOnePrompt } from './templates/one-on-one.js';
import { buildStandupPrompt } from './templates/standup.js';
import { buildSprintReviewPrompt } from './templates/sprint-review.js';
import { buildProgressReportPrompt } from './templates/progress-report.js';

// ─── Types ────────────────────────────────────────────────────────

/** Options for generating a summary */
export interface SummaryOptions {
  /** The collected data to summarize */
  data: CollectedData;
  /** The type of summary to generate */
  type: SummaryType;
  /** Display name for the developer */
  developerName: string;
  /** Human-readable period label (e.g., "Sprint 23", "Week of Jan 6") */
  period: string;
  /** Team ID for the generated summary */
  teamId: string;
  /** Path to the project directory for loading config (defaults to cwd) */
  projectDir?: string;
  /** Pre-loaded config to avoid re-reading .archguard.yml */
  config?: ArchGuardConfig;
  /** Pre-created LLM client */
  client?: LlmClient;
}

// ─── Main Entry Point ─────────────────────────────────────────────

/**
 * Generate a work summary using the LLM.
 *
 * Constructs an XML-tagged structured prompt that includes velocity metrics,
 * architectural impact scores, commit and PR details, and module activity,
 * then sends it to Claude via the 'summary' operation (Sonnet model).
 *
 * Returns a complete WorkSummary object ready for storage or display.
 */
export async function generateSummary(options: SummaryOptions): Promise<WorkSummary> {
  const {
    data,
    type,
    developerName,
    period,
    teamId,
    projectDir = process.cwd(),
  } = options;

  const config = options.config ?? loadConfig(projectDir);
  const client = options.client ?? createLlmClient(config);

  const content = await generateLlmSummary(client, config, data, type, developerName, period);

  return {
    id: generateId(),
    developerId: data.developer,
    teamId,
    type,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    content,
    dataPoints: data.dataPoints,
    generatedAt: now(),
  };
}

// ─── LLM Summary Generation ──────────────────────────────────────

/**
 * Generate a summary by building an XML-tagged prompt and sending it
 * to Claude with the 'summary' operation type (Sonnet model).
 */
async function generateLlmSummary(
  client: LlmClient,
  config: ArchGuardConfig,
  data: CollectedData,
  type: SummaryType,
  developerName: string,
  period: string,
): Promise<string> {
  const templatePrompt = buildTemplatePrompt(data, type, developerName, period);

  const systemPrompt = buildSystemPrompt(type);
  const userPrompt = buildStructuredUserPrompt(
    data,
    type,
    developerName,
    period,
    templatePrompt,
  );

  const response = await analyzeWithLlm(
    client,
    config,
    {
      systemPrompt,
      userPrompt,
      maxTokens: config.llm.maxTokensPerAnalysis,
      temperature: 0.4,
    },
    'summary',
  );

  return response;
}

// ─── System Prompt ────────────────────────────────────────────────

/**
 * Build a system prompt that establishes the assistant's role based
 * on the summary type.
 */
function buildSystemPrompt(type: SummaryType): string {
  const roleDescriptions: Record<SummaryType, string> = {
    standup:
      'You are a concise engineering assistant that generates daily standup summaries. ' +
      'Your output follows the Done/Doing/Blocked format. Be specific — reference actual ' +
      'PR numbers, commit SHAs, and module names. Never fabricate data.',
    one_on_one:
      'You are an engineering manager\'s assistant specializing in developer performance ' +
      'analysis and 1:1 meeting preparation. You produce actionable meeting prep documents ' +
      'backed by concrete data. Focus on being constructive, specific, and evidence-driven. ' +
      'Never fabricate data — only reference what is provided.',
    sprint_review:
      'You are an engineering analytics assistant that generates sprint and weekly review ' +
      'summaries. Your summaries are data-driven, highlighting delivery outcomes, velocity ' +
      'trends, and architectural health. Be objective and quantitative. Never fabricate data.',
    progress_report:
      'You are a technical writing assistant that translates engineering activity into ' +
      'stakeholder-friendly progress reports. Your audience is non-technical: product managers, ' +
      'executives, and business stakeholders. Avoid jargon and focus on outcomes. Never fabricate data.',
  };

  return `${roleDescriptions[type]}

<output_guidelines>
- Produce well-structured Markdown
- Tie every accomplishment to a specific PR number or commit SHA when the data is available
- Identify patterns in the developer's work (e.g., "focused on infrastructure work", "heavy refactoring sprint", "cross-cutting API changes")
- When velocity or architectural impact scores are provided, interpret them in context rather than just restating numbers
- If the data is sparse, acknowledge it explicitly and suggest areas to explore
</output_guidelines>`;
}

// ─── Template Prompt Router ───────────────────────────────────────

/**
 * Route to the correct template builder based on summary type.
 * Each template returns { systemPrompt, userPrompt } — we use only
 * the userPrompt from the template as the format-specific instructions.
 */
function buildTemplatePrompt(
  data: CollectedData,
  type: SummaryType,
  developerName: string,
  period: string,
): { systemPrompt: string; userPrompt: string } {
  switch (type) {
    case 'one_on_one':
      return buildOneOnOnePrompt(data, developerName, period);
    case 'standup':
      return buildStandupPrompt(data, developerName, period);
    case 'sprint_review':
      return buildSprintReviewPrompt(data, developerName, period);
    case 'progress_report':
      return buildProgressReportPrompt(data, developerName, period);
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown summary type: ${_exhaustive}`);
    }
  }
}

// ─── Structured Prompt Builder ────────────────────────────────────

/**
 * Build the full user prompt wrapped in XML tags for structured input.
 *
 * Includes:
 * - Developer metadata and period
 * - Commit log with SHAs and messages
 * - Pull request details with status, additions/deletions, and reviewers
 * - Velocity metrics and architectural impact scores
 * - Module activity breakdown
 * - Summary data points (violations, files changed)
 * - Format-specific instructions from the template builder
 * - Pattern identification request
 */
function buildStructuredUserPrompt(
  data: CollectedData,
  type: SummaryType,
  developerName: string,
  period: string,
  templatePrompt: { systemPrompt: string; userPrompt: string },
): string {
  const commitXml = buildCommitXml(data);
  const prXml = buildPullRequestXml(data);
  const velocityXml = buildVelocityXml(data);
  const moduleXml = buildModuleXml(data);
  const dataPointsXml = buildDataPointsXml(data);
  const blockersXml = buildBlockersXml(data);

  return `<summary_request>
<metadata>
  <developer_name>${escapeXml(developerName)}</developer_name>
  <summary_type>${type}</summary_type>
  <period_label>${escapeXml(period)}</period_label>
  <period_start>${data.periodStart}</period_start>
  <period_end>${data.periodEnd}</period_end>
</metadata>

<activity_data>
${commitXml}

${prXml}

${velocityXml}

${moduleXml}

${dataPointsXml}

${blockersXml}
</activity_data>

<format_instructions>
${templatePrompt.userPrompt}
</format_instructions>

<pattern_analysis_instructions>
After generating the summary, identify and weave in patterns you observe in the developer's work. Examples of patterns to look for:
- Focus areas: "Concentrated effort on infrastructure/testing/API layer"
- Work style: "Large PRs vs. small incremental changes"
- Collaboration: "Heavy review activity suggesting mentorship role"
- Refactoring trends: "Significant code cleanup alongside feature work"
- Module breadth: "Work spread across many modules (context switching) vs. deep focus on one area"
- Velocity trajectory: "Accelerating output in the second half of the period"

Tie each pattern observation to specific evidence from the commits, PRs, and metrics provided.
Do NOT create a separate "Patterns" section — instead, integrate pattern observations naturally into the relevant sections of the summary.
</pattern_analysis_instructions>
</summary_request>`;
}

// ─── XML Section Builders ─────────────────────────────────────────

/**
 * Build the <commits> XML section from collected commit data.
 */
function buildCommitXml(data: CollectedData): string {
  if (data.commits.length === 0) {
    return '<commits count="0" />';
  }

  const commitEntries = data.commits
    .slice(0, 30)
    .map(
      (c) =>
        `  <commit sha="${c.sha.slice(0, 7)}" date="${c.date}" files_changed="${c.filesChanged}" additions="${c.additions}" deletions="${c.deletions}">
    <message>${escapeXml(c.message)}</message>
  </commit>`,
    )
    .join('\n');

  return `<commits count="${data.commits.length}" showing="${Math.min(data.commits.length, 30)}">
${commitEntries}
</commits>`;
}

/**
 * Build the <pull_requests> XML section from collected PR data.
 */
function buildPullRequestXml(data: CollectedData): string {
  if (data.pullRequests.length === 0) {
    return '<pull_requests count="0" />';
  }

  const mergedPrs = data.pullRequests.filter((pr) => pr.status === 'merged');
  const openPrs = data.pullRequests.filter((pr) => pr.status === 'open');

  const prEntries = data.pullRequests
    .map(
      (pr) =>
        `  <pr number="${pr.number}" status="${pr.status}" additions="${pr.additions}" deletions="${pr.deletions}" files_changed="${pr.filesChanged}">
    <title>${escapeXml(pr.title)}</title>
    <url>${escapeXml(pr.url)}</url>
    <created_at>${pr.createdAt}</created_at>${pr.mergedAt ? `\n    <merged_at>${pr.mergedAt}</merged_at>` : ''}
    <reviewers>${pr.reviewers.map((r) => escapeXml(r)).join(', ') || 'none'}</reviewers>
  </pr>`,
    )
    .join('\n');

  return `<pull_requests count="${data.pullRequests.length}" merged="${mergedPrs.length}" open="${openPrs.length}">
${prEntries}
</pull_requests>`;
}

/**
 * Build the <velocity_metrics> XML section with scores and impact data.
 */
function buildVelocityXml(data: CollectedData): string {
  const vel = data.velocity;

  const basicMetrics = `  <commit_count>${vel.commitCount}</commit_count>
  <lines_added>${vel.linesAdded}</lines_added>
  <lines_removed>${vel.linesRemoved}</lines_removed>
  <prs_opened>${vel.prsOpened}</prs_opened>
  <prs_merged>${vel.prsMerged}</prs_merged>
  <reviews_given>${vel.reviewsGiven}</reviews_given>`;

  const changeRatio =
    vel.linesRemoved > 0
      ? (vel.linesAdded / vel.linesRemoved).toFixed(2)
      : 'N/A';

  const ratioMetric = `  <add_remove_ratio>${changeRatio}</add_remove_ratio>`;

  if (vel.score) {
    const score = vel.score;
    return `<velocity_metrics has_score="true">
${basicMetrics}
${ratioMetric}
  <velocity_score value="${score.velocityScore}" max="100" trend="${score.trend}" />
  <weighted_effort>${score.weightedEffort}</weighted_effort>
  <architectural_impact>${score.architecturalImpact}</architectural_impact>
  <refactoring_ratio>${(score.refactoringRatio * 100).toFixed(1)}%</refactoring_ratio>
  <review_contribution>${score.reviewContribution}</review_contribution>
</velocity_metrics>`;
  }

  return `<velocity_metrics has_score="false">
${basicMetrics}
${ratioMetric}
</velocity_metrics>`;
}

/**
 * Build the <modules> XML section showing which areas of the codebase
 * were modified and to what extent.
 */
function buildModuleXml(data: CollectedData): string {
  if (data.modules.length === 0) {
    return '<modules count="0" />';
  }

  const sortedModules = [...data.modules].sort(
    (a, b) => b.filesChanged - a.filesChanged,
  );

  const moduleEntries = sortedModules
    .map(
      (m) =>
        `  <module name="${escapeXml(m.module)}" files_changed="${m.filesChanged}" commits="${m.commits}" additions="${m.additions}" deletions="${m.deletions}" />`,
    )
    .join('\n');

  return `<modules count="${data.modules.length}">
${moduleEntries}
</modules>`;
}

/**
 * Build the <data_points> XML section with aggregate summary statistics.
 */
function buildDataPointsXml(data: CollectedData): string {
  const dp = data.dataPoints;
  const violationNet = dp.violationsResolved - dp.violationsIntroduced;

  return `<data_points>
  <commits>${dp.commits}</commits>
  <prs_opened>${dp.prsOpened}</prs_opened>
  <prs_merged>${dp.prsMerged}</prs_merged>
  <reviews_given>${dp.reviewsGiven}</reviews_given>
  <files_changed>${dp.filesChanged}</files_changed>
  <violations_introduced>${dp.violationsIntroduced}</violations_introduced>
  <violations_resolved>${dp.violationsResolved}</violations_resolved>
  <violation_net_change>${violationNet >= 0 ? '+' : ''}${violationNet}</violation_net_change>
  <key_prs>${dp.keyPrs.map((pr: string) => escapeXml(pr)).join('; ') || 'none'}</key_prs>
</data_points>`;
}

/**
 * Build the <blockers> XML section from velocity blocker data.
 */
function buildBlockersXml(data: CollectedData): string {
  const blockers = data.velocity.blockers;

  if (blockers.length === 0) {
    return '<blockers count="0" />';
  }

  const blockerEntries = blockers
    .map(
      (b) =>
        `  <blocker type="${b.type}" severity="${b.severity}"${b.staleSince ? ` stale_since="${b.staleSince}"` : ''}>
    <description>${escapeXml(b.description)}</description>
    <related_entity>${escapeXml(b.relatedEntity)}</related_entity>
  </blocker>`,
    )
    .join('\n');

  return `<blockers count="${blockers.length}">
${blockerEntries}
</blockers>`;
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Escape special characters for safe XML embedding.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
