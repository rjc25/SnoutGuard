/**
 * Rate limiting middleware for Hono.
 * Implements a simple sliding-window rate limiter using in-memory storage.
 * In production, replace with a Redis-backed implementation.
 */

import type { Context, Next } from 'hono';

// ─── Types ────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** Maximum number of requests allowed in the window */
  max: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Custom key extractor. Defaults to IP + user ID */
  keyGenerator?: (c: Context) => string;
  /** Custom response when rate limited */
  message?: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────

const store = new Map<string, RateLimitEntry>();

/** Periodically clean up expired entries (every 60 seconds) */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 60_000);

// ─── Default Key Generator ───────────────────────────────────────

function defaultKeyGenerator(c: Context): string {
  const user = c.get('user') as { id: string } | undefined;
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'unknown';

  return user ? `user:${user.id}` : `ip:${ip}`;
}

// ─── Middleware Factory ───────────────────────────────────────────

/**
 * Create a rate limiting middleware.
 *
 * @param options - Rate limit configuration
 * @returns Hono middleware function
 *
 * @example
 * ```ts
 * app.use('/api/analysis/trigger', rateLimit({ max: 10, windowMs: 60_000 }));
 * ```
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    max,
    windowMs,
    keyGenerator = defaultKeyGenerator,
    message = 'Too many requests, please try again later',
  } = options;

  return async (c: Context, next: Next) => {
    const key = keyGenerator(c);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      // New window
      store.set(key, { count: 1, resetAt: now + windowMs });
      setRateLimitHeaders(c, max, max - 1, now + windowMs);
      await next();
      return;
    }

    if (entry.count >= max) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      setRateLimitHeaders(c, max, 0, entry.resetAt);
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'Rate limit exceeded', message, retryAfter }, 429);
    }

    // Increment counter
    entry.count++;
    setRateLimitHeaders(c, max, max - entry.count, entry.resetAt);
    await next();
  };
}

/**
 * Set standard rate limit response headers.
 */
function setRateLimitHeaders(
  c: Context,
  limit: number,
  remaining: number,
  resetAt: number
): void {
  c.header('X-RateLimit-Limit', String(limit));
  c.header('X-RateLimit-Remaining', String(Math.max(0, remaining)));
  c.header('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
}

// ─── Preset Configurations ───────────────────────────────────────

/** Standard API rate limit: 100 requests per minute */
export const standardLimit = rateLimit({ max: 100, windowMs: 60_000 });

/** Strict rate limit for write operations: 20 requests per minute */
export const strictLimit = rateLimit({ max: 20, windowMs: 60_000 });

/** Analysis trigger rate limit: 5 requests per minute */
export const analysisLimit = rateLimit({
  max: 5,
  windowMs: 60_000,
  message: 'Analysis trigger rate limit exceeded. Please wait before triggering another analysis.',
});
