/**
 * MCP Tool: get_dependency_graph
 * Returns the dependency subgraph for a module or file.
 * Uses the analyzer package to build and query the dependency graph.
 */

import type {
  DbClient,
  DependencyNode,
} from '@snoutguard/core';
import { schema } from '@snoutguard/core';

/** Input schema for get_dependency_graph tool */
export interface GetDependenciesInput {
  target: string;
  depth?: number;
}

/** JSON Schema for the tool input */
export const getDependenciesInputSchema = {
  type: 'object' as const,
  properties: {
    target: {
      type: 'string' as const,
      description:
        'The module or file path to get the dependency graph for. Can be a partial path match.',
    },
    depth: {
      type: 'number' as const,
      description:
        'Maximum depth of dependencies to traverse. Defaults to 2.',
      default: 2,
    },
  },
  required: ['target'] as const,
};

/** Result from the dependency graph query */
export interface DependencyGraphResult {
  target: string;
  resolvedTarget: string | null;
  depth: number;
  nodes: DependencyNode[];
  totalEdges: number;
  circularDependencies: string[][];
}

/**
 * Execute the get_dependency_graph tool.
 * Loads dependencies from the database and builds a subgraph
 * centered on the target module/file.
 */
export async function executeGetDependencies(
  db: DbClient,
  input: GetDependenciesInput
): Promise<DependencyGraphResult> {
  const { target, depth = 2 } = input;

  // Load all dependencies from the database
  const allDeps = await db.select().from(schema.dependencies);

  // Build an in-memory dependency graph
  const nodes = new Map<string, DependencyNode>();

  // Collect all unique file paths
  const allFiles = new Set<string>();
  for (const dep of allDeps) {
    allFiles.add(dep.sourceFile);
    allFiles.add(dep.targetFile);
  }

  // Initialize nodes
  for (const filePath of allFiles) {
    nodes.set(filePath, {
      filePath,
      imports: [],
      importedBy: [],
    });
  }

  // Build edges
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

  // Find the target node (supports partial path matching)
  const resolvedTarget = resolveTarget(target, nodes);

  if (!resolvedTarget) {
    return {
      target,
      resolvedTarget: null,
      depth,
      nodes: [],
      totalEdges: 0,
      circularDependencies: [],
    };
  }

  // Walk the graph to the specified depth
  const visited = new Set<string>();
  const subgraphNodes: DependencyNode[] = [];

  function walk(filePath: string, currentDepth: number): void {
    if (currentDepth > depth || visited.has(filePath)) return;
    visited.add(filePath);

    const node = nodes.get(filePath);
    if (!node) return;
    subgraphNodes.push(node);

    for (const imp of node.imports) {
      walk(imp, currentDepth + 1);
    }
    for (const by of node.importedBy) {
      walk(by, currentDepth + 1);
    }
  }

  walk(resolvedTarget, 0);

  // Count edges within the subgraph
  const subgraphFiles = new Set(subgraphNodes.map((n) => n.filePath));
  let totalEdges = 0;
  for (const node of subgraphNodes) {
    totalEdges += node.imports.filter((imp) => subgraphFiles.has(imp)).length;
  }

  // Detect circular dependencies within the subgraph
  const circularDependencies = detectCircularDepsInSubgraph(subgraphNodes, subgraphFiles);

  return {
    target,
    resolvedTarget,
    depth,
    nodes: subgraphNodes,
    totalEdges,
    circularDependencies,
  };
}

/**
 * Resolve a target string to an actual file path in the graph.
 * Supports exact match and partial path matching.
 */
function resolveTarget(
  target: string,
  nodes: Map<string, DependencyNode>
): string | null {
  // Exact match first
  if (nodes.has(target)) return target;

  // Partial match: find the best matching file path
  const targetLower = target.toLowerCase();
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const filePath of nodes.keys()) {
    const filePathLower = filePath.toLowerCase();

    if (filePathLower === targetLower) {
      return filePath;
    }

    if (filePathLower.endsWith(targetLower) || filePathLower.includes(targetLower)) {
      // Prefer shorter paths (more specific matches)
      const score = targetLower.length / filePathLower.length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = filePath;
      }
    }
  }

  return bestMatch;
}

/**
 * Detect circular dependencies within a subgraph using DFS.
 */
function detectCircularDepsInSubgraph(
  subgraphNodes: DependencyNode[],
  subgraphFiles: Set<string>
): string[][] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const nodeMap = new Map(subgraphNodes.map((n) => [n.filePath, n]));
  const colors = new Map<string, number>();
  const parent = new Map<string, string>();
  const cycles: string[][] = [];

  for (const filePath of subgraphFiles) {
    colors.set(filePath, WHITE);
  }

  function dfs(u: string): void {
    colors.set(u, GRAY);
    const node = nodeMap.get(u);
    if (!node) return;

    for (const v of node.imports) {
      if (!subgraphFiles.has(v)) continue;

      if (colors.get(v) === GRAY) {
        // Found a cycle
        const cycle: string[] = [v];
        let current = u;
        while (current !== v) {
          cycle.push(current);
          current = parent.get(current) ?? v;
        }
        cycle.push(v);
        cycle.reverse();
        cycles.push(cycle);
      } else if (colors.get(v) === WHITE) {
        parent.set(v, u);
        dfs(v);
      }
    }

    colors.set(u, BLACK);
  }

  for (const filePath of subgraphFiles) {
    if (colors.get(filePath) === WHITE) {
      dfs(filePath);
    }
  }

  return cycles;
}
