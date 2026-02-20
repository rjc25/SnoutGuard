/**
 * JSON report generator for analysis results.
 */

import type { ArchDecision } from '@archguard/core';
import type { ScanResult } from '../scanner.js';
import type { DependencyGraph } from '../dependency-mapper.js';
import type { DriftResult } from '../drift-detector.js';

/** JSON report structure */
export interface JsonReport {
  generatedAt: string;
  scan: {
    totalFiles: number;
    totalLines: number;
    languageBreakdown: Record<string, number>;
  };
  decisions: ArchDecision[];
  dependencies: {
    totalModules: number;
    circularDeps: number;
    avgCoupling: number;
    couplingHotspots: Array<{ file: string; score: number }>;
  };
  drift?: {
    driftScore: number;
    events: Array<{
      type: string;
      description: string;
      severity: string;
    }>;
  };
}

/** Generate a JSON analysis report */
export function generateJsonReport(
  scanResult: ScanResult,
  decisions: ArchDecision[],
  graph: DependencyGraph,
  drift?: DriftResult
): JsonReport {
  const hotspots = Array.from(graph.couplingScores.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([file, score]) => ({ file, score }));

  return {
    generatedAt: new Date().toISOString(),
    scan: {
      totalFiles: scanResult.totalFiles,
      totalLines: scanResult.totalLines,
      languageBreakdown: scanResult.languageBreakdown,
    },
    decisions,
    dependencies: {
      totalModules: graph.totalModules,
      circularDeps: graph.circularDeps.length,
      avgCoupling: graph.avgCoupling,
      couplingHotspots: hotspots,
    },
    drift: drift
      ? {
          driftScore: drift.driftScore,
          events: drift.events.map((e) => ({
            type: e.type,
            description: e.description,
            severity: e.severity,
          })),
        }
      : undefined,
  };
}
