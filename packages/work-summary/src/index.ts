/**
 * @archguard/work-summary - AI-powered work summaries for developers and teams.
 * Generates standup updates, 1:1 meeting prep, sprint reviews, and progress reports
 * from git activity data, optionally enhanced with LLM analysis via Claude.
 */

// ─── Main API ─────────────────────────────────────────────────────

export { generateSummary, type SummaryOptions } from './summarizer.js';

// ─── Data Collection ──────────────────────────────────────────────

export {
  collectData,
  type CollectorOptions,
  type CollectedData,
  type CommitInfo,
  type PullRequestInfo,
  type ModuleActivity,
  type PeriodVelocity,
} from './collector.js';

// ─── Scheduler ────────────────────────────────────────────────────

export {
  SummaryScheduler,
  type SchedulerConfig,
  type SummaryCallback,
  type ErrorCallback,
} from './scheduler.js';

// ─── Templates ────────────────────────────────────────────────────

export { buildOneOnOnePrompt } from './templates/one-on-one.js';
export { buildStandupPrompt } from './templates/standup.js';
export { buildSprintReviewPrompt } from './templates/sprint-review.js';
export { buildProgressReportPrompt } from './templates/progress-report.js';
