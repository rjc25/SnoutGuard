/**
 * Sprint/weekly review template.
 * Generates a prompt for Claude focusing on key deliverables,
 * velocity trends, architectural impact, and code quality metrics.
 */

import type { CollectedData } from '../collector.js';

/**
 * Build the system and user prompts for a sprint or weekly review summary.
 */
export function buildSprintReviewPrompt(
  data: CollectedData,
  developerName: string,
  period: string
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are an engineering analytics assistant that generates sprint and weekly review summaries. Your summaries should be data-driven, highlighting delivery outcomes, velocity trends, and architectural health. Use Markdown formatting with clear sections. Be objective and quantitative where possible. When metrics indicate a trend, clearly state the direction and implications. Never fabricate data -- only reference what is provided.`;

  const commitsByDay = groupCommitsByDay(data);
  const commitTimeline = Object.entries(commitsByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, commits]) => `- **${day}**: ${commits.length} commit(s) — ${commits.map((c) => c.message).join('; ')}`)
    .join('\n');

  const prDeliverables = data.pullRequests
    .filter((pr) => pr.status === 'merged')
    .map((pr) => `- PR #${pr.number}: ${pr.title} (+${pr.additions}/-${pr.deletions}, ${pr.filesChanged} files, reviewers: ${pr.reviewers.join(', ') || 'none'})`)
    .join('\n');

  const openWork = data.pullRequests
    .filter((pr) => pr.status === 'open')
    .map((pr) => `- PR #${pr.number}: ${pr.title} [open since ${pr.createdAt}] (+${pr.additions}/-${pr.deletions})`)
    .join('\n');

  const moduleSummary = data.modules
    .sort((a, b) => b.filesChanged - a.filesChanged)
    .map((m) => `- **${m.module}**: ${m.filesChanged} files changed across ${m.commits} commits`)
    .join('\n');

  const blockerSummary = data.velocity.blockers.length > 0
    ? data.velocity.blockers
        .map((b) => `- [${b.severity.toUpperCase()}] ${b.type}: ${b.description}${b.staleSince ? ` (stale since ${b.staleSince})` : ''}`)
        .join('\n')
    : 'No blockers detected.';

  const velocityMetrics = buildVelocitySection(data);
  const codeQualityMetrics = buildCodeQualitySection(data);

  const userPrompt = `Generate a sprint/weekly review summary for **${developerName}** covering **${period}** (${data.periodStart} to ${data.periodEnd}).

## Activity Data

### Commit Timeline
${commitTimeline || 'No commits in this period.'}

### Delivered PRs (${data.pullRequests.filter((pr) => pr.status === 'merged').length} merged)
${prDeliverables || 'No PRs merged this sprint.'}

### In-Progress Work
${openWork || 'No open PRs.'}

### Modules Impacted
${moduleSummary || 'No module data available.'}

### Velocity Metrics
${velocityMetrics}

### Code Quality
${codeQualityMetrics}

### Blockers
${blockerSummary}

---

Please produce a Markdown sprint review with these sections:

## Key Deliverables
Summarize the most important features, fixes, or improvements delivered this sprint. Reference specific PRs and their impact. Group related work together.

## Velocity Trend
Analyze the development velocity for this period. Comment on commit frequency, PR throughput, and lines changed. If a velocity score is available, contextualize it. Note whether the trend is accelerating, stable, or decelerating and what might be driving it.

## Architectural Impact
Evaluate how this sprint's work affected the codebase architecture. Consider: which modules were touched, was there significant refactoring, were there cross-cutting changes, and did the work improve or complicate the architecture.

## Code Quality Metrics
Assess code quality based on available data: violation counts, refactoring ratio, review contributions, and the ratio of additions to deletions. Flag any concerning patterns.

## Risks & Carry-Over
Identify any incomplete work that will carry over to the next sprint, stale PRs, unresolved blockers, or emerging risks based on the data patterns.

## Sprint Score
Provide an overall sprint score (1-10) with a brief justification based on delivery, quality, and velocity metrics.`;

  return { systemPrompt, userPrompt };
}

/**
 * Group commits by their date (YYYY-MM-DD).
 */
function groupCommitsByDay(
  data: CollectedData
): Record<string, Array<{ sha: string; message: string }>> {
  const byDay: Record<string, Array<{ sha: string; message: string }>> = {};

  for (const commit of data.commits) {
    const day = commit.date.slice(0, 10); // YYYY-MM-DD
    if (!byDay[day]) {
      byDay[day] = [];
    }
    byDay[day].push({ sha: commit.sha, message: commit.message });
  }

  return byDay;
}

/**
 * Build the velocity metrics section from collected data.
 */
function buildVelocitySection(data: CollectedData): string {
  const lines: string[] = [];

  if (data.velocity.score) {
    const score = data.velocity.score;
    lines.push(`- Velocity Score: **${score.velocityScore}/100** (trend: ${score.trend})`);
    lines.push(`- Weighted Effort: ${score.weightedEffort}`);
    lines.push(`- Architectural Impact: ${score.architecturalImpact}`);
    lines.push(`- Refactoring Ratio: ${(score.refactoringRatio * 100).toFixed(1)}%`);
    lines.push(`- Review Contribution: ${score.reviewContribution}`);
  }

  lines.push(`- Total Commits: ${data.velocity.commitCount}`);
  lines.push(`- Lines Added: ${data.velocity.linesAdded}`);
  lines.push(`- Lines Removed: ${data.velocity.linesRemoved}`);
  lines.push(`- PRs Opened: ${data.velocity.prsOpened}`);
  lines.push(`- PRs Merged: ${data.velocity.prsMerged}`);
  lines.push(`- Reviews Given: ${data.velocity.reviewsGiven}`);

  const changeRatio = data.velocity.linesRemoved > 0
    ? (data.velocity.linesAdded / data.velocity.linesRemoved).toFixed(2)
    : 'N/A (no deletions)';
  lines.push(`- Add/Remove Ratio: ${changeRatio}`);

  return lines.join('\n');
}

/**
 * Build the code quality metrics section from collected data.
 */
function buildCodeQualitySection(data: CollectedData): string {
  const lines: string[] = [];

  lines.push(`- Violations Introduced: ${data.dataPoints.violationsIntroduced}`);
  lines.push(`- Violations Resolved: ${data.dataPoints.violationsResolved}`);

  const violationDelta = data.dataPoints.violationsResolved - data.dataPoints.violationsIntroduced;
  const violationTrend = violationDelta > 0 ? 'improving' : violationDelta < 0 ? 'degrading' : 'neutral';
  lines.push(`- Violation Trend: ${violationTrend} (net ${violationDelta >= 0 ? '+' : ''}${violationDelta})`);

  lines.push(`- Files Changed: ${data.dataPoints.filesChanged}`);
  lines.push(`- Modules Touched: ${data.modules.length}`);

  if (data.velocity.score) {
    lines.push(`- Refactoring Ratio: ${(data.velocity.score.refactoringRatio * 100).toFixed(1)}%`);
  }

  return lines.join('\n');
}
