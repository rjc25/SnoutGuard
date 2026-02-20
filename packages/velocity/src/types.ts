/**
 * Type definitions for the velocity package.
 * Re-exports relevant types from @archguard/core and defines internal types
 * used across collectors, scoring, and blocker modules.
 */

// Re-export all velocity-related types from core
export type {
  VelocityScore,
  VelocityPeriod,
  VelocityTrend,
  TeamVelocity,
  Blocker,
  BlockerType,
  ArchGuardConfig,
  Violation,
  ViolationSeverity,
  ArchDecision,
  Developer,
} from '@archguard/core';

// Re-export git types used by collectors
export type { DevGitStats, FileDiff, DiffHunk } from '@archguard/core';

// ─── Internal Collector Types ─────────────────────────────────────

/** Git-level metrics collected per developer per time window */
export interface GitMetrics {
  developerId: string;
  commits: number;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  fileTypesTouched: Record<string, number>;
  periodStart: string;
  periodEnd: string;
}

/** Complexity rating for a single function or block */
export interface FunctionComplexity {
  filePath: string;
  functionName: string;
  lineStart: number;
  lineEnd: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
}

/** Complexity metrics for a file */
export interface FileComplexity {
  filePath: string;
  functions: FunctionComplexity[];
  avgCyclomaticComplexity: number;
  avgCognitiveComplexity: number;
  maxCyclomaticComplexity: number;
  maxCognitiveComplexity: number;
}

/** Complexity delta from a set of changes */
export interface ComplexityDelta {
  filePath: string;
  beforeAvgComplexity: number;
  afterAvgComplexity: number;
  complexityChange: number;
  refactoringReduction: number;
  complexityAddition: number;
}

// ─── PR Metrics Types ─────────────────────────────────────────────

/** Pull request data for velocity tracking */
export interface PRData {
  id: string;
  number: number;
  title: string;
  author: string;
  state: 'open' | 'closed' | 'merged';
  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
  closedAt?: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  reviewRounds: number;
  timeToFirstReviewMs?: number;
  timeToMergeMs?: number;
  reviewers: string[];
  hasArchViolations: boolean;
  violationCount: number;
  branchName: string;
  baseBranch: string;
  labels: string[];
}

/** Aggregated PR metrics per developer */
export interface DeveloperPRMetrics {
  developerId: string;
  prsOpened: number;
  prsMerged: number;
  prsClosed: number;
  avgFilesChanged: number;
  avgLinesChanged: number;
  avgTimeToMergeMs: number;
  avgReviewRounds: number;
  prsWithViolations: number;
  reviewsGiven: number;
}

// ─── Issue Tracker Types ──────────────────────────────────────────

/** Issue data from external tracker */
export interface IssueData {
  id: string;
  key: string;
  title: string;
  type: 'bug' | 'feature' | 'task' | 'story' | 'epic';
  status: 'open' | 'in_progress' | 'review' | 'done' | 'closed';
  assignee?: string;
  storyPoints?: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  labels: string[];
  linkedPrNumbers: number[];
}

/** Issue metrics aggregated per developer */
export interface DeveloperIssueMetrics {
  developerId: string;
  issuesCompleted: number;
  totalStoryPoints: number;
  avgCycleTimeMs: number;
  bugFixCount: number;
  featureCount: number;
}

// ─── Scoring Types ────────────────────────────────────────────────

/** Weighted effort score for a developer */
export interface EffortScore {
  developerId: string;
  rawLinesChanged: number;
  complexityWeightedEffort: number;
  normalizedScore: number;
}

/** Architectural impact score for a developer */
export interface ImpactScore {
  developerId: string;
  boundariesCrossed: number;
  coreModuleTouches: number;
  peripheralModuleTouches: number;
  normalizedScore: number;
}

// ─── Blocker Alert Types ──────────────────────────────────────────

/** Format for blocker alert output */
export type AlertFormat = 'text' | 'slack' | 'json';

/** Slack block structure for alerts */
export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text: string;
    emoji?: boolean;
  }>;
  fields?: Array<{
    type: string;
    text: string;
  }>;
}
