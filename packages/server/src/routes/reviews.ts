/**
 * Review routes for the ArchGuard server.
 * Provides endpoints for viewing review history, details,
 * and triggering new code reviews.
 */

import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { schema, type DbClient } from '@archguard/core';
import { requirePermission } from '../auth/rbac.js';
import type { AuthUser } from '../auth/rbac.js';
import { enqueueReview, getJobStatus, QUEUE_NAMES } from '../jobs/queue.js';
import { rateLimit } from '../middleware/rate-limit.js';

/**
 * Create the reviews router.
 *
 * @param db - Database client
 */
export function createReviewsRouter(db: DbClient): Hono {
  const router = new Hono();

  // ─── GET /api/reviews - Review history ────────────────────────
  router.get('/', requirePermission('reviews:read'), async (c) => {
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
      return c.json({ reviews: [], total: 0 });
    }

    // Load reviews from all repos
    const allReviews = [];
    for (const rid of repoIds) {
      const rows = await db
        .select()
        .from(schema.reviews)
        .where(eq(schema.reviews.repoId, rid))
        .orderBy(desc(schema.reviews.reviewedAt));
      allReviews.push(...rows);
    }

    // Sort by date descending
    allReviews.sort(
      (a, b) => new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime()
    );

    const total = allReviews.length;
    const paginated = allReviews.slice(offset, offset + limit);

    const reviews = paginated.map((r) => ({
      id: r.id,
      repoId: r.repoId,
      ref: r.ref,
      prNumber: r.prNumber,
      prUrl: r.prUrl,
      totalViolations: r.totalViolations,
      errors: r.errors,
      warnings: r.warnings,
      infos: r.infos,
      triggeredBy: r.triggeredBy,
      reviewedAt: r.reviewedAt,
    }));

    return c.json({ reviews, total, limit, offset });
  });

  // ─── GET /api/reviews/:id - Review detail ─────────────────────
  router.get('/:id', requirePermission('reviews:read'), async (c) => {
    const id = c.req.param('id');

    const rows = await db
      .select()
      .from(schema.reviews)
      .where(eq(schema.reviews.id, id))
      .limit(1);

    if (rows.length === 0) {
      return c.json({ error: 'Review not found' }, 404);
    }

    const review = rows[0];

    return c.json({
      id: review.id,
      repoId: review.repoId,
      ref: review.ref,
      prNumber: review.prNumber,
      prUrl: review.prUrl,
      totalViolations: review.totalViolations,
      errors: review.errors,
      warnings: review.warnings,
      infos: review.infos,
      violations: JSON.parse(review.results),
      triggeredBy: review.triggeredBy,
      reviewedAt: review.reviewedAt,
    });
  });

  // ─── POST /api/reviews/trigger - Trigger a review ─────────────
  router.post(
    '/trigger',
    requirePermission('reviews:trigger'),
    rateLimit({ max: 10, windowMs: 60_000, message: 'Review trigger rate limited' }),
    async (c) => {
      const user = c.get('user') as AuthUser;
      const body = await c.req.json<{
        repoId: string;
        ref: string;
        prNumber?: number;
      }>();

      if (!body.repoId || !body.ref) {
        return c.json({ error: 'repoId and ref are required' }, 400);
      }

      // Verify repo belongs to org
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

      // Enqueue review job
      const jobId = await enqueueReview({
        repoId: body.repoId,
        orgId: user.orgId,
        ref: body.ref,
        prNumber: body.prNumber,
        triggeredBy: 'manual',
      });

      return c.json(
        {
          jobId,
          status: 'queued',
          message: 'Review job has been queued',
        },
        202
      );
    }
  );

  return router;
}
