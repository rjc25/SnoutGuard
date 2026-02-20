/**
 * CRUD routes for architectural decisions.
 * Provides endpoints for listing, viewing, creating, updating,
 * confirming, deprecating, and deleting decisions.
 */

import { Hono } from 'hono';
import { eq, and, like, desc } from 'drizzle-orm';
import {
  schema,
  generateId,
  now,
  type DbClient,
  type ArchCategory,
  type DecisionStatus,
} from '@archguard/core';
import { requirePermission } from '../auth/rbac.js';
import type { AuthUser } from '../auth/rbac.js';

/**
 * Create the decisions router.
 *
 * @param db - Database client
 */
export function createDecisionsRouter(db: DbClient): Hono {
  const router = new Hono();

  // ─── GET /api/decisions - List decisions with filters ─────────
  router.get('/', requirePermission('decisions:read'), async (c) => {
    const orgId = c.get('orgId') as string | undefined;
    const category = c.req.query('category') as ArchCategory | undefined;
    const status = c.req.query('status') as DecisionStatus | undefined;
    const search = c.req.query('search');
    const repoId = c.req.query('repoId');
    const limit = parseInt(c.req.query('limit') ?? '50', 10);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    let allDecisions: any[] = [];

    if (repoId) {
      // Filter by specific repo
      allDecisions = await db
        .select()
        .from(schema.decisions)
        .where(eq(schema.decisions.repoId, repoId))
        .orderBy(desc(schema.decisions.detectedAt));
    } else if (orgId) {
      // Multi-tenant: scope to org's repos
      const orgRepos = await db
        .select({ id: schema.repositories.id })
        .from(schema.repositories)
        .where(eq(schema.repositories.orgId, orgId));

      const repoIds = orgRepos.map((r) => r.id);
      if (repoIds.length === 0) {
        return c.json({ decisions: [], total: 0 });
      }

      for (const rid of repoIds) {
        const rows = await db
          .select()
          .from(schema.decisions)
          .where(eq(schema.decisions.repoId, rid))
          .orderBy(desc(schema.decisions.detectedAt));
        allDecisions.push(...rows);
      }
    } else {
      // Local mode (no org context): return all decisions
      allDecisions = await db
        .select()
        .from(schema.decisions)
        .orderBy(desc(schema.decisions.detectedAt));
    }

    // Apply filters
    if (category) {
      allDecisions = allDecisions.filter((d) => d.category === category);
    }
    if (status) {
      allDecisions = allDecisions.filter((d) => d.status === status);
    }
    if (search) {
      const lowerSearch = search.toLowerCase();
      allDecisions = allDecisions.filter(
        (d) =>
          d.title.toLowerCase().includes(lowerSearch) ||
          d.description.toLowerCase().includes(lowerSearch)
      );
    }

    const total = allDecisions.length;
    const paginated = allDecisions.slice(offset, offset + limit);

    // Parse JSON fields
    const decisions = paginated.map((d) => ({
      ...d,
      constraints: JSON.parse(d.constraints ?? '[]'),
      relatedDecisions: JSON.parse(d.relatedDecisions ?? '[]'),
      tags: JSON.parse(d.tags ?? '[]'),
    }));

    return c.json({ decisions, total, limit, offset });
  });

  // ─── GET /api/decisions/:id - Decision detail ─────────────────
  router.get('/:id', requirePermission('decisions:read'), async (c) => {
    const id = c.req.param('id');

    const rows = await db
      .select()
      .from(schema.decisions)
      .where(eq(schema.decisions.id, id))
      .limit(1);

    if (rows.length === 0) {
      return c.json({ error: 'Decision not found' }, 404);
    }

    const decision = rows[0];

    // Load evidence
    const evidenceRows = await db
      .select()
      .from(schema.evidence)
      .where(eq(schema.evidence.decisionId, id));

    return c.json({
      ...decision,
      constraints: JSON.parse(decision.constraints ?? '[]'),
      relatedDecisions: JSON.parse(decision.relatedDecisions ?? '[]'),
      tags: JSON.parse(decision.tags ?? '[]'),
      evidence: evidenceRows.map((e) => ({
        id: e.id,
        filePath: e.filePath,
        lineRange: [e.lineStart, e.lineEnd],
        snippet: e.snippet,
        explanation: e.explanation,
      })),
    });
  });

  // ─── POST /api/decisions - Create a decision ──────────────────
  router.post('/', requirePermission('decisions:write'), async (c) => {
    const body = await c.req.json<{
      repoId: string;
      title: string;
      description: string;
      category: ArchCategory;
      status?: DecisionStatus;
      confidence?: number;
      constraints?: string[];
      relatedDecisions?: string[];
      tags?: string[];
      evidence?: Array<{
        filePath: string;
        lineRange: [number, number];
        snippet: string;
        explanation: string;
      }>;
    }>();

    if (!body.repoId || !body.title || !body.description || !body.category) {
      return c.json({ error: 'repoId, title, description, and category are required' }, 400);
    }

    const id = generateId();
    const timestamp = now();

    await db.insert(schema.decisions).values({
      id,
      repoId: body.repoId,
      title: body.title,
      description: body.description,
      category: body.category,
      status: body.status ?? 'detected',
      confidence: body.confidence ?? 0.5,
      constraints: JSON.stringify(body.constraints ?? []),
      relatedDecisions: JSON.stringify(body.relatedDecisions ?? []),
      tags: JSON.stringify(body.tags ?? []),
      detectedAt: timestamp,
      updatedAt: timestamp,
    });

    // Store evidence if provided
    if (body.evidence && body.evidence.length > 0) {
      for (const ev of body.evidence) {
        await db.insert(schema.evidence).values({
          id: generateId(),
          decisionId: id,
          filePath: ev.filePath,
          lineStart: ev.lineRange[0],
          lineEnd: ev.lineRange[1],
          snippet: ev.snippet,
          explanation: ev.explanation,
        });
      }
    }

    return c.json({ id, message: 'Decision created' }, 201);
  });

  // ─── PUT /api/decisions/:id - Update a decision ───────────────
  router.put('/:id', requirePermission('decisions:write'), async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{
      title?: string;
      description?: string;
      category?: ArchCategory;
      confidence?: number;
      constraints?: string[];
      relatedDecisions?: string[];
      tags?: string[];
    }>();

    // Check decision exists
    const existing = await db
      .select()
      .from(schema.decisions)
      .where(eq(schema.decisions.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: 'Decision not found' }, 404);
    }

    const updates: Record<string, unknown> = { updatedAt: now() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.category !== undefined) updates.category = body.category;
    if (body.confidence !== undefined) updates.confidence = body.confidence;
    if (body.constraints !== undefined) updates.constraints = JSON.stringify(body.constraints);
    if (body.relatedDecisions !== undefined) updates.relatedDecisions = JSON.stringify(body.relatedDecisions);
    if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags);

    await db
      .update(schema.decisions)
      .set(updates)
      .where(eq(schema.decisions.id, id));

    return c.json({ id, message: 'Decision updated' });
  });

  // ─── POST /api/decisions/:id/confirm - Confirm a decision ─────
  router.post('/:id/confirm', requirePermission('decisions:confirm'), async (c) => {
    const id = c.req.param('id');
    const user = c.get('user') as AuthUser;

    const existing = await db
      .select()
      .from(schema.decisions)
      .where(eq(schema.decisions.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: 'Decision not found' }, 404);
    }

    if (existing[0].status === 'confirmed') {
      return c.json({ error: 'Decision is already confirmed' }, 409);
    }

    await db
      .update(schema.decisions)
      .set({
        status: 'confirmed',
        confirmedBy: user.id,
        updatedAt: now(),
      })
      .where(eq(schema.decisions.id, id));

    return c.json({ id, status: 'confirmed', confirmedBy: user.id });
  });

  // ─── POST /api/decisions/:id/deprecate - Deprecate a decision ─
  router.post('/:id/deprecate', requirePermission('decisions:deprecate'), async (c) => {
    const id = c.req.param('id');

    const existing = await db
      .select()
      .from(schema.decisions)
      .where(eq(schema.decisions.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: 'Decision not found' }, 404);
    }

    if (existing[0].status === 'deprecated') {
      return c.json({ error: 'Decision is already deprecated' }, 409);
    }

    await db
      .update(schema.decisions)
      .set({
        status: 'deprecated',
        updatedAt: now(),
      })
      .where(eq(schema.decisions.id, id));

    return c.json({ id, status: 'deprecated' });
  });

  // ─── DELETE /api/decisions/:id - Remove a decision ────────────
  router.delete('/:id', requirePermission('decisions:delete'), async (c) => {
    const id = c.req.param('id');

    const existing = await db
      .select()
      .from(schema.decisions)
      .where(eq(schema.decisions.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: 'Decision not found' }, 404);
    }

    // Delete evidence first (foreign key constraint)
    await db
      .delete(schema.evidence)
      .where(eq(schema.evidence.decisionId, id));

    // Delete the decision
    await db
      .delete(schema.decisions)
      .where(eq(schema.decisions.id, id));

    return c.json({ id, message: 'Decision deleted' });
  });

  return router;
}
