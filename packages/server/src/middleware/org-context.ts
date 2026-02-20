/**
 * Multi-tenant organization resolution middleware for Hono.
 * Resolves the current organization from the request context
 * and attaches org details for downstream handlers.
 */

import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { schema, type DbClient } from '@archguard/core';
import type { AuthUser } from '../auth/rbac.js';

// ─── Types ────────────────────────────────────────────────────────

/** Organization context attached to the request */
export interface OrgContext {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: Record<string, unknown>;
}

// ─── Middleware Factory ───────────────────────────────────────────

/**
 * Create middleware that resolves the organization context from the authenticated user.
 * The org ID comes from the auth session. This middleware loads full org details
 * and attaches them to the Hono context as 'org'.
 *
 * Must be placed AFTER auth middleware in the middleware chain.
 *
 * @param db - Database client for organization lookups
 */
export function orgContextMiddleware(db: DbClient) {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as AuthUser | undefined;

    // If no authenticated user, skip org resolution (public routes)
    if (!user) {
      await next();
      return;
    }

    const orgId = user.orgId;
    if (!orgId) {
      return c.json(
        { error: 'Organization context required', message: 'No organization associated with session' },
        400
      );
    }

    // Look up the organization
    const orgRows = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1);

    if (orgRows.length === 0) {
      return c.json(
        { error: 'Organization not found', message: `Organization ${orgId} does not exist` },
        404
      );
    }

    const org = orgRows[0];

    // Parse settings JSON
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(org.settings ?? '{}');
    } catch {
      settings = {};
    }

    // Attach org context
    const orgContext: OrgContext = {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      settings,
    };

    c.set('org', orgContext);
    c.set('orgId', org.id);

    await next();
  };
}

/**
 * Helper to extract the OrgContext from a Hono context.
 * Throws if org is not set (middleware not applied or public route).
 */
export function getOrgContext(c: Context): OrgContext {
  const org = c.get('org') as OrgContext | undefined;
  if (!org) {
    throw new Error('Organization context not available. Ensure orgContextMiddleware is applied.');
  }
  return org;
}
