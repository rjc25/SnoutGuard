/**
 * @snoutguard/server - Hono API Server
 * Main entrypoint for the SnoutGuard API server with auth, routes, and job queue.
 *
 * Architecture:
 * - Hono for HTTP routing and middleware
 * - BullMQ + Redis for async job processing
 * - SQLite (via Drizzle ORM) for persistence
 * - Session-based auth with RBAC
 * - SSE for real-time dashboard updates
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { initializeDatabase } from '@snoutguard/core';

// Middleware
import { authMiddleware } from './middleware/auth.js';
import { orgContextMiddleware } from './middleware/org-context.js';
import { standardLimit } from './middleware/rate-limit.js';

// Auth handlers
import { handleLogin, handleSignup, handleLogout, handleMe } from './auth/index.js';
import { handleSamlLogin, handleSamlMetadata } from './auth/saml.js';

// Route factories
import { createDecisionsRouter } from './routes/decisions.js';
import { createAnalysisRouter } from './routes/analysis.js';
import { createReviewsRouter } from './routes/reviews.js';
import { createVelocityRouter } from './routes/velocity.js';
import { createSummariesRouter } from './routes/summaries.js';
import { createTeamsRouter } from './routes/teams.js';
import { createReposRouter } from './routes/repos.js';
import { createSettingsRouter } from './routes/settings.js';
import { createSyncRouter } from './routes/sync.js';
import { createWebhooksRouter } from './routes/webhooks.js';
import { createSSERouter } from './routes/sse.js';

// Jobs
import { registerAnalysisWorker } from './jobs/analyze.job.js';
import { registerReviewWorker } from './jobs/review.job.js';
import { registerVelocityWorker } from './jobs/velocity.job.js';
import { registerSummaryWorker } from './jobs/summary.job.js';
import { registerSyncWorker } from './jobs/sync.job.js';
import { shutdownQueues } from './jobs/queue.js';

// ─── Database ─────────────────────────────────────────────────────

const dbPath = process.env.DATABASE_PATH ?? undefined;
const db = initializeDatabase(dbPath);

// ─── App ──────────────────────────────────────────────────────────

const app = new Hono();

// ─── Global Middleware ────────────────────────────────────────────

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3001',
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    exposeHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
  })
);

// ─── Health Check ─────────────────────────────────────────────────

app.get('/api/health', (c) =>
  c.json({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  })
);

// ─── Auth Routes (public) ─────────────────────────────────────────

app.post('/api/auth/login', (c) => handleLogin(c, db));
app.post('/api/auth/signup', (c) => handleSignup(c, db));
app.post('/api/auth/logout', (c) => handleLogout(c));

// ─── SAML Routes (public) ────────────────────────────────────────

app.get('/api/auth/saml/:orgSlug/login', (c) => handleSamlLogin(c, db));
app.get('/api/auth/saml/:orgSlug/metadata', (c) => handleSamlMetadata(c));

// ─── Webhook Routes (public, signature-verified) ──────────────────

app.route('/api/webhooks', createWebhooksRouter(db));

// ─── Protected Routes Middleware ──────────────────────────────────

// Apply rate limiting to all API routes
app.use('/api/*', standardLimit);

// Apply auth middleware (skips public paths automatically)
app.use('/api/*', authMiddleware(db));

// Apply org context middleware
app.use('/api/*', orgContextMiddleware(db));

// ─── Auth Profile Route ──────────────────────────────────────────

app.get('/api/auth/me', (c) => handleMe(c));

// ─── API Routes ──────────────────────────────────────────────────

app.route('/api/decisions', createDecisionsRouter(db));
app.route('/api/analysis', createAnalysisRouter(db));
app.route('/api/reviews', createReviewsRouter(db));
app.route('/api/velocity', createVelocityRouter(db));
app.route('/api/summaries', createSummariesRouter(db));
app.route('/api/teams', createTeamsRouter(db));
app.route('/api/repos', createReposRouter(db));
app.route('/api/settings', createSettingsRouter(db));
app.route('/api/sync', createSyncRouter(db));
app.route('/api/events', createSSERouter());

// ─── 404 Handler ──────────────────────────────────────────────────

app.notFound((c) =>
  c.json(
    {
      error: 'Not Found',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404
  )
);

// ─── Error Handler ────────────────────────────────────────────────

app.onError((err, c) => {
  console.error(`[error] ${c.req.method} ${c.req.path}:`, err.message);
  return c.json(
    {
      error: 'Internal Server Error',
      message:
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : err.message,
    },
    500
  );
});

// ─── Job Workers ──────────────────────────────────────────────────

const ENABLE_WORKERS = process.env.ENABLE_WORKERS !== 'false';

if (ENABLE_WORKERS) {
  try {
    registerAnalysisWorker();
    registerReviewWorker();
    registerVelocityWorker();
    registerSummaryWorker();
    registerSyncWorker();
    console.log('[jobs] All workers registered');
  } catch (error) {
    console.warn(
      '[jobs] Failed to register workers (Redis may not be available):',
      error instanceof Error ? error.message : error
    );
  }
}

// ─── Server ───────────────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '3000', 10);

const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`SnoutGuard server running on http://localhost:${info.port}`);
    console.log(`  - API:      http://localhost:${info.port}/api`);
    console.log(`  - Health:   http://localhost:${info.port}/api/health`);
    console.log(`  - Events:   http://localhost:${info.port}/api/events`);
    console.log(`  - Workers:  ${ENABLE_WORKERS ? 'enabled' : 'disabled'}`);
  }
);

// ─── Graceful Shutdown ────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[server] Received ${signal}, shutting down gracefully...`);

  try {
    // Close job queues and workers
    await shutdownQueues();
    console.log('[server] Job queues closed');
  } catch (error) {
    console.warn('[server] Error closing queues:', error);
  }

  // Close HTTP server
  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('[server] Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Exports ──────────────────────────────────────────────────────

export { app };
export { broadcastEvent } from './routes/sse.js';
export type { SSEEventType } from './routes/sse.js';
export default app;
