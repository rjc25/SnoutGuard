# Architecture

This is ArchGuard — an LLM-powered architectural analysis platform organized as a monorepo. It analyzes codebases, detects architectural decisions/drift, reviews PRs, tracks developer velocity, generates work summaries, and syncs context to AI coding assistants.

## Monorepo Structure

11 packages under `packages/`, each a bounded domain:
- **core** — shared types, DB, LLM client, auth, git, logging, config (foundation layer)
- **analyzer** — codebase scanning, decision extraction, dependency analysis, drift detection
- **reviewer** — dual-pass code review (deterministic rules + LLM), multi-format output
- **velocity** — developer metrics, composite scoring, blocker detection
- **work-summary** — LLM-powered summary generation with templates
- **context-sync** — generates AI assistant context files (7+ formats)
- **integrations** — GitHub, Bitbucket, Slack adapters
- **mcp-server** — Model Context Protocol server for AI agents
- **server** — Hono HTTP API, BullMQ workers, SSE, auth/RBAC
- **dashboard** — Next.js App Router web UI
- **cli** — Commander.js CLI

**Rules:**
- You MUST define all shared domain types in `packages/core/src/types.ts`. Never redefine core types in other packages.
- Core MUST NOT depend on any other `@archguard/*` package. All other packages import from `@archguard/core`.
- Always use `@archguard/` scoped package names for cross-package imports, never relative paths.
- Each package MUST export its public API through an `index.ts` barrel file.
- New domain capabilities should be new packages, not bolted onto existing ones.

## LLM Layer (Anthropic Claude)

All LLM operations go through `packages/core/src/llm.ts`. Claude is the exclusive provider with operation-based model routing (Opus for analysis, Sonnet for review/MCP/summary).

**Rules:**
- You MUST route all LLM calls through `analyzeWithLlm` or `analyzeWithLlmValidated` — never use the Anthropic SDK directly.
- New LLM operations MUST be added to the `LlmOperation` type and model mapping.
- All structured LLM responses MUST be validated against Zod schemas via `analyzeWithLlmValidated`.
- Cost tracking is mandatory — every call updates the run cost accumulator. Respect `maxCostPerRun` limits.
- All prompts MUST use XML-tagged sections (`<role>`, `<task>`, `<output_format>`, etc.) following Anthropic best practices.
- Include few-shot examples for complex extraction tasks. Separate system prompts from user prompts.
- JSON extraction handles markdown fences, truncated responses (via `repairTruncatedJson`), and auto-retries on validation failure.
- LLM errors MUST use the typed hierarchy: `LlmAuthError`, `LlmRateLimitError`, `LlmValidationError`, `LlmCostLimitError`.

## Database (SQLite + Drizzle ORM)

SQLite via `better-sqlite3` with Drizzle ORM. Schema in `packages/core/src/db/schema.ts` (16 tables).

**Rules:**
- All database queries MUST use Drizzle ORM query builders — no raw SQL except schema initialization.
- Import Drizzle operators (`eq`, `and`, `desc`, etc.) from `@archguard/core`, not `drizzle-orm` directly.
- JSON/array fields are stored as text — serialize with `JSON.stringify`, parse with `JSON.parse`.
- Schema changes require updating both Drizzle schema definitions and CREATE TABLE statements.
- All queries MUST be scoped by `orgId` for multi-tenant isolation.
- Repository deletion MUST cascade in dependency order: evidence → decisions, drift_events → snapshots, dependencies, reviews, sync_history → repository.

## Server (Hono + BullMQ)

**Rules:**
- All route modules MUST export a factory function (`createXxxRouter`) accepting `DbClient` and returning a Hono router.
- Route handlers receive Hono `Context` objects — this is NOT Express.
- Middleware order: CORS → logger → rate-limit → auth → org-context → route handlers.
- Webhook and health routes MUST be mounted before the auth middleware.
- Long-running operations MUST be processed via BullMQ queues, never inline in HTTP handlers. Redis required.
- Job processors MUST use dynamic `import()` for heavy packages to avoid circular dependencies at startup.
- Every API endpoint MUST use `requirePermission()` or `requireRole()` middleware.
- New permissions MUST be added to `ROLE_PERMISSIONS` in `core/auth.ts`. Role hierarchy: owner > admin > member > viewer.
- `orgId` MUST come from authenticated session, never from user input.
- List endpoints MUST support `limit`/`offset` pagination. Errors use `{ error: string }`. Create → 201, async → 202.
- Real-time updates use SSE (not WebSockets). Events scoped to org. Heartbeat every 30s.
- Rate limiting: `standardLimit` (general), `strictLimit` (auth/writes), `analysisLimit` (expensive ops).
- Auth can be disabled via `ARCHGUARD_DISABLE_AUTH` for local/CLI mode. Workers optional without Redis.

## Dashboard (Next.js)

**Rules:**
- Authenticated pages go under `(app)/` route group. Auth pages under `(auth)/`.
- All pages use `'use client'` directive.
- All API calls MUST go through `lib/api.ts` (`apiFetch`/`apiGet`/`apiPost`/etc.) — never raw `fetch`.
- Data fetching MUST be encapsulated in custom hooks under `hooks/` returning `{ data, loading, error, refetch? }`. No external state libraries (no React Query, Redux, SWR).
- All styling uses Tailwind CSS. Use `cn()` (clsx + tailwind-merge) for conditional classes. Use `brand-*` color tokens and custom classes (`card`, `btn-primary`, `input-field`).
- Charts use Recharts with `ResponsiveContainer`. Handle empty states gracefully.
- Components organized by domain (`decisions/`, `reviews/`, `velocity/`), not by type.

## Analyzer

- Dual-pass: heuristic pattern detection (9 detectors, confidence threshold 0.3) → LLM decision extraction.
- Tiered content strategy: files scoring ≥ 4 get full source; others get structural summaries only.
- Token budget per batch: 100K. Max parallel batches: 3. Results deduplicated by title.
- Incremental analysis via SHA-256 file content hashing. Cache at `.archguard/cache.json` with configurable TTL. `--force` bypasses cache.
- Every analysis produces a snapshot for drift comparison. Drift score 0-100, severity-weighted.
- Dependency analysis calculates Robert C. Martin metrics: Ca, Ce, instability, abstractness, distance from main sequence.
- Multi-language regex-based parsing (TS, JS, Python, Go, Rust, Java). New languages require updating ALL extraction functions.
- Import resolution: language-specific → relative → tsconfig paths → pnpm workspace → fallback.

## Reviewer

- Two-pass: deterministic rule engine first, then LLM reviewer. Rule-based violations take precedence on overlap.
- Custom rules in `.archguard.yml` are enforced deterministically. New deterministic checks go in rule engine, not LLM.
- Four output formatters (strategy pattern): terminal, GitHub PR, Bitbucket PR, JSON. New platforms → new formatter in `formatters/`.
- JSON output includes `version` field for schema evolution.

## Context Sync

- 7 formats: `.cursorrules`, `CLAUDE.md`, `agents.md`, `.github/copilot-instructions.md`, `.windsurfrules`, `.kiro/steering.md`, custom templates.
- Each format has a dedicated generator in `generators/`. All accept `(decisions, config)` → string.
- Generated files MUST include `<!-- archguard:user-start -->` / `<!-- archguard:user-end -->` markers. User sections MUST be preserved across regeneration.
- LLM-powered sync is optional, controlled by `config.sync.useLlm`.

## MCP Server

- Exposes tools (`get_architectural_decisions`, `check_architectural_compliance`, `get_architectural_guidance`, `get_dependencies`) and resources (`archguard://decisions`, `archguard://patterns`, `archguard://dependencies/{module}`).
- Supports stdio, SSE, and streamable HTTP transports.
- All tools MUST have Zod input schemas. Resources use `archguard://` URI scheme.
- Tools return `{ content: [{ type: 'text', text: ... }] }` format.

## CLI (Commander.js)

- Each command in its own file under `commands/`, exporting `registerXxxCommand(program)`.
- Use `chalk` for colors, `ora` for spinners (tapir-themed), `loadConfig()` for config, `requireApiKey()` before LLM ops.

## Key Patterns

- **Factory functions over classes**: `createGitHubClient`, `createSlackApp`, `createLlmClient`, etc.
- **Provider interface pattern**: External data sources abstracted with `isAvailable()` method and no-op defaults.
- **Functional style**: Business logic as exported functions. Classes only for errors, Logger, SyncEngine, SummaryScheduler.
- **Structured logging**: Always writes to `.archguard/logs/`. Use `getLogger()` in library code (safe no-op if uninitialized).
- **Config validation**: YAML config validated via Zod schemas in core.
- **Integrations**: GitHub/Bitbucket follow `api.ts` + `pr-bot.ts` + `webhook.ts` pattern. Slack uses Block Kit.
- **Webhook security**: Signature verification with constant-time comparison. Secrets from env vars.
- **Work summaries**: 4 templates (standup, sprint-review, one-on-one, progress-report). Collector gathers data, templates build prompts. `editedContent` stored separately from AI-generated content.
- **Session store**: In-memory for dev, needs Redis for production.

## Workflow

- Before writing code, if `get_architectural_guidance` MCP tool is available, call it with a description of the task to get relevant constraints. If MCP is not configured, review the constraints in this file that relate to the files being modified.
- After making changes, run `archguard review --diff <branch>` to check for architectural violations before committing.
- After significant refactors or new features, run `archguard analyze` then `archguard sync` to keep this context file current (incremental — only re-analyzes changed files).

<!-- archguard:user-start -->
<!-- archguard:user-end -->
