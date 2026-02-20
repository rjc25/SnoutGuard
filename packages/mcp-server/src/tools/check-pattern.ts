/**
 * MCP Tool: check_architectural_compliance
 * Checks code against architectural decisions and constraints using LLM-powered
 * semantic analysis via Claude Sonnet for fast, accurate compliance checking.
 */

import { z } from 'zod';
import type {
  ArchCategory,
  ArchDecision,
  ComplianceResult,
  CustomRule,
  DbClient,
  Evidence,
  Violation,
  ViolationSeverity,
  SnoutGuardConfig,
} from '@snoutguard/core';
import {
  generateId,
  schema,
  parseJsonSafe,
  createLlmClient,
  analyzeWithLlmValidated,
} from '@snoutguard/core';

/** Input schema for check_architectural_compliance tool */
export interface CheckPatternInput {
  code: string;
  filePath: string;
  intent?: string;
}

/** JSON Schema for the tool input */
export const checkPatternInputSchema = {
  type: 'object' as const,
  properties: {
    code: {
      type: 'string' as const,
      description: 'The code to check for architectural compliance.',
    },
    filePath: {
      type: 'string' as const,
      description: 'The file path of the code being checked.',
    },
    intent: {
      type: 'string' as const,
      description:
        'Optional description of what the code is intended to do. Helps provide more relevant compliance checks.',
    },
  },
  required: ['code', 'filePath'] as const,
};

// ─── LLM Response Schema ───────────────────────────────────────────

const llmViolationSchema = z.object({
  constraintViolated: z.string(),
  decisionTitle: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  explanation: z.string(),
  lineStart: z.number().optional(),
  lineEnd: z.number().optional(),
  suggestion: z.string().optional(),
});

const complianceAnalysisSchema = z.object({
  compliant: z.boolean(),
  violations: z.array(llmViolationSchema),
  reasoning: z.string(),
});

type ComplianceAnalysis = z.infer<typeof complianceAnalysisSchema>;

// ─── System Prompt ─────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert software architect analyzing code for compliance with architectural decisions and constraints.

Your job is to semantically analyze whether the provided code violates any of the architectural constraints from the project's documented decisions.

<important_rules>
1. Use semantic understanding — don't just pattern match. Understand what the code DOES, not just what it contains.
2. Only flag real violations. If the code complies with the intent of the constraint (even if it looks suspicious), it's compliant.
3. Explain your reasoning clearly — WHY is this a violation or WHY is it compliant?
4. Consider the file path and intent when determining relevance.
5. Be specific about which constraint was violated and from which decision.
</important_rules>

You must respond with ONLY valid JSON matching this schema:

{
  "compliant": true/false,
  "violations": [
    {
      "constraintViolated": "The exact constraint text that was violated",
      "decisionTitle": "Title of the decision this constraint came from",
      "severity": "error|warning|info",
      "explanation": "Clear explanation of WHY this code violates the constraint",
      "lineStart": 1,
      "lineEnd": 10,
      "suggestion": "How to fix this violation"
    }
  ],
  "reasoning": "Your step-by-step thinking about whether the code complies with the constraints"
}

If the code is compliant with all constraints, return compliant: true and an empty violations array.`;

/**
 * Execute the check_architectural_compliance tool.
 * Loads all decisions from the database, then uses Claude Sonnet to
 * semantically check the code against constraints.
 */
export async function executeCheckPattern(
  db: DbClient,
  input: CheckPatternInput,
  config: SnoutGuardConfig
): Promise<ComplianceResult> {
  const { code, filePath, intent } = input;

  // Load all decisions from the database
  const allDecisions = await db.select().from(schema.decisions);
  const allEvidence = await db.select().from(schema.evidence);

  // Group evidence by decision ID
  const evidenceByDecision = new Map<string, Evidence[]>();
  for (const ev of allEvidence) {
    const list = evidenceByDecision.get(ev.decisionId) ?? [];
    list.push({
      filePath: ev.filePath,
      lineRange: [ev.lineStart, ev.lineEnd] as [number, number],
      snippet: ev.snippet,
      explanation: ev.explanation,
    });
    evidenceByDecision.set(ev.decisionId, list);
  }

  // Map DB rows to ArchDecision objects
  const decisions: ArchDecision[] = allDecisions.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as ArchCategory,
    status: row.status as ArchDecision['status'],
    confidence: row.confidence,
    evidence: evidenceByDecision.get(row.id) ?? [],
    constraints: parseJsonSafe<string[]>(row.constraints ?? '[]', []),
    relatedDecisions: parseJsonSafe<string[]>(row.relatedDecisions ?? '[]', []),
    tags: parseJsonSafe<string[]>(row.tags ?? '[]', []),
    detectedAt: row.detectedAt,
    confirmedBy: row.confirmedBy ?? undefined,
  }));

  // Send all non-deprecated decisions to the LLM and let it determine relevance.
  // At small-to-medium decision counts (<100) this is simpler and more accurate
  // than pre-filtering, which can miss cross-cutting violations.
  const activeDecisions = decisions.filter((d) => d.status !== 'deprecated');

  if (activeDecisions.length === 0) {
    return {
      compliant: true,
      violations: [],
      suggestions: ['No architectural decisions found. Run `snoutguard analyze` first.'],
    };
  }

  const relevantDecisions = activeDecisions;

  // Build the prompt for LLM analysis
  const userPrompt = buildCompliancePrompt(
    code,
    filePath,
    intent,
    relevantDecisions
  );

  // Call Claude Sonnet for semantic analysis (review model = Sonnet, fast/cheap)
  const client = createLlmClient(config);
  const analysis = await analyzeWithLlmValidated<ComplianceAnalysis>(
    client,
    config,
    {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.2, // Lower temperature for more consistent compliance checking
    },
    complianceAnalysisSchema,
    'review' // Use review operation → Sonnet model (fast + cheap for per-query checks)
  );

  // Convert LLM violations to our Violation format
  const violations: Violation[] = analysis.violations.map((v) => ({
    id: generateId(),
    rule: `${v.decisionTitle}: ${v.constraintViolated}`,
    severity: v.severity,
    message: v.explanation,
    filePath,
    lineStart: v.lineStart ?? 1,
    lineEnd: v.lineEnd ?? code.split('\n').length,
    suggestion: v.suggestion,
    decisionId: relevantDecisions.find(d => d.title === v.decisionTitle)?.id,
  }));

  // Generate helpful suggestions
  const suggestions: string[] = [];
  for (const decision of relevantDecisions) {
    if (decision.constraints.length > 0 && !violations.some(v => v.decisionId === decision.id)) {
      suggestions.push(
        `[${decision.title}] Following constraints: ${decision.constraints.join('; ')}`
      );
    }
  }

  return {
    compliant: analysis.compliant,
    violations,
    suggestions,
  };
}

// ─── Prompt Building ───────────────────────────────────────────────

function buildCompliancePrompt(
  code: string,
  filePath: string,
  intent: string | undefined,
  decisions: ArchDecision[]
): string {
  const sections: string[] = [];

  sections.push(`<code_to_check>
File: ${filePath}
${intent ? `Intent: ${intent}\n` : ''}
\`\`\`
${code}
\`\`\`
</code_to_check>`);

  sections.push(`<architectural_decisions>
The following architectural decisions have been documented for this codebase.
Check if the code above violates any of their constraints.
`);

  for (const decision of decisions) {
    sections.push(`
<decision>
  <title>${decision.title}</title>
  <category>${decision.category}</category>
  <description>${decision.description}</description>
  <constraints>
${decision.constraints.map(c => `    - ${c}`).join('\n')}
  </constraints>
  <confidence>${(decision.confidence * 100).toFixed(0)}%</confidence>
</decision>`);
  }

  sections.push('</architectural_decisions>');

  sections.push(`<task>
Analyze the code and determine if it violates any of the constraints listed above.

For each constraint:
1. Understand what the constraint requires
2. Semantically analyze the code to see if it violates that requirement
3. If it violates, explain clearly WHY and HOW to fix it

Examples of violations to catch:
- Code using sqlite3 directly when the architecture says "All data must flow through Supabase"
- Controllers accessing database directly when they should use repositories
- Domain layer importing infrastructure code when dependencies should point inward
- Hardcoded secrets when the architecture requires environment variables

Return your analysis as JSON matching the schema in the system prompt.
</task>`);

  return sections.join('\n\n');
}

// NOTE: Previously used a scoring-based findRelevantDecisions() filter here,
// but it was too aggressive and missed cross-cutting violations. At current
// scale (<100 decisions), sending all decisions to the LLM is simpler and
// more accurate. Re-introduce filtering if decision count grows large enough
// to cause token/latency issues.
