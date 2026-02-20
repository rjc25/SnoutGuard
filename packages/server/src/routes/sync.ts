/**
 * Context file sync routes for the SnoutGuard server.
 * Provides endpoints for triggering, viewing status, and
 * browsing history of context file synchronization.
 */

import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { schema, generateId, now, type DbClient } from '@snoutguard/core';
import { requirePermission } from '../auth/rbac.js';

/**
 * Create the sync router.
 *
 * @param db - Database client
 */
export function createSyncRouter(db: DbClient): Hono {
  const router = new Hono();

  // ─── GET /api/sync - List sync history ─────────────────────────
  router.get('/', requirePermission('settings:read'), async (c) => {
    const orgId = c.get('orgId') as string;
    const repoId = c.req.query('repoId');
    const limit = parseInt(c.req.query('limit') ?? '20', 10);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    // Get repos for this org
    const orgRepos = await db
      .select({ id: schema.repositories.id })
      .from(schema.repositories)
      .where(eq(schema.repositories.orgId, orgId));

    const orgRepoIds = new Set(orgRepos.map((r) => r.id));

    // Build query
    let rows;
    if (repoId) {
      if (!orgRepoIds.has(repoId)) {
        return c.json({ error: 'Repository not found in your organization' }, 404);
      }
      rows = await db
        .select()
        .from(schema.syncHistory)
        .where(eq(schema.syncHistory.repoId, repoId))
        .orderBy(desc(schema.syncHistory.syncedAt))
        .limit(limit)
        .offset(offset);
    } else {
      // All syncs across the org's repos
      const allRows = await db
        .select()
        .from(schema.syncHistory)
        .orderBy(desc(schema.syncHistory.syncedAt));

      rows = allRows
        .filter((r) => orgRepoIds.has(r.repoId))
        .slice(offset, offset + limit);
    }

    // Enrich with repo name
    const repoMap = new Map<string, string>();
    for (const repo of orgRepos) {
      const repoRows = await db
        .select({ id: schema.repositories.id, name: schema.repositories.name })
        .from(schema.repositories)
        .where(eq(schema.repositories.id, repo.id))
        .limit(1);
      if (repoRows.length > 0) {
        repoMap.set(repoRows[0].id, repoRows[0].name);
      }
    }

    const syncRecords = rows.map((s) => ({
      id: s.id,
      repoId: s.repoId,
      repoName: repoMap.get(s.repoId) ?? 'unknown',
      format: s.format,
      outputPath: s.outputPath,
      decisionsCount: s.decisionsCount,
      syncedAt: s.syncedAt,
    }));

    return c.json({
      syncs: syncRecords,
      total: syncRecords.length,
    });
  });

  // ─── POST /api/sync/trigger - Trigger context file sync ────────
  router.post('/trigger', requirePermission('settings:write'), async (c) => {
    const orgId = c.get('orgId') as string;
    const body = await c.req.json<{
      repoId: string;
      formats?: string[];
    }>();

    if (!body.repoId) {
      return c.json({ error: 'repoId is required' }, 400);
    }

    // Verify repo belongs to org
    const repoRows = await db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.id, body.repoId))
      .limit(1);

    if (repoRows.length === 0 || repoRows[0].orgId !== orgId) {
      return c.json({ error: 'Repository not found in your organization' }, 404);
    }

    const repo = repoRows[0];
    const formats = body.formats ?? ['claude', 'cursorrules'];

    // Get decisions for this repo
    const decisionRows = await db
      .select()
      .from(schema.decisions)
      .where(eq(schema.decisions.repoId, body.repoId));

    const timestamp = now();
    const syncRecords: Array<{ id: string; format: string; outputPath: string }> = [];

    // Record a sync entry for each format
    const formatOutputMap: Record<string, string> = {
      cursorrules: '.cursorrules',
      claude: 'CLAUDE.md',
      copilot: '.github/copilot-instructions.md',
      agents: 'agents.md',
      windsurf: '.windsurfrules',
      kiro: '.kiro/steering.md',
    };

    for (const format of formats) {
      const outputPath = formatOutputMap[format] ?? `${format}.md`;
      const syncId = generateId();

      await db.insert(schema.syncHistory).values({
        id: syncId,
        repoId: body.repoId,
        format,
        outputPath,
        decisionsCount: decisionRows.length,
        syncedAt: timestamp,
      });

      syncRecords.push({ id: syncId, format, outputPath });
    }

    return c.json(
      {
        message: 'Sync triggered',
        repoId: body.repoId,
        repoName: repo.name,
        decisionsCount: decisionRows.length,
        syncs: syncRecords,
        triggeredAt: timestamp,
      },
      201
    );
  });

  // ─── GET /api/sync/:id - Get sync detail ──────────────────────
  router.get('/:id', requirePermission('settings:read'), async (c) => {
    const syncId = c.req.param('id');
    const orgId = c.get('orgId') as string;

    const syncRows = await db
      .select()
      .from(schema.syncHistory)
      .where(eq(schema.syncHistory.id, syncId))
      .limit(1);

    if (syncRows.length === 0) {
      return c.json({ error: 'Sync record not found' }, 404);
    }

    const sync = syncRows[0];

    // Verify the repo belongs to this org
    const repoRows = await db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.id, sync.repoId))
      .limit(1);

    if (repoRows.length === 0 || repoRows[0].orgId !== orgId) {
      return c.json({ error: 'Sync record not found' }, 404);
    }

    return c.json({
      id: sync.id,
      repoId: sync.repoId,
      repoName: repoRows[0].name,
      format: sync.format,
      outputPath: sync.outputPath,
      decisionsCount: sync.decisionsCount,
      syncedAt: sync.syncedAt,
    });
  });

  return router;
}
