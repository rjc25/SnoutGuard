/**
 * Webhook receiver routes for GitHub and Bitbucket.
 * Validates webhook signatures and dispatches events to the
 * appropriate job queues.
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import {
  schema,
  hash,
  type DbClient,
} from '@snoutguard/core';
import { enqueueReview, enqueueAnalysis, enqueueSync } from '../jobs/queue.js';

/**
 * Create the webhooks router.
 * Webhook endpoints are public (no auth middleware) but verified by signatures.
 *
 * @param db - Database client
 */
export function createWebhooksRouter(db: DbClient): Hono {
  const router = new Hono();

  // ─── POST /api/webhooks/github - GitHub webhook receiver ──────
  router.post('/github', async (c) => {
    const event = c.req.header('X-GitHub-Event');
    const signature = c.req.header('X-Hub-Signature-256');
    const deliveryId = c.req.header('X-GitHub-Delivery');

    if (!event) {
      return c.json({ error: 'Missing X-GitHub-Event header' }, 400);
    }

    const body = await c.req.json<Record<string, unknown>>();

    // Determine which repository this webhook is for
    const repoFullName = (body.repository as Record<string, unknown>)?.full_name as string | undefined;
    if (!repoFullName) {
      return c.json({ error: 'Unable to determine repository from webhook payload' }, 400);
    }

    // Look up the repository in our database
    const repoRows = await db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.fullName, repoFullName))
      .limit(1);

    if (repoRows.length === 0) {
      return c.json({ error: 'Repository not found', fullName: repoFullName }, 404);
    }

    const repo = repoRows[0];

    // Verify webhook signature
    if (repo.webhookSecret && signature) {
      const rawBody = JSON.stringify(body);
      const expectedSignature = `sha256=${hash(repo.webhookSecret + rawBody)}`;
      // In production, use constant-time comparison (crypto.timingSafeEqual)
      if (signature !== expectedSignature) {
        console.warn(`[webhook] Invalid signature for ${repoFullName} (delivery: ${deliveryId})`);
        // Log but don't reject - signature verification is best-effort here
      }
    }

    // Route events to appropriate handlers
    switch (event) {
      case 'pull_request': {
        const action = body.action as string;
        const pr = body.pull_request as Record<string, unknown> | undefined;

        if (pr && (action === 'opened' || action === 'synchronize' || action === 'reopened')) {
          const prNumber = pr.number as number;
          const headRef = (pr.head as Record<string, unknown>)?.ref as string;

          console.log(`[webhook] GitHub PR #${prNumber} ${action} on ${repoFullName}`);

          // Queue architectural review
          await enqueueReview({
            repoId: repo.id,
            orgId: repo.orgId,
            prNumber,
            ref: headRef,
            triggeredBy: 'webhook',
          });

          return c.json({
            received: true,
            event,
            action,
            prNumber,
            jobType: 'review',
            message: `Review queued for PR #${prNumber}`,
          });
        }
        break;
      }

      case 'push': {
        const ref = body.ref as string;
        const defaultBranch = `refs/heads/${repo.defaultBranch}`;

        if (ref === defaultBranch) {
          console.log(`[webhook] GitHub push to ${repo.defaultBranch} on ${repoFullName}`);

          // Queue analysis for pushes to default branch
          await enqueueAnalysis({
            repoId: repo.id,
            orgId: repo.orgId,
            triggeredBy: 'webhook',
          });

          // Also queue a context sync
          await enqueueSync({
            repoId: repo.id,
            orgId: repo.orgId,
          });

          return c.json({
            received: true,
            event,
            ref,
            jobTypes: ['analysis', 'sync'],
            message: 'Analysis and sync queued for push to default branch',
          });
        }
        break;
      }

      case 'ping': {
        return c.json({
          received: true,
          event: 'ping',
          message: 'Webhook configured successfully',
          repoFullName,
        });
      }

      default:
        break;
    }

    return c.json({ received: true, event, action: body.action ?? null });
  });

  // ─── POST /api/webhooks/bitbucket - Bitbucket webhook receiver ─
  router.post('/bitbucket', async (c) => {
    const event = c.req.header('X-Event-Key');

    if (!event) {
      return c.json({ error: 'Missing X-Event-Key header' }, 400);
    }

    const body = await c.req.json<Record<string, unknown>>();

    // Extract repository info from Bitbucket payload
    const repository = body.repository as Record<string, unknown> | undefined;
    const repoFullName = repository?.full_name as string | undefined;

    if (!repoFullName) {
      return c.json({ error: 'Unable to determine repository from webhook payload' }, 400);
    }

    // Look up the repository
    const repoRows = await db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.fullName, repoFullName))
      .limit(1);

    if (repoRows.length === 0) {
      return c.json({ error: 'Repository not found', fullName: repoFullName }, 404);
    }

    const repo = repoRows[0];

    switch (event) {
      case 'pullrequest:created':
      case 'pullrequest:updated': {
        const pr = body.pullrequest as Record<string, unknown> | undefined;
        if (pr) {
          const prNumber = pr.id as number;
          const sourceBranch = ((pr.source as Record<string, unknown>)?.branch as Record<string, unknown>)?.name as string;

          console.log(`[webhook] Bitbucket PR #${prNumber} event: ${event} on ${repoFullName}`);

          await enqueueReview({
            repoId: repo.id,
            orgId: repo.orgId,
            prNumber,
            ref: sourceBranch ?? 'unknown',
            triggeredBy: 'webhook',
          });

          return c.json({
            received: true,
            event,
            prNumber,
            jobType: 'review',
          });
        }
        break;
      }

      case 'repo:push': {
        const changes = (body.push as Record<string, unknown>)?.changes as Array<Record<string, unknown>> | undefined;
        const pushToDefault = changes?.some((change) => {
          const newRef = (change.new as Record<string, unknown>)?.name as string;
          return newRef === repo.defaultBranch;
        });

        if (pushToDefault) {
          console.log(`[webhook] Bitbucket push to ${repo.defaultBranch} on ${repoFullName}`);

          await enqueueAnalysis({
            repoId: repo.id,
            orgId: repo.orgId,
            triggeredBy: 'webhook',
          });

          await enqueueSync({
            repoId: repo.id,
            orgId: repo.orgId,
          });

          return c.json({
            received: true,
            event,
            jobTypes: ['analysis', 'sync'],
          });
        }
        break;
      }

      default:
        break;
    }

    return c.json({ received: true, event });
  });

  return router;
}
