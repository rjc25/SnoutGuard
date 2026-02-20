/**
 * Role definitions and permission mappings for the ArchGuard server.
 * Defines the four roles (owner, admin, member, viewer) and their
 * associated permissions used for RBAC enforcement.
 */

import type { Role } from '@archguard/core';

/** All permissions available in the system, grouped by resource */
export const PERMISSIONS = {
  decisions: ['decisions:read', 'decisions:write', 'decisions:confirm', 'decisions:deprecate', 'decisions:delete'],
  analysis: ['analysis:trigger', 'analysis:read'],
  reviews: ['reviews:read', 'reviews:trigger'],
  velocity: ['velocity:read'],
  summaries: ['summaries:read', 'summaries:generate', 'summaries:edit'],
  team: ['team:read', 'team:invite', 'team:remove', 'team:changeRole'],
  repos: ['repos:read', 'repos:connect', 'repos:disconnect'],
  settings: ['settings:read', 'settings:write'],
  webhooks: ['webhooks:manage'],
  integrations: ['integrations:read', 'integrations:write'],
} as const;

/** Role hierarchy from least to most privileged */
export const ROLE_HIERARCHY: Role[] = ['viewer', 'member', 'admin', 'owner'];

/** Human-readable description for each role */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Full access to all resources and settings. Can manage billing and delete the organization.',
  admin: 'Can manage team members, repositories, settings, and trigger all operations.',
  member: 'Can view and create decisions, trigger analyses and reviews, and view own velocity.',
  viewer: 'Read-only access to decisions, reviews, and repository information.',
};

/**
 * Get the numeric index of a role in the hierarchy.
 * Higher index means more privileged.
 */
export function getRoleLevel(role: Role): number {
  return ROLE_HIERARCHY.indexOf(role);
}

/**
 * Check if the first role is at least as privileged as the second.
 */
export function isRoleAtLeast(role: Role, minimum: Role): boolean {
  return getRoleLevel(role) >= getRoleLevel(minimum);
}

/**
 * Get all valid role values.
 */
export function getValidRoles(): Role[] {
  return [...ROLE_HIERARCHY];
}
