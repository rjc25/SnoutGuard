/**
 * @archguard/analyzer - Architecture Agent: Codebase Analysis
 *
 * Scans codebases to extract architectural decisions using LLM analysis,
 * maps dependencies with real coupling metrics, detects layer violations,
 * and tracks drift over time.
 *
 * Requires an Anthropic API key — the LLM IS the product.
 */

export { scanCodebase, formatDirectoryTree, type ScanResult, type DirectoryNode } from './scanner.js';
export { extractDecisions } from './decision-extractor.js';
export {
  buildDependencyGraph,
  getSubgraph,
  type DependencyGraph,
} from './dependency-mapper.js';
export { detectDrift, type DriftResult } from './drift-detector.js';
export { analyzeTrends, type TrendSummary, type TrendDataPoint } from './trend-analyzer.js';
export { detectLayerViolations } from './layer-detector.js';
export { generateMarkdownReport } from './reporters/markdown.js';
export { generateJsonReport, type JsonReport } from './reporters/json.js';

import type Anthropic from '@anthropic-ai/sdk';
import type { ArchDecision, ArchGuardConfig, ArchSnapshot, LayerViolation } from '@archguard/core';
import {
  createLlmClient,
  getHeadSha,
  createGitClient,
  resetRunCost,
  getRunCost,
  getCallHistory,
  type LlmCallRecord,
} from '@archguard/core';
import { scanCodebase } from './scanner.js';
import { extractDecisions } from './decision-extractor.js';
import { buildDependencyGraph } from './dependency-mapper.js';
import { detectDrift, type DriftResult } from './drift-detector.js';
import { detectLayerViolations } from './layer-detector.js';
import { generateMarkdownReport } from './reporters/markdown.js';
import { generateJsonReport, type JsonReport } from './reporters/json.js';
import type { DependencyGraph } from './dependency-mapper.js';
import type { ScanResult } from './scanner.js';

/** Full analysis result */
export interface AnalysisResult {
  scanResult: ScanResult;
  decisions: ArchDecision[];
  dependencyGraph: DependencyGraph;
  layerViolations: LayerViolation[];
  drift: DriftResult;
  markdownReport: string;
  jsonReport: JsonReport;
  cost: {
    totalCost: number;
    calls: LlmCallRecord[];
  };
}

/**
 * Run a full codebase analysis.
 * This is the main entry point for the analyzer package.
 *
 * Requires a valid Anthropic API key configured via the ANTHROPIC_API_KEY
 * environment variable (or whatever is set in llm.api_key_env config).
 */
export async function runAnalysis(
  projectDir: string,
  config: ArchGuardConfig,
  options: {
    repoId: string;
    previousSnapshot?: ArchSnapshot;
  }
): Promise<AnalysisResult> {
  const { repoId, previousSnapshot } = options;

  // Reset cost tracking for this run
  resetRunCost();

  // Create LLM client — will throw LlmAuthError if no API key
  const client = createLlmClient(config);

  // Step 1: Scan codebase
  const scanResult = await scanCodebase(projectDir, config);

  // Step 2: Build dependency graph (with tsconfig resolution)
  const dependencyGraph = buildDependencyGraph(scanResult.files, repoId, projectDir);

  // Step 3: Extract architectural decisions using LLM
  const decisions = await extractDecisions(
    client,
    config,
    scanResult.files,
    scanResult.directoryTree,
    dependencyGraph
  );

  // Step 4: Detect layer violations
  const layerViolations = detectLayerViolations(
    dependencyGraph,
    scanResult.files,
    config.layers
  );

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
    previousSnapshot,
    layerViolations
  );

  // Step 6: Generate reports
  const markdownReport = generateMarkdownReport(scanResult, decisions, dependencyGraph, drift, layerViolations);
  const jsonReport = generateJsonReport(scanResult, decisions, dependencyGraph, drift, layerViolations);

  return {
    scanResult,
    decisions,
    dependencyGraph,
    layerViolations,
    drift,
    markdownReport,
    jsonReport,
    cost: {
      totalCost: getRunCost(),
      calls: getCallHistory(),
    },
  };
}
