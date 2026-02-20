/**
 * Async codebase analysis job.
 * Processes analysis requests from the queue, running the full
 * analyzer pipeline and storing results in the database.
 *
 * Requires an Anthropic API key — the LLM IS the product.
 */

import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import {
  initializeDatabase,
  schema,
  generateId,
  now,
  loadConfig,
  requireApiKey,
  type DbClient,
} from '@snoutguard/core';
import {
  QUEUE_NAMES,
  registerWorker,
  type AnalysisJobData,
} from './queue.js';

/**
 * Process an analysis job.
 * Steps:
 * 1. Load repository and config
 * 2. Validate API key
 * 3. Run the analyzer pipeline
 * 4. Store decisions, snapshots, and drift events
 * 5. Update repository last-analyzed timestamp
 */
async function processAnalysis(job: Job<AnalysisJobData>): Promise<{ snapshotId: string; decisionsCount: number }> {
  const { repoId, orgId } = job.data;
  const db = initializeDatabase();

  await job.updateProgress(5);

  // Load repository details
  const repoRows = await db
    .select()
    .from(schema.repositories)
    .where(eq(schema.repositories.id, repoId))
    .limit(1);

  if (repoRows.length === 0) {
    throw new Error(`Repository ${repoId} not found`);
  }

  const repo = repoRows[0];
  await job.updateProgress(10);

  // Load project config and validate API key
  const config = loadConfig(process.cwd());
  requireApiKey(config);
  await job.updateProgress(15);

  // Dynamically import analyzer to avoid circular dependencies at startup
  const { runAnalysis } = await import('@snoutguard/analyzer');

  // Load previous snapshot for drift comparison
  const previousSnapshots = await db
    .select()
    .from(schema.archSnapshots)
    .where(eq(schema.archSnapshots.repoId, repoId))
    .limit(1);

  const previousSnapshot = previousSnapshots.length > 0
    ? {
        id: previousSnapshots[0].id,
        repoId: previousSnapshots[0].repoId,
        commitSha: previousSnapshots[0].commitSha,
        decisions: [],
        driftScore: previousSnapshots[0].driftScore,
        dependencyStats: JSON.parse(previousSnapshots[0].dependencyStats ?? '{}'),
        createdAt: previousSnapshots[0].createdAt,
      }
    : undefined;

  await job.updateProgress(20);

  // Run the analysis pipeline (LLM is always used)
  const result = await runAnalysis(process.cwd(), config, {
    repoId,
    previousSnapshot,
  });

  await job.updateProgress(70);

  // Store architectural decisions
  const timestamp = now();
  for (const decision of result.decisions) {
    await db.insert(schema.decisions).values({
      id: decision.id,
      repoId,
      title: decision.title,
      description: decision.description,
      category: decision.category,
      status: decision.status,
      confidence: decision.confidence,
      constraints: JSON.stringify(decision.constraints),
      relatedDecisions: JSON.stringify(decision.relatedDecisions),
      tags: JSON.stringify(decision.tags),
      detectedAt: decision.detectedAt,
      updatedAt: timestamp,
    });

    // Store evidence for each decision
    for (const ev of decision.evidence) {
      await db.insert(schema.evidence).values({
        id: generateId(),
        decisionId: decision.id,
        filePath: ev.filePath,
        lineStart: ev.lineRange[0],
        lineEnd: ev.lineRange[1],
        snippet: ev.snippet,
        explanation: ev.explanation,
      });
    }
  }

  await job.updateProgress(80);

  // Store snapshot
  const snapshotId = generateId();
  await db.insert(schema.archSnapshots).values({
    id: snapshotId,
    repoId,
    commitSha: result.drift.snapshot.commitSha,
    driftScore: result.drift.snapshot.driftScore,
    decisionCount: result.decisions.length,
    dependencyStats: JSON.stringify(result.drift.snapshot.dependencyStats),
    createdAt: timestamp,
  });

  await job.updateProgress(85);

  // Store drift events
  for (const event of result.drift.events) {
    await db.insert(schema.driftEvents).values({
      id: event.id,
      repoId,
      snapshotId,
      type: event.type,
      decisionId: event.decisionId ?? null,
      description: event.description,
      severity: event.severity,
      detectedAt: event.detectedAt,
    });
  }

  await job.updateProgress(90);

  // Store dependencies
  for (const node of result.dependencyGraph.nodes.values()) {
    for (const target of node.imports) {
      await db.insert(schema.dependencies).values({
        id: generateId(),
        repoId,
        sourceFile: node.filePath,
        targetFile: target,
        snapshotId,
        detectedAt: timestamp,
      });
    }
  }

  await job.updateProgress(95);

  // Update repo last-analyzed timestamp
  await db
    .update(schema.repositories)
    .set({ lastAnalyzedAt: timestamp })
    .where(eq(schema.repositories.id, repoId));

  await job.updateProgress(100);

  return {
    snapshotId,
    decisionsCount: result.decisions.length,
  };
}

/**
 * Register the analysis worker.
 */
export function registerAnalysisWorker(): void {
  registerWorker(QUEUE_NAMES.ANALYSIS, processAnalysis, 2);
}
