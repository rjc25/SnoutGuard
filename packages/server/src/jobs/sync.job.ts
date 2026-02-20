/**
 * Periodic context file sync job.
 * Regenerates AI context files (.cursorrules, CLAUDE.md, etc.)
 * from the latest architectural decisions in the database.
 */

import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import {
  initializeDatabase,
  schema,
  generateId,
  now,
  loadConfig,
  type ArchDecision,
  type Evidence,
  type ArchCategory,
  type DecisionStatus,
} from '@snoutguard/core';
import {
  QUEUE_NAMES,
  registerWorker,
  type SyncJobData,
} from './queue.js';

/**
 * Process a context file sync job.
 * Steps:
 * 1. Load repository and its decisions
 * 2. Load evidence for each decision
 * 3. Initialize the SyncEngine
 * 4. Generate all configured context files
 * 5. Record sync history
 */
async function processSync(job: Job<SyncJobData>): Promise<{ syncedFormats: string[]; recordCount: number }> {
  const { repoId, orgId, formats } = job.data;
  const db = initializeDatabase();

  await job.updateProgress(10);

  // Load repository
  const repoRows = await db
    .select()
    .from(schema.repositories)
    .where(eq(schema.repositories.id, repoId))
    .limit(1);

  if (repoRows.length === 0) {
    throw new Error(`Repository ${repoId} not found`);
  }

  const repo = repoRows[0];
  await job.updateProgress(20);

  // Load decisions for the repository
  const decisionRows = await db
    .select()
    .from(schema.decisions)
    .where(eq(schema.decisions.repoId, repoId));

  // Load evidence for all decisions
  const decisionIds = decisionRows.map((d) => d.id);
  const evidenceRows = decisionIds.length > 0
    ? await db.select().from(schema.evidence)
    : [];

  await job.updateProgress(40);

  // Build full decision objects with evidence
  const decisions: ArchDecision[] = decisionRows.map((d) => {
    const decisionEvidence = evidenceRows
      .filter((e) => e.decisionId === d.id)
      .map((e): Evidence => ({
        filePath: e.filePath,
        lineRange: [e.lineStart, e.lineEnd],
        snippet: e.snippet,
        explanation: e.explanation,
      }));

    return {
      id: d.id,
      title: d.title,
      description: d.description,
      category: d.category as ArchCategory,
      status: d.status as DecisionStatus,
      confidence: d.confidence,
      evidence: decisionEvidence,
      constraints: JSON.parse(d.constraints ?? '[]'),
      relatedDecisions: JSON.parse(d.relatedDecisions ?? '[]'),
      tags: JSON.parse(d.tags ?? '[]'),
      detectedAt: d.detectedAt,
      confirmedBy: d.confirmedBy ?? undefined,
    };
  });

  await job.updateProgress(50);

  // Load config
  const config = loadConfig(process.cwd());

  // Override formats if specified
  if (formats && formats.length > 0) {
    config.sync.formats = formats as import('@snoutguard/core').SyncFormat[];
  }

  // Dynamically import context-sync engine
  const { SyncEngine } = await import('@snoutguard/context-sync');

  const engine = new SyncEngine({
    config,
    decisions,
    repoId,
    projectRoot: process.cwd(),
  });

  await job.updateProgress(60);

  // Run the sync
  const result = await engine.sync();

  await job.updateProgress(80);

  // Record sync history
  const timestamp = now();
  for (const record of result.records) {
    await db.insert(schema.syncHistory).values({
      id: record.id,
      repoId,
      format: record.format,
      outputPath: record.outputPath,
      decisionsCount: record.decisionsCount,
      syncedAt: timestamp,
    });
  }

  // Log any errors
  for (const error of result.errors) {
    console.warn(`[sync] Failed to generate ${error.format}: ${error.error}`);
  }

  await job.updateProgress(100);

  return {
    syncedFormats: result.records.map((r) => r.format),
    recordCount: result.records.length,
  };
}

/**
 * Register the sync worker.
 */
export function registerSyncWorker(): void {
  registerWorker(QUEUE_NAMES.SYNC, processSync, 1);
}
