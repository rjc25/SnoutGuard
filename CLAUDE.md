# Architecture

This is **ArchGuard** — an AI-powered architectural governance platform organized as a monorepo. It analyzes codebases, extracts architectural decisions, detects drift, reviews PRs, tracks developer velocity, and generates AI context files for coding assistants.

## Monorepo Package Structure

Packages under `packages/` with `@archguard/*` namespace:

| Package | Responsibility |
|---------|---------------|
| **core** | Shared types, LLM client, Git utilities, DB schema, Zod schemas |
| **analyzer** | LLM-powered decision extraction, drift detection, layer/pattern detection |
| **reviewer** | AI-powered code review |
| **velocity** | Developer velocity tracking, complexity analysis |
| **work-summary** | Work summary generation |
| **integrations** | GitHub, Bitbucket, Slack APIs, webhooks, PR bots |
| **context-sync** | Multi-format AI context file generation (Cursor, Claude, Copilot, etc.) |
| **mcp-server** | Model Context Protocol server for AI assistant integration |
| **server** | Hono HTTP server, API routes, middleware, job queues |
| **dashboard** | Next.js App Router frontend |
| **cli** | Commander-based CLI |

### Dependency Rules

- **Core MUST remain dependency-free** of all other packages.
- Dependencies MUST flow inward toward core — never circular between packages.
- Cross-package imports MUST use the `@archguard/*` namespace.
- You MUST place shared utilities in the `core` package.
- Each package MUST maintain its own build and test configuration.
- New functionality MUST be placed in the appropriate package based on domain.

## Database — Drizzle ORM + SQLite

- All schemas are defined centrally in `core/db/schema.ts` using Drizzle's schema builder.
- You MUST use Drizzle ORM's typed query builder for all database operations. Never use raw SQL except for genuinely complex operations.
- Schema changes MUST go through Drizzle migrations.
- All business data MUST be scoped by `organizationId` for multi-tenant isolation.
- New tables MUST include organization scoping where appropriate.
- Foreign key relationships MUST be properly defined.

## LLM Integration — Anthropic Claude

- All LLM operations MUST go through the centralized `core/llm.ts` module.
- You MUST implement cost tracking for every LLM call.
- LLM responses MUST be validated against Zod schemas before processing.
- API keys MUST be managed through configuration — never hardcoded.
- Different models should be selected based on operation requirements.

## Validation — Zod Throughout

- All external inputs MUST be validated with Zod schemas.
- All LLM responses MUST be validated before processing.
- Configuration files MUST have corresponding Zod schemas.
- API request bodies MUST be validated with Zod.

## Server — Hono Framework

- All HTTP handlers MUST use Hono's `Context` and `Next` types.
- Middleware MUST follow Hono's `async (c, next) =>` pattern.
- Middleware pipeline order: CORS → logging → authentication → organization context → rate limiting → RBAC.
- Routes MUST NOT directly access the database — go through service/repository layers.
- Context variables MUST be properly typed in `hono-env.d.ts`.
- All protected endpoints MUST use `requirePermission` middleware.

## Security — RBAC + Multi-Tenancy

- Four-tier role hierarchy: **viewer < member < admin < owner** (higher inherits lower).
- All API endpoints MUST use RBAC middleware for authorization.
- Permission checks MUST happen after authentication.
- Users can ONLY access data within their organization.
- Database queries MUST include organization filtering.
- Owner-specific resources MUST check ownership in addition to role.
- New permissions MUST be added to the `PERMISSIONS` constant and role mappings.

## Job Queue — BullMQ + Redis

- All long-running operations MUST be processed through BullMQ job queues.
- Job types: analysis, review, velocity, summary, sync.
- Job data MUST be serializable and follow defined TypeScript interfaces.
- Workers MUST implement progress tracking, error handling, and retry logic.
- Jobs MUST be idempotent.
- Redis connection MUST be shared and properly managed across all queues.
- Workers MUST be registered during server startup.

## Real-Time — Server-Sent Events (SSE)

- All real-time dashboard updates MUST use SSE (not WebSockets).
- SSE connections MUST be authenticated with valid tokens.
- Events MUST be filtered by organization membership.
- Client reconnection MUST use exponential backoff.
- Connection cleanup MUST be handled to prevent memory leaks.
- Event payloads MUST be JSON serializable.

## Dashboard — Next.js App Router

- You MUST follow Next.js App Router file-based routing conventions.
- Interactive components MUST use the `'use client'` directive.
- Route groups: `(app)` for authenticated, `(auth)` for unauthenticated areas.
- Layouts MUST be used for shared UI across route groups.
- All API interactions MUST go through custom hooks (`use-decisions`, `use-reviews`, `use-velocity`, `use-sse`), never direct API calls in components.
- Hooks MUST provide consistent loading, error, and success state interfaces.
- All styling MUST use Tailwind CSS classes — no custom CSS files.
- Use the `cn()` utility for conditional class composition.
- Brand colors and custom animations are defined in `tailwind.config.ts`.

## Integrations — GitHub, Bitbucket, Slack

- Each provider MUST implement consistent interfaces for common operations.
- Webhook endpoints MUST validate signatures for security.
- Webhook processing MUST be asynchronous (enqueue to job queue) to avoid timeouts.
- Integration clients MUST handle API rate limits.
- PR bots MUST support both inline comments and check runs.
- Error handling and authentication MUST be consistent across providers.

## Context Sync — Multi-Format AI Context Generation

- Supported formats: Cursor rules, CLAUDE.md, GitHub Copilot instructions, Windsurf rules, Kiro steering.
- Each AI tool format MUST have a dedicated generator.
- All generators MUST use the shared Handlebars template system and helpers.
- User-written content sections MUST be preserved between regenerations.
- LLM compression MUST respect token limits for each format.
- File watching MUST be debounced to avoid excessive regeneration.
- Helper functions MUST handle null/undefined values gracefully.

## MCP Server — Model Context Protocol

- MUST support multiple transports: stdio, SSE, streamable-http.
- All transports MUST expose the same tools and resources.
- Transport selection MUST be configurable via environment variables.
- All MCP tools MUST have JSON schema definitions and Zod input validation.
- Tool responses MUST follow MCP protocol standards.
- Each transport MUST handle its own connection lifecycle.

## Analyzer — Architectural Analysis

- Modular plugin-like architecture: decision-extractor, layer-detector, pattern-detector, drift-detector.
- Analysis modules MUST be composable and not tightly coupled.
- All analyzers MUST work with common `ParsedFile` and `DependencyGraph` types.
- Dependency analysis MUST support TypeScript path aliases and monorepo packages.
- Coupling metrics MUST follow Robert C. Martin's formal definitions (afferent/efferent coupling, instability, abstractness, distance from main sequence).
- Drift detection MUST compare multiple architectural dimensions with severity scoring.
- Snapshots MUST be stored for historical comparison.

## Velocity — Developer Metrics

- Velocity scoring combines git metrics, complexity analysis, PR metrics, and architectural impact.
- Both cyclomatic and cognitive complexity MUST be calculated.
- Scoring algorithms MUST be configurable through weights.
- Complexity changes MUST be tracked for refactoring analysis.

## CLI — Commander Pattern

- All CLI commands MUST be registered in the main `index.ts`.
- Each command MUST export a register function that takes a Commander program.
- Commands MUST handle their own error cases and user feedback.

## Git Operations

- All Git operations MUST go through `core/git.ts` utilities (uses `simple-git` library).
- Git clients MUST be properly initialized with repository paths.
- Operations MUST be async and handle large repositories gracefully.

<!-- archguard:user-start -->
<!-- archguard:user-end -->
