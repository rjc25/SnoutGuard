/**
 * Module dependency graph builder.
 * Builds a directed graph of import relationships and identifies
 * circular dependencies, coupling hotspots, and layer violations.
 */

import * as path from 'node:path';
import type {
  ParsedFile,
  Dependency,
  DependencyNode,
  CircularDependency,
} from '@archguard/core';
import { generateId, now } from '@archguard/core';

/** Full dependency graph for a repository */
export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: Dependency[];
  circularDeps: CircularDependency[];
  couplingScores: Map<string, number>;
  totalModules: number;
  avgCoupling: number;
}

/**
 * Build a dependency graph from parsed files.
 * Resolves relative imports and maps them to actual file paths.
 */
export function buildDependencyGraph(
  files: ParsedFile[],
  repoId: string
): DependencyGraph {
  const filesByPath = new Map(files.map((f) => [f.filePath, f]));
  const nodes = new Map<string, DependencyNode>();
  const edges: Dependency[] = [];

  // Initialize nodes
  for (const file of files) {
    nodes.set(file.filePath, {
      filePath: file.filePath,
      imports: [],
      importedBy: [],
    });
  }

  // Build edges from imports
  for (const file of files) {
    for (const imp of file.imports) {
      const resolvedPath = resolveImport(file.filePath, imp, filesByPath);
      if (resolvedPath && resolvedPath !== file.filePath) {
        const node = nodes.get(file.filePath);
        if (node && !node.imports.includes(resolvedPath)) {
          node.imports.push(resolvedPath);
        }

        const targetNode = nodes.get(resolvedPath);
        if (targetNode && !targetNode.importedBy.includes(file.filePath)) {
          targetNode.importedBy.push(file.filePath);
        }

        edges.push({
          id: generateId(),
          repoId,
          sourceFile: file.filePath,
          targetFile: resolvedPath,
          importType: detectImportType(imp),
          detectedAt: now(),
        });
      }
    }
  }

  // Find circular dependencies
  const circularDeps = detectCircularDependencies(nodes);

  // Calculate coupling scores
  const couplingScores = calculateCouplingScores(nodes);
  const avgCoupling =
    couplingScores.size > 0
      ? Array.from(couplingScores.values()).reduce((a, b) => a + b, 0) /
        couplingScores.size
      : 0;

  return {
    nodes,
    edges,
    circularDeps,
    couplingScores,
    totalModules: nodes.size,
    avgCoupling,
  };
}

/**
 * Resolve a relative import path to a file in the codebase.
 */
function resolveImport(
  fromFile: string,
  importPath: string,
  filesByPath: Map<string, ParsedFile>
): string | null {
  // Skip external packages
  if (
    !importPath.startsWith('.') &&
    !importPath.startsWith('/') &&
    !importPath.startsWith('@/')
  ) {
    return null;
  }

  const dir = path.dirname(fromFile);
  let resolved: string;

  if (importPath.startsWith('@/')) {
    // Alias import — resolve from project root
    resolved = importPath.replace('@/', 'src/');
  } else {
    resolved = path.normalize(path.join(dir, importPath));
  }

  // Try common extensions
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
  for (const ext of extensions) {
    const candidate = resolved + ext;
    if (filesByPath.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

/** Detect the type of import (named, default, namespace, side-effect) */
function detectImportType(importPath: string): string {
  if (importPath.endsWith('.css') || importPath.endsWith('.scss')) return 'style';
  if (importPath.endsWith('.json')) return 'data';
  return 'module';
}

/**
 * Detect circular dependencies using DFS with coloring.
 */
function detectCircularDependencies(
  nodes: Map<string, DependencyNode>
): CircularDependency[] {
  const WHITE = 0; // Not visited
  const GRAY = 1; // In current path
  const BLACK = 2; // Fully processed

  const colors = new Map<string, number>();
  const parent = new Map<string, string>();
  const cycles: CircularDependency[] = [];

  for (const key of nodes.keys()) {
    colors.set(key, WHITE);
  }

  function dfs(u: string): void {
    colors.set(u, GRAY);
    const node = nodes.get(u);
    if (!node) return;

    for (const v of node.imports) {
      if (!nodes.has(v)) continue;

      if (colors.get(v) === GRAY) {
        // Found a cycle — reconstruct it
        const cycle: string[] = [v];
        let current = u;
        while (current !== v) {
          cycle.push(current);
          current = parent.get(current) ?? v;
        }
        cycle.push(v);
        cycle.reverse();

        cycles.push({
          files: [...new Set(cycle)],
          cycle,
        });
      } else if (colors.get(v) === WHITE) {
        parent.set(v, u);
        dfs(v);
      }
    }

    colors.set(u, BLACK);
  }

  for (const key of nodes.keys()) {
    if (colors.get(key) === WHITE) {
      dfs(key);
    }
  }

  return cycles;
}

/**
 * Calculate coupling score for each module.
 * Score = (fan-in + fan-out) / totalModules, normalized 0-1.
 */
function calculateCouplingScores(
  nodes: Map<string, DependencyNode>
): Map<string, number> {
  const scores = new Map<string, number>();
  const total = nodes.size;
  if (total === 0) return scores;

  for (const [filePath, node] of nodes) {
    const fanIn = node.importedBy.length;
    const fanOut = node.imports.length;
    const score = (fanIn + fanOut) / total;
    scores.set(filePath, Math.min(score, 1));
  }

  return scores;
}

/**
 * Get the subgraph for a specific module at a given depth.
 */
export function getSubgraph(
  graph: DependencyGraph,
  target: string,
  depth: number
): DependencyNode[] {
  const visited = new Set<string>();
  const result: DependencyNode[] = [];

  function walk(filePath: string, currentDepth: number) {
    if (currentDepth > depth || visited.has(filePath)) return;
    visited.add(filePath);

    const node = graph.nodes.get(filePath);
    if (!node) return;
    result.push(node);

    for (const imp of node.imports) {
      walk(imp, currentDepth + 1);
    }
    for (const by of node.importedBy) {
      walk(by, currentDepth + 1);
    }
  }

  walk(target, 0);
  return result;
}
