/**
 * RBAC (Role-Based Access Control) middleware for Hono.
 * Checks permissions based on the authenticated user's role within
 * the current organization context, using hasPermission from @archguard/core.
 */

import type { Context, Next } from 'hono';
import { hasPermission, type Permission, type Role } from '@archguard/core';
import { isRoleAtLeast } from './roles.js';

/** When true, all permission/role checks are bypassed (local CLI mode) */
function isAuthDisabled(): boolean {
  return process.env.ARCHGUARD_DISABLE_AUTH === 'true';
}

/** Shape of the auth user stored on the Hono context */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  orgId: string;
  role: Role;
}

/**
 * Create an RBAC middleware that requires a specific permission.
 */
export function requirePermission(
  permission: Permission,
  options?: { ownerIdParam?: string }
) {
  return async (c: Context, next: Next) => {
    if (isAuthDisabled()) { await next(); return; }

    const user = c.get('user') as AuthUser | undefined;
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    let ownerId: string | undefined;
    if (options?.ownerIdParam) {
      ownerId = c.req.param(options.ownerIdParam) ?? undefined;
    }

    const allowed = hasPermission(user.role, permission, ownerId, user.id);
    if (!allowed) {
      return c.json(
        { error: 'Forbidden', message: `Insufficient permissions. Required: ${permission}` },
        403
      );
    }

    await next();
  };
}

/**
 * Create an RBAC middleware that requires a minimum role level.
 */
export function requireRole(minimumRole: Role) {
  return async (c: Context, next: Next) => {
    if (isAuthDisabled()) { await next(); return; }

    const user = c.get('user') as AuthUser | undefined;
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!isRoleAtLeast(user.role, minimumRole)) {
      return c.json(
        { error: 'Forbidden', message: `Minimum role required: ${minimumRole}` },
        403
      );
    }

    await next();
  };
}

/**
 * Create a middleware that checks multiple permissions (ANY match = allowed).
 */
export function requireAnyPermission(permissions: Permission[]) {
  return async (c: Context, next: Next) => {
    if (isAuthDisabled()) { await next(); return; }

    const user = c.get('user') as AuthUser | undefined;
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const hasAny = permissions.some((perm) =>
      hasPermission(user.role, perm, undefined, user.id)
    );

    if (!hasAny) {
      return c.json(
        { error: 'Forbidden', message: `Insufficient permissions. Required one of: ${permissions.join(', ')}` },
        403
      );
    }

    await next();
  };
}
