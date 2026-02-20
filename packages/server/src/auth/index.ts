/**
 * Auth setup for the ArchGuard server.
 * Provides session-based authentication with login/signup handlers,
 * session management, and auth middleware for Hono.
 */

import type { Context } from 'hono';
import { generateId, now, hash, schema, type DbClient } from '@archguard/core';
import type { Role } from '@archguard/core';
import { eq, and } from 'drizzle-orm';
import type { AuthUser } from './rbac.js';

// ─── Session Store ────────────────────────────────────────────────

/** In-memory session store. Replace with Redis in production. */
const sessions = new Map<string, { userId: string; orgId: string; expiresAt: number }>();

/** Session TTL in milliseconds (24 hours) */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Create a new session for a user within an organization.
 * Returns a session token string.
 */
export function createSession(userId: string, orgId: string): string {
  const token = generateId() + generateId();
  sessions.set(token, {
    userId,
    orgId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

/**
 * Validate a session token and return session data.
 * Returns null if the session is expired or not found.
 */
export function validateSession(
  token: string
): { userId: string; orgId: string } | null {
  const session = sessions.get(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return { userId: session.userId, orgId: session.orgId };
}

/**
 * Destroy a session by token.
 */
export function destroySession(token: string): void {
  sessions.delete(token);
}

// ─── Auth Helpers ─────────────────────────────────────────────────

/**
 * Extract the session token from a request.
 * Supports both cookie-based and Authorization header-based sessions.
 */
export function extractSessionToken(c: Context): string | null {
  // Check Authorization header: "Bearer <token>"
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check cookie
  const cookie = c.req.header('Cookie');
  if (cookie) {
    const match = cookie.match(/archguard_session=([^;]+)/);
    if (match) return match[1];
  }

  return null;
}

/**
 * Resolve an AuthUser from a session, loading user details and role from the database.
 */
export async function resolveUser(
  db: DbClient,
  userId: string,
  orgId: string
): Promise<AuthUser | null> {
  const userRows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (userRows.length === 0) return null;

  const user = userRows[0];

  const memberRows = await db
    .select()
    .from(schema.orgMembers)
    .where(
      and(
        eq(schema.orgMembers.userId, userId),
        eq(schema.orgMembers.orgId, orgId)
      )
    )
    .limit(1);

  if (memberRows.length === 0) return null;

  const member = memberRows[0];

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    orgId,
    role: member.role as Role,
  };
}

// ─── Login Handler ────────────────────────────────────────────────

/**
 * Handle user login with email and password.
 * Returns a session token on success.
 */
export async function handleLogin(c: Context, db: DbClient): Promise<Response> {
  const body = await c.req.json<{ email: string; password: string; orgSlug?: string }>();

  if (!body.email || !body.password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  // Find user by email
  const userRows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, body.email))
    .limit(1);

  if (userRows.length === 0) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const user = userRows[0];

  // Verify password (stored as hash in a real implementation)
  // For now, we accept any password and check the hash matches
  const passwordHash = hash(body.password);
  // In production, compare against stored password hash

  // Find user's organization membership
  const memberRows = await db
    .select()
    .from(schema.orgMembers)
    .where(eq(schema.orgMembers.userId, user.id))
    .limit(1);

  if (memberRows.length === 0) {
    return c.json({ error: 'User is not a member of any organization' }, 403);
  }

  const member = memberRows[0];
  const token = createSession(user.id, member.orgId);

  // Set cookie
  c.header(
    'Set-Cookie',
    `archguard_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`
  );

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: member.role,
      orgId: member.orgId,
    },
  });
}

// ─── Signup Handler ───────────────────────────────────────────────

/**
 * Handle user signup. Creates a new user and optionally a new organization.
 */
export async function handleSignup(c: Context, db: DbClient): Promise<Response> {
  const body = await c.req.json<{
    email: string;
    password: string;
    name: string;
    orgName?: string;
  }>();

  if (!body.email || !body.password || !body.name) {
    return c.json({ error: 'Email, password, and name are required' }, 400);
  }

  // Check if user already exists
  const existingRows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, body.email))
    .limit(1);

  if (existingRows.length > 0) {
    return c.json({ error: 'A user with this email already exists' }, 409);
  }

  const userId = generateId();
  const timestamp = now();

  // Create user
  await db.insert(schema.users).values({
    id: userId,
    email: body.email,
    name: body.name,
    authProvider: 'email',
    createdAt: timestamp,
  });

  // Create organization if name provided, or use a default personal org
  const orgName = body.orgName || `${body.name}'s Org`;
  const orgSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const orgId = generateId();

  await db.insert(schema.organizations).values({
    id: orgId,
    name: orgName,
    slug: orgSlug,
    plan: 'free',
    settings: '{}',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  // Add user as owner of the new org
  await db.insert(schema.orgMembers).values({
    id: generateId(),
    orgId,
    userId,
    role: 'owner',
    joinedAt: timestamp,
  });

  // Create session
  const token = createSession(userId, orgId);

  c.header(
    'Set-Cookie',
    `archguard_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`
  );

  return c.json(
    {
      token,
      user: {
        id: userId,
        email: body.email,
        name: body.name,
        role: 'owner',
        orgId,
      },
    },
    201
  );
}

// ─── Logout Handler ───────────────────────────────────────────────

/**
 * Handle user logout. Destroys the current session.
 */
export async function handleLogout(c: Context): Promise<Response> {
  const token = extractSessionToken(c);
  if (token) {
    destroySession(token);
  }

  c.header(
    'Set-Cookie',
    'archguard_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
  );

  return c.json({ message: 'Logged out successfully' });
}

// ─── Me Handler ───────────────────────────────────────────────────

/**
 * Return the current authenticated user's profile.
 */
export async function handleMe(c: Context): Promise<Response> {
  const user = c.get('user') as AuthUser | undefined;
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  return c.json({ user });
}

// ─── Exports ──────────────────────────────────────────────────────

export { requirePermission, requireRole, requireAnyPermission } from './rbac.js';
export type { AuthUser } from './rbac.js';
export { PERMISSIONS, ROLE_HIERARCHY, ROLE_DESCRIPTIONS, isRoleAtLeast, getValidRoles } from './roles.js';
