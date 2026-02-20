/**
 * Markdown report generator for analysis results.
 */

import type { ArchDecision } from '@archguard/core';
import type { ScanResult } from '../scanner.js';
import type { DependencyGraph } from '../dependency-mapper.js';
import type { DriftResult } from '../drift-detector.js';

/** Generate a full markdown analysis report */
export function generateMarkdownReport(
  scanResult: ScanResult,
  decisions: ArchDecision[],
  graph: DependencyGraph,
  drift?: DriftResult
): string {
  const lines: string[] = [];

  lines.push('# ArchGuard Analysis Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Files analyzed:** ${scanResult.totalFiles}`);
  lines.push(`**Total lines:** ${scanResult.totalLines.toLocaleString()}`);
  lines.push('');

  // Language breakdown
  lines.push('## Language Breakdown');
  lines.push('');
  lines.push('| Language | Lines | % |');
  lines.push('|----------|------:|--:|');
  const sortedLangs = Object.entries(scanResult.languageBreakdown).sort(
    ([, a], [, b]) => b - a
  );
  for (const [lang, count] of sortedLangs) {
    const pct = ((count / scanResult.totalLines) * 100).toFixed(1);
    lines.push(`| ${lang} | ${count.toLocaleString()} | ${pct}% |`);
  }
  lines.push('');

  // Architectural decisions
  lines.push('## Architectural Decisions');
  lines.push('');

  if (decisions.length === 0) {
    lines.push('No architectural decisions detected.');
  } else {
    for (const decision of decisions) {
      lines.push(`### ${decision.title}`);
      lines.push('');
      lines.push(`- **Category:** ${decision.category}`);
      lines.push(`- **Confidence:** ${(decision.confidence * 100).toFixed(0)}%`);
      lines.push(`- **Status:** ${decision.status}`);
      lines.push('');
      lines.push(decision.description);
      lines.push('');

      if (decision.constraints.length > 0) {
        lines.push('**Constraints:**');
        for (const c of decision.constraints) {
          lines.push(`- ${c}`);
        }
        lines.push('');
      }

      if (decision.evidence.length > 0) {
        lines.push('**Evidence:**');
        for (const e of decision.evidence) {
          lines.push(
            `- \`${e.filePath}\` (lines ${e.lineRange[0]}-${e.lineRange[1]}): ${e.explanation}`
          );
        }
        lines.push('');
      }
    }
  }

  // Dependency analysis
  lines.push('## Dependency Analysis');
  lines.push('');
  lines.push(`- **Total modules:** ${graph.totalModules}`);
  lines.push(`- **Circular dependencies:** ${graph.circularDeps.length}`);
  lines.push(`- **Average coupling:** ${graph.avgCoupling.toFixed(3)}`);
  lines.push('');

  if (graph.circularDeps.length > 0) {
    lines.push('### Circular Dependencies');
    lines.push('');
    for (const cd of graph.circularDeps.slice(0, 10)) {
      lines.push(`- ${cd.cycle.join(' → ')}`);
    }
    if (graph.circularDeps.length > 10) {
      lines.push(`- ... and ${graph.circularDeps.length - 10} more`);
    }
    lines.push('');
  }

  // Coupling hotspots
  const hotspots = Array.from(graph.couplingScores.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  if (hotspots.length > 0) {
    lines.push('### Coupling Hotspots');
    lines.push('');
    lines.push('| File | Coupling Score |');
    lines.push('|------|---------------:|');
    for (const [file, score] of hotspots) {
      lines.push(`| \`${file}\` | ${score.toFixed(3)} |`);
    }
    lines.push('');
  }

  // Drift analysis
  if (drift) {
    lines.push('## Architectural Drift');
    lines.push('');
    lines.push(`**Drift Score:** ${drift.driftScore}/100`);
    lines.push('');

    if (drift.events.length > 0) {
      lines.push('### Drift Events');
      lines.push('');
      for (const event of drift.events) {
        const icon =
          event.severity === 'high'
            ? '[HIGH]'
            : event.severity === 'medium'
              ? '[MED]'
              : '[LOW]';
        lines.push(`- ${icon} ${event.description}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
