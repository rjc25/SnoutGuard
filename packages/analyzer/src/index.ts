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
  getLogger,
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

/** Progress callback for real-time CLI updates */
export type AnalysisProgressCallback = (event: AnalysisProgressEvent) => void;

export interface AnalysisProgressEvent {
  step: number;
  totalSteps: number;
  phase: string;
  detail?: string;
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
    onProgress?: AnalysisProgressCallback;
  }
): Promise<AnalysisResult> {
  const { repoId, previousSnapshot, onProgress } = options;
  const log = getLogger();
  const totalSteps = 6;

  function progress(step: number, phase: string, detail?: string): void {
    log.info('analysis', `Step ${step}/${totalSteps}: ${phase}`, detail ? { detail } : undefined);
    onProgress?.({ step, totalSteps, phase, detail });
  }

  // Reset cost tracking for this run
  resetRunCost();

  // Create LLM client — will throw LlmAuthError if no API key
  const client = createLlmClient(config);

  // Step 1: Scan codebase
  progress(1, 'Scanning codebase', `Discovering source files in ${projectDir}`);
  const scanResult = await scanCodebase(projectDir, config);
  log.info('scan', 'Scan complete', {
    totalFiles: scanResult.totalFiles,
    totalLines: scanResult.totalLines,
    languages: Object.keys(scanResult.languageBreakdown),
  });

  // Step 2: Build dependency graph (with tsconfig resolution)
  progress(2, 'Building dependency graph', `${scanResult.totalFiles} files`);
  const dependencyGraph = buildDependencyGraph(scanResult.files, repoId, projectDir);
  log.info('deps', 'Dependency graph built', {
    totalModules: dependencyGraph.totalModules,
    circularDeps: dependencyGraph.circularDeps.length,
    avgCoupling: dependencyGraph.avgCoupling.toFixed(3),
  });

  // Step 3: Extract architectural decisions using LLM
  progress(3, 'Extracting architectural decisions', `Sending ${scanResult.totalFiles} files to LLM`);
  log.llmRequest({
    operation: 'analyze',
    model: config.llm.models.analyze,
    inputTokens: 0, // will be logged at the llm layer
    filesIncluded: scanResult.totalFiles,
    filesList: scanResult.files.slice(0, 50).map((f) => f.filePath),
  });
  const decisions = await extractDecisions(
    client,
    config,
    scanResult.files,
    scanResult.directoryTree,
    dependencyGraph
  );
  log.info('analysis', `Extracted ${decisions.length} architectural decisions`);

  // Step 4: Detect layer violations
  progress(4, 'Detecting layer violations');
  const layerViolations = detectLayerViolations(
    dependencyGraph,
    scanResult.files,
    config.layers
  );
  log.info('layers', `Found ${layerViolations.length} layer violations`);

  // Step 5: Detect drift
  progress(5, 'Detecting architectural drift');
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
  log.info('drift', `Drift score: ${(drift.driftScore * 100).toFixed(0)}%, events: ${drift.events.length}`);

  // Step 6: Generate reports
  progress(6, 'Generating reports');
  const markdownReport = generateMarkdownReport(scanResult, decisions, dependencyGraph, drift, layerViolations);
  const jsonReport = generateJsonReport(scanResult, decisions, dependencyGraph, drift, layerViolations);

  log.info('analysis', 'Analysis complete', {
    totalCost: `$${getRunCost().toFixed(4)}`,
    apiCalls: getCallHistory().filter((c) => !c.cacheHit).length,
    cacheHits: getCallHistory().filter((c) => c.cacheHit).length,
  });

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
