# Architecture

This is ArchGuard — an LLM-powered architectural analysis platform. It extracts architectural decisions from codebases, reviews PRs for violations, tracks developer velocity, generates work summaries, and syncs context files to AI coding assistants.

## Monorepo Structure

11 packages under `packages/`, each a bounded domain with `src/` directory and `index.ts` barrel export:

- **core** — shared types, config, DB, LLM client, git, auth, logging (depends on NO other @archguard packages)
- **analyzer** — codebase scanning, decision extraction, dependency analysis, drift detection
- **reviewer** — dual-pass code review (deterministic rules + LLM), multi-format output
- **velocity** — developer metrics, composite scoring, blocker detection
- **work-summary** — LLM-powered summary generation with templates
- **context-sync** — AI context file generation (7+ formats)
- **integrations** — GitHub, Bitbucket, Slack clients and webhooks
- **mcp-server** — Model Context Protocol server for AI agents
- **server** — Hono HTTP API with BullMQ job processing
- **dashboard** — Next.js App Router web UI
- **cli** — Commander.js CLI

**Rules:**
- You MUST use `@archguard/*` scoped imports for cross-package dependencies, never relative paths
- You MUST define all shared domain types in `packages/core/src/types.ts` — never redefine them elsewhere
- You MUST export public API through each package's `index.ts` barrel file
- Core MUST NOT depend on any other @archguard package
- New domain capabilities should be new packages, not bolted onto existing ones

## LLM Layer (Anthropic Claude Only)

All LLM operations go through `packages/core/src/llm.ts`. Different Claude models per operation type (Opus for analysis, Sonnet for review/MCP/summary). Features: exponential backoff retry, cost tracking, in-memory caching with TTL, Zod validation, context window overflow prevention.

**Rules:**
- You MUST route all LLM calls through `analyzeWithLlm` or `analyzeWithLlmValidated` — no direct SDK usage
- You MUST add new operations to the `LlmOperation` type and model mapping
- You MUST validate structured LLM responses with Zod schemas via `analyzeWithLlmValidated`
- You MUST track cost for every call — the run cost accumulator is mandatory
- You MUST respect `maxCostPerRun` limits to prevent surprise bills
- You MUST use XML-tagged prompt sections (`<role>`, `<task>`, `<output_format>`, etc.) following Anthropic best practices
- You MUST include few-shot examples for complex extraction tasks
- JSON extraction handles markdown fences, truncated responses (via `repairTruncatedJson`), and auto-retry with refined prompts on validation failure (up to 2 retries)

**Error hierarchy:** `LlmError` → `LlmAuthError`, `LlmRateLimitError`, `LlmValidationError` (carries rawResponse + zodErrors), `LlmCostLimitError`. Always throw specific subclasses, never generic Error.

## Database (SQLite + Drizzle ORM)

SQLite via better-sqlite3 with Drizzle ORM. Schema in `packages/core/src/db/schema.ts` (16 tables). WAL mode enabled.

**Rules:**
- You MUST use Drizzle ORM query builders — no raw SQL in application code (except schema init)
- You MUST import Drizzle operators (`eq`, `and`, `desc`, etc.) from `@archguard/core`, not `drizzle-orm` directly
- JSON/array fields are stored as text — serialize with `JSON.stringify`, parse with `JSON.parse`
- Schema changes require updating both Drizzle schema definitions and CREATE TABLE statements
- Repository deletion MUST cascade in order: evidence → decisions, drift_events → snapshots, dependencies, reviews, sync_history → repository

## Server (Hono + BullMQ)

HTTP framework: Hono. Middleware chain order: CORS → logger → auth → org-context → rate-limit → routes.

**Rules:**
- All route modules MUST export a factory function (`createXxxRouter(db: DbClient)`) returning a Hono router
- Route handlers receive Hono `Context` objects, not Express req/res
- Long-running operations MUST be processed via BullMQ queues, never inline in HTTP handlers
- Each job type MUST have a typed data interface
- Redis is required for server mode (`REDIS_URL` env var)
- Workers can be disabled via `ENABLE_WORKERS=false`
- Job processors MUST use dynamic `import()` for heavy packages to avoid circular dependencies
- Webhook and health routes MUST be mounted before the auth middleware chain
- Public routes (webhooks) verify signatures cryptographically (HMAC-SHA256, constant-time comparison)
- Graceful shutdown: close queues/workers first, then HTTP server, force exit after 10s

### RBAC & Multi-Tenancy

4-tier roles: owner > admin > member > viewer. Permissions follow `resource:action` pattern defined in `core/auth.ts`.

- You MUST protect every API route with `requirePermission()` or `requireRole()` middleware
- You MUST scope all database queries by `orgId` from authenticated session — never from user input
- Auth bypass: `ARCHGUARD_DISABLE_AUTH` env var for local/CLI mode
- New permissions MUST be added to `ROLE_PERMISSIONS` in `core/auth.ts`
- SAML SSO config is per-organization; SAML routes must remain public (before auth middleware)

### Rate Limiting

Three tiers: `standardLimit` (100/min), `strictLimit` (20/min), `analysisLimit` (5/min). In-memory sliding window. Rate limit headers on every response.

### REST API Conventions

- List endpoints: `limit`/`offset` pagination (defaults: 20/0), return `{ data, total }`
- Create: return 201. Async operations: return 202
- Errors: `{ error: string }` format. 404 for missing resources
- SSE for real-time updates (not WebSockets). Events scoped to org. Heartbeat every 30s. New event types added to `SSEEventType` union

## Dashboard (Next.js App Router)

Route groups: `(auth)/` for login/signup/SSO, `(app)/` for authenticated pages with sidebar+header layout.

**Rules:**
- Authenticated pages MUST be under `(app)/` route group
- Auth pages MUST be under `(auth)/` route group
- All pages use `'use client'` directive
- All API calls MUST go through centralized `lib/api.ts` (`apiFetch`, `apiGet`, `apiPost`, etc.) — auth tokens auto-injected from localStorage
- Data fetching MUST use custom hooks (`hooks/use-*.ts`) returning `{ data, loading, error, refetch? }` — no React Query/SWR
- Components organized by domain (`decisions/`, `reviews/`, `velocity/`, etc.), not by type
- Charts use Recharts with `ResponsiveContainer`. All charts handle empty states
- Styling: Tailwind CSS with `brand-*` color tokens. Use `cn()` (clsx + tailwind-merge) for conditional classes. Use custom classes: `card`, `btn-primary`, `btn-secondary`, `btn-ghost`, `input-field`

## Analyzer

- **Dual-pass review:** deterministic rule engine first, then LLM analysis. Rule-based violations take precedence on overlap
- **Tiered file content:** files scoring ≥4 get full source sent to LLM; others get structural summaries only
- **Incremental analysis:** SHA-256 file hashing, cache at `.archguard/cache.json` with configurable TTL. `--force` bypasses cache
- **Dependency metrics:** Robert C. Martin's Ca, Ce, instability (I=Ce/(Ca+Ce)), abstractness (A), distance from main sequence (D=|A+I-1|)
- **Drift detection:** snapshot comparison producing composite 0-100 drift score. First analysis = baseline (score 0). Confidence drops >15% flagged
- **Multi-language regex parsing:** TS, JS, Python, Go, Rust, Java. New language requires cases in ALL extraction functions
- **Import resolution order:** language-specific → relative → tsconfig paths → pnpm workspace → fallback. Try extensions: .ts, .tsx, .js, .jsx, .py, .go, /index variants
- **Pattern detection:** 9 heuristic detectors run pre-LLM. Confidence <0.3 filtered out

## Context Sync

7 formats: `.cursorrules`, `CLAUDE.md`, `agents.md`, `.github/copilot-instructions.md`, `.windsurfrules`, `.kiro/steering.md`, custom Handlebars templates.

- Each format has its own generator in `generators/`
- All generators accept `(decisions: ArchDecision[], config: ArchGuardConfig)` → `string`
- Generated files include `<!-- archguard:user-start/end -->` markers — user content between markers MUST be preserved on regeneration
- LLM-powered sync optional via `config.sync.useLlm`
- Watch mode debounces at 5 seconds

## CLI (Commander.js)

- Each command in own file under `commands/`, exporting `registerXxxCommand(program)`
- Use `chalk` for colors, `ora` for spinners
- Load config via `loadConfig()` from `@archguard/core`
- Validate API key upfront with `requireApiKey()` where LLM needed
- Custom inline `.env` loader (no dotenv dependency) — existing env vars not overridden

## MCP Server

Exposes tools (`get_architectural_decisions`, `check_architectural_compliance`, `get_architectural_guidance`, `get_dependencies`) and resources (`archguard://decisions`, `archguard://patterns`, `archguard://dependencies/{module}`).

- Tools MUST have Zod input schemas and return `{ content: [{ type: 'text', text }] }`
- Resources use `archguard://` URI scheme
- Supports stdio (default), SSE, and streamable HTTP transports

## Configuration

`.archguard.yml` at project root, parsed with js-yaml, validated with Zod. Covers: languages, layers, rules, sync formats, LLM settings, velocity weights, summary schedules. Use `loadConfig()` / `getDefaultConfig()` / `writeDefaultConfig()`.

## Key Patterns

- **Factory functions over classes:** `createGitHubClient()`, `createSlackApp()`, `createLlmClient()`, etc. Classes only for errors, Logger, SyncEngine, SummaryScheduler
- **Provider interface pattern:** external data sources have interface + `createNoopXxx()` null implementation with `isAvailable()` method
- **Integrations structure:** each platform (GitHub, Bitbucket) has `api.ts`, `pr-bot.ts`, webhook handler. Reviewer has matching formatters
- **Logging:** `initLogger()` at startup, `getLogger()` returns safe no-op proxy if uninitialized. Logs to `.archguard/logs/`. LLM calls use specialized `llmRequest`/`llmResponse`/`llmError` methods
- **Work summaries:** 4 types (standup, sprint-review, one-on-one, progress-report). Templates build `{systemPrompt, userPrompt}` from collected data. `editedContent` stored separately from AI-generated content — never overwrite originals
- **Velocity:** weighted composite (complexity 0.4, arch impact 0.3, review 0.15, refactoring 0.15). Weights auto-normalize to 1.0. Scores 0-100. Blocker detection from stalled PRs, long branches, review bottlenecks

## Dual-Mode Operation

Local CLI (no auth, SQLite, no Redis) and cloud server (full auth, BullMQ, multi-tenant). Routes handle missing `orgId` gracefully. Session store is in-memory (needs Redis for production).

<!-- archguard:user-start -->
<!-- archguard:user-end -->
