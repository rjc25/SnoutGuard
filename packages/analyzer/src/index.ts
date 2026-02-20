/**
 * @archguard/analyzer - Architecture Agent: Codebase Analysis
 * Scans codebases to extract architectural decisions, detect patterns,
 * map dependencies, and track drift over time.
 */

export { scanCodebase, formatDirectoryTree, type ScanResult, type DirectoryNode } from './scanner.js';
export { detectPatterns } from './pattern-detector.js';
export {
  extractDecisionsWithLlm,
  extractDecisionsFromPatterns,
} from './decision-extractor.js';
export {
  buildDependencyGraph,
  getSubgraph,
  type DependencyGraph,
} from './dependency-mapper.js';
export { detectDrift, type DriftResult } from './drift-detector.js';
export { analyzeTrends, type TrendSummary, type TrendDataPoint } from './trend-analyzer.js';
export { generateMarkdownReport } from './reporters/markdown.js';
export { generateJsonReport, type JsonReport } from './reporters/json.js';

import type Anthropic from '@anthropic-ai/sdk';
import type { ArchDecision, ArchGuardConfig, ArchSnapshot } from '@archguard/core';
import { createLlmClient, getHeadSha, createGitClient } from '@archguard/core';
import { scanCodebase } from './scanner.js';
import { detectPatterns } from './pattern-detector.js';
import { extractDecisionsWithLlm, extractDecisionsFromPatterns } from './decision-extractor.js';
import { buildDependencyGraph } from './dependency-mapper.js';
import { detectDrift, type DriftResult } from './drift-detector.js';
import { generateMarkdownReport } from './reporters/markdown.js';
import { generateJsonReport, type JsonReport } from './reporters/json.js';
import type { DependencyGraph } from './dependency-mapper.js';
import type { ScanResult } from './scanner.js';

/** Full analysis result */
export interface AnalysisResult {
  scanResult: ScanResult;
  decisions: ArchDecision[];
  dependencyGraph: DependencyGraph;
  drift: DriftResult;
  markdownReport: string;
  jsonReport: JsonReport;
}

/**
 * Run a full codebase analysis.
 * This is the main entry point for the analyzer package.
 */
export async function runAnalysis(
  projectDir: string,
  config: ArchGuardConfig,
  options: {
    repoId: string;
    useLlm?: boolean;
    previousSnapshot?: ArchSnapshot;
  }
): Promise<AnalysisResult> {
  const { repoId, useLlm = config.analysis.llmAnalysis, previousSnapshot } = options;

  // Step 1: Scan codebase
  const scanResult = await scanCodebase(projectDir, config);

  // Step 2: Detect patterns via heuristics
  const patterns = detectPatterns(scanResult.files, scanResult.directoryTree);

  // Step 3: Extract decisions
  let decisions: ArchDecision[];
  if (useLlm) {
    try {
      const client = createLlmClient(config);
      decisions = await extractDecisionsWithLlm(
        client,
        config,
        scanResult.files,
        scanResult.directoryTree,
        patterns
      );
      // Merge with heuristic decisions that LLM might have missed
      const heuristicDecisions = extractDecisionsFromPatterns(patterns);
      decisions = mergeDecisions(decisions, heuristicDecisions);
    } catch {
      // Fall back to heuristics only
      decisions = extractDecisionsFromPatterns(patterns);
    }
  } else {
    decisions = extractDecisionsFromPatterns(patterns);
  }

  // Step 4: Build dependency graph
  const dependencyGraph = buildDependencyGraph(scanResult.files, repoId);

  // Step 5: Detect drift
  const git = createGitClient(projectDir);
  let commitSha: string;
  try {
    commitSha = await getHeadSha(git);
  } catch {
    commitSha = 'unknown';
  }

  const drift = detectDrift(
    repoId,
    commitSha,
    decisions,
    dependencyGraph,
    previousSnapshot
  );

  // Step 6: Generate reports
  const markdownReport = generateMarkdownReport(scanResult, decisions, dependencyGraph, drift);
  const jsonReport = generateJsonReport(scanResult, decisions, dependencyGraph, drift);

  return {
    scanResult,
    decisions,
    dependencyGraph,
    drift,
    markdownReport,
    jsonReport,
  };
}

/** Merge LLM and heuristic decisions, avoiding duplicates */
function mergeDecisions(
  llmDecisions: ArchDecision[],
  heuristicDecisions: ArchDecision[]
): ArchDecision[] {
  const merged = [...llmDecisions];
  const llmTitles = new Set(llmDecisions.map((d) => d.title.toLowerCase()));

  for (const hd of heuristicDecisions) {
    if (!llmTitles.has(hd.title.toLowerCase())) {
      merged.push(hd);
    }
  }

  return merged;
}
