/**
 * LLM-powered deep architectural review.
 * Sends diff context and relevant architectural decisions to Claude
 * for nuanced review that goes beyond deterministic rule matching.
 * Supports a --no-llm fallback that skips this pass entirely.
 */

import type {
  ArchDecision,
  ArchGuardConfig,
  Violation,
  ViolationSeverity,
} from '@archguard/core';
import {
  createLlmClient,
  analyzeWithLlm,
  generateId,
  parseJsonSafe,
} from '@archguard/core';
import type { DiffAnalysis, ChangeContext } from './diff-analyzer.js';

// ─── Types ────────────────────────────────────────────────────────

/** Options for the LLM review pass */
export interface LlmReviewOptions {
  /** Skip LLM review entirely (--no-llm flag) */
  skipLlm: boolean;
  /** Maximum number of change contexts to send to LLM (to control token usage) */
  maxContexts?: number;
  /** Additional instructions to include in the prompt */
  additionalInstructions?: string;
}

/** A raw violation parsed from LLM output before ID assignment */
interface RawLlmViolation {
  rule: string;
  severity: ViolationSeverity;
  message: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  suggestion?: string;
  decisionId?: string;
}

// ─── System Prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert software architect performing a code review focused on architectural compliance.

Your job is to analyze git diff changes against the established architectural decisions and identify violations, anti-patterns, or concerns that may not be caught by simple pattern matching.

Focus on:
1. **Dependency Direction Violations**: Imports that violate layer boundaries or dependency inversion principles.
2. **Abstraction Leaks**: Implementation details leaking across architectural boundaries.
3. **Pattern Consistency**: Deviations from established patterns in the codebase.
4. **Coupling Concerns**: Changes that increase coupling between modules that should be independent.
5. **Cohesion Issues**: Changes that reduce cohesion within modules.
6. **API Contract Changes**: Breaking changes to public interfaces or APIs.
7. **Security Concerns**: New code that may introduce security vulnerabilities from an architectural perspective.

For each violation found, respond with ONLY a JSON array. Each element must have these exact fields:
- "rule": string - A short rule identifier (e.g., "abstraction-leak", "coupling-concern")
- "severity": "error" | "warning" | "info"
- "message": string - Clear description of the violation
- "filePath": string - The file where the violation occurs
- "lineStart": number - Start line number
- "lineEnd": number - End line number
- "suggestion": string - Actionable suggestion for fixing the violation
- "decisionId": string | null - ID of the related architectural decision, if any

If no violations are found, respond with an empty JSON array: []

IMPORTANT: Your response must be valid JSON. Do not include any markdown formatting, code fences, or explanatory text. Only output the JSON array.`;

// ─── Main LLM Review Function ─────────────────────────────────────

/**
 * Run an LLM-powered architectural review on the diff.
 * Returns an empty array if skipLlm is true or if LLM analysis is disabled in config.
 */
export async function runLlmReview(
  diffAnalysis: DiffAnalysis,
  decisions: ArchDecision[],
  config: ArchGuardConfig,
  options: LlmReviewOptions
): Promise<Violation[]> {
  // Skip LLM review if explicitly requested or disabled in config
  if (options.skipLlm || !config.analysis.llmAnalysis) {
    return [];
  }

  // Don't run LLM review if there are no changes to review
  if (diffAnalysis.changeContexts.length === 0) {
    return [];
  }

  try {
    const client = createLlmClient(config);
    const userPrompt = buildUserPrompt(diffAnalysis, decisions, options);

    const response = await analyzeWithLlm(client, config, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: config.llm.maxTokensPerAnalysis,
      temperature: 0.2,
    });

    return parseLlmResponse(response);
  } catch (error) {
    // If LLM fails, return a single info violation noting the failure
    const errorMessage = error instanceof Error ? error.message : String(error);
    return [
      {
        id: generateId(),
        rule: 'llm-review-error',
        severity: 'info',
        message: `LLM review could not be completed: ${errorMessage}. ` +
          `Rule-based review results are still available.`,
        filePath: '',
        lineStart: 0,
        lineEnd: 0,
        suggestion: 'Check your LLM API key configuration and try again, ' +
          'or use --no-llm to skip LLM review.',
      },
    ];
  }
}

// ─── Prompt Building ──────────────────────────────────────────────

/**
 * Build the user prompt containing the diff and architectural context.
 */
function buildUserPrompt(
  diffAnalysis: DiffAnalysis,
  decisions: ArchDecision[],
  options: LlmReviewOptions
): string {
  const sections: string[] = [];

  // Section 1: Architectural context
  sections.push(buildArchitecturalContextSection(decisions));

  // Section 2: Diff summary
  sections.push(buildDiffSummarySection(diffAnalysis));

  // Section 3: Change details (limited by maxContexts)
  const maxContexts = options.maxContexts ?? 30;
  const contexts = prioritizeContexts(diffAnalysis.changeContexts, maxContexts);
  sections.push(buildChangeDetailsSection(contexts));

  // Section 4: Additional instructions (if any)
  if (options.additionalInstructions) {
    sections.push(
      `## Additional Review Instructions\n\n${options.additionalInstructions}`
    );
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Build the architectural context section of the prompt.
 */
function buildArchitecturalContextSection(decisions: ArchDecision[]): string {
  if (decisions.length === 0) {
    return '## Architectural Context\n\nNo established architectural decisions found. ' +
      'Review based on general software architecture best practices.';
  }

  const activeDecisions = decisions.filter((d) => d.status !== 'deprecated');

  const decisionDescriptions = activeDecisions.map((d) => {
    let desc = `### ${d.title} (${d.category})\n`;
    desc += `ID: ${d.id}\n`;
    desc += `${d.description}\n`;

    if (d.constraints.length > 0) {
      desc += `\nConstraints:\n`;
      for (const c of d.constraints) {
        desc += `- ${c}\n`;
      }
    }

    if (d.tags.length > 0) {
      desc += `\nTags: ${d.tags.join(', ')}\n`;
    }

    return desc;
  });

  return `## Architectural Context\n\nThe following architectural decisions are established for this codebase:\n\n${decisionDescriptions.join('\n')}`;
}

/**
 * Build the diff summary section.
 */
function buildDiffSummarySection(diffAnalysis: DiffAnalysis): string {
  const { summary } = diffAnalysis;
  let section = '## Diff Summary\n\n';
  section += `- **Files changed**: ${summary.totalFiles}\n`;
  section += `- **Additions**: ${summary.totalAdditions} lines\n`;
  section += `- **Deletions**: ${summary.totalDeletions} lines\n`;
  section += `- **New files**: ${summary.newFileCount}\n`;
  section += `- **Modified files**: ${summary.modifiedCount}\n`;
  section += `- **Deleted files**: ${summary.deletedCount}\n`;

  if (summary.touchedDirectories.length > 0) {
    section += `- **Directories touched**: ${summary.touchedDirectories.join(', ')}\n`;
  }

  if (summary.fileExtensions.length > 0) {
    section += `- **File types**: ${summary.fileExtensions.join(', ')}\n`;
  }

  return section;
}

/**
 * Build the change details section with actual code changes.
 */
function buildChangeDetailsSection(contexts: ChangeContext[]): string {
  if (contexts.length === 0) {
    return '## Changes\n\nNo code changes to review.';
  }

  let section = '## Changes\n\n';

  // Group contexts by file
  const groupedByFile = new Map<string, ChangeContext[]>();
  for (const ctx of contexts) {
    const existing = groupedByFile.get(ctx.filePath) || [];
    existing.push(ctx);
    groupedByFile.set(ctx.filePath, existing);
  }

  for (const [filePath, fileContexts] of groupedByFile) {
    section += `### ${filePath} (${fileContexts[0].status})\n\n`;

    for (const ctx of fileContexts) {
      section += `Lines ${ctx.lineStart}-${ctx.lineEnd}:\n`;
      section += '```\n';

      // Show removed lines
      if (ctx.removedLines.length > 0) {
        for (const line of ctx.removedLines) {
          section += `- ${line}\n`;
        }
      }

      // Show added lines
      if (ctx.addedLines.length > 0) {
        for (const line of ctx.addedLines) {
          section += `+ ${line}\n`;
        }
      }

      section += '```\n\n';

      // Show new imports specifically
      if (ctx.newImports.length > 0) {
        section += `New imports:\n`;
        for (const imp of ctx.newImports) {
          section += `  - ${imp.trim()}\n`;
        }
        section += '\n';
      }
    }
  }

  return section;
}

// ─── Context Prioritization ──────────────────────────────────────

/**
 * Prioritize change contexts to stay within token limits.
 * Prioritizes:
 * 1. New files (most likely to introduce architectural issues)
 * 2. Changes with new imports (dependency direction changes)
 * 3. Modified files (existing code changes)
 * 4. Remaining changes
 */
function prioritizeContexts(
  contexts: ChangeContext[],
  maxContexts: number
): ChangeContext[] {
  if (contexts.length <= maxContexts) {
    return contexts;
  }

  // Score each context for priority
  const scored = contexts.map((ctx) => {
    let score = 0;

    // New files get highest priority
    if (ctx.status === 'added') score += 10;
    // Changes with imports are architecturally significant
    if (ctx.newImports.length > 0) score += 5;
    // Modifications to existing files
    if (ctx.status === 'modified') score += 3;
    // More added lines = more to review
    score += Math.min(ctx.addedLines.length, 5);

    return { ctx, score };
  });

  // Sort by score descending and take the top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxContexts).map((s) => s.ctx);
}

// ─── Response Parsing ─────────────────────────────────────────────

/**
 * Parse the LLM response into Violation objects.
 * Handles various response formats and edge cases.
 */
function parseLlmResponse(response: string): Violation[] {
  // Try to extract JSON from the response
  const jsonStr = extractJsonArray(response);
  if (!jsonStr) {
    return [];
  }

  const rawViolations = parseJsonSafe<RawLlmViolation[]>(jsonStr, []);

  if (!Array.isArray(rawViolations)) {
    return [];
  }

  // Validate and transform each raw violation
  const violations: Violation[] = [];
  for (const raw of rawViolations) {
    const violation = validateAndTransformViolation(raw);
    if (violation) {
      violations.push(violation);
    }
  }

  return violations;
}

/**
 * Extract a JSON array string from LLM response text.
 * Handles cases where the LLM wraps the JSON in code fences or other text.
 */
function extractJsonArray(text: string): string | null {
  // First, try to parse the entire response as JSON
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    // Find the matching closing bracket
    let depth = 0;
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === '[') depth++;
      else if (trimmed[i] === ']') depth--;
      if (depth === 0) {
        return trimmed.slice(0, i + 1);
      }
    }
  }

  // Try to extract from code fences
  const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeFenceMatch) {
    const inner = codeFenceMatch[1].trim();
    if (inner.startsWith('[')) {
      return inner;
    }
  }

  // Try to find a JSON array anywhere in the text
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return arrayMatch[0];
  }

  return null;
}

/**
 * Validate and transform a raw LLM violation into a proper Violation object.
 */
function validateAndTransformViolation(raw: RawLlmViolation): Violation | null {
  // Validate required fields
  if (!raw.rule || typeof raw.rule !== 'string') return null;
  if (!raw.message || typeof raw.message !== 'string') return null;
  if (!raw.filePath || typeof raw.filePath !== 'string') return null;

  // Validate severity
  const validSeverities: ViolationSeverity[] = ['error', 'warning', 'info'];
  const severity = validSeverities.includes(raw.severity) ? raw.severity : 'warning';

  // Validate line numbers
  const lineStart = typeof raw.lineStart === 'number' && raw.lineStart > 0
    ? raw.lineStart
    : 1;
  const lineEnd = typeof raw.lineEnd === 'number' && raw.lineEnd >= lineStart
    ? raw.lineEnd
    : lineStart;

  return {
    id: generateId(),
    rule: `llm:${raw.rule}`,
    severity,
    message: raw.message,
    filePath: raw.filePath,
    lineStart,
    lineEnd,
    suggestion: raw.suggestion || undefined,
    decisionId: raw.decisionId || undefined,
  };
}
