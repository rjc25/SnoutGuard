/**
 * Auth middleware for Hono.
 * Validates session tokens and attaches the authenticated user
 * to the request context for downstream handlers.
 */

import type { Context, Next } from 'hono';
import type { DbClient } from '@snoutguard/core';
import {
  extractSessionToken,
  validateSession,
  resolveUser,
} from '../auth/index.js';

/**
 * Create auth middleware that validates the session and attaches the user to context.
 * Skips authentication for public routes (login, signup, webhooks, health).
 *
 * @param db - Database client for user/membership lookups
 * @param publicPaths - List of path prefixes that don't require authentication
 */
export function authMiddleware(
  db: DbClient,
  publicPaths: string[] = [
    '/api/auth/login',
    '/api/auth/signup',
    '/api/webhooks/',
    '/api/health',
  ]
) {
  return async (c: Context, next: Next) => {
    const path = c.req.path;

    // In local/CLI mode, auth can be disabled entirely
    if (process.env.SNOUTGUARD_DISABLE_AUTH === 'true') {
      await next();
      return;
    }

    // Skip auth for public paths
    if (publicPaths.some((pp) => path.startsWith(pp))) {
      await next();
      return;
    }

    // Extract session token
    const token = extractSessionToken(c);
    if (!token) {
      return c.json(
        { error: 'Authentication required', message: 'No session token provided' },
        401
      );
    }

    // Validate session
    const session = validateSession(token);
    if (!session) {
      return c.json(
        { error: 'Authentication required', message: 'Invalid or expired session' },
        401
      );
    }

    // Resolve full user object with role
    const user = await resolveUser(db, session.userId, session.orgId);
    if (!user) {
      return c.json(
        { error: 'Authentication required', message: 'User or membership not found' },
        401
      );
    }

    // Attach user and orgId to context
    c.set('user', user);
    c.set('orgId', user.orgId);

    await next();
  };
}
