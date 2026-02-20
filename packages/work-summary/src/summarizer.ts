/**
 * LLM-powered summary generation.
 * Takes collected data and a summary type, sends it to Claude
 * with format-specific prompts, and returns generated markdown content.
 * Includes a no-LLM fallback that produces structured bullet-point summaries.
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
  /** Set to true to skip the LLM call and generate a fallback summary */
  noLlm?: boolean;
  /** Path to the project directory for loading config (defaults to cwd) */
  projectDir?: string;
  /** Pre-loaded config to avoid re-reading .archguard.yml */
  config?: ArchGuardConfig;
  /** Pre-created LLM client */
  client?: LlmClient;
}

// ─── Main Entry Point ─────────────────────────────────────────────

/**
 * Generate a work summary using LLM or fallback.
 * Returns a complete WorkSummary object ready for storage or display.
 */
export async function generateSummary(options: SummaryOptions): Promise<WorkSummary> {
  const {
    data,
    type,
    developerName,
    period,
    teamId,
    noLlm = false,
    projectDir = process.cwd(),
  } = options;

  let content: string;

  if (noLlm) {
    content = generateFallbackSummary(data, type, developerName, period);
  } else {
    content = await generateLlmSummary(options, projectDir);
  }

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
 * Generate a summary using Claude via the LLM client.
 */
async function generateLlmSummary(options: SummaryOptions, projectDir: string): Promise<string> {
  const {
    data,
    type,
    developerName,
    period,
  } = options;

  const config = options.config ?? loadConfig(projectDir);
  const client = options.client ?? createLlmClient(config);

  const { systemPrompt, userPrompt } = buildPrompt(data, type, developerName, period);

  const response = await analyzeWithLlm(client, config, {
    systemPrompt,
    userPrompt,
    maxTokens: config.llm.maxTokensPerAnalysis,
    temperature: 0.4,
  });

  return response;
}

/**
 * Route to the correct template builder based on summary type.
 */
function buildPrompt(
  data: CollectedData,
  type: SummaryType,
  developerName: string,
  period: string
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

// ─── Fallback Summary Generation (No LLM) ────────────────────────

/**
 * Generate a structured bullet-point summary without using an LLM.
 * This provides a useful summary when no API key is configured
 * or when LLM calls are not desired.
 */
function generateFallbackSummary(
  data: CollectedData,
  type: SummaryType,
  developerName: string,
  period: string
): string {
  switch (type) {
    case 'standup':
      return generateFallbackStandup(data, developerName, period);
    case 'one_on_one':
      return generateFallbackOneOnOne(data, developerName, period);
    case 'sprint_review':
      return generateFallbackSprintReview(data, developerName, period);
    case 'progress_report':
      return generateFallbackProgressReport(data, developerName, period);
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown summary type: ${_exhaustive}`);
    }
  }
}

/**
 * Fallback standup in Done/Doing/Blocked format.
 */
function generateFallbackStandup(
  data: CollectedData,
  developerName: string,
  period: string
): string {
  const mergedPrs = data.pullRequests.filter((pr) => pr.status === 'merged');
  const openPrs = data.pullRequests.filter((pr) => pr.status === 'open');

  const doneItems = mergedPrs.length > 0
    ? mergedPrs.slice(0, 5).map((pr) => `- Merged PR #${pr.number}: ${pr.title}`).join('\n')
    : data.commits.length > 0
      ? data.commits.slice(0, 5).map((c) => `- ${c.message}`).join('\n')
      : '- No completed items in this period';

  const doingItems = openPrs.length > 0
    ? openPrs.slice(0, 3).map((pr) => `- Working on PR #${pr.number}: ${pr.title}`).join('\n')
    : '- No open work items tracked';

  const blockedItems = data.velocity.blockers.length > 0
    ? data.velocity.blockers.map((b) => `- [${b.severity}] ${b.description}`).join('\n')
    : '- Nothing to report';

  return `# Standup Update: ${developerName}
**Period:** ${period} (${data.periodStart} to ${data.periodEnd})

## Done
${doneItems}

## Doing
${doingItems}

## Blocked
${blockedItems}

---
*${data.commits.length} commits | ${data.velocity.linesAdded} lines added | ${data.velocity.linesRemoved} lines removed*
`;
}

/**
 * Fallback 1:1 meeting prep document.
 */
function generateFallbackOneOnOne(
  data: CollectedData,
  developerName: string,
  period: string
): string {
  const mergedPrs = data.pullRequests.filter((pr) => pr.status === 'merged');
  const openPrs = data.pullRequests.filter((pr) => pr.status === 'open');

  const accomplishments = mergedPrs.length > 0
    ? mergedPrs.slice(0, 3).map((pr) => `- PR #${pr.number}: ${pr.title} (+${pr.additions}/-${pr.deletions})`).join('\n')
    : data.commits.length > 0
      ? data.commits.slice(0, 3).map((c) => `- ${c.message} (${c.sha.slice(0, 7)})`).join('\n')
      : '- No significant accomplishments tracked';

  const wip = openPrs.length > 0
    ? openPrs.map((pr) => `- PR #${pr.number}: ${pr.title} (${pr.reviewers.length} reviewers assigned)`).join('\n')
    : '- No tracked work in progress';

  const blockers = data.velocity.blockers.length > 0
    ? data.velocity.blockers.map((b) => `- [${b.severity}] ${b.type}: ${b.description}`).join('\n')
    : '- No blockers detected';

  const topModules = data.modules
    .sort((a, b) => b.filesChanged - a.filesChanged)
    .slice(0, 5)
    .map((m) => `- ${m.module}: ${m.filesChanged} files across ${m.commits} commits`)
    .join('\n');

  const velocityInfo = data.velocity.score
    ? `- Velocity Score: ${data.velocity.score.velocityScore}/100 (${data.velocity.score.trend})
- Architectural Impact: ${data.velocity.score.architecturalImpact}
- Refactoring Ratio: ${(data.velocity.score.refactoringRatio * 100).toFixed(1)}%`
    : `- Commits: ${data.velocity.commitCount}
- Lines Changed: +${data.velocity.linesAdded} / -${data.velocity.linesRemoved}`;

  return `# 1:1 Meeting Prep: ${developerName}
**Period:** ${period} (${data.periodStart} to ${data.periodEnd})

## Top Accomplishments
${accomplishments}

## Current Work in Progress
${wip}

## Blockers & Risks
${blockers}

## Architectural Contributions
### Modules Worked On
${topModules || '- No module data available'}

### Metrics
${velocityInfo}

## Suggested Discussion Topics
- Review of key deliverables and their impact
- Current workload and capacity assessment
${data.velocity.blockers.length > 0 ? '- Resolution plan for active blockers' : ''}
${data.modules.length > 3 ? '- Context switching across multiple modules' : ''}
- Goals and priorities for the next period

---
*Data: ${data.commits.length} commits, ${mergedPrs.length} PRs merged, ${data.dataPoints.filesChanged} files changed*
`;
}

/**
 * Fallback sprint review document.
 */
function generateFallbackSprintReview(
  data: CollectedData,
  developerName: string,
  period: string
): string {
  const mergedPrs = data.pullRequests.filter((pr) => pr.status === 'merged');
  const openPrs = data.pullRequests.filter((pr) => pr.status === 'open');

  const deliverables = mergedPrs.length > 0
    ? mergedPrs.map((pr) => `- PR #${pr.number}: ${pr.title} (+${pr.additions}/-${pr.deletions}, ${pr.filesChanged} files)`).join('\n')
    : '- No PRs merged this sprint';

  const velocityTrend = data.velocity.score
    ? `**${data.velocity.score.velocityScore}/100** (${data.velocity.score.trend})`
    : `${data.velocity.commitCount} commits, +${data.velocity.linesAdded}/-${data.velocity.linesRemoved} lines`;

  const moduleSummary = data.modules
    .sort((a, b) => b.filesChanged - a.filesChanged)
    .map((m) => `- ${m.module}: ${m.filesChanged} files, ${m.commits} commits`)
    .join('\n');

  const carryOver = openPrs.length > 0
    ? openPrs.map((pr) => `- PR #${pr.number}: ${pr.title} [open]`).join('\n')
    : '- No carry-over items';

  const blockers = data.velocity.blockers.length > 0
    ? data.velocity.blockers.map((b) => `- [${b.severity.toUpperCase()}] ${b.type}: ${b.description}`).join('\n')
    : '- No blockers';

  const violationNet = data.dataPoints.violationsResolved - data.dataPoints.violationsIntroduced;

  return `# Sprint Review: ${developerName}
**Period:** ${period} (${data.periodStart} to ${data.periodEnd})

## Key Deliverables
${deliverables}

## Velocity Trend
- Score: ${velocityTrend}
- PRs Opened: ${data.velocity.prsOpened}
- PRs Merged: ${data.velocity.prsMerged}
- Reviews Given: ${data.velocity.reviewsGiven}

## Architectural Impact
### Modules Impacted
${moduleSummary || '- No module data'}

## Code Quality Metrics
- Violations Introduced: ${data.dataPoints.violationsIntroduced}
- Violations Resolved: ${data.dataPoints.violationsResolved}
- Net Violation Change: ${violationNet >= 0 ? '+' : ''}${violationNet}
- Files Changed: ${data.dataPoints.filesChanged}

## Risks & Carry-Over
### Carry-Over
${carryOver}

### Blockers
${blockers}

---
*Sprint totals: ${data.commits.length} commits, ${mergedPrs.length} PRs merged, ${data.dataPoints.filesChanged} files changed*
`;
}

/**
 * Fallback stakeholder progress report.
 */
function generateFallbackProgressReport(
  data: CollectedData,
  developerName: string,
  period: string
): string {
  const mergedPrs = data.pullRequests.filter((pr) => pr.status === 'merged');
  const openPrs = data.pullRequests.filter((pr) => pr.status === 'open');

  const accomplishments = mergedPrs.length > 0
    ? mergedPrs.slice(0, 5).map((pr) => `- ${pr.title}`).join('\n')
    : '- Ongoing development work across the codebase';

  const currentFocus = openPrs.length > 0
    ? openPrs.slice(0, 3).map((pr) => `- ${pr.title}`).join('\n')
    : '- Continuing planned development activities';

  const paceDescription = data.velocity.score
    ? data.velocity.score.trend === 'accelerating'
      ? 'increasing'
      : data.velocity.score.trend === 'stable'
        ? 'steady'
        : 'adjusted'
    : 'steady';

  const risks = data.velocity.blockers.length > 0
    ? data.velocity.blockers
        .filter((b) => b.severity === 'high' || b.severity === 'medium')
        .map((b) => `- ${b.description}`)
        .join('\n') || '- Delivery is on track with no significant risks'
    : '- Delivery is on track with no significant risks';

  return `# Progress Report: ${developerName}
**Period:** ${period} (${data.periodStart} to ${data.periodEnd})

## Executive Summary
During this period, ${developerName} completed ${mergedPrs.length} deliverable(s) and made ${data.commits.length} updates across ${data.modules.length} area(s) of the system. Development pace is ${paceDescription}.

## Key Accomplishments
${accomplishments}

## Impact & Outcomes
- ${mergedPrs.length} item(s) delivered to production
- ${data.modules.length} area(s) of the system improved
- ${data.velocity.linesAdded + data.velocity.linesRemoved} total changes processed

## Current Focus
${currentFocus}

## Risks & Dependencies
${risks}

## Outlook
${openPrs.length > 0
    ? `${openPrs.length} item(s) currently in progress and expected to be completed in the upcoming period.`
    : 'The next period will focus on continuing planned development activities.'}

---
*Report generated from engineering activity data*
`;
}
