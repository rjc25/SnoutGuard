/**
 * RBAC (Role-Based Access Control) middleware for Hono.
 * Checks permissions based on the authenticated user's role within
 * the current organization context, using hasPermission from @archguard/core.
 */

import type { Context, Next } from 'hono';
import { hasPermission, type Permission, type Role } from '@archguard/core';
import { isRoleAtLeast } from './roles.js';

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
 * The middleware reads the user from context variables (set by auth middleware)
 * and checks if their role grants the requested permission.
 *
 * @param permission - The permission string to check (e.g., "decisions:write")
 * @param options - Optional configuration for scoped checks
 */
export function requirePermission(
  permission: Permission,
  options?: { ownerIdParam?: string }
) {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as AuthUser | undefined;
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // For scoped permissions (e.g., velocity:read:own), extract the owner ID
    let ownerId: string | undefined;
    if (options?.ownerIdParam) {
      ownerId = c.req.param(options.ownerIdParam) ?? undefined;
    }

    const allowed = hasPermission(user.role, permission, ownerId, user.id);
    if (!allowed) {
      return c.json(
        {
          error: 'Forbidden',
          message: `Insufficient permissions. Required: ${permission}`,
        },
        403
      );
    }

    await next();
  };
}

/**
 * Create an RBAC middleware that requires a minimum role level.
 * This is a simpler alternative to permission-based checks for
 * broad access control (e.g., "admin or above").
 *
 * @param minimumRole - The minimum role required (e.g., "admin")
 */
export function requireRole(minimumRole: Role) {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as AuthUser | undefined;
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!isRoleAtLeast(user.role, minimumRole)) {
      return c.json(
        {
          error: 'Forbidden',
          message: `Minimum role required: ${minimumRole}`,
        },
        403
      );
    }

    await next();
  };
}

/**
 * Create a middleware that checks multiple permissions (ANY match = allowed).
 * Useful for endpoints that can be accessed by different permission sets.
 */
export function requireAnyPermission(permissions: Permission[]) {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as AuthUser | undefined;
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const hasAny = permissions.some((perm) =>
      hasPermission(user.role, perm, undefined, user.id)
    );

    if (!hasAny) {
      return c.json(
        {
          error: 'Forbidden',
          message: `Insufficient permissions. Required one of: ${permissions.join(', ')}`,
        },
        403
      );
    }

    await next();
  };
}
