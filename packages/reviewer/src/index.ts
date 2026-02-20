/**
 * @archguard/reviewer - Architectural Code Review Engine
 * Performs architectural code reviews on git diffs by running both
 * deterministic rule-based checks and LLM-powered deep review passes.
 *
 * Main entry point: reviewChanges()
 */

import type {
  ArchDecision,
  ArchGuardConfig,
  ReviewResult,
  Violation,
  ViolationSeverity,
} from '@archguard/core';
import { generateId, now, loadConfig } from '@archguard/core';

import { analyzeDiff, type DiffAnalysis } from './diff-analyzer.js';
import { checkRules, type RuleEngineConfig } from './rule-engine.js';
import { runLlmReview, type LlmReviewOptions } from './llm-reviewer.js';
import {
  filterBySeverity,
  sortBySeverity,
  countBySeverity,
  determinePassFail,
} from './severity.js';

// ─── Re-exports ───────────────────────────────────────────────────

// Diff analyzer
export {
  analyzeDiff,
  categorizeChanges,
  extractChangeContexts,
  buildDiffSummary,
  getAffectedFiles,
  getContextsForFile,
  getAllNewImports,
  type CategorizedChanges,
  type ChangeContext,
  type DiffSummary,
  type DiffAnalysis,
} from './diff-analyzer.js';

// Rule engine
export {
  checkRules,
  type RuleEngineConfig,
} from './rule-engine.js';

// LLM reviewer
export {
  runLlmReview,
  type LlmReviewOptions,
} from './llm-reviewer.js';

// Severity utilities
export {
  filterBySeverity,
  sortBySeverity,
  countBySeverity,
  determinePassFail,
  getHighestSeverity,
  getSeverityIcon,
  getSeverityLabel,
  computeSeverityScore,
  buildSeveritySummary,
  meetsThreshold,
} from './severity.js';

// Formatters
export { formatForTerminal } from './formatters/terminal.js';
export {
  formatForGitHubPr,
  formatForGitHubFull,
  type GitHubInlineComment,
  type GitHubCheckAnnotation,
  type GitHubFormattedOutput,
} from './formatters/github-pr.js';
export {
  formatForBitbucketPr,
  formatForBitbucketFull,
  type BitbucketReport,
  type BitbucketReportData,
  type BitbucketAnnotation,
  type BitbucketFormattedOutput,
} from './formatters/bitbucket-pr.js';
export {
  formatForJson,
  buildJsonOutput,
  type JsonReviewOutput,
  type JsonViolation,
  type JsonFileResult,
  type JsonRuleResult,
} from './formatters/json.js';

// ─── Types ────────────────────────────────────────────────────────

/** Options for the reviewChanges function */
export interface ReviewOptions {
  /** Skip LLM review (--no-llm flag) */
  skipLlm?: boolean;
  /** Repository ID for tracking */
  repoId?: string;
  /** PR number if triggered by a pull request */
  prNumber?: number;
  /** PR URL if triggered by a pull request */
  prUrl?: string;
  /** How the review was triggered */
  triggeredBy?: 'webhook' | 'cli' | 'manual';
  /** Override the severity threshold from config */
  severityThreshold?: ViolationSeverity;
  /** Override maximum violations from config */
  maxViolations?: number;
  /** Architectural decisions to enforce (if not provided, will be empty) */
  decisions?: ArchDecision[];
  /** Additional instructions for the LLM reviewer */
  additionalInstructions?: string;
  /** Maximum number of change contexts to send to LLM */
  maxLlmContexts?: number;
}

// ─── Main Entry Point ─────────────────────────────────────────────

/**
 * Perform an architectural code review on git diff changes.
 *
 * This is the main entry point for the reviewer package. It:
 * 1. Analyzes the git diff to extract and categorize changes
 * 2. Runs deterministic rule-based checks against architectural decisions
 * 3. Optionally runs an LLM-powered deep review for nuanced analysis
 * 4. Combines results, deduplicates, and returns a ReviewResult
 *
 * @param projectDir - Path to the project root directory
 * @param config - ArchGuard configuration (from .archguard.yml)
 * @param diffRef - Git ref to diff against (e.g., "HEAD~1", "main", a commit SHA)
 * @param options - Additional review options
 * @returns A ReviewResult with all violations found
 */
export async function reviewChanges(
  projectDir: string,
  config: ArchGuardConfig,
  diffRef: string,
  options: ReviewOptions = {}
): Promise<ReviewResult> {
  const {
    skipLlm = false,
    repoId = '',
    prNumber,
    prUrl,
    triggeredBy = 'cli',
    severityThreshold,
    maxViolations,
    decisions = [],
    additionalInstructions,
    maxLlmContexts,
  } = options;

  // Step 1: Analyze the diff
  const diffAnalysis = await analyzeDiff(projectDir, diffRef);

  // If no files changed, return an empty result
  if (diffAnalysis.fileDiffs.length === 0) {
    return buildReviewResult({
      repoId,
      ref: diffRef,
      prNumber,
      prUrl,
      triggeredBy,
      violations: [],
    });
  }

  // Step 2: Run rule-based checks
  const ruleConfig: RuleEngineConfig = {
    decisions,
    customRules: config.rules,
  };
  const ruleViolations = checkRules(diffAnalysis, ruleConfig);

  // Step 3: Run LLM review (if enabled)
  let llmViolations: Violation[] = [];
  if (!skipLlm && config.analysis.llmAnalysis) {
    const llmOptions: LlmReviewOptions = {
      maxContexts: maxLlmContexts,
      additionalInstructions,
    };
    llmViolations = await runLlmReview(
      diffAnalysis,
      decisions,
      config,
      llmOptions
    );
  }

  // Step 4: Combine and deduplicate violations
  const allViolations = deduplicateViolations([
    ...ruleViolations,
    ...llmViolations,
  ]);

  // Step 5: Apply severity threshold filter
  const threshold = severityThreshold ?? config.review.severityThreshold;
  const filteredViolations = filterBySeverity(allViolations, threshold);

  // Step 6: Apply max violations limit
  const limit = maxViolations ?? config.review.maxViolations;
  const sortedViolations = sortBySeverity(filteredViolations);
  const limitedViolations = sortedViolations.slice(0, limit);

  // Step 7: Build and return the review result
  return buildReviewResult({
    repoId,
    ref: diffRef,
    prNumber,
    prUrl,
    triggeredBy,
    violations: limitedViolations,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────

/** Parameters for building a ReviewResult */
interface ReviewResultParams {
  repoId: string;
  ref: string;
  prNumber?: number;
  prUrl?: string;
  triggeredBy: 'webhook' | 'cli' | 'manual';
  violations: Violation[];
}

/**
 * Build a ReviewResult from violations and metadata.
 */
function buildReviewResult(params: ReviewResultParams): ReviewResult {
  const counts = countBySeverity(params.violations);

  return {
    id: generateId(),
    repoId: params.repoId,
    ref: params.ref,
    prNumber: params.prNumber,
    prUrl: params.prUrl,
    totalViolations: params.violations.length,
    errors: counts.error,
    warnings: counts.warning,
    infos: counts.info,
    violations: params.violations,
    triggeredBy: params.triggeredBy,
    reviewedAt: now(),
  };
}

/**
 * Deduplicate violations that have the same file, line range, and similar messages.
 * When duplicates are found from both rule-based and LLM passes, prefer the
 * rule-based violation (deterministic) but keep the LLM suggestion if it is richer.
 */
function deduplicateViolations(violations: Violation[]): Violation[] {
  const seen = new Map<string, Violation>();

  for (const v of violations) {
    const key = buildDeduplicationKey(v);
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, v);
      continue;
    }

    // If the existing one is from LLM and this one is rule-based, prefer rule-based
    const existingIsLlm = existing.rule.startsWith('llm:');
    const currentIsLlm = v.rule.startsWith('llm:');

    if (existingIsLlm && !currentIsLlm) {
      // Keep the rule-based one, but merge suggestion if LLM has a better one
      const merged = { ...v };
      if (!merged.suggestion && existing.suggestion) {
        merged.suggestion = existing.suggestion;
      }
      seen.set(key, merged);
    } else if (!existingIsLlm && currentIsLlm) {
      // Keep the existing rule-based one, but merge LLM suggestion if richer
      if (!existing.suggestion && v.suggestion) {
        seen.set(key, { ...existing, suggestion: v.suggestion });
      }
    }
    // If both are from the same source, keep the first one
  }

  return Array.from(seen.values());
}

/**
 * Build a deduplication key for a violation.
 * Uses file path, approximate line range, and a normalized message prefix.
 */
function buildDeduplicationKey(v: Violation): string {
  // Normalize the message to the first 50 chars for fuzzy matching
  const normalizedMessage = v.message
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 50);

  // Group line ranges within 3 lines of each other
  const lineGroup = Math.floor(v.lineStart / 3);

  return `${v.filePath}:${lineGroup}:${normalizedMessage}`;
}
