/**
 * 1:1 meeting preparation template.
 * Generates a prompt for Claude focusing on accomplishments,
 * work in progress, blockers, architectural contributions,
 * and suggested discussion topics.
 */

import type { CollectedData } from '../collector.js';

/**
 * Build the system and user prompts for a 1:1 meeting preparation summary.
 */
export function buildOneOnOnePrompt(
  data: CollectedData,
  developerName: string,
  period: string
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are an engineering manager's assistant specializing in developer performance analysis and 1:1 meeting preparation. You produce concise, actionable meeting prep documents in Markdown format. Focus on being constructive, specific, and data-driven. Never fabricate data -- only reference what is provided. When data is sparse, note it and suggest areas to explore in the meeting.`;

  const commitSummary = data.commits
    .slice(0, 20)
    .map((c) => `- [${c.sha.slice(0, 7)}] ${c.message} (${c.date})`)
    .join('\n');

  const prSummary = data.pullRequests
    .map((pr) => `- PR #${pr.number}: ${pr.title} [${pr.status}] (+${pr.additions}/-${pr.deletions}, ${pr.filesChanged} files)`)
    .join('\n');

  const moduleSummary = data.modules
    .sort((a, b) => b.filesChanged - a.filesChanged)
    .map((m) => `- ${m.module}: ${m.filesChanged} files, ${m.commits} commits`)
    .join('\n');

  const blockerSummary = data.velocity.blockers.length > 0
    ? data.velocity.blockers
        .map((b) => `- [${b.severity}] ${b.type}: ${b.description}`)
        .join('\n')
    : 'No blockers detected.';

  const velocityInfo = data.velocity.score
    ? `Velocity Score: ${data.velocity.score.velocityScore}/100 (trend: ${data.velocity.score.trend})
Architectural Impact: ${data.velocity.score.architecturalImpact}
Refactoring Ratio: ${(data.velocity.score.refactoringRatio * 100).toFixed(1)}%
Review Contribution: ${data.velocity.score.reviewContribution}`
    : `Commits: ${data.velocity.commitCount}
Lines Added: ${data.velocity.linesAdded}
Lines Removed: ${data.velocity.linesRemoved}
PRs Opened: ${data.velocity.prsOpened}
PRs Merged: ${data.velocity.prsMerged}
Reviews Given: ${data.velocity.reviewsGiven}`;

  const userPrompt = `Generate a 1:1 meeting preparation document for **${developerName}** covering the period **${period}** (${data.periodStart} to ${data.periodEnd}).

## Developer Activity Data

### Commits (${data.commits.length} total)
${commitSummary || 'No commits in this period.'}

### Pull Requests (${data.pullRequests.length} total)
${prSummary || 'No PR data available.'}

### Modules/Areas Worked On
${moduleSummary || 'No module data available.'}

### Velocity Metrics
${velocityInfo}

### Blockers
${blockerSummary}

### Summary Statistics
- Files Changed: ${data.dataPoints.filesChanged}
- Violations Introduced: ${data.dataPoints.violationsIntroduced}
- Violations Resolved: ${data.dataPoints.violationsResolved}

---

Please produce a Markdown document with these sections:

## Top 3 Accomplishments
Identify the three most significant contributions based on the commit messages, PRs, and modules worked on. Reference specific PRs or commits where possible.

## Current Work in Progress
Based on open PRs and recent commits, identify what the developer is currently working on. Note any patterns suggesting ongoing feature work.

## Blockers & Risks
List any detected blockers and potential risks. If velocity is declining or the developer seems stretched across too many modules, note it.

## Architectural Contributions
Highlight any work that touches shared infrastructure, refactoring, API changes, or cross-cutting concerns. Note the refactoring ratio and architectural impact score if available.

## Suggested Discussion Topics
Based on the data, suggest 3-5 specific talking points for the 1:1 meeting. These might include: recognizing achievements, exploring blockers, discussing growth areas, addressing code quality trends, or planning upcoming work.`;

  return { systemPrompt, userPrompt };
}
