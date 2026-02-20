/**
 * Summary routes for the ArchGuard server.
 * Provides endpoints for listing, viewing, generating,
 * and editing work summaries.
 */

import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { schema, now, type DbClient, type SummaryType } from '@archguard/core';
import { requirePermission } from '../auth/rbac.js';
import type { AuthUser } from '../auth/rbac.js';
import { enqueueSummary } from '../jobs/queue.js';

/**
 * Create the summaries router.
 *
 * @param db - Database client
 */
export function createSummariesRouter(db: DbClient): Hono {
  const router = new Hono();

  // ─── GET /api/summaries - List summaries ──────────────────────
  router.get('/', requirePermission('summaries:read'), async (c) => {
    const orgId = c.get('orgId') as string;
    const type = c.req.query('type') as SummaryType | undefined;
    const developerId = c.req.query('developerId');
    const limit = parseInt(c.req.query('limit') ?? '20', 10);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    // Load summaries for the org
    let allSummaries = await db
      .select()
      .from(schema.workSummaries)
      .where(eq(schema.workSummaries.orgId, orgId))
      .orderBy(desc(schema.workSummaries.generatedAt));

    // Apply filters
    if (type) {
      allSummaries = allSummaries.filter((s) => s.type === type);
    }
    if (developerId) {
      allSummaries = allSummaries.filter((s) => s.developerId === developerId);
    }

    const total = allSummaries.length;
    const paginated = allSummaries.slice(offset, offset + limit);

    const summaries = paginated.map((s) => ({
      id: s.id,
      developerId: s.developerId,
      orgId: s.orgId,
      type: s.type,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      content: s.editedContent ?? s.content,
      dataPoints: JSON.parse(s.dataPoints ?? '{}'),
      isEdited: !!s.editedContent,
      generatedAt: s.generatedAt,
    }));

    return c.json({ summaries, total, limit, offset });
  });

  // ─── GET /api/summaries/:id - Summary detail ──────────────────
  router.get('/:id', requirePermission('summaries:read'), async (c) => {
    const id = c.req.param('id');

    const rows = await db
      .select()
      .from(schema.workSummaries)
      .where(eq(schema.workSummaries.id, id))
      .limit(1);

    if (rows.length === 0) {
      return c.json({ error: 'Summary not found' }, 404);
    }

    const summary = rows[0];

    return c.json({
      id: summary.id,
      developerId: summary.developerId,
      orgId: summary.orgId,
      type: summary.type,
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      content: summary.content,
      editedContent: summary.editedContent,
      displayContent: summary.editedContent ?? summary.content,
      dataPoints: JSON.parse(summary.dataPoints ?? '{}'),
      isEdited: !!summary.editedContent,
      generatedAt: summary.generatedAt,
    });
  });

  // ─── POST /api/summaries/generate - Generate a summary ────────
  router.post('/generate', requirePermission('summaries:generate'), async (c) => {
    const user = c.get('user') as AuthUser;
    const body = await c.req.json<{
      type: SummaryType;
      developerId?: string;
      periodStart: string;
      periodEnd: string;
    }>();

    if (!body.type || !body.periodStart || !body.periodEnd) {
      return c.json({ error: 'type, periodStart, and periodEnd are required' }, 400);
    }

    // Validate summary type
    const validTypes: SummaryType[] = ['one_on_one', 'standup', 'sprint_review', 'progress_report'];
    if (!validTypes.includes(body.type)) {
      return c.json({
        error: `Invalid summary type. Must be one of: ${validTypes.join(', ')}`,
      }, 400);
    }

    // Validate dates
    const start = new Date(body.periodStart);
    const end = new Date(body.periodEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return c.json({ error: 'Invalid date format. Use ISO 8601 format.' }, 400);
    }
    if (start >= end) {
      return c.json({ error: 'periodStart must be before periodEnd' }, 400);
    }

    // Enqueue summary generation job
    const jobId = await enqueueSummary({
      orgId: user.orgId,
      type: body.type,
      developerId: body.developerId,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
    });

    return c.json(
      {
        jobId,
        status: 'queued',
        message: 'Summary generation job has been queued',
      },
      202
    );
  });

  // ─── PUT /api/summaries/:id - Edit a summary ─────────────────
  router.put('/:id', requirePermission('summaries:edit'), async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{ content: string }>();

    if (!body.content) {
      return c.json({ error: 'content is required' }, 400);
    }

    // Check summary exists
    const existing = await db
      .select()
      .from(schema.workSummaries)
      .where(eq(schema.workSummaries.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: 'Summary not found' }, 404);
    }

    // Verify org membership
    const orgId = c.get('orgId') as string;
    if (existing[0].orgId !== orgId) {
      return c.json({ error: 'Summary does not belong to your organization' }, 403);
    }

    // Store edited content separately from original
    await db
      .update(schema.workSummaries)
      .set({ editedContent: body.content })
      .where(eq(schema.workSummaries.id, id));

    return c.json({ id, message: 'Summary updated' });
  });

  return router;
}
