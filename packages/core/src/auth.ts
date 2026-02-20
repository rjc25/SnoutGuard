/**
 * Shared auth types and RBAC helpers.
 * Defines role-based access control permissions used across the platform.
 */

import type { Role } from './types.js';

/** Permission string format: "resource:action" or "resource:action:scope" */
export type Permission = string;

/** Full permission map by role */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ['*'],
  admin: [
    'decisions:read',
    'decisions:write',
    'decisions:confirm',
    'decisions:deprecate',
    'reviews:read',
    'reviews:trigger',
    'velocity:read',
    'summaries:read',
    'summaries:generate',
    'team:read',
    'team:invite',
    'team:remove',
    'repos:read',
    'repos:connect',
    'repos:disconnect',
    'settings:read',
    'settings:write',
    'rules:read',
    'rules:write',
    'integrations:read',
    'integrations:write',
  ],
  member: [
    'decisions:read',
    'decisions:write',
    'decisions:confirm',
    'reviews:read',
    'reviews:trigger',
    'velocity:read:own',
    'summaries:read:own',
    'repos:read',
    'rules:read',
  ],
  viewer: ['decisions:read', 'reviews:read', 'repos:read'],
};

/**
 * Check if a role has a specific permission.
 * Owner role has wildcard access to everything.
 * Permissions with ":own" scope only allow access to the user's own data.
 */
export function hasPermission(
  role: Role,
  permission: Permission,
  ownerId?: string,
  requesterId?: string
): boolean {
  const rolePerms = ROLE_PERMISSIONS[role];
  if (!rolePerms) return false;

  // Owner has all permissions
  if (rolePerms.includes('*')) return true;

  // Direct permission match
  if (rolePerms.includes(permission)) return true;

  // Check scoped permission (e.g., "velocity:read:own" matches "velocity:read" for own data)
  const ownPermission = `${permission}:own`;
  if (rolePerms.includes(ownPermission)) {
    return ownerId !== undefined && requesterId !== undefined && ownerId === requesterId;
  }

  return false;
}

/**
 * Get all permissions for a role as a flat list.
 * Expands wildcard for owner role.
 */
export function getRolePermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Check if a role is at least as privileged as another role.
 */
export function isRoleAtLeast(role: Role, minRole: Role): boolean {
  const hierarchy: Role[] = ['viewer', 'member', 'admin', 'owner'];
  return hierarchy.indexOf(role) >= hierarchy.indexOf(minRole);
}
