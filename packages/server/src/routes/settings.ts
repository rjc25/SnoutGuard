/**
 * Settings routes for the SnoutGuard server.
 * Provides endpoints for reading and updating organization settings.
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { schema, now, type DbClient } from '@snoutguard/core';
import { requirePermission } from '../auth/rbac.js';
import type { AuthUser } from '../auth/rbac.js';

/**
 * Create the settings router.
 *
 * @param db - Database client
 */
export function createSettingsRouter(db: DbClient): Hono {
  const router = new Hono();

  // ─── GET /api/settings - Get organization settings ────────────
  router.get('/', requirePermission('settings:read'), async (c) => {
    const orgId = c.get('orgId') as string;

    // Load organization
    const orgRows = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1);

    if (orgRows.length === 0) {
      return c.json({ error: 'Organization not found' }, 404);
    }

    const org = orgRows[0];
    const settings = JSON.parse(org.settings ?? '{}');

    // Load connected repositories count
    const repoRows = await db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.orgId, orgId));

    // Load member count
    const memberRows = await db
      .select()
      .from(schema.orgMembers)
      .where(eq(schema.orgMembers.orgId, orgId));

    return c.json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
      },
      stats: {
        repositoriesCount: repoRows.length,
        membersCount: memberRows.length,
      },
      settings: {
        analysis: {
          llmAnalysis: settings.llmAnalysis ?? true,
          analysisPeriodMonths: settings.analysisPeriodMonths ?? 6,
          maxFileSizeKb: settings.maxFileSizeKb ?? 500,
          languages: settings.languages ?? ['typescript'],
        },
        review: {
          severityThreshold: settings.severityThreshold ?? 'warning',
          maxViolations: settings.maxViolations ?? 50,
          autoFixSuggestions: settings.autoFixSuggestions ?? true,
          autoReviewPrs: settings.autoReviewPrs ?? true,
        },
        velocity: {
          enabled: settings.velocityEnabled ?? true,
          calculationSchedule: settings.calculationSchedule ?? '0 0 * * *',
          complexityWeight: settings.complexityWeight ?? 0.4,
          archImpactWeight: settings.archImpactWeight ?? 0.3,
          reviewWeight: settings.reviewWeight ?? 0.15,
          refactoringWeight: settings.refactoringWeight ?? 0.15,
          stalePrDays: settings.stalePrDays ?? 3,
          longBranchDays: settings.longBranchDays ?? 7,
        },
        summaries: {
          enabled: settings.summariesEnabled ?? true,
          schedules: settings.schedules ?? [],
        },
        sync: {
          formats: settings.syncFormats ?? ['claude', 'cursorrules'],
          preserveUserSections: settings.preserveUserSections ?? true,
          autoCommit: settings.autoCommit ?? false,
          autoPr: settings.autoPr ?? false,
        },
        notifications: {
          slack: settings.slack ?? null,
        },
      },
    });
  });

  // ─── PUT /api/settings - Update organization settings ─────────
  router.put('/', requirePermission('settings:write'), async (c) => {
    const orgId = c.get('orgId') as string;
    const body = await c.req.json<{
      name?: string;
      settings?: Record<string, unknown>;
    }>();

    // Load current org
    const orgRows = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1);

    if (orgRows.length === 0) {
      return c.json({ error: 'Organization not found' }, 404);
    }

    const org = orgRows[0];
    const currentSettings = JSON.parse(org.settings ?? '{}');
    const timestamp = now();

    // Merge settings (shallow merge at top level)
    const updates: Record<string, unknown> = { updatedAt: timestamp };

    if (body.name !== undefined) {
      updates.name = body.name;
      // Update slug when name changes
      updates.slug = body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    }

    if (body.settings !== undefined) {
      const mergedSettings = { ...currentSettings, ...body.settings };
      updates.settings = JSON.stringify(mergedSettings);
    }

    await db
      .update(schema.organizations)
      .set(updates)
      .where(eq(schema.organizations.id, orgId));

    return c.json({
      message: 'Settings updated',
      updatedAt: timestamp,
    });
  });

  return router;
}
