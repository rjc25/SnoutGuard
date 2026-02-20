/**
 * Architectural drift detection.
 * Compares current analysis results against historical snapshots
 * to identify architectural drift over time.
 *
 * Tracks: decision changes, coupling trends, circular deps,
 * instability shifts, and layer violation trends.
 */

import {
  generateId,
  now,
  type ArchDecision,
  type ArchSnapshot,
  type DriftEvent,
  type DriftEventType,
  type LayerViolation,
} from '@archguard/core';
import type { DependencyGraph } from './dependency-mapper.js';

/** Result of drift detection */
export interface DriftResult {
  driftScore: number;
  events: DriftEvent[];
  snapshot: ArchSnapshot;
}

/**
 * Detect drift by comparing current analysis against the previous snapshot.
 */
export function detectDrift(
  repoId: string,
  commitSha: string,
  currentDecisions: ArchDecision[],
  currentGraph: DependencyGraph,
  previousSnapshot?: ArchSnapshot,
  layerViolations?: LayerViolation[]
): DriftResult {
  const events: DriftEvent[] = [];
  const snapshotId = generateId();

  if (!previousSnapshot) {
    // First run — no drift to detect, just create baseline
    const snapshot: ArchSnapshot = {
      id: snapshotId,
      repoId,
      commitSha,
      decisions: currentDecisions,
      driftScore: 0,
      dependencyStats: {
        totalModules: currentGraph.totalModules,
        circularDeps: currentGraph.circularDeps.length,
        avgCoupling: currentGraph.avgCoupling,
        avgInstability: currentGraph.avgInstability,
        avgDistance: currentGraph.avgDistance,
      },
      createdAt: now(),
    };

    return { driftScore: 0, events, snapshot };
  }

  // Compare decisions
  const previousDecisionMap = new Map(
    previousSnapshot.decisions.map((d) => [d.title, d])
  );
  const currentDecisionMap = new Map(
    currentDecisions.map((d) => [d.title, d])
  );

  // Detect lost decisions
  for (const [title, prevDecision] of previousDecisionMap) {
    if (!currentDecisionMap.has(title)) {
      events.push({
        id: generateId(),
        repoId,
        type: 'decision_lost',
        decisionId: prevDecision.id,
        description: `Architectural decision "${title}" is no longer detected. This may indicate architectural drift.`,
        severity: prevDecision.confidence > 0.7 ? 'high' : 'medium',
        detectedAt: now(),
        snapshotId,
      });
    }
  }

  // Detect new decisions
  for (const [title] of currentDecisionMap) {
    if (!previousDecisionMap.has(title)) {
      events.push({
        id: generateId(),
        repoId,
        type: 'decision_emerged',
        description: `New architectural pattern detected: "${title}". Review whether this aligns with intended architecture.`,
        severity: 'low',
        detectedAt: now(),
        snapshotId,
      });
    }
  }

  // Detect weakened decisions (confidence drop)
  for (const [title, currDecision] of currentDecisionMap) {
    const prevDecision = previousDecisionMap.get(title);
    if (prevDecision) {
      const confidenceDrop = prevDecision.confidence - currDecision.confidence;
      if (confidenceDrop > 0.15) {
        events.push({
          id: generateId(),
          repoId,
          type: 'decision_weakened',
          decisionId: currDecision.id,
          description: `Confidence in "${title}" dropped from ${(prevDecision.confidence * 100).toFixed(0)}% to ${(currDecision.confidence * 100).toFixed(0)}%. The pattern may be eroding.`,
          severity: confidenceDrop > 0.3 ? 'high' : 'medium',
          detectedAt: now(),
          snapshotId,
        });
      }
    }
  }

  // Detect new circular dependencies
  const prevCircularCount = previousSnapshot.dependencyStats.circularDeps;
  const currentCircularCount = currentGraph.circularDeps.length;

  if (currentCircularCount > prevCircularCount) {
    const newCount = currentCircularCount - prevCircularCount;
    events.push({
      id: generateId(),
      repoId,
      type: 'circular_dep_introduced',
      description: `${newCount} new circular dependency group(s) detected (total: ${currentCircularCount}).`,
      severity: newCount > 2 ? 'high' : 'medium',
      detectedAt: now(),
      snapshotId,
    });
  }

  // Detect coupling increase
  const couplingIncrease =
    currentGraph.avgCoupling - previousSnapshot.dependencyStats.avgCoupling;
  if (couplingIncrease > 0.1) {
    events.push({
      id: generateId(),
      repoId,
      type: 'new_violation_trend',
      description: `Average module coupling increased by ${(couplingIncrease * 100).toFixed(1)}% (${previousSnapshot.dependencyStats.avgCoupling.toFixed(2)} → ${currentGraph.avgCoupling.toFixed(2)}).`,
      severity: couplingIncrease > 0.2 ? 'high' : 'medium',
      detectedAt: now(),
      snapshotId,
    });
  }

  // Detect instability increase
  const prevInstability = previousSnapshot.dependencyStats.avgInstability ?? 0;
  const instabilityIncrease = currentGraph.avgInstability - prevInstability;
  if (instabilityIncrease > 0.1) {
    events.push({
      id: generateId(),
      repoId,
      type: 'new_violation_trend',
      description: `Average module instability increased by ${(instabilityIncrease * 100).toFixed(1)}% (${prevInstability.toFixed(2)} → ${currentGraph.avgInstability.toFixed(2)}). Modules are becoming less stable.`,
      severity: instabilityIncrease > 0.2 ? 'high' : 'medium',
      detectedAt: now(),
      snapshotId,
    });
  }

  // Detect layer violations if provided
  if (layerViolations && layerViolations.length > 0) {
    events.push({
      id: generateId(),
      repoId,
      type: 'layer_violation_introduced',
      description: `${layerViolations.length} layer boundary violation(s) detected. ${layerViolations.slice(0, 3).map((v) => `${v.sourceLayer} → ${v.targetLayer}`).join(', ')}${layerViolations.length > 3 ? ` and ${layerViolations.length - 3} more` : ''}.`,
      severity: layerViolations.length > 5 ? 'high' : layerViolations.length > 2 ? 'medium' : 'low',
      detectedAt: now(),
      snapshotId,
    });
  }

  // Calculate overall drift score (0-100)
  const driftScore = calculateDriftScore(events, currentDecisions, previousSnapshot);

  const snapshot: ArchSnapshot = {
    id: snapshotId,
    repoId,
    commitSha,
    decisions: currentDecisions,
    driftScore,
    dependencyStats: {
      totalModules: currentGraph.totalModules,
      circularDeps: currentGraph.circularDeps.length,
      avgCoupling: currentGraph.avgCoupling,
      avgInstability: currentGraph.avgInstability,
      avgDistance: currentGraph.avgDistance,
    },
    createdAt: now(),
  };

  return { driftScore, events, snapshot };
}

/**
 * Calculate an overall drift score from 0 (no drift) to 100 (severe drift).
 */
function calculateDriftScore(
  events: DriftEvent[],
  currentDecisions: ArchDecision[],
  previousSnapshot: ArchSnapshot
): number {
  let score = 0;

  // Weight by severity
  const severityWeights: Record<string, number> = {
    high: 15,
    medium: 8,
    low: 3,
  };

  for (const event of events) {
    score += severityWeights[event.severity] || 0;
  }

  // Additional penalty for decision loss relative to total
  const lostDecisions = events.filter((e) => e.type === 'decision_lost').length;
  const totalPrevious = previousSnapshot.decisions.length;
  if (totalPrevious > 0) {
    score += (lostDecisions / totalPrevious) * 30;
  }

  // Cap at 100
  return Math.min(Math.round(score), 100);
}
