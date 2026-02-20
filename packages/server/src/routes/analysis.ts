/**
 * Analysis routes for the SnoutGuard server.
 * Provides endpoints for triggering analyses, checking status,
 * and viewing analysis history.
 */

import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { schema, type DbClient } from '@snoutguard/core';
import { requirePermission } from '../auth/rbac.js';
import type { AuthUser } from '../auth/rbac.js';
import {
  enqueueAnalysis,
  getJobStatus,
  QUEUE_NAMES,
} from '../jobs/queue.js';
import { rateLimit } from '../middleware/rate-limit.js';

/**
 * Create the analysis router.
 *
 * @param db - Database client
 */
export function createAnalysisRouter(db: DbClient): Hono {
  const router = new Hono();

  // ─── POST /api/analysis/trigger - Trigger a new analysis ──────
  router.post(
    '/trigger',
    requirePermission('analysis:trigger'),
    rateLimit({ max: 5, windowMs: 60_000, message: 'Analysis trigger rate limited' }),
    async (c) => {
      const user = c.get('user') as AuthUser;
      const body = await c.req.json<{
        repoId: string;
        useLlm?: boolean;
        branch?: string;
      }>();

      if (!body.repoId) {
        return c.json({ error: 'repoId is required' }, 400);
      }

      // Verify the repo belongs to the user's org
      const repoRows = await db
        .select()
        .from(schema.repositories)
        .where(eq(schema.repositories.id, body.repoId))
        .limit(1);

      if (repoRows.length === 0) {
        return c.json({ error: 'Repository not found' }, 404);
      }

      if (repoRows[0].orgId !== user.orgId) {
        return c.json({ error: 'Repository does not belong to your organization' }, 403);
      }

      // Enqueue the analysis job
      const jobId = await enqueueAnalysis({
        repoId: body.repoId,
        orgId: user.orgId,
        triggeredBy: user.id,
        options: {
          useLlm: body.useLlm,
          branch: body.branch,
        },
      });

      return c.json(
        {
          jobId,
          status: 'queued',
          message: 'Analysis job has been queued',
        },
        202
      );
    }
  );

  // ─── GET /api/analysis/status/:id - Check analysis status ─────
  router.get('/status/:id', requirePermission('analysis:read'), async (c) => {
    const jobId = c.req.param('id');

    const status = await getJobStatus(QUEUE_NAMES.ANALYSIS, jobId);

    if (!status) {
      return c.json({ error: 'Analysis job not found' }, 404);
    }

    return c.json({
      jobId: status.id,
      status: status.status,
      progress: status.progress,
      failedReason: status.failedReason,
      startedAt: status.processedOn
        ? new Date(status.processedOn).toISOString()
        : null,
      completedAt: status.finishedOn
        ? new Date(status.finishedOn).toISOString()
        : null,
    });
  });

  // ─── GET /api/analysis/history - Analysis history ─────────────
  router.get('/history', requirePermission('analysis:read'), async (c) => {
    const orgId = c.get('orgId') as string;
    const repoId = c.req.query('repoId');
    const limit = parseInt(c.req.query('limit') ?? '20', 10);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    // Get repos for this org
    const orgRepos = await db
      .select({ id: schema.repositories.id })
      .from(schema.repositories)
      .where(eq(schema.repositories.orgId, orgId));

    const repoIds = repoId ? [repoId] : orgRepos.map((r) => r.id);

    if (repoIds.length === 0) {
      return c.json({ snapshots: [], total: 0 });
    }

    // Load snapshots from all repos
    const allSnapshots = [];
    for (const rid of repoIds) {
      const rows = await db
        .select()
        .from(schema.archSnapshots)
        .where(eq(schema.archSnapshots.repoId, rid))
        .orderBy(desc(schema.archSnapshots.createdAt));
      allSnapshots.push(...rows);
    }

    // Sort by date descending
    allSnapshots.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const total = allSnapshots.length;
    const paginated = allSnapshots.slice(offset, offset + limit);

    const snapshots = paginated.map((s) => ({
      id: s.id,
      repoId: s.repoId,
      commitSha: s.commitSha,
      driftScore: s.driftScore,
      decisionCount: s.decisionCount,
      dependencyStats: JSON.parse(s.dependencyStats ?? '{}'),
      createdAt: s.createdAt,
    }));

    return c.json({ snapshots, total, limit, offset });
  });

  return router;
}
