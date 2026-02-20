/**
 * JSON report generator for analysis results.
 * Includes layer violations and Robert C. Martin coupling metrics.
 */

import type { ArchDecision, LayerViolation, CouplingMetrics } from '@archguard/core';
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
    avgInstability: number;
    avgDistance: number;
    couplingHotspots: Array<{ file: string; score: number }>;
    moduleMetrics: Array<{
      file: string;
      metrics: CouplingMetrics;
    }>;
  };
  layerViolations: Array<{
    sourceFile: string;
    targetFile: string;
    sourceLayer: string;
    targetLayer: string;
    message: string;
  }>;
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
  drift?: DriftResult,
  layerViolations?: LayerViolation[]
): JsonReport {
  const hotspots = Array.from(graph.couplingScores.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([file, score]) => ({ file, score }));

  const moduleMetrics = Array.from(graph.couplingMetrics.entries())
    .sort(([, a], [, b]) => b.distanceFromMainSequence - a.distanceFromMainSequence)
    .map(([file, metrics]) => ({ file, metrics }));

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
      avgInstability: graph.avgInstability,
      avgDistance: graph.avgDistance,
      couplingHotspots: hotspots,
      moduleMetrics,
    },
    layerViolations: (layerViolations ?? []).map((v) => ({
      sourceFile: v.sourceFile,
      targetFile: v.targetFile,
      sourceLayer: v.sourceLayer,
      targetLayer: v.targetLayer,
      message: v.message,
    })),
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
