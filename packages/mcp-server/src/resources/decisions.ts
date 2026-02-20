/**
 * MCP Resources for architectural decisions and constraints.
 *
 * Exposes:
 *   archguard://decisions       - Full list of all architectural decisions
 *   archguard://decisions/{id}  - Individual decision by ID
 *   archguard://constraints     - All constraints across all decisions
 */

import type {
  ArchCategory,
  ArchDecision,
  DbClient,
  Evidence,
} from '@archguard/core';
import { schema, parseJsonSafe } from '@archguard/core';

/**
 * Load all decisions from the database and return them as ArchDecision objects.
 */
export async function loadAllDecisions(db: DbClient): Promise<ArchDecision[]> {
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

  return allDecisions.map((row) => ({
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
}

/**
 * Load a single decision by ID.
 */
export async function loadDecisionById(
  db: DbClient,
  id: string
): Promise<ArchDecision | null> {
  const decisions = await loadAllDecisions(db);
  return decisions.find((d) => d.id === id) ?? null;
}

/**
 * Load all constraints from all decisions, grouped by decision.
 */
export async function loadAllConstraints(
  db: DbClient
): Promise<Array<{ decisionId: string; decisionTitle: string; constraint: string }>> {
  const allDecisions = await db.select().from(schema.decisions);

  const constraints: Array<{
    decisionId: string;
    decisionTitle: string;
    constraint: string;
  }> = [];

  for (const row of allDecisions) {
    const parsed = parseJsonSafe<string[]>(row.constraints ?? '[]', []);
    for (const constraint of parsed) {
      constraints.push({
        decisionId: row.id,
        decisionTitle: row.title,
        constraint,
      });
    }
  }

  return constraints;
}

/**
 * Get the resource content for archguard://decisions
 */
export async function getDecisionsResource(db: DbClient): Promise<string> {
  const decisions = await loadAllDecisions(db);

  if (decisions.length === 0) {
    return JSON.stringify({
      message: 'No architectural decisions found. Run `archguard analyze` to detect decisions.',
      decisions: [],
    }, null, 2);
  }

  return JSON.stringify({
    totalDecisions: decisions.length,
    decisions: decisions.map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      category: d.category,
      status: d.status,
      confidence: d.confidence,
      tags: d.tags,
      constraints: d.constraints,
      evidenceCount: d.evidence.length,
      detectedAt: d.detectedAt,
    })),
  }, null, 2);
}

/**
 * Get the resource content for archguard://decisions/{id}
 */
export async function getDecisionByIdResource(
  db: DbClient,
  id: string
): Promise<string> {
  const decision = await loadDecisionById(db, id);

  if (!decision) {
    return JSON.stringify({
      error: `Decision with ID "${id}" not found.`,
    }, null, 2);
  }

  return JSON.stringify(decision, null, 2);
}

/**
 * Get the resource content for archguard://constraints
 */
export async function getConstraintsResource(db: DbClient): Promise<string> {
  const constraints = await loadAllConstraints(db);

  if (constraints.length === 0) {
    return JSON.stringify({
      message: 'No architectural constraints found. Run `archguard analyze` to detect decisions with constraints.',
      constraints: [],
    }, null, 2);
  }

  // Group by decision
  const grouped: Record<string, { title: string; constraints: string[] }> = {};
  for (const c of constraints) {
    if (!grouped[c.decisionId]) {
      grouped[c.decisionId] = { title: c.decisionTitle, constraints: [] };
    }
    grouped[c.decisionId].constraints.push(c.constraint);
  }

  return JSON.stringify({
    totalConstraints: constraints.length,
    byDecision: Object.entries(grouped).map(([id, data]) => ({
      decisionId: id,
      decisionTitle: data.title,
      constraints: data.constraints,
    })),
  }, null, 2);
}
