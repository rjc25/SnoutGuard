/**
 * MCP Tool: get_architectural_decisions
 * Retrieves architectural decisions filtered by query and optional category.
 * Searches across file paths, titles, tags, and descriptions.
 */

import { eq, like } from 'drizzle-orm';
import type {
  ArchCategory,
  ArchDecision,
  Evidence,
  DbClient,
} from '@snoutguard/core';
import { schema } from '@snoutguard/core';

/** Input schema for get_architectural_decisions tool */
export interface GetDecisionsInput {
  query: string;
  category?: ArchCategory;
}

/** JSON Schema for the tool input */
export const getDecisionsInputSchema = {
  type: 'object' as const,
  properties: {
    query: {
      type: 'string' as const,
      description:
        'Search query to filter decisions. Matches against file paths, titles, tags, and descriptions.',
    },
    category: {
      type: 'string' as const,
      enum: [
        'structural',
        'behavioral',
        'deployment',
        'data',
        'api',
        'testing',
        'security',
      ],
      description: 'Optional category to filter decisions by.',
    },
  },
  required: ['query'] as const,
};

/**
 * Execute the get_architectural_decisions tool.
 * Loads all decisions from the database and filters them by the query string,
 * matching against titles, descriptions, tags, and associated evidence file paths.
 */
export async function executeGetDecisions(
  db: DbClient,
  input: GetDecisionsInput
): Promise<ArchDecision[]> {
  const { query, category } = input;
  const queryLower = query.toLowerCase();

  // Fetch all decisions from the database
  const allDecisions = await db.select().from(schema.decisions);

  // Fetch all evidence for joining
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

  // Map DB rows to ArchDecision objects and filter
  const decisions: ArchDecision[] = allDecisions
    .map((row) => {
      const evidenceList = evidenceByDecision.get(row.id) ?? [];
      const constraints: string[] = parseJsonArray(row.constraints);
      const relatedDecisions: string[] = parseJsonArray(row.relatedDecisions);
      const tags: string[] = parseJsonArray(row.tags);

      return {
        id: row.id,
        title: row.title,
        description: row.description,
        category: row.category as ArchCategory,
        status: row.status as ArchDecision['status'],
        confidence: row.confidence,
        evidence: evidenceList,
        constraints,
        relatedDecisions,
        tags,
        detectedAt: row.detectedAt,
        confirmedBy: row.confirmedBy ?? undefined,
      } satisfies ArchDecision;
    })
    .filter((decision) => {
      // Filter by category if specified
      if (category && decision.category !== category) {
        return false;
      }

      // Match query against title, description, tags, and evidence file paths
      const titleMatch = decision.title.toLowerCase().includes(queryLower);
      const descMatch = decision.description.toLowerCase().includes(queryLower);
      const tagMatch = decision.tags.some((tag) =>
        tag.toLowerCase().includes(queryLower)
      );
      const evidenceMatch = decision.evidence.some((ev) =>
        ev.filePath.toLowerCase().includes(queryLower)
      );
      const constraintMatch = decision.constraints.some((c) =>
        c.toLowerCase().includes(queryLower)
      );

      return titleMatch || descMatch || tagMatch || evidenceMatch || constraintMatch;
    });

  return decisions;
}

/** Safely parse a JSON array string, returning empty array on failure */
function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
