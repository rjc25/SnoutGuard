/**
 * Velocity routes for the SnoutGuard server.
 * Provides endpoints for viewing team velocity, developer velocity,
 * and current blockers.
 */

import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { schema, type DbClient } from '@snoutguard/core';
import { requirePermission } from '../auth/rbac.js';
import type { AuthUser } from '../auth/rbac.js';

/**
 * Create the velocity router.
 *
 * @param db - Database client
 */
export function createVelocityRouter(db: DbClient): Hono {
  const router = new Hono();

  // ─── GET /api/velocity/team - Team velocity ───────────────────
  router.get('/team', requirePermission('velocity:read'), async (c) => {
    const orgId = c.get('orgId') as string;
    const period = c.req.query('period') ?? 'weekly';
    const repoId = c.req.query('repoId');

    // Get developers for this org
    const devRows = await db
      .select()
      .from(schema.developers)
      .where(eq(schema.developers.orgId, orgId));

    if (devRows.length === 0) {
      return c.json({
        teamVelocityScore: 0,
        members: [],
        topBlockers: [],
        architecturalHealth: 0,
        highlights: [],
      });
    }

    // Get latest velocity scores for each developer
    const memberScores = [];
    for (const dev of devRows) {
      const filter = repoId
        ? and(
            eq(schema.velocityScores.developerId, dev.id),
            eq(schema.velocityScores.repoId, repoId),
            eq(schema.velocityScores.period, period)
          )
        : and(
            eq(schema.velocityScores.developerId, dev.id),
            eq(schema.velocityScores.period, period)
          );

      const scoreRows = await db
        .select()
        .from(schema.velocityScores)
        .where(filter)
        .orderBy(desc(schema.velocityScores.calculatedAt))
        .limit(1);

      if (scoreRows.length > 0) {
        const score = scoreRows[0];
        memberScores.push({
          developerId: dev.id,
          developerName: dev.gitName,
          period: score.period,
          periodStart: score.periodStart,
          periodEnd: score.periodEnd,
          commits: score.commits,
          prsOpened: score.prsOpened,
          prsMerged: score.prsMerged,
          linesAdded: score.linesAdded,
          linesRemoved: score.linesRemoved,
          weightedEffort: score.weightedEffort,
          architecturalImpact: score.architecturalImpact,
          refactoringRatio: score.refactoringRatio,
          reviewContribution: score.reviewContribution,
          velocityScore: score.velocityScore,
          trend: score.trend,
          blockers: JSON.parse(score.blockers ?? '[]'),
        });
      }
    }

    // Calculate team aggregate
    const teamVelocityScore =
      memberScores.length > 0
        ? memberScores.reduce((sum, m) => sum + m.velocityScore, 0) / memberScores.length
        : 0;

    // Collect all blockers
    const allBlockers = memberScores.flatMap((m) => m.blockers);

    // Sort blockers by severity
    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    allBlockers.sort(
      (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
    );

    // Calculate architectural health from drift scores
    let architecturalHealth = 100;
    if (repoId) {
      const snapshotRows = await db
        .select()
        .from(schema.archSnapshots)
        .where(eq(schema.archSnapshots.repoId, repoId))
        .orderBy(desc(schema.archSnapshots.createdAt))
        .limit(1);

      if (snapshotRows.length > 0) {
        architecturalHealth = Math.max(0, 100 - snapshotRows[0].driftScore * 100);
      }
    }

    // Build highlights
    const highlights: string[] = [];
    if (memberScores.length > 0) {
      const topPerformer = memberScores.reduce((a, b) =>
        a.velocityScore > b.velocityScore ? a : b
      );
      highlights.push(`Top contributor: ${topPerformer.developerName} (score: ${topPerformer.velocityScore.toFixed(1)})`);
    }
    const highBlockers = allBlockers.filter((b) => b.severity === 'high');
    if (highBlockers.length > 0) {
      highlights.push(`${highBlockers.length} high-severity blockers need attention`);
    }

    return c.json({
      teamVelocityScore: Math.round(teamVelocityScore * 100) / 100,
      members: memberScores,
      topBlockers: allBlockers.slice(0, 10),
      architecturalHealth: Math.round(architecturalHealth * 100) / 100,
      highlights,
    });
  });

  // ─── GET /api/velocity/dev/:id - Developer velocity ───────────
  router.get('/dev/:id', requirePermission('velocity:read'), async (c) => {
    const developerId = c.req.param('id');
    const period = c.req.query('period') ?? 'weekly';
    const limit = parseInt(c.req.query('limit') ?? '10', 10);

    // Load velocity scores for this developer
    const scoreRows = await db
      .select()
      .from(schema.velocityScores)
      .where(
        and(
          eq(schema.velocityScores.developerId, developerId),
          eq(schema.velocityScores.period, period)
        )
      )
      .orderBy(desc(schema.velocityScores.calculatedAt))
      .limit(limit);

    if (scoreRows.length === 0) {
      return c.json({ error: 'No velocity data found for this developer' }, 404);
    }

    // Load developer info
    const devRows = await db
      .select()
      .from(schema.developers)
      .where(eq(schema.developers.id, developerId))
      .limit(1);

    const developer = devRows.length > 0
      ? { id: devRows[0].id, name: devRows[0].gitName, email: devRows[0].gitEmail }
      : { id: developerId, name: 'Unknown', email: '' };

    const scores = scoreRows.map((s) => ({
      period: s.period,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      commits: s.commits,
      prsOpened: s.prsOpened,
      prsMerged: s.prsMerged,
      linesAdded: s.linesAdded,
      linesRemoved: s.linesRemoved,
      weightedEffort: s.weightedEffort,
      architecturalImpact: s.architecturalImpact,
      refactoringRatio: s.refactoringRatio,
      reviewContribution: s.reviewContribution,
      velocityScore: s.velocityScore,
      trend: s.trend,
      blockers: JSON.parse(s.blockers ?? '[]'),
    }));

    return c.json({
      developer,
      scores,
      latestScore: scores[0],
    });
  });

  // ─── GET /api/velocity/blockers - Current blockers ────────────
  router.get('/blockers', requirePermission('velocity:read'), async (c) => {
    const orgId = c.get('orgId') as string;
    const severity = c.req.query('severity');

    // Get all developers in the org
    const devRows = await db
      .select()
      .from(schema.developers)
      .where(eq(schema.developers.orgId, orgId));

    // Get latest velocity scores to extract blockers
    const allBlockers: Array<{
      type: string;
      description: string;
      severity: string;
      relatedEntity: string;
      staleSince?: string;
      developerId: string;
      developerName: string;
    }> = [];

    for (const dev of devRows) {
      const scoreRows = await db
        .select()
        .from(schema.velocityScores)
        .where(eq(schema.velocityScores.developerId, dev.id))
        .orderBy(desc(schema.velocityScores.calculatedAt))
        .limit(1);

      if (scoreRows.length > 0) {
        const blockers = JSON.parse(scoreRows[0].blockers ?? '[]');
        for (const blocker of blockers) {
          allBlockers.push({
            ...blocker,
            developerId: dev.id,
            developerName: dev.gitName,
          });
        }
      }
    }

    // Filter by severity if specified
    const filtered = severity
      ? allBlockers.filter((b) => b.severity === severity)
      : allBlockers;

    // Sort by severity
    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    filtered.sort(
      (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
    );

    return c.json({
      blockers: filtered,
      total: filtered.length,
      bySeverity: {
        high: filtered.filter((b) => b.severity === 'high').length,
        medium: filtered.filter((b) => b.severity === 'medium').length,
        low: filtered.filter((b) => b.severity === 'low').length,
      },
    });
  });

  return router;
}
