/**
 * Production-grade LLM-powered architectural reviewer.
 *
 * Uses structured XML-tagged prompts (Anthropic best practices), Zod schema
 * validation, few-shot examples, full architectural context, decision citation,
 * and pattern-aware fix suggestions. Calls `analyzeWithLlmValidated` with the
 * 'review' operation type so the Sonnet model is selected automatically.
 *
 * Errors are never silently swallowed -- if the LLM call fails, the error
 * propagates to the caller so it can be handled explicitly.
 */

import { z } from 'zod';
import type {
  ArchDecision,
  ArchGuardConfig,
  Violation,
  ViolationSeverity,
} from '@archguard/core';
import {
  createLlmClient,
  analyzeWithLlmValidated,
  generateId,
  LlmError,
} from '@archguard/core';
import type { DiffAnalysis, ChangeContext } from './diff-analyzer.js';

// ─── Types ────────────────────────────────────────────────────────

/** Options for the LLM review pass */
export interface LlmReviewOptions {
  /** Maximum number of change contexts to send to LLM (to control token usage) */
  maxContexts?: number;
  /** Additional instructions to include in the prompt */
  additionalInstructions?: string;
}

// ─── Zod Schema ───────────────────────────────────────────────────

const violationSchema = z.object({
  rule: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  filePath: z.string(),
  lineStart: z.number(),
  lineEnd: z.number(),
  suggestion: z.string(),
  decisionId: z.string().nullable(),
  reasoning: z.string(),
});

const llmResponseSchema = z.array(violationSchema);

type RawLlmViolation = z.infer<typeof violationSchema>;

// ─── System Prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT = `<role>
You are an expert software architect performing a code review focused on
architectural compliance. You review git diffs against a project's established
architectural decisions and constraints to identify violations, anti-patterns,
and concerns that cannot be caught by simple pattern matching.
</role>

<focus_areas>
1. Dependency direction violations -- imports that break layer boundaries or
   dependency inversion principles.
2. Abstraction leaks -- implementation details crossing architectural boundaries.
3. Pattern consistency -- deviations from established patterns in the codebase.
4. Coupling concerns -- changes that increase coupling between modules that
   should be independent.
5. Cohesion issues -- changes that reduce cohesion within a module.
6. API contract changes -- breaking changes to public interfaces or APIs.
7. Security concerns -- new code that introduces security risks from an
   architectural perspective.
</focus_areas>

<output_format>
Respond with ONLY a JSON array. Each element must be an object with these
exact fields:

- "rule"       (string)        -- Short kebab-case rule identifier
                                  (e.g. "abstraction-leak", "coupling-concern").
- "severity"   ("error"|"warning"|"info") -- How severe the violation is.
- "message"    (string)        -- Clear, one-sentence description of the
                                  violation.
- "filePath"   (string)        -- The file where the violation occurs.
- "lineStart"  (number)        -- Start line number in the new file.
- "lineEnd"    (number)        -- End line number in the new file.
- "suggestion" (string)        -- Actionable fix that follows the project's
                                  actual patterns and conventions.
- "decisionId" (string|null)   -- ID of the architectural decision this
                                  violation breaks, or null if it is a
                                  general best-practice concern.
- "reasoning"  (string)        -- Brief explanation of WHY this is a
                                  violation, citing specific constraints.

If no violations are found, respond with an empty JSON array: []

IMPORTANT: Your response must be valid JSON. Do not include markdown formatting,
code fences, or explanatory text outside the JSON array.
</output_format>

<examples>
Here are examples of well-formed violation objects:

[
  {
    "rule": "layer-boundary-violation",
    "severity": "error",
    "message": "Infrastructure module directly imports from the presentation layer, violating the layered architecture.",
    "filePath": "src/infrastructure/api-client.ts",
    "lineStart": 3,
    "lineEnd": 3,
    "suggestion": "Import the interface from the domain layer instead: import type { UserRepository } from '../domain/repositories/user-repository.js'",
    "decisionId": "dec-layered-arch-001",
    "reasoning": "Decision dec-layered-arch-001 constrains infrastructure to only depend on domain and application layers. Importing from presentation breaks this constraint."
  },
  {
    "rule": "abstraction-leak",
    "severity": "warning",
    "message": "Database-specific error type (PrismaClientKnownRequestError) is exposed in the service interface return type.",
    "filePath": "src/services/user-service.ts",
    "lineStart": 45,
    "lineEnd": 52,
    "suggestion": "Wrap the Prisma error in a domain-level AppError before re-throwing: throw new UserNotFoundError(userId)",
    "decisionId": "dec-clean-arch-002",
    "reasoning": "Decision dec-clean-arch-002 requires that persistence details do not leak above the repository layer. Exposing PrismaClientKnownRequestError couples the service to Prisma."
  },
  {
    "rule": "pattern-inconsistency",
    "severity": "info",
    "message": "New API endpoint handler does not follow the established Result pattern used by all other handlers in this module.",
    "filePath": "src/api/handlers/orders.ts",
    "lineStart": 12,
    "lineEnd": 30,
    "suggestion": "Wrap the return value using Result.ok(data) for success and Result.err(error) for failures, matching the pattern in src/api/handlers/users.ts",
    "decisionId": null,
    "reasoning": "All other handlers in src/api/handlers/ use the Result monad pattern. Inconsistency makes error handling unpredictable."
  }
]
</examples>`;

// ─── Main LLM Review Function ─────────────────────────────────────

/**
 * Run an LLM-powered architectural review on the diff.
 *
 * Sends the full architectural context (all confirmed decisions and their
 * constraints) alongside enriched diff context to Claude Sonnet for review.
 *
 * Throws on LLM failure -- callers must handle errors explicitly.
 */
export async function runLlmReview(
  diffAnalysis: DiffAnalysis,
  decisions: ArchDecision[],
  config: ArchGuardConfig,
  options: LlmReviewOptions
): Promise<Violation[]> {
  // Nothing to review if there are no changes
  if (diffAnalysis.changeContexts.length === 0) {
    return [];
  }

  const client = createLlmClient(config);
  const userPrompt = buildUserPrompt(diffAnalysis, decisions, options);

  let rawViolations: RawLlmViolation[];
  try {
    rawViolations = await analyzeWithLlmValidated(
      client,
      config,
      {
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        maxTokens: config.llm.maxTokensPerAnalysis,
        temperature: 0.2,
      },
      llmResponseSchema,
      'review'
    );
  } catch (error) {
    if (error instanceof LlmError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new LlmError(
      `LLM architectural review failed: ${message}`,
      'REVIEW_FAILED'
    );
  }

  return rawViolations.map(transformViolation);
}

// ─── Prompt Building ──────────────────────────────────────────────

/**
 * Build the user prompt containing the diff and architectural context
 * using XML-tagged sections for clear structure.
 */
function buildUserPrompt(
  diffAnalysis: DiffAnalysis,
  decisions: ArchDecision[],
  options: LlmReviewOptions
): string {
  const sections: string[] = [];

  // Section 1: Full architectural context (decisions + constraints)
  sections.push(buildArchitecturalContextSection(decisions));

  // Section 2: Diff summary
  sections.push(buildDiffSummarySection(diffAnalysis));

  // Section 3: Change details with surrounding code context
  const maxContexts = options.maxContexts ?? 30;
  const contexts = prioritizeContexts(diffAnalysis.changeContexts, maxContexts);
  sections.push(buildChangeDetailsSection(contexts));

  // Section 4: Additional instructions (if any)
  if (options.additionalInstructions) {
    sections.push(
      `<additional_instructions>\n${options.additionalInstructions}\n</additional_instructions>`
    );
  }

  // Section 5: Task instructions
  sections.push(buildTaskSection(decisions));

  return sections.join('\n\n');
}

/**
 * Build the architectural context section with all confirmed decisions
 * and their constraints, formatted as XML for clarity.
 */
function buildArchitecturalContextSection(decisions: ArchDecision[]): string {
  if (decisions.length === 0) {
    return (
      '<architectural_context>\n' +
      'No established architectural decisions found for this project.\n' +
      'Review based on general software architecture best practices.\n' +
      '</architectural_context>'
    );
  }

  const activeDecisions = decisions.filter((d) => d.status !== 'deprecated');

  const decisionBlocks = activeDecisions.map((d) => {
    const parts: string[] = [];
    parts.push(`<decision id="${d.id}" category="${d.category}" status="${d.status}">`);
    parts.push(`  <title>${d.title}</title>`);
    parts.push(`  <description>${d.description}</description>`);

    if (d.constraints.length > 0) {
      parts.push('  <constraints>');
      for (const c of d.constraints) {
        parts.push(`    <constraint>${c}</constraint>`);
      }
      parts.push('  </constraints>');
    }

    if (d.evidence.length > 0) {
      parts.push('  <evidence>');
      for (const e of d.evidence) {
        parts.push(`    <example file="${e.filePath}" lines="${e.lineRange[0]}-${e.lineRange[1]}">`);
        parts.push(`      ${e.explanation}`);
        parts.push('    </example>');
      }
      parts.push('  </evidence>');
    }

    if (d.relatedDecisions.length > 0) {
      parts.push(`  <related_decisions>${d.relatedDecisions.join(', ')}</related_decisions>`);
    }

    if (d.tags.length > 0) {
      parts.push(`  <tags>${d.tags.join(', ')}</tags>`);
    }

    parts.push('</decision>');
    return parts.join('\n');
  });

  return (
    '<architectural_context>\n' +
    `The following ${activeDecisions.length} architectural decisions are ` +
    'established and enforced for this codebase:\n\n' +
    decisionBlocks.join('\n\n') +
    '\n</architectural_context>'
  );
}

/**
 * Build the diff summary section with high-level statistics.
 */
function buildDiffSummarySection(diffAnalysis: DiffAnalysis): string {
  const { summary } = diffAnalysis;
  const lines: string[] = [];

  lines.push('<diff_summary>');
  lines.push(`  Files changed: ${summary.totalFiles}`);
  lines.push(`  Additions: ${summary.totalAdditions} lines`);
  lines.push(`  Deletions: ${summary.totalDeletions} lines`);
  lines.push(`  New files: ${summary.newFileCount}`);
  lines.push(`  Modified files: ${summary.modifiedCount}`);
  lines.push(`  Deleted files: ${summary.deletedCount}`);

  if (summary.touchedDirectories.length > 0) {
    lines.push(`  Directories touched: ${summary.touchedDirectories.join(', ')}`);
  }

  if (summary.fileExtensions.length > 0) {
    lines.push(`  File types: ${summary.fileExtensions.join(', ')}`);
  }

  lines.push('</diff_summary>');
  return lines.join('\n');
}

/**
 * Build the change details section with actual code changes,
 * including surrounding context lines for better understanding.
 */
function buildChangeDetailsSection(contexts: ChangeContext[]): string {
  if (contexts.length === 0) {
    return '<changes>\nNo code changes to review.\n</changes>';
  }

  const lines: string[] = [];
  lines.push('<changes>');

  // Group contexts by file for coherent presentation
  const groupedByFile = new Map<string, ChangeContext[]>();
  for (const ctx of contexts) {
    const existing = groupedByFile.get(ctx.filePath) || [];
    existing.push(ctx);
    groupedByFile.set(ctx.filePath, existing);
  }

  for (const [filePath, fileContexts] of groupedByFile) {
    lines.push(`<file path="${filePath}" status="${fileContexts[0].status}">`);

    for (const ctx of fileContexts) {
      lines.push(`  <hunk lines="${ctx.lineStart}-${ctx.lineEnd}">`);

      // Include surrounding context lines for better understanding
      if (ctx.contextLines.length > 0) {
        lines.push('    <surrounding_context>');
        for (const line of ctx.contextLines) {
          lines.push(`      ${line}`);
        }
        lines.push('    </surrounding_context>');
      }

      // Show removed lines
      if (ctx.removedLines.length > 0) {
        lines.push('    <removed>');
        for (const line of ctx.removedLines) {
          lines.push(`    - ${line}`);
        }
        lines.push('    </removed>');
      }

      // Show added lines
      if (ctx.addedLines.length > 0) {
        lines.push('    <added>');
        for (const line of ctx.addedLines) {
          lines.push(`    + ${line}`);
        }
        lines.push('    </added>');
      }

      // Highlight new imports specifically -- these are often the most
      // architecturally significant changes
      if (ctx.newImports.length > 0) {
        lines.push('    <new_imports>');
        for (const imp of ctx.newImports) {
          lines.push(`      ${imp.trim()}`);
        }
        lines.push('    </new_imports>');
      }

      lines.push('  </hunk>');
    }

    lines.push('</file>');
  }

  lines.push('</changes>');
  return lines.join('\n');
}

/**
 * Build the task instruction section that tells the model exactly what to do.
 */
function buildTaskSection(decisions: ArchDecision[]): string {
  const activeDecisions = decisions.filter((d) => d.status !== 'deprecated');

  const lines: string[] = [];
  lines.push('<task>');
  lines.push(
    'Review the changes above against the architectural decisions and constraints.'
  );
  lines.push('');
  lines.push('For each violation you find:');
  lines.push(
    '1. Cite which specific decision it violates by including the decision ID in ' +
    'the "decisionId" field. Use null only for general best-practice concerns ' +
    'not covered by any listed decision.'
  );
  lines.push(
    '2. In the "reasoning" field, explain WHY it is a violation by referencing ' +
    'the specific constraint from that decision.'
  );
  lines.push(
    '3. In the "suggestion" field, provide a concrete fix that follows the ' +
    "project's actual patterns and conventions as shown in the architectural " +
    'evidence and surrounding code context.'
  );
  lines.push(
    '4. Use the surrounding context lines to understand the code structure ' +
    'and avoid false positives.'
  );

  if (activeDecisions.length > 0) {
    lines.push('');
    lines.push('Available decision IDs for citation:');
    for (const d of activeDecisions) {
      lines.push(`  - ${d.id}: ${d.title}`);
    }
  }

  lines.push('');
  lines.push(
    'Only report genuine architectural violations. Do not flag style issues, ' +
    'naming conventions, or minor code quality concerns unless they violate a ' +
    'specific architectural decision.'
  );
  lines.push('</task>');
  return lines.join('\n');
}

// ─── Context Prioritization ──────────────────────────────────────

/**
 * Prioritize change contexts to stay within token limits while
 * maximizing architectural signal.
 *
 * Priority order:
 * 1. New files (most likely to introduce architectural issues)
 * 2. Changes with new imports (dependency direction changes)
 * 3. Changes with both additions and removals (refactoring that may break patterns)
 * 4. Modified files with surrounding context (existing code changes)
 * 5. Remaining changes
 */
function prioritizeContexts(
  contexts: ChangeContext[],
  maxContexts: number
): ChangeContext[] {
  if (contexts.length <= maxContexts) {
    return contexts;
  }

  const scored = contexts.map((ctx) => {
    let score = 0;

    // New files get highest priority -- new architectural decisions happening
    if (ctx.status === 'added') score += 10;

    // Changes with imports are architecturally significant
    if (ctx.newImports.length > 0) score += 5;

    // Changes with both additions and removals suggest refactoring
    if (ctx.addedLines.length > 0 && ctx.removedLines.length > 0) score += 4;

    // Modifications to existing files
    if (ctx.status === 'modified') score += 3;

    // Surrounding context available -- better for analysis
    if (ctx.contextLines.length > 0) score += 2;

    // More added lines = more to review
    score += Math.min(ctx.addedLines.length, 5);

    return { ctx, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxContexts).map((s) => s.ctx);
}

// ─── Violation Transformation ─────────────────────────────────────

/**
 * Transform a validated raw LLM violation into a proper Violation object
 * with a generated ID and the `llm:` rule prefix.
 */
function transformViolation(raw: RawLlmViolation): Violation {
  // Validate line numbers are sensible
  const lineStart = raw.lineStart > 0 ? raw.lineStart : 1;
  const lineEnd = raw.lineEnd >= lineStart ? raw.lineEnd : lineStart;

  return {
    id: generateId(),
    rule: `llm:${raw.rule}`,
    severity: raw.severity as ViolationSeverity,
    message: raw.message,
    filePath: raw.filePath,
    lineStart,
    lineEnd,
    suggestion: raw.suggestion || undefined,
    decisionId: raw.decisionId || undefined,
  };
}
