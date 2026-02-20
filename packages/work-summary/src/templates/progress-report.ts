/**
 * Stakeholder progress report template.
 * Generates a prompt for Claude with a non-technical audience focus,
 * emphasizing outcomes, impact, and business value rather than
 * implementation details.
 */

import type { CollectedData } from '../collector.js';

/**
 * Build the system and user prompts for a stakeholder progress report.
 */
export function buildProgressReportPrompt(
  data: CollectedData,
  developerName: string,
  period: string
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a technical writing assistant that translates engineering activity into stakeholder-friendly progress reports. Your audience is non-technical: product managers, executives, and business stakeholders. Avoid jargon, code references, and internal tooling names. Focus on outcomes, business impact, and progress toward goals. Use clear, professional language. Structure the report to answer: "What was accomplished?", "What is the impact?", and "What's next?". Never fabricate data -- only reference what is provided.`;

  const deliveredItems = data.pullRequests
    .filter((pr) => pr.status === 'merged')
    .map((pr) => `- ${pr.title} (completed${pr.mergedAt ? ` on ${pr.mergedAt.slice(0, 10)}` : ''})`)
    .join('\n');

  const inProgressItems = data.pullRequests
    .filter((pr) => pr.status === 'open')
    .map((pr) => `- ${pr.title} (in progress since ${pr.createdAt.slice(0, 10)})`)
    .join('\n');

  const highLevelModules = data.modules
    .sort((a, b) => b.filesChanged - a.filesChanged)
    .slice(0, 5)
    .map((m) => `- ${humanizeModule(m.module)}: ${m.filesChanged} components updated`)
    .join('\n');

  const blockerSummary = data.velocity.blockers.length > 0
    ? data.velocity.blockers
        .filter((b) => b.severity === 'high' || b.severity === 'medium')
        .map((b) => `- ${humanizeBlockerType(b.type)}: ${b.description}`)
        .join('\n')
    : '';

  const productivitySnapshot = buildProductivitySnapshot(data);

  const commitThemes = extractCommitThemes(data);

  const userPrompt = `Generate a stakeholder progress report for **${developerName}** covering **${period}** (${data.periodStart} to ${data.periodEnd}).

## Raw Engineering Data (for context only -- do NOT include technical details in the report)

### Delivered Work
${deliveredItems || 'No items delivered this period.'}

### In-Progress Work
${inProgressItems || 'No items currently in progress.'}

### Areas of Focus
${highLevelModules || 'No area data available.'}

### Commit Themes
${commitThemes || 'No discernible themes.'}

### Productivity Snapshot
${productivitySnapshot}

### Blockers Affecting Delivery
${blockerSummary || 'No significant blockers.'}

---

Please produce a Markdown progress report suitable for non-technical stakeholders with these sections:

## Executive Summary
A 2-3 sentence overview of what was accomplished this period and the overall trajectory. Use plain language.

## Key Accomplishments
List the most important deliverables in business terms. Translate technical work into outcomes and impact. For example, instead of "Merged PR #42: Refactor auth middleware", write "Improved system security infrastructure to support upcoming compliance requirements." Maximum 5 items.

## Impact & Outcomes
Describe the tangible impact of the completed work. How does it affect the product, users, or business objectives? Reference quantitative metrics where they tell a story (e.g., "processed X components" or "updated Y areas of the system").

## Current Focus
Describe what is currently being worked on and expected completion. Use non-technical language. Maximum 3 items.

## Risks & Dependencies
List any delivery risks, dependencies on other teams, or blockers that stakeholders should be aware of. If there are none, state that delivery is on track.

## Outlook
A brief forward-looking statement about the upcoming period: what to expect, any planned milestones, or changes in pace.`;

  return { systemPrompt, userPrompt };
}

/**
 * Convert a module path like "src/api" into a human-readable area name.
 */
function humanizeModule(module: string): string {
  const mappings: Record<string, string> = {
    'src/api': 'API Layer',
    'src/auth': 'Authentication',
    'src/db': 'Database',
    'src/components': 'UI Components',
    'src/services': 'Backend Services',
    'src/utils': 'Core Utilities',
    'src/lib': 'Shared Libraries',
    'src/hooks': 'Application Logic',
    'src/middleware': 'Request Processing',
    'src/routes': 'Routing',
    'src/models': 'Data Models',
    'src/config': 'Configuration',
    'src/tests': 'Test Suite',
    'src/types': 'Type Definitions',
    'src/templates': 'Templates',
    'src/workers': 'Background Processing',
    'src/jobs': 'Scheduled Tasks',
    'src/events': 'Event System',
    'src/integrations': 'Third-Party Integrations',
  };

  // Check for exact match
  if (mappings[module]) {
    return mappings[module];
  }

  // Check for partial match
  for (const [key, value] of Object.entries(mappings)) {
    if (module.includes(key.split('/').pop()!)) {
      return value;
    }
  }

  // Fallback: capitalize the last path segment
  const parts = module.split('/');
  const last = parts[parts.length - 1];
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/[-_]/g, ' ');
}

/**
 * Translate blocker types into stakeholder-friendly descriptions.
 */
function humanizeBlockerType(type: string): string {
  const mappings: Record<string, string> = {
    stalled_pr: 'Pending review approval',
    long_lived_branch: 'Long-running work item',
    review_bottleneck: 'Review capacity constraint',
    high_violation_rate: 'Code quality concerns requiring attention',
    dependency_block: 'External dependency',
  };
  return mappings[type] ?? type.replace(/_/g, ' ');
}

/**
 * Build a high-level productivity snapshot.
 */
function buildProductivitySnapshot(data: CollectedData): string {
  const lines: string[] = [];

  lines.push(`- Items Completed: ${data.pullRequests.filter((pr) => pr.status === 'merged').length}`);
  lines.push(`- Items In Progress: ${data.pullRequests.filter((pr) => pr.status === 'open').length}`);
  lines.push(`- Areas Updated: ${data.modules.length}`);
  lines.push(`- Total Changes Made: ${data.velocity.commitCount} updates across ${data.dataPoints.filesChanged} components`);

  if (data.velocity.score) {
    const trend = data.velocity.score.trend;
    const trendLabel = trend === 'accelerating'
      ? 'Increasing pace'
      : trend === 'stable'
        ? 'Steady pace'
        : 'Reduced pace';
    lines.push(`- Delivery Pace: ${trendLabel}`);
  }

  return lines.join('\n');
}

/**
 * Extract high-level themes from commit messages.
 * Groups commits by common keywords and patterns.
 */
function extractCommitThemes(data: CollectedData): string {
  const themeKeywords: Record<string, string[]> = {
    'New Features': ['feat', 'add', 'implement', 'introduce', 'create', 'new'],
    'Bug Fixes': ['fix', 'bug', 'patch', 'resolve', 'issue', 'hotfix'],
    'Improvements': ['improve', 'enhance', 'update', 'upgrade', 'optimize', 'refactor'],
    'Infrastructure': ['ci', 'deploy', 'build', 'config', 'infra', 'setup', 'pipeline'],
    'Documentation': ['doc', 'readme', 'comment', 'changelog'],
    'Testing': ['test', 'spec', 'coverage', 'e2e', 'unit'],
  };

  const themeCounts: Record<string, number> = {};

  for (const commit of data.commits) {
    const messageLower = commit.message.toLowerCase();
    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      if (keywords.some((kw) => messageLower.includes(kw))) {
        themeCounts[theme] = (themeCounts[theme] ?? 0) + 1;
      }
    }
  }

  const themes = Object.entries(themeCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([theme, count]) => `- ${theme}: ${count} update(s)`)
    .join('\n');

  return themes || 'General development activity.';
}
