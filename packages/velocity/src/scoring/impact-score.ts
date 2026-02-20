/**
 * Architectural impact scoring.
 * Scores changes by how many architectural boundaries they cross and
 * whether they touch core vs peripheral modules.
 * Normalized to a 0-100 scale.
 */

import { clamp } from '@snoutguard/core';
import type { ArchDecision, Violation } from '@snoutguard/core';
import type { DependencyGraph } from '@snoutguard/analyzer';
import type { GitMetrics, ImpactScore } from '../types.js';

// ─── Configuration ──────────────────────────────────────────────────

/**
 * Weight for boundary-crossing changes.
 * Changes that cross architectural boundaries are more impactful.
 */
const BOUNDARY_CROSSING_WEIGHT = 3.0;

/**
 * Weight for core module touches.
 * Core modules have more downstream impact than peripheral ones.
 */
const CORE_MODULE_WEIGHT = 2.0;

/**
 * Weight for peripheral module touches.
 * Peripheral modules have limited blast radius.
 */
const PERIPHERAL_MODULE_WEIGHT = 0.5;

/**
 * Threshold for coupling score to be considered a "core" module.
 * Modules with coupling above this threshold are core.
 */
const CORE_COUPLING_THRESHOLD = 0.3;

/**
 * Reference score for normalization to 0-100 scale.
 */
const NORMALIZATION_REFERENCE = 50;

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Calculate architectural impact scores for all developers.
 *
 * @param gitMetrics - Per-developer git metrics for the period
 * @param dependencyGraph - The repository's dependency graph
 * @param decisions - Current architectural decisions
 * @param violations - Violations introduced in the period (optional)
 * @returns Array of ImpactScore, one per developer, normalized 0-100
 */
export function calculateImpactScores(
  gitMetrics: GitMetrics[],
  dependencyGraph: DependencyGraph | null,
  decisions: ArchDecision[],
  violations: Violation[] = []
): ImpactScore[] {
  // Identify core modules from the dependency graph
  const coreModules = identifyCoreModules(dependencyGraph);

  // Map decision categories to architectural boundaries
  const boundaries = extractBoundaries(decisions);

  // Calculate per-developer impact
  const rawScores: ImpactScore[] = gitMetrics.map((metrics) => {
    const analysis = analyzeArchitecturalImpact(
      metrics,
      coreModules,
      boundaries,
      violations
    );

    return {
      developerId: metrics.developerId,
      boundariesCrossed: analysis.boundariesCrossed,
      coreModuleTouches: analysis.coreModuleTouches,
      peripheralModuleTouches: analysis.peripheralModuleTouches,
      normalizedScore: 0, // Set after normalization
    };
  });

  return normalizeImpactScores(rawScores);
}

/**
 * Calculate impact score for a single developer.
 *
 * @param metrics - Git metrics for the developer
 * @param dependencyGraph - The repository's dependency graph
 * @param decisions - Current architectural decisions
 * @param violations - Violations introduced by this developer (optional)
 * @returns ImpactScore for the developer
 */
export function calculateSingleImpactScore(
  metrics: GitMetrics,
  dependencyGraph: DependencyGraph | null,
  decisions: ArchDecision[],
  violations: Violation[] = []
): ImpactScore {
  const coreModules = identifyCoreModules(dependencyGraph);
  const boundaries = extractBoundaries(decisions);
  const analysis = analyzeArchitecturalImpact(
    metrics,
    coreModules,
    boundaries,
    violations
  );

  const rawScore =
    analysis.boundariesCrossed * BOUNDARY_CROSSING_WEIGHT +
    analysis.coreModuleTouches * CORE_MODULE_WEIGHT +
    analysis.peripheralModuleTouches * PERIPHERAL_MODULE_WEIGHT;

  const normalizedScore = clamp(
    Math.round((rawScore / NORMALIZATION_REFERENCE) * 50 * 100) / 100,
    0,
    100
  );

  return {
    developerId: metrics.developerId,
    boundariesCrossed: analysis.boundariesCrossed,
    coreModuleTouches: analysis.coreModuleTouches,
    peripheralModuleTouches: analysis.peripheralModuleTouches,
    normalizedScore,
  };
}

/**
 * Determine which files are "core" modules in the dependency graph.
 * Core modules are those with high coupling scores (many dependents).
 *
 * @param graph - The dependency graph
 * @returns Set of file paths that are core modules
 */
export function identifyCoreModules(
  graph: DependencyGraph | null
): Set<string> {
  const coreModules = new Set<string>();

  if (!graph) return coreModules;

  for (const [filePath, score] of graph.couplingScores) {
    if (score >= CORE_COUPLING_THRESHOLD) {
      coreModules.add(filePath);
    }
  }

  // Also include nodes with high fan-in (many dependents)
  for (const [filePath, node] of graph.nodes) {
    if (node.importedBy.length >= 5) {
      coreModules.add(filePath);
    }
  }

  return coreModules;
}

// ─── Internal Helpers ───────────────────────────────────────────────

/**
 * Extract architectural boundaries from decisions.
 * Each category of decision represents a boundary.
 * Returns a map of boundary name -> file patterns that belong to it.
 */
function extractBoundaries(
  decisions: ArchDecision[]
): Map<string, Set<string>> {
  const boundaries = new Map<string, Set<string>>();

  for (const decision of decisions) {
    const boundaryKey = `${decision.category}:${decision.title}`;

    if (!boundaries.has(boundaryKey)) {
      boundaries.set(boundaryKey, new Set<string>());
    }

    const files = boundaries.get(boundaryKey)!;

    // Add files referenced in evidence to this boundary
    for (const evidence of decision.evidence) {
      files.add(evidence.filePath);
    }
  }

  return boundaries;
}

/**
 * Analyze the architectural impact of a developer's changes.
 */
function analyzeArchitecturalImpact(
  metrics: GitMetrics,
  coreModules: Set<string>,
  boundaries: Map<string, Set<string>>,
  violations: Violation[]
): {
  boundariesCrossed: number;
  coreModuleTouches: number;
  peripheralModuleTouches: number;
} {
  // Extract the file types/paths this developer touched
  // Since GitMetrics has fileTypesTouched, we use that as a proxy
  const touchedExtensions = Object.keys(metrics.fileTypesTouched);

  // Count boundary crossings from violations
  // Each violation that references a decision boundary is a crossing
  const developerViolations = violations.filter(
    (v) => v.decisionId !== undefined
  );

  const boundariesCrossed = countBoundaryCrossings(
    touchedExtensions,
    boundaries,
    developerViolations
  );

  // Estimate core vs peripheral touches based on file types
  // Source code files (.ts, .js, .py, etc.) in core modules are "core touches"
  const coreExtensions = new Set(['.ts', '.js', '.py', '.go', '.rs', '.java']);
  const configExtensions = new Set([
    '.json',
    '.yml',
    '.yaml',
    '.toml',
    '.xml',
    '.env',
  ]);

  let coreModuleTouches = 0;
  let peripheralModuleTouches = 0;

  for (const [ext, count] of Object.entries(metrics.fileTypesTouched)) {
    if (coreExtensions.has(ext)) {
      // If we have a dependency graph indicating core modules,
      // weight these higher
      if (coreModules.size > 0) {
        // Estimate: roughly proportional to the ratio of core modules
        const coreRatio =
          coreModules.size > 0
            ? Math.min(coreModules.size / 20, 0.5)
            : 0.3;
        coreModuleTouches += Math.round(count * coreRatio);
        peripheralModuleTouches += Math.round(count * (1 - coreRatio));
      } else {
        // Without a graph, assume 30% of source touches are core
        coreModuleTouches += Math.round(count * 0.3);
        peripheralModuleTouches += Math.round(count * 0.7);
      }
    } else if (configExtensions.has(ext)) {
      // Config files are peripheral
      peripheralModuleTouches += count;
    } else {
      peripheralModuleTouches += count;
    }
  }

  return {
    boundariesCrossed,
    coreModuleTouches,
    peripheralModuleTouches,
  };
}

/**
 * Count how many architectural boundaries a set of changes crosses.
 */
function countBoundaryCrossings(
  touchedExtensions: string[],
  boundaries: Map<string, Set<string>>,
  violations: Violation[]
): number {
  let crossings = 0;

  // Each violation with a decision reference implies a boundary crossing
  const decisionIds = new Set(
    violations
      .filter((v) => v.decisionId)
      .map((v) => v.decisionId!)
  );
  crossings += decisionIds.size;

  // If a developer touches files in multiple boundaries, that's a crossing
  if (boundaries.size > 0 && touchedExtensions.length > 2) {
    // Having diverse file types touched (e.g., frontend and backend)
    // suggests boundary crossing
    const hasBackend = touchedExtensions.some((ext) =>
      ['.py', '.go', '.rs', '.java'].includes(ext)
    );
    const hasFrontend = touchedExtensions.some((ext) =>
      ['.tsx', '.jsx', '.vue', '.svelte'].includes(ext)
    );
    const hasConfig = touchedExtensions.some((ext) =>
      ['.yml', '.yaml', '.json', '.toml'].includes(ext)
    );

    if (hasBackend && hasFrontend) crossings++;
    if ((hasBackend || hasFrontend) && hasConfig) crossings++;
  }

  return crossings;
}

/**
 * Normalize impact scores to a 0-100 scale.
 */
function normalizeImpactScores(scores: ImpactScore[]): ImpactScore[] {
  if (scores.length === 0) return [];

  // Calculate raw impact scores
  const rawScores = scores.map((s) => ({
    score: s,
    raw:
      s.boundariesCrossed * BOUNDARY_CROSSING_WEIGHT +
      s.coreModuleTouches * CORE_MODULE_WEIGHT +
      s.peripheralModuleTouches * PERIPHERAL_MODULE_WEIGHT,
  }));

  const maxRaw = Math.max(...rawScores.map((r) => r.raw), 1);

  // Normalize relative to the reference point, capped at 100
  const scaleFactor = maxRaw > NORMALIZATION_REFERENCE
    ? 100 / maxRaw
    : 100 / NORMALIZATION_REFERENCE;

  for (const { score, raw } of rawScores) {
    score.normalizedScore = clamp(
      Math.round(raw * scaleFactor * 100) / 100,
      0,
      100
    );
  }

  return scores;
}
