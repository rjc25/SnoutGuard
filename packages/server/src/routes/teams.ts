/**
 * Team management routes for the ArchGuard server.
 * Provides endpoints for listing members, inviting, removing,
 * and changing roles within an organization.
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { schema, generateId, now, type DbClient, type Role } from '@archguard/core';
import { requirePermission } from '../auth/rbac.js';
import type { AuthUser } from '../auth/rbac.js';
import { isRoleAtLeast, getValidRoles } from '../auth/roles.js';

/**
 * Create the teams router.
 *
 * @param db - Database client
 */
export function createTeamsRouter(db: DbClient): Hono {
  const router = new Hono();

  // ─── GET /api/teams - List team members ───────────────────────
  router.get('/', requirePermission('team:read'), async (c) => {
    const orgId = c.get('orgId') as string;

    // Get all org members with user details
    const memberRows = await db
      .select()
      .from(schema.orgMembers)
      .where(eq(schema.orgMembers.orgId, orgId));

    const members = [];
    for (const member of memberRows) {
      const userRows = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, member.userId))
        .limit(1);

      if (userRows.length > 0) {
        const user = userRows[0];
        members.push({
          memberId: member.id,
          userId: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          role: member.role,
          joinedAt: member.joinedAt,
        });
      }
    }

    return c.json({
      members,
      total: members.length,
    });
  });

  // ─── POST /api/teams/invite - Invite a member ────────────────
  router.post('/invite', requirePermission('team:invite'), async (c) => {
    const user = c.get('user') as AuthUser;
    const orgId = c.get('orgId') as string;
    const body = await c.req.json<{
      email: string;
      role?: Role;
    }>();

    if (!body.email) {
      return c.json({ error: 'email is required' }, 400);
    }

    // Validate role
    const role = body.role ?? 'member';
    const validRoles = getValidRoles();
    if (!validRoles.includes(role)) {
      return c.json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }, 400);
    }

    // Cannot invite someone as a role higher than your own
    if (!isRoleAtLeast(user.role, role)) {
      return c.json({ error: 'Cannot invite a user with a higher role than your own' }, 403);
    }

    // Check if user exists
    const existingUser = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, body.email))
      .limit(1);

    if (existingUser.length === 0) {
      // In production, send an invitation email.
      // For now, create a placeholder user.
      const newUserId = generateId();
      const timestamp = now();

      await db.insert(schema.users).values({
        id: newUserId,
        email: body.email,
        name: body.email.split('@')[0],
        authProvider: 'email',
        createdAt: timestamp,
      });

      await db.insert(schema.orgMembers).values({
        id: generateId(),
        orgId,
        userId: newUserId,
        role,
        joinedAt: timestamp,
      });

      return c.json(
        {
          message: 'User invited and added to the organization',
          userId: newUserId,
          role,
        },
        201
      );
    }

    const targetUserId = existingUser[0].id;

    // Check if already a member
    const existingMember = await db
      .select()
      .from(schema.orgMembers)
      .where(
        and(
          eq(schema.orgMembers.orgId, orgId),
          eq(schema.orgMembers.userId, targetUserId)
        )
      )
      .limit(1);

    if (existingMember.length > 0) {
      return c.json({ error: 'User is already a member of this organization' }, 409);
    }

    // Add member
    const memberId = generateId();
    await db.insert(schema.orgMembers).values({
      id: memberId,
      orgId,
      userId: targetUserId,
      role,
      joinedAt: now(),
    });

    return c.json(
      {
        message: 'User added to the organization',
        memberId,
        userId: targetUserId,
        role,
      },
      201
    );
  });

  // ─── DELETE /api/teams/:memberId - Remove a member ────────────
  router.delete('/:memberId', requirePermission('team:remove'), async (c) => {
    const user = c.get('user') as AuthUser;
    const orgId = c.get('orgId') as string;
    const memberId = c.req.param('memberId');

    // Load the target member
    const memberRows = await db
      .select()
      .from(schema.orgMembers)
      .where(
        and(
          eq(schema.orgMembers.id, memberId),
          eq(schema.orgMembers.orgId, orgId)
        )
      )
      .limit(1);

    if (memberRows.length === 0) {
      return c.json({ error: 'Member not found' }, 404);
    }

    const targetMember = memberRows[0];

    // Cannot remove yourself
    if (targetMember.userId === user.id) {
      return c.json({ error: 'Cannot remove yourself from the organization' }, 400);
    }

    // Cannot remove someone with a higher or equal role (unless you're owner)
    if (user.role !== 'owner' && isRoleAtLeast(targetMember.role as Role, user.role)) {
      return c.json({ error: 'Cannot remove a member with an equal or higher role' }, 403);
    }

    // Cannot remove the last owner
    if (targetMember.role === 'owner') {
      const ownerCount = await db
        .select()
        .from(schema.orgMembers)
        .where(
          and(
            eq(schema.orgMembers.orgId, orgId),
            eq(schema.orgMembers.role, 'owner')
          )
        );

      if (ownerCount.length <= 1) {
        return c.json({ error: 'Cannot remove the last owner of the organization' }, 400);
      }
    }

    await db
      .delete(schema.orgMembers)
      .where(eq(schema.orgMembers.id, memberId));

    return c.json({ memberId, message: 'Member removed from the organization' });
  });

  // ─── PUT /api/teams/:memberId/role - Change role ──────────────
  router.put('/:memberId/role', requirePermission('team:changeRole'), async (c) => {
    const user = c.get('user') as AuthUser;
    const orgId = c.get('orgId') as string;
    const memberId = c.req.param('memberId');
    const body = await c.req.json<{ role: Role }>();

    if (!body.role) {
      return c.json({ error: 'role is required' }, 400);
    }

    const validRoles = getValidRoles();
    if (!validRoles.includes(body.role)) {
      return c.json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }, 400);
    }

    // Load the target member
    const memberRows = await db
      .select()
      .from(schema.orgMembers)
      .where(
        and(
          eq(schema.orgMembers.id, memberId),
          eq(schema.orgMembers.orgId, orgId)
        )
      )
      .limit(1);

    if (memberRows.length === 0) {
      return c.json({ error: 'Member not found' }, 404);
    }

    const targetMember = memberRows[0];

    // Cannot change your own role
    if (targetMember.userId === user.id) {
      return c.json({ error: 'Cannot change your own role' }, 400);
    }

    // Cannot assign a role higher than your own
    if (!isRoleAtLeast(user.role, body.role)) {
      return c.json({ error: 'Cannot assign a role higher than your own' }, 403);
    }

    // Cannot demote someone with a higher role (unless you're owner)
    if (user.role !== 'owner' && isRoleAtLeast(targetMember.role as Role, user.role)) {
      return c.json({ error: 'Cannot change the role of a member with an equal or higher role' }, 403);
    }

    // Cannot demote the last owner
    if (targetMember.role === 'owner' && body.role !== 'owner') {
      const ownerCount = await db
        .select()
        .from(schema.orgMembers)
        .where(
          and(
            eq(schema.orgMembers.orgId, orgId),
            eq(schema.orgMembers.role, 'owner')
          )
        );

      if (ownerCount.length <= 1) {
        return c.json({ error: 'Cannot demote the last owner of the organization' }, 400);
      }
    }

    await db
      .update(schema.orgMembers)
      .set({ role: body.role })
      .where(eq(schema.orgMembers.id, memberId));

    return c.json({
      memberId,
      role: body.role,
      message: 'Member role updated',
    });
  });

  return router;
}
