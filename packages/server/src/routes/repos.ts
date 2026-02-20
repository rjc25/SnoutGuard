/**
 * Repository management routes for the SnoutGuard server.
 * Provides endpoints for listing, connecting, disconnecting,
 * and viewing repository details.
 */

import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import {
  schema,
  generateId,
  now,
  hash,
  type DbClient,
  type GitProvider,
} from '@snoutguard/core';
import { requirePermission } from '../auth/rbac.js';
import type { AuthUser } from '../auth/rbac.js';

/**
 * Create the repos router.
 *
 * @param db - Database client
 */
export function createReposRouter(db: DbClient): Hono {
  const router = new Hono();

  // ─── GET /api/repos - List connected repositories ─────────────
  router.get('/', requirePermission('repos:read'), async (c) => {
    const orgId = c.get('orgId') as string;

    const repoRows = await db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.orgId, orgId))
      .orderBy(desc(schema.repositories.createdAt));

    const repositories = await Promise.all(
      repoRows.map(async (r) => {
        // Get decision count for each repo
        const decisionRows = await db
          .select()
          .from(schema.decisions)
          .where(eq(schema.decisions.repoId, r.id));

        // Get latest snapshot for health score
        const snapshotRows = await db
          .select()
          .from(schema.archSnapshots)
          .where(eq(schema.archSnapshots.repoId, r.id))
          .orderBy(desc(schema.archSnapshots.createdAt))
          .limit(1);

        const healthScore = snapshotRows.length > 0
          ? Math.max(0, 100 - snapshotRows[0].driftScore * 100)
          : null;

        return {
          id: r.id,
          provider: r.provider,
          providerId: r.providerId,
          name: r.name,
          fullName: r.fullName,
          defaultBranch: r.defaultBranch,
          cloneUrl: r.cloneUrl,
          lastAnalyzedAt: r.lastAnalyzedAt,
          decisionsCount: decisionRows.length,
          healthScore: healthScore !== null ? Math.round(healthScore * 100) / 100 : null,
          config: JSON.parse(r.config ?? '{}'),
          createdAt: r.createdAt,
        };
      })
    );

    return c.json({
      repositories,
      total: repositories.length,
    });
  });

  // ─── POST /api/repos - Connect a repository ──────────────────
  router.post('/', requirePermission('repos:connect'), async (c) => {
    const user = c.get('user') as AuthUser;
    const orgId = c.get('orgId') as string;
    const body = await c.req.json<{
      provider: GitProvider;
      providerId: string;
      name: string;
      fullName: string;
      cloneUrl: string;
      defaultBranch?: string;
      config?: Record<string, unknown>;
    }>();

    if (!body.provider || !body.fullName || !body.cloneUrl) {
      return c.json({ error: 'provider, fullName, and cloneUrl are required' }, 400);
    }

    // Validate provider
    const validProviders: GitProvider[] = ['github', 'bitbucket'];
    if (!validProviders.includes(body.provider)) {
      return c.json({
        error: `Invalid provider. Must be one of: ${validProviders.join(', ')}`,
      }, 400);
    }

    // Check for duplicate
    const existing = await db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.fullName, body.fullName))
      .limit(1);

    if (existing.length > 0 && existing[0].orgId === orgId) {
      return c.json({ error: 'Repository is already connected to this organization' }, 409);
    }

    const repoId = generateId();
    const timestamp = now();

    // Generate a webhook secret for this repo
    const webhookSecret = hash(`${repoId}-${timestamp}-${generateId()}`).slice(0, 40);

    await db.insert(schema.repositories).values({
      id: repoId,
      orgId,
      provider: body.provider,
      providerId: body.providerId ?? body.fullName,
      name: body.name ?? body.fullName.split('/').pop() ?? body.fullName,
      fullName: body.fullName,
      defaultBranch: body.defaultBranch ?? 'main',
      cloneUrl: body.cloneUrl,
      webhookSecret,
      config: JSON.stringify(body.config ?? {}),
      createdAt: timestamp,
    });

    return c.json(
      {
        id: repoId,
        provider: body.provider,
        fullName: body.fullName,
        webhookSecret,
        message: 'Repository connected',
      },
      201
    );
  });

  // ─── DELETE /api/repos/:id - Disconnect a repository ──────────
  router.delete('/:id', requirePermission('repos:disconnect'), async (c) => {
    const orgId = c.get('orgId') as string;
    const repoId = c.req.param('id');

    // Check repository exists and belongs to org
    const repoRows = await db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.id, repoId))
      .limit(1);

    if (repoRows.length === 0) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    if (repoRows[0].orgId !== orgId) {
      return c.json({ error: 'Repository does not belong to your organization' }, 403);
    }

    // Delete in order: evidence -> decisions, drift_events -> arch_snapshots,
    // dependencies, reviews, velocity_scores, sync_history -> repository

    // Delete evidence for all decisions in this repo
    const decisionRows = await db
      .select({ id: schema.decisions.id })
      .from(schema.decisions)
      .where(eq(schema.decisions.repoId, repoId));

    for (const d of decisionRows) {
      await db.delete(schema.evidence).where(eq(schema.evidence.decisionId, d.id));
    }

    // Delete decisions
    await db.delete(schema.decisions).where(eq(schema.decisions.repoId, repoId));

    // Delete drift events for snapshots of this repo
    const snapshotRows = await db
      .select({ id: schema.archSnapshots.id })
      .from(schema.archSnapshots)
      .where(eq(schema.archSnapshots.repoId, repoId));

    for (const s of snapshotRows) {
      await db.delete(schema.driftEvents).where(eq(schema.driftEvents.snapshotId, s.id));
    }

    // Delete snapshots
    await db.delete(schema.archSnapshots).where(eq(schema.archSnapshots.repoId, repoId));

    // Delete dependencies
    await db.delete(schema.dependencies).where(eq(schema.dependencies.repoId, repoId));

    // Delete reviews
    await db.delete(schema.reviews).where(eq(schema.reviews.repoId, repoId));

    // Delete sync history
    await db.delete(schema.syncHistory).where(eq(schema.syncHistory.repoId, repoId));

    // Delete the repository
    await db.delete(schema.repositories).where(eq(schema.repositories.id, repoId));

    return c.json({ id: repoId, message: 'Repository disconnected and all associated data removed' });
  });

  // ─── GET /api/repos/:id - Repository detail ──────────────────
  router.get('/:id', requirePermission('repos:read'), async (c) => {
    const repoId = c.req.param('id');

    const repoRows = await db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.id, repoId))
      .limit(1);

    if (repoRows.length === 0) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    const repo = repoRows[0];

    // Verify org access
    const orgId = c.get('orgId') as string;
    if (repo.orgId !== orgId) {
      return c.json({ error: 'Repository does not belong to your organization' }, 403);
    }

    // Get decision count
    const decisionRows = await db
      .select()
      .from(schema.decisions)
      .where(eq(schema.decisions.repoId, repoId));

    // Get latest snapshot
    const snapshotRows = await db
      .select()
      .from(schema.archSnapshots)
      .where(eq(schema.archSnapshots.repoId, repoId))
      .orderBy(desc(schema.archSnapshots.createdAt))
      .limit(1);

    // Get review count
    const reviewRows = await db
      .select()
      .from(schema.reviews)
      .where(eq(schema.reviews.repoId, repoId));

    // Get sync history
    const syncRows = await db
      .select()
      .from(schema.syncHistory)
      .where(eq(schema.syncHistory.repoId, repoId))
      .orderBy(desc(schema.syncHistory.syncedAt))
      .limit(5);

    const healthScore = snapshotRows.length > 0
      ? Math.max(0, 100 - snapshotRows[0].driftScore * 100)
      : null;

    return c.json({
      id: repo.id,
      provider: repo.provider,
      providerId: repo.providerId,
      name: repo.name,
      fullName: repo.fullName,
      defaultBranch: repo.defaultBranch,
      cloneUrl: repo.cloneUrl,
      lastAnalyzedAt: repo.lastAnalyzedAt,
      config: JSON.parse(repo.config ?? '{}'),
      createdAt: repo.createdAt,
      stats: {
        decisionsCount: decisionRows.length,
        reviewsCount: reviewRows.length,
        healthScore: healthScore !== null ? Math.round(healthScore * 100) / 100 : null,
        latestSnapshot: snapshotRows.length > 0
          ? {
              id: snapshotRows[0].id,
              commitSha: snapshotRows[0].commitSha,
              driftScore: snapshotRows[0].driftScore,
              decisionCount: snapshotRows[0].decisionCount,
              createdAt: snapshotRows[0].createdAt,
            }
          : null,
      },
      recentSyncs: syncRows.map((s) => ({
        id: s.id,
        format: s.format,
        outputPath: s.outputPath,
        decisionsCount: s.decisionsCount,
        syncedAt: s.syncedAt,
      })),
    });
  });

  return router;
}
