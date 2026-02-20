/**
 * Daily standup template.
 * Generates a prompt for Claude using the Done/Doing/Blocked format
 * commonly used in agile standup meetings.
 */

import type { CollectedData } from '../collector.js';

/**
 * Build the system and user prompts for a daily standup summary.
 */
export function buildStandupPrompt(
  data: CollectedData,
  developerName: string,
  period: string
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a concise engineering assistant that generates daily standup summaries. Your output must follow the strict Done/Doing/Blocked format. Keep each bullet point to one sentence. Be specific -- reference actual PR numbers, module names, and commit descriptions rather than vague statements. If there is nothing for a section, say "Nothing to report." Never fabricate data.`;

  const recentCommits = data.commits
    .slice(0, 10)
    .map((c) => `- [${c.sha.slice(0, 7)}] ${c.message} (${c.date})`)
    .join('\n');

  const mergedPrs = data.pullRequests
    .filter((pr) => pr.status === 'merged')
    .map((pr) => `- PR #${pr.number}: ${pr.title} (merged${pr.mergedAt ? ` on ${pr.mergedAt}` : ''})`)
    .join('\n');

  const openPrs = data.pullRequests
    .filter((pr) => pr.status === 'open')
    .map((pr) => `- PR #${pr.number}: ${pr.title} (+${pr.additions}/-${pr.deletions}, ${pr.reviewers.length} reviewers)`)
    .join('\n');

  const blockerSummary = data.velocity.blockers.length > 0
    ? data.velocity.blockers
        .map((b) => `- [${b.severity}] ${b.type}: ${b.description}`)
        .join('\n')
    : 'No blockers detected.';

  const activeModules = data.modules
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 5)
    .map((m) => `- ${m.module} (${m.filesChanged} files, ${m.commits} touches)`)
    .join('\n');

  const userPrompt = `Generate a daily standup update for **${developerName}** covering **${period}** (${data.periodStart} to ${data.periodEnd}).

## Activity Data

### Recent Commits (${data.commits.length} total)
${recentCommits || 'No commits in this period.'}

### Merged PRs
${mergedPrs || 'No merged PRs.'}

### Open PRs
${openPrs || 'No open PRs.'}

### Active Modules
${activeModules || 'No module data.'}

### Blockers
${blockerSummary}

### Quick Stats
- Lines Added: ${data.velocity.linesAdded}
- Lines Removed: ${data.velocity.linesRemoved}
- Reviews Given: ${data.velocity.reviewsGiven}

---

Please produce a Markdown standup update with EXACTLY these three sections:

## Done
List completed work items based on merged PRs and commits. Each item should be one concise bullet point referencing the specific PR or commit. Maximum 5 items, prioritize the most impactful.

## Doing
List current work in progress based on open PRs and the most recent unmerged commits. Each item should be one concise bullet point. Maximum 3 items.

## Blocked
List any blockers or impediments. If there are no blockers, state "Nothing to report." Include stalled PRs or review bottlenecks if detected.`;

  return { systemPrompt, userPrompt };
}
