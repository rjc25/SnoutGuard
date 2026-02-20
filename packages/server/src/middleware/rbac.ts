/**
 * Permission check middleware for Hono.
 * Re-exports RBAC middleware from the auth module for convenient access
 * in route definitions.
 */

export {
  requirePermission,
  requireRole,
  requireAnyPermission,
} from '../auth/rbac.js';
