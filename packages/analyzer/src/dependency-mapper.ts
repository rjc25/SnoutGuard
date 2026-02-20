/**
 * Module dependency graph builder.
 * Builds a directed graph of import relationships and identifies
 * circular dependencies, coupling hotspots, and layer violations.
 *
 * Supports:
 * - TypeScript path alias resolution via tsconfig.json
 * - Monorepo cross-package imports via pnpm-workspace.yaml
 * - Python relative imports (from . import X)
 * - Go module import paths
 * - Robert C. Martin coupling metrics (Ca, Ce, Instability, Abstractness, Distance)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ParsedFile,
  Dependency,
  DependencyNode,
  CircularDependency,
  CouplingMetrics,
} from '@snoutguard/core';
import { generateId, now } from '@snoutguard/core';

export type { CouplingMetrics } from '@snoutguard/core';

// ─── Public Interface ───────────────────────────────────────────────

/** Full dependency graph for a repository */
export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: Dependency[];
  circularDeps: CircularDependency[];
  couplingScores: Map<string, number>; // Keep backward compat - simple score
  couplingMetrics: Map<string, CouplingMetrics>; // Full Robert Martin metrics
  totalModules: number;
  avgCoupling: number;
  avgInstability: number;
  avgDistance: number;
}

// ─── Internal: tsconfig.json Resolution ─────────────────────────────

interface TsConfigPaths {
  baseUrl: string;
  paths: Record<string, string[]>;
}

/**
 * Attempt to read and parse tsconfig.json from projectDir.
 * Extracts compilerOptions.baseUrl and compilerOptions.paths.
 * Returns null if tsconfig.json does not exist or cannot be parsed.
 */
function loadTsConfigPaths(projectDir: string): TsConfigPaths | null {
  const tsconfigPath = path.join(projectDir, 'tsconfig.json');
  try {
    if (!fs.existsSync(tsconfigPath)) {
      return null;
    }
    const raw = fs.readFileSync(tsconfigPath, 'utf-8');
    // Strip single-line and multi-line comments for JSON.parse compatibility
    const stripped = raw
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const config = JSON.parse(stripped);
    const compilerOptions = config?.compilerOptions;
    if (!compilerOptions) {
      return null;
    }
    const baseUrl = compilerOptions.baseUrl ?? '.';
    const paths: Record<string, string[]> = compilerOptions.paths ?? {};
    if (Object.keys(paths).length === 0 && baseUrl === '.') {
      return null;
    }
    return { baseUrl, paths };
  } catch {
    return null;
  }
}

// ─── Internal: pnpm-workspace.yaml Resolution ──────────────────────

/**
 * Attempt to read pnpm-workspace.yaml and extract workspace package globs.
 * Returns a map of package name -> absolute directory path.
 */
function loadWorkspacePackages(
  projectDir: string,
  files: ParsedFile[]
): Map<string, string> {
  const packageMap = new Map<string, string>();
  const workspacePath = path.join(projectDir, 'pnpm-workspace.yaml');
  try {
    if (!fs.existsSync(workspacePath)) {
      return packageMap;
    }
    const raw = fs.readFileSync(workspacePath, 'utf-8');
    // Lightweight YAML parsing: extract lines under "packages:" list
    const packageGlobs: string[] = [];
    let inPackages = false;
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === 'packages:') {
        inPackages = true;
        continue;
      }
      if (inPackages) {
        if (trimmed.startsWith('- ')) {
          // Strip quotes and glob suffix
          let glob = trimmed.slice(2).trim();
          glob = glob.replace(/^['"]|['"]$/g, '');
          packageGlobs.push(glob);
        } else if (trimmed !== '' && !trimmed.startsWith('#')) {
          // Another top-level key — stop
          break;
        }
      }
    }

    // For each glob pattern, scan for package.json files in the parsed files
    // to build a name -> directory mapping.
    // We also scan the filesystem for package.json in matching directories.
    for (const glob of packageGlobs) {
      const basePattern = glob.replace(/\/\*$/, '').replace(/\*$/, '');
      const baseDir = path.resolve(projectDir, basePattern);
      try {
        if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
          continue;
        }
        const entries = fs.readdirSync(baseDir);
        for (const entry of entries) {
          const pkgJsonPath = path.join(baseDir, entry, 'package.json');
          try {
            if (fs.existsSync(pkgJsonPath)) {
              const pkgRaw = fs.readFileSync(pkgJsonPath, 'utf-8');
              const pkg = JSON.parse(pkgRaw);
              if (pkg.name) {
                packageMap.set(pkg.name, path.join(baseDir, entry));
              }
            }
          } catch {
            // Skip malformed package.json
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    }
  } catch {
    // pnpm-workspace.yaml not readable — not an error
  }
  return packageMap;
}

// ─── Internal: Import Resolution ────────────────────────────────────

/** Detect the type of import (style, data, or module) */
function detectImportType(importPath: string): string {
  if (importPath.endsWith('.css') || importPath.endsWith('.scss')) return 'style';
  if (importPath.endsWith('.json')) return 'data';
  return 'module';
}

/**
 * Try to match a file path against the known files map with common extensions.
 */
function tryResolveWithExtensions(
  resolved: string,
  filesByPath: Map<string, ParsedFile>
): string | null {
  const extensions = [
    '',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.py',
    '.go',
    '/index.ts',
    '/index.tsx',
    '/index.js',
    '/index.jsx',
  ];
  for (const ext of extensions) {
    const candidate = resolved + ext;
    if (filesByPath.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Resolve an import path from a TypeScript/JavaScript file using
 * tsconfig.json paths and baseUrl configuration.
 * Returns the resolved absolute-ish path or null if no match.
 */
function resolveTsConfigAlias(
  importPath: string,
  tsConfig: TsConfigPaths,
  projectDir: string,
  filesByPath: Map<string, ParsedFile>
): string | null {
  const absoluteBaseUrl = path.resolve(projectDir, tsConfig.baseUrl);

  // Check each path alias pattern
  for (const [pattern, mappings] of Object.entries(tsConfig.paths)) {
    // Convert tsconfig glob pattern to a prefix match
    // e.g., "@/*" -> "@/", "@app/*" -> "@app/"
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1); // "@/*" -> "@/"
      if (importPath.startsWith(prefix)) {
        const remainder = importPath.slice(prefix.length);
        for (const mapping of mappings) {
          // mapping is like "src/*" -> strip the trailing *
          const mappingBase = mapping.endsWith('/*')
            ? mapping.slice(0, -1)
            : mapping.endsWith('*')
              ? mapping.slice(0, -1)
              : mapping;
          const resolved = path.normalize(
            path.join(absoluteBaseUrl, mappingBase, remainder)
          );
          const match = tryResolveWithExtensions(resolved, filesByPath);
          if (match) return match;
        }
      }
    } else {
      // Exact alias match (no wildcard)
      if (importPath === pattern) {
        for (const mapping of mappings) {
          const resolved = path.normalize(
            path.join(absoluteBaseUrl, mapping)
          );
          const match = tryResolveWithExtensions(resolved, filesByPath);
          if (match) return match;
        }
      }
    }
  }

  // If baseUrl is set, try resolving from baseUrl directly
  // (tsconfig baseUrl makes all imports relative to that directory)
  if (tsConfig.baseUrl !== '.') {
    const resolved = path.normalize(path.join(absoluteBaseUrl, importPath));
    const match = tryResolveWithExtensions(resolved, filesByPath);
    if (match) return match;
  }

  return null;
}

/**
 * Resolve a Python relative import.
 * Handles "from . import X", "from .. import X", "from .module import X".
 */
function resolvePythonImport(
  fromFile: string,
  importPath: string,
  filesByPath: Map<string, ParsedFile>
): string | null {
  // Match Python relative import patterns: ". X", ".. X", ".module.sub"
  const relativeMatch = importPath.match(/^(\.+)(.*)$/);
  if (!relativeMatch) return null;

  const dots = relativeMatch[1];
  const remainder = relativeMatch[2].trim();

  // Number of parent directory levels: "." = 0 (current dir), ".." = 1, etc.
  const levels = dots.length - 1;
  let dir = path.dirname(fromFile);
  for (let i = 0; i < levels; i++) {
    dir = path.dirname(dir);
  }

  if (!remainder) {
    // "from . import X" -> look for __init__.py in current package dir
    const resolved = path.join(dir, '__init__.py');
    if (filesByPath.has(resolved)) return resolved;
    return null;
  }

  // Convert dotted module path to file path: "module.sub" -> "module/sub"
  const modulePath = remainder.replace(/\./g, '/');
  const candidates = [
    path.normalize(path.join(dir, modulePath + '.py')),
    path.normalize(path.join(dir, modulePath, '__init__.py')),
  ];
  for (const candidate of candidates) {
    if (filesByPath.has(candidate)) return candidate;
  }

  return null;
}

/**
 * Resolve a Go import path.
 * Go imports are like "github.com/org/repo/internal/pkg".
 * We attempt to find files matching the import suffix within the project.
 */
function resolveGoImport(
  importPath: string,
  projectDir: string,
  filesByPath: Map<string, ParsedFile>
): string | null {
  // Go imports often include the full module path; try to strip the module
  // prefix and find the package directory within the project.
  // First, try to read go.mod to find the module name
  const goModPath = path.join(projectDir, 'go.mod');
  let moduleName: string | null = null;
  try {
    if (fs.existsSync(goModPath)) {
      const goMod = fs.readFileSync(goModPath, 'utf-8');
      const moduleMatch = goMod.match(/^module\s+(\S+)/m);
      if (moduleMatch) {
        moduleName = moduleMatch[1];
      }
    }
  } catch {
    // go.mod not readable
  }

  if (moduleName && importPath.startsWith(moduleName + '/')) {
    const relativePkg = importPath.slice(moduleName.length + 1);
    // Go packages are directories; find any .go file in that directory
    const pkgDir = path.normalize(path.join(projectDir, relativePkg));
    for (const filePath of filesByPath.keys()) {
      if (filePath.startsWith(pkgDir + '/') || filePath.startsWith(pkgDir + path.sep)) {
        return filePath;
      }
    }
  }

  // Fallback: try matching the end of the import path against known files
  const segments = importPath.split('/');
  for (let i = 0; i < segments.length; i++) {
    const suffix = segments.slice(i).join('/');
    for (const filePath of filesByPath.keys()) {
      const dir = path.dirname(filePath);
      if (dir.endsWith(suffix) || dir.endsWith('/' + suffix)) {
        return filePath;
      }
    }
  }

  return null;
}

/**
 * Resolve a monorepo cross-package import using workspace package mappings.
 * e.g., "@snoutguard/core" -> packages/core/src/index.ts
 */
function resolveWorkspaceImport(
  importPath: string,
  workspacePackages: Map<string, string>,
  filesByPath: Map<string, ParsedFile>
): string | null {
  // Check exact package name match or scoped subpath
  for (const [pkgName, pkgDir] of workspacePackages) {
    if (importPath === pkgName || importPath.startsWith(pkgName + '/')) {
      const subpath = importPath === pkgName
        ? ''
        : importPath.slice(pkgName.length + 1);

      // Try to resolve from src/ directory (common convention)
      const srcDir = path.join(pkgDir, 'src');
      const basePaths = [srcDir, pkgDir];
      for (const base of basePaths) {
        const target = subpath ? path.join(base, subpath) : base;
        const match = tryResolveWithExtensions(
          path.normalize(target),
          filesByPath
        );
        if (match) return match;
        // Try index files in the base
        if (!subpath) {
          const indexMatch = tryResolveWithExtensions(
            path.join(base, 'index'),
            filesByPath
          );
          if (indexMatch) return indexMatch;
        }
      }
    }
  }
  return null;
}

/**
 * Resolve an import path to a file in the codebase.
 * Handles relative imports, TypeScript path aliases, Python relative imports,
 * Go module paths, and monorepo cross-package imports.
 */
function resolveImport(
  fromFile: string,
  importPath: string,
  filesByPath: Map<string, ParsedFile>,
  tsConfig: TsConfigPaths | null,
  projectDir: string,
  workspacePackages: Map<string, string>
): string | null {
  const sourceFile = filesByPath.get(fromFile);
  const lang = sourceFile?.language;

  // ── Python relative imports ───────────────────────────────────────
  if (lang === 'python' && importPath.startsWith('.')) {
    return resolvePythonImport(fromFile, importPath, filesByPath);
  }

  // ── Go module imports ─────────────────────────────────────────────
  if (lang === 'go' && importPath.includes('/') && !importPath.startsWith('.')) {
    return resolveGoImport(importPath, projectDir, filesByPath);
  }

  // ── Relative imports (./ or ../) ──────────────────────────────────
  if (importPath.startsWith('.') || importPath.startsWith('/')) {
    const dir = path.dirname(fromFile);
    const resolved = path.normalize(path.join(dir, importPath));
    return tryResolveWithExtensions(resolved, filesByPath);
  }

  // ── TypeScript path alias resolution (tsconfig.json) ──────────────
  if (tsConfig) {
    const aliasResult = resolveTsConfigAlias(
      importPath,
      tsConfig,
      projectDir,
      filesByPath
    );
    if (aliasResult) return aliasResult;
  }

  // ── Monorepo workspace package resolution ─────────────────────────
  if (workspacePackages.size > 0) {
    const wsResult = resolveWorkspaceImport(
      importPath,
      workspacePackages,
      filesByPath
    );
    if (wsResult) return wsResult;
  }

  // ── Fallback: @/ alias -> src/ (legacy behavior when no tsconfig) ─
  if (!tsConfig && importPath.startsWith('@/')) {
    const resolved = importPath.replace('@/', 'src/');
    return tryResolveWithExtensions(resolved, filesByPath);
  }

  // External package — not resolvable within the project
  return null;
}

// ─── Circular Dependency Detection ──────────────────────────────────

/**
 * Detect circular dependencies using DFS with coloring.
 * WHITE = not visited, GRAY = in current path, BLACK = fully processed.
 */
function detectCircularDependencies(
  nodes: Map<string, DependencyNode>
): CircularDependency[] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

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

// ─── Robert C. Martin Coupling Metrics ──────────────────────────────

/**
 * Calculate backward-compatible simple coupling score.
 * Score = (fan-in + fan-out) / totalModules, clamped to [0, 1].
 */
function calculateSimpleCouplingScores(
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
 * Calculate Robert C. Martin coupling metrics for every module.
 *
 * - Afferent coupling (Ca): number of modules that depend on this module
 * - Efferent coupling (Ce): number of modules this module depends on
 * - Instability (I): Ce / (Ca + Ce).  0 = maximally stable, 1 = maximally unstable
 * - Abstractness (A): ratio of abstract types (interfaces + abstract classes)
 *   to total declared types (interfaces + abstract classes + concrete classes + type aliases)
 * - Distance from main sequence (D): |A + I - 1|.  0 = ideal balance
 */
function calculateCouplingMetrics(
  nodes: Map<string, DependencyNode>,
  filesByPath: Map<string, ParsedFile>
): Map<string, CouplingMetrics> {
  const metrics = new Map<string, CouplingMetrics>();

  for (const [filePath, node] of nodes) {
    const ca = node.importedBy.length; // afferent
    const ce = node.imports.length;    // efferent
    const instability = ca + ce > 0 ? ce / (ca + ce) : 0;

    // Compute abstractness from the parsed file metadata
    const parsed = filesByPath.get(filePath);
    let abstractness = 0;
    if (parsed) {
      const abstractCount =
        (parsed.interfaces?.length ?? 0) +
        (parsed.abstractClasses?.length ?? 0);
      const concreteCount =
        (parsed.classes?.length ?? 0) +
        (parsed.typeAliases?.length ?? 0);
      // Total types = abstract + concrete (classes already excludes abstract
      // if the parser separates them; if not, abstractClasses is a subset).
      // We treat them as disjoint sets as specified by the ParsedFile contract.
      const totalTypes = abstractCount + concreteCount;
      abstractness = totalTypes > 0 ? abstractCount / totalTypes : 0;
    }

    const distance = Math.abs(abstractness + instability - 1);

    metrics.set(filePath, {
      afferentCoupling: ca,
      efferentCoupling: ce,
      instability: Math.round(instability * 1000) / 1000,
      abstractness: Math.round(abstractness * 1000) / 1000,
      distanceFromMainSequence: Math.round(distance * 1000) / 1000,
    });
  }

  return metrics;
}

// ─── Main Entry Point ───────────────────────────────────────────────

/**
 * Build a dependency graph from parsed files.
 * Resolves relative imports, TypeScript aliases, Python relative imports,
 * Go module paths, and monorepo cross-package imports.
 * Computes both simple coupling scores and full Robert C. Martin metrics.
 */
export function buildDependencyGraph(
  files: ParsedFile[],
  repoId: string,
  projectDir?: string
): DependencyGraph {
  const effectiveProjectDir = projectDir ?? process.cwd();
  const filesByPath = new Map(files.map((f) => [f.filePath, f]));
  const nodes = new Map<string, DependencyNode>();
  const edges: Dependency[] = [];

  // Load tsconfig.json path mappings (TypeScript projects)
  const tsConfig = loadTsConfigPaths(effectiveProjectDir);

  // Load monorepo workspace packages (pnpm)
  const workspacePackages = loadWorkspacePackages(effectiveProjectDir, files);

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
      const resolvedPath = resolveImport(
        file.filePath,
        imp,
        filesByPath,
        tsConfig,
        effectiveProjectDir,
        workspacePackages
      );
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

  // Find circular dependencies (DFS-based)
  const circularDeps = detectCircularDependencies(nodes);

  // Calculate backward-compatible simple coupling scores
  const couplingScores = calculateSimpleCouplingScores(nodes);
  const avgCoupling =
    couplingScores.size > 0
      ? Array.from(couplingScores.values()).reduce((a, b) => a + b, 0) /
        couplingScores.size
      : 0;

  // Calculate full Robert C. Martin coupling metrics
  const couplingMetrics = calculateCouplingMetrics(nodes, filesByPath);

  const avgInstability =
    couplingMetrics.size > 0
      ? Array.from(couplingMetrics.values()).reduce(
          (sum, m) => sum + m.instability,
          0
        ) / couplingMetrics.size
      : 0;

  const avgDistance =
    couplingMetrics.size > 0
      ? Array.from(couplingMetrics.values()).reduce(
          (sum, m) => sum + m.distanceFromMainSequence,
          0
        ) / couplingMetrics.size
      : 0;

  return {
    nodes,
    edges,
    circularDeps,
    couplingScores,
    couplingMetrics,
    totalModules: nodes.size,
    avgCoupling,
    avgInstability: Math.round(avgInstability * 1000) / 1000,
    avgDistance: Math.round(avgDistance * 1000) / 1000,
  };
}

// ─── Subgraph Extraction ────────────────────────────────────────────

/**
 * Get the subgraph for a specific module at a given depth.
 * Walks both imports and importedBy edges up to `depth` hops.
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
