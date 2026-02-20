/**
 * MCP Tool: get_architectural_guidance
 * Returns architectural guidance with relevant decisions, constraints, and examples.
 * Helps AI coding agents understand the project's architectural conventions.
 */

import type {
  ArchCategory,
  ArchDecision,
  ArchitecturalGuidance,
  DbClient,
  Evidence,
} from '@snoutguard/core';
import { schema, parseJsonSafe } from '@snoutguard/core';

/** Input schema for get_architectural_guidance tool */
export interface SuggestApproachInput {
  task: string;
  constraints?: string[];
}

/** JSON Schema for the tool input */
export const suggestApproachInputSchema = {
  type: 'object' as const,
  properties: {
    task: {
      type: 'string' as const,
      description:
        'Description of the task or feature being implemented. Used to find relevant architectural decisions and guidance.',
    },
    constraints: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description:
        'Optional additional constraints to consider when generating guidance.',
    },
  },
  required: ['task'] as const,
};

/**
 * Execute the get_architectural_guidance tool.
 * Analyzes the task description against known architectural decisions
 * and returns relevant guidance, constraints, and examples.
 */
export async function executeSuggestApproach(
  db: DbClient,
  input: SuggestApproachInput
): Promise<ArchitecturalGuidance> {
  const { task, constraints: additionalConstraints } = input;
  const taskLower = task.toLowerCase();

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

  // Find decisions relevant to the task
  const relevantDecisions = findRelevantDecisionsForTask(decisions, taskLower);

  // Collect all constraints from relevant decisions
  const allConstraints: string[] = [];
  for (const decision of relevantDecisions) {
    allConstraints.push(...decision.constraints);
  }
  if (additionalConstraints) {
    allConstraints.push(...additionalConstraints);
  }

  // Collect examples from evidence
  const examples = collectExamples(relevantDecisions);

  // Generate approach summary
  const approach = generateApproach(task, relevantDecisions, allConstraints);

  return {
    approach,
    relevantDecisions,
    constraints: [...new Set(allConstraints)],
    examples,
  };
}

/**
 * Find decisions relevant to a task description.
 * Uses keyword matching across decision titles, descriptions, tags, and categories.
 */
function findRelevantDecisionsForTask(
  decisions: ArchDecision[],
  taskLower: string
): ArchDecision[] {
  // Extract keywords from the task
  const keywords = extractKeywords(taskLower);

  // Score each decision by relevance
  const scored = decisions
    .filter((d) => d.status !== 'deprecated')
    .map((decision) => {
      let score = 0;
      const titleLower = decision.title.toLowerCase();
      const descLower = decision.description.toLowerCase();
      const tagsLower = decision.tags.map((t) => t.toLowerCase());

      // Direct title match
      if (taskLower.includes(titleLower) || titleLower.includes(taskLower)) {
        score += 10;
      }

      // Keyword matches
      for (const keyword of keywords) {
        if (titleLower.includes(keyword)) score += 5;
        if (descLower.includes(keyword)) score += 3;
        if (tagsLower.some((t) => t.includes(keyword))) score += 4;
        if (decision.constraints.some((c) => c.toLowerCase().includes(keyword)))
          score += 2;
      }

      // Category relevance
      score += getCategoryRelevance(decision.category, taskLower);

      // Weight by confidence
      score *= decision.confidence;

      return { decision, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  // Return top relevant decisions (up to 10)
  return scored.slice(0, 10).map(({ decision }) => decision);
}

/**
 * Extract meaningful keywords from a task description.
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'can', 'shall',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'between', 'and', 'but', 'or', 'nor', 'not', 'so',
    'yet', 'both', 'either', 'neither', 'each', 'every', 'all',
    'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because',
    'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our',
    'you', 'your', 'it', 'its', 'they', 'them', 'their', 'what',
    'which', 'who', 'whom', 'how', 'when', 'where', 'why', 'need',
    'want', 'add', 'create', 'make', 'build', 'implement', 'write',
    'new', 'use', 'using',
  ]);

  return text
    .split(/[\s,.\-_/()]+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

/**
 * Get category relevance score for a task.
 */
function getCategoryRelevance(category: ArchCategory, taskLower: string): number {
  const categoryKeywords: Record<ArchCategory, string[]> = {
    structural: ['structure', 'architecture', 'layer', 'module', 'package', 'organization', 'directory'],
    behavioral: ['event', 'state', 'middleware', 'handler', 'callback', 'observer', 'pattern'],
    deployment: ['deploy', 'docker', 'ci', 'cd', 'pipeline', 'container', 'kubernetes'],
    data: ['database', 'model', 'schema', 'migration', 'query', 'repository', 'storage', 'data'],
    api: ['api', 'endpoint', 'route', 'rest', 'graphql', 'grpc', 'http', 'request', 'response'],
    testing: ['test', 'spec', 'mock', 'stub', 'fixture', 'e2e', 'integration', 'unit'],
    security: ['auth', 'security', 'permission', 'role', 'token', 'encrypt', 'password', 'access'],
  };

  const keywords = categoryKeywords[category] ?? [];
  let score = 0;
  for (const keyword of keywords) {
    if (taskLower.includes(keyword)) {
      score += 2;
    }
  }
  return score;
}

/**
 * Collect code examples from evidence of relevant decisions.
 */
function collectExamples(decisions: ArchDecision[]): string[] {
  const examples: string[] = [];

  for (const decision of decisions) {
    for (const ev of decision.evidence) {
      if (ev.snippet && ev.snippet.length > 10 && !ev.snippet.startsWith('//')) {
        examples.push(
          `// From ${ev.filePath} (${decision.title}):\n${ev.snippet}`
        );
      }
    }
  }

  // Limit to top 5 examples
  return examples.slice(0, 5);
}

/**
 * Generate an approach summary based on the task and relevant decisions.
 */
function generateApproach(
  task: string,
  relevantDecisions: ArchDecision[],
  constraints: string[]
): string {
  const parts: string[] = [];

  parts.push(`## Architectural Guidance for: ${task}\n`);

  if (relevantDecisions.length === 0) {
    parts.push(
      'No existing architectural decisions were found that directly relate to this task. ' +
      'Consider documenting the architectural approach you choose as a new decision.\n'
    );
  } else {
    parts.push(
      `Found ${relevantDecisions.length} relevant architectural decision(s):\n`
    );

    for (const decision of relevantDecisions) {
      parts.push(`### ${decision.title}`);
      parts.push(`- **Category**: ${decision.category}`);
      parts.push(`- **Confidence**: ${(decision.confidence * 100).toFixed(0)}%`);
      parts.push(`- **Description**: ${decision.description}`);
      if (decision.constraints.length > 0) {
        parts.push(`- **Constraints**:`);
        for (const c of decision.constraints) {
          parts.push(`  - ${c}`);
        }
      }
      parts.push('');
    }
  }

  if (constraints.length > 0) {
    parts.push('### Constraints to Follow');
    for (const constraint of [...new Set(constraints)]) {
      parts.push(`- ${constraint}`);
    }
    parts.push('');
  }

  parts.push('### Recommendations');
  parts.push(
    '- Follow the existing patterns and conventions found in the codebase.'
  );
  parts.push(
    '- Ensure new code adheres to the constraints listed above.'
  );
  if (relevantDecisions.some((d) => d.category === 'structural')) {
    parts.push(
      '- Place new files in the appropriate architectural layer/directory.'
    );
  }
  if (relevantDecisions.some((d) => d.category === 'testing')) {
    parts.push(
      '- Include tests following the project\'s established testing patterns.'
    );
  }

  return parts.join('\n');
}
