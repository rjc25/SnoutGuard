/**
 * MCP Resources for detected patterns and dependency information.
 *
 * Exposes:
 *   archguard://patterns               - Detected patterns summary
 *   archguard://dependencies/{module}   - Dependency info for a module
 */

import type {
  ArchCategory,
  ArchDecision,
  DbClient,
  DependencyNode,
  Evidence,
} from '@archguard/core';
import { schema, parseJsonSafe } from '@archguard/core';

/**
 * Get the resource content for archguard://patterns
 * Summarizes detected architectural patterns from the decisions table.
 */
export async function getPatternsResource(db: DbClient): Promise<string> {
  const allDecisions = await db.select().from(schema.decisions);
  const allEvidence = await db.select().from(schema.evidence);

  if (allDecisions.length === 0) {
    return JSON.stringify({
      message: 'No patterns detected yet. Run `archguard analyze` to scan the codebase.',
      patterns: [],
    }, null, 2);
  }

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

  // Build patterns from detected decisions
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

  // Group by category
  const byCategory: Record<string, ArchDecision[]> = {};
  for (const decision of decisions) {
    if (!byCategory[decision.category]) {
      byCategory[decision.category] = [];
    }
    byCategory[decision.category].push(decision);
  }

  // Create a patterns summary
  const patterns = decisions.map((d) => ({
    name: d.title,
    confidence: d.confidence,
    category: d.category,
    status: d.status,
    description: d.description,
    evidenceFiles: d.evidence.map((e) => e.filePath),
    tags: d.tags,
  }));

  // Category summary
  const categorySummary = Object.entries(byCategory).map(([category, decs]) => ({
    category,
    count: decs.length,
    avgConfidence: decs.reduce((sum, d) => sum + d.confidence, 0) / decs.length,
    patterns: decs.map((d) => d.title),
  }));

  return JSON.stringify({
    totalPatterns: patterns.length,
    categorySummary,
    patterns,
  }, null, 2);
}

/**
 * Get the resource content for archguard://dependencies/{module}
 * Returns dependency information for a specific module/file.
 */
export async function getDependenciesResource(
  db: DbClient,
  module: string
): Promise<string> {
  const allDeps = await db.select().from(schema.dependencies);

  if (allDeps.length === 0) {
    return JSON.stringify({
      message: 'No dependency data available. Run `archguard analyze` to map dependencies.',
      module,
      dependencies: null,
    }, null, 2);
  }

  // Build an in-memory graph
  const nodes = new Map<string, DependencyNode>();
  const allFiles = new Set<string>();

  for (const dep of allDeps) {
    allFiles.add(dep.sourceFile);
    allFiles.add(dep.targetFile);
  }

  for (const filePath of allFiles) {
    nodes.set(filePath, {
      filePath,
      imports: [],
      importedBy: [],
    });
  }

  for (const dep of allDeps) {
    const sourceNode = nodes.get(dep.sourceFile);
    const targetNode = nodes.get(dep.targetFile);

    if (sourceNode && !sourceNode.imports.includes(dep.targetFile)) {
      sourceNode.imports.push(dep.targetFile);
    }
    if (targetNode && !targetNode.importedBy.includes(dep.sourceFile)) {
      targetNode.importedBy.push(dep.sourceFile);
    }
  }

  // Resolve the module to a file path
  const resolvedPath = resolveModulePath(module, nodes);

  if (!resolvedPath) {
    // Try to find files that partially match
    const partialMatches = Array.from(nodes.keys()).filter((fp) =>
      fp.toLowerCase().includes(module.toLowerCase())
    );

    return JSON.stringify({
      module,
      resolved: false,
      message: `Module "${module}" not found in the dependency graph.`,
      suggestions: partialMatches.slice(0, 10),
    }, null, 2);
  }

  const node = nodes.get(resolvedPath)!;

  // Calculate coupling info
  const fanIn = node.importedBy.length;
  const fanOut = node.imports.length;
  const totalModules = nodes.size;
  const couplingScore = totalModules > 0 ? Math.min((fanIn + fanOut) / totalModules, 1) : 0;

  return JSON.stringify({
    module,
    resolvedPath,
    imports: node.imports,
    importedBy: node.importedBy,
    metrics: {
      fanIn,
      fanOut,
      couplingScore: Math.round(couplingScore * 1000) / 1000,
      totalModulesInGraph: totalModules,
    },
  }, null, 2);
}

/**
 * Resolve a module name/path to a file path in the graph.
 */
function resolveModulePath(
  module: string,
  nodes: Map<string, DependencyNode>
): string | null {
  // Exact match
  if (nodes.has(module)) return module;

  // Case-insensitive exact match
  const moduleLower = module.toLowerCase();
  for (const filePath of nodes.keys()) {
    if (filePath.toLowerCase() === moduleLower) {
      return filePath;
    }
  }

  // Partial match - prefer the best match
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const filePath of nodes.keys()) {
    const filePathLower = filePath.toLowerCase();
    if (filePathLower.endsWith(moduleLower) || filePathLower.includes(moduleLower)) {
      const score = moduleLower.length / filePathLower.length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = filePath;
      }
    }
  }

  return bestMatch;
}
