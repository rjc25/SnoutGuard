# Claude Code Prompt: Build "ArchGuard" — Open-Source Architectural Guardrails & Engineering Intelligence Platform

## Project Overview

Build an open-source platform called **ArchGuard** that provides architectural guardrails and engineering management intelligence for AI-powered software development teams. It analyzes codebases to extract architectural decisions, syncs them to AI agent context files, provides an MCP server for real-time architectural guidance, runs architectural code reviews on PRs, tracks team velocity based on code complexity, and generates developer work summaries.

This is a full-stack monorepo with two AI agents (Architecture Agent + Management Agent), a web dashboard, a CLI, a GitHub/Bitbucket bot, Slack integration, and an MCP server.

---

## Tech Stack

- **Language:** TypeScript (strict mode) throughout
- **Runtime:** Node.js 20+
- **Monorepo:** Turborepo with pnpm workspaces
- **CLI Framework:** Commander.js
- **MCP Server:** @modelcontextprotocol/sdk
- **AST Parsing:** tree-sitter (TypeScript, Python, Go, Rust, Java)
- **LLM Integration:** Anthropic SDK (@anthropic-ai/sdk) using Claude Sonnet for analysis
- **Database:** PostgreSQL via Drizzle ORM (team/multi-user), SQLite via better-sqlite3 (local solo mode)
- **Web Framework:** Hono (API server)
- **Web Dashboard:** Next.js 14 (App Router) + Tailwind + shadcn/ui + Recharts
- **Auth:** Better Auth (supports email/password, OAuth, SAML 2.0 via enterprise plugin)
- **Real-time:** Server-Sent Events for live dashboard updates
- **Queue:** BullMQ + Redis for async analysis jobs
- **Git Integration:** simple-git + GitHub App SDK (@octokit/app) + Bitbucket API
- **Slack:** @slack/bolt
- **Testing:** Vitest
- **Containerization:** Docker + docker-compose for self-hosted deployment
- **Config Format:** YAML (js-yaml)

---

## Monorepo Structure

```
archguard/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── README.md
├── LICENSE (MIT)
├── docker-compose.yml
├── docker-compose.prod.yml
├── Dockerfile
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
│
├── packages/
│   ├── core/                        # Shared types, utils, DB, LLM client
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types.ts             # All shared interfaces
│   │       ├── db/
│   │       │   ├── index.ts         # DB client factory (Postgres or SQLite)
│   │       │   ├── schema.ts        # Drizzle schema definitions
│   │       │   ├── migrations/      # Drizzle migration files
│   │       │   └── seed.ts
│   │       ├── llm.ts               # Anthropic client wrapper with caching
│   │       ├── config.ts            # YAML config loader (.archguard.yml)
│   │       ├── git.ts               # Git helpers (diff, blame, log, stats)
│   │       ├── auth.ts              # Shared auth types + RBAC helpers
│   │       └── utils.ts
│   │
│   ├── analyzer/                    # Architecture Agent: Codebase Analysis
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── scanner.ts           # Walk codebase, parse ASTs
│   │       ├── pattern-detector.ts  # Detect arch patterns from code
│   │       ├── decision-extractor.ts # LLM-powered decision extraction
│   │       ├── dependency-mapper.ts  # Module dependency graph
│   │       ├── drift-detector.ts    # Compare current vs historical decisions
│   │       ├── trend-analyzer.ts    # Track arch changes over time windows
│   │       └── reporters/
│   │           ├── markdown.ts
│   │           └── json.ts
│   │
│   ├── context-sync/                # Architecture Agent: Context File Management
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── generators/
│   │       │   ├── cursorrules.ts        # .cursorrules
│   │       │   ├── claude-md.ts          # CLAUDE.md
│   │       │   ├── agents-md.ts          # agents.md
│   │       │   ├── copilot.ts            # .github/copilot-instructions.md
│   │       │   ├── windsurf.ts           # .windsurfrules
│   │       │   ├── kiro.ts              # .kiro/steering.md
│   │       │   └── custom.ts            # User-defined Handlebars templates
│   │       ├── sync-engine.ts            # Watch + auto-sync
│   │       └── templates.ts
│   │
│   ├── mcp-server/                  # Architecture Agent: MCP Advisor
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                  # MCP server entrypoint
│   │       ├── tools/
│   │       │   ├── get-decisions.ts
│   │       │   ├── check-pattern.ts
│   │       │   ├── suggest-approach.ts
│   │       │   └── get-dependencies.ts
│   │       └── resources/
│   │           ├── decisions.ts
│   │           └── patterns.ts
│   │
│   ├── reviewer/                    # Architecture Agent: Code Review
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── diff-analyzer.ts
│   │       ├── rule-engine.ts
│   │       ├── llm-reviewer.ts
│   │       ├── severity.ts
│   │       └── formatters/
│   │           ├── terminal.ts
│   │           ├── github-pr.ts
│   │           ├── bitbucket-pr.ts
│   │           └── json.ts
│   │
│   ├── velocity/                    # Management Agent: Team Velocity
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── collectors/
│   │       │   ├── git-stats.ts          # Commit frequency, LOC, file churn
│   │       │   ├── complexity.ts         # Cyclomatic complexity, cognitive complexity
│   │       │   ├── pr-metrics.ts         # PR size, review time, merge time
│   │       │   └── issue-tracker.ts      # Optional: GitHub Issues / Linear integration
│   │       ├── scoring/
│   │       │   ├── effort-model.ts       # Weight LOC by complexity, not raw lines
│   │       │   ├── impact-score.ts       # Score changes by architectural impact
│   │       │   └── velocity-calculator.ts # Rolling velocity per dev, per team
│   │       ├── blockers/
│   │       │   ├── detector.ts           # Identify stalled PRs, long-lived branches
│   │       │   └── alerts.ts             # Generate blocker alerts
│   │       └── types.ts
│   │
│   ├── work-summary/                # Management Agent: Work Summaries
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── collector.ts              # Gather commits, PRs, reviews per dev per period
│   │       ├── summarizer.ts             # LLM-powered summary generation
│   │       ├── templates/
│   │       │   ├── one-on-one.ts         # 1:1 meeting prep format
│   │       │   ├── standup.ts            # Daily standup format
│   │       │   ├── sprint-review.ts      # Sprint/weekly review format
│   │       │   └── progress-report.ts    # Stakeholder progress report format
│   │       └── scheduler.ts              # Cron-based auto-generation
│   │
│   ├── integrations/                # External Service Integrations
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── github/
│   │       │   ├── app.ts               # GitHub App: webhooks, PR events
│   │       │   ├── pr-bot.ts            # Auto-comment arch reviews on PRs
│   │       │   ├── check-run.ts         # GitHub Check Run for CI status
│   │       │   └── api.ts               # GitHub REST/GraphQL client
│   │       ├── bitbucket/
│   │       │   ├── webhook.ts           # Bitbucket webhook handler
│   │       │   ├── pr-bot.ts            # PR comment integration
│   │       │   └── api.ts               # Bitbucket REST client
│   │       └── slack/
│   │           ├── app.ts               # Slack Bolt app
│   │           ├── commands.ts          # /archguard slash commands
│   │           ├── notifications.ts     # Push alerts for violations, summaries
│   │           └── blocks.ts            # Slack Block Kit message builders
│   │
│   ├── server/                      # API Server + Auth + Jobs
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                 # Hono server entrypoint
│   │       ├── auth/
│   │       │   ├── index.ts             # Better Auth setup
│   │       │   ├── rbac.ts             # Role-based access control middleware
│   │       │   ├── roles.ts            # Role definitions: owner, admin, member, viewer
│   │       │   └── saml.ts             # SAML 2.0 SSO config (enterprise)
│   │       ├── routes/
│   │       │   ├── decisions.ts         # CRUD for architectural decisions
│   │       │   ├── analysis.ts          # Trigger/status of analyses
│   │       │   ├── reviews.ts           # Review history + results
│   │       │   ├── velocity.ts          # Velocity metrics endpoints
│   │       │   ├── summaries.ts         # Work summary endpoints
│   │       │   ├── teams.ts             # Team management
│   │       │   ├── repos.ts             # Repository management
│   │       │   ├── sync.ts              # Context file sync status
│   │       │   ├── settings.ts          # Org/project settings
│   │       │   ├── webhooks.ts          # GitHub/Bitbucket webhook receivers
│   │       │   └── sse.ts              # SSE endpoint for live dashboard updates
│   │       ├── jobs/
│   │       │   ├── queue.ts             # BullMQ queue setup
│   │       │   ├── analyze.job.ts       # Async codebase analysis
│   │       │   ├── review.job.ts        # Async PR review
│   │       │   ├── velocity.job.ts      # Periodic velocity calculation
│   │       │   ├── summary.job.ts       # Scheduled work summary generation
│   │       │   └── sync.job.ts          # Periodic context file sync
│   │       └── middleware/
│   │           ├── auth.ts              # Auth middleware
│   │           ├── rbac.ts              # Permission checks
│   │           ├── rate-limit.ts
│   │           └── org-context.ts       # Multi-tenant org resolution
│   │
│   ├── dashboard/                   # Web Dashboard (Next.js)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx
│   │       │   ├── page.tsx                    # Landing / login
│   │       │   ├── (auth)/
│   │       │   │   ├── login/page.tsx
│   │       │   │   ├── signup/page.tsx
│   │       │   │   └── sso/page.tsx            # SAML SSO entry
│   │       │   └── (app)/
│   │       │       ├── layout.tsx              # Authenticated shell + sidebar
│   │       │       ├── dashboard/page.tsx      # Overview: health, recent activity
│   │       │       ├── decisions/
│   │       │       │   ├── page.tsx            # List all decisions + filters
│   │       │       │   └── [id]/page.tsx       # Decision detail + evidence
│   │       │       ├── reviews/
│   │       │       │   ├── page.tsx            # Review history
│   │       │       │   └── [id]/page.tsx       # Review detail with violations
│   │       │       ├── velocity/
│   │       │       │   ├── page.tsx            # Team velocity dashboard
│   │       │       │   └── [devId]/page.tsx    # Individual dev velocity
│   │       │       ├── summaries/
│   │       │       │   ├── page.tsx            # Work summaries list
│   │       │       │   └── [id]/page.tsx       # Individual summary
│   │       │       ├── repos/
│   │       │       │   ├── page.tsx            # Connected repositories
│   │       │       │   └── [id]/page.tsx       # Repo-specific decisions + health
│   │       │       ├── team/
│   │       │       │   ├── page.tsx            # Team members + roles
│   │       │       │   └── invite/page.tsx
│   │       │       ├── drift/page.tsx          # Architectural drift over time
│   │       │       ├── dependencies/page.tsx   # Dependency graph visualization
│   │       │       └── settings/
│   │       │           ├── page.tsx            # General settings
│   │       │           ├── integrations/page.tsx # GitHub/Bitbucket/Slack setup
│   │       │           ├── rules/page.tsx      # Custom architectural rules
│   │       │           └── sso/page.tsx        # SAML config (enterprise)
│   │       ├── components/
│   │       │   ├── ui/                         # shadcn/ui components
│   │       │   ├── charts/
│   │       │   │   ├── velocity-chart.tsx      # Rolling velocity line chart
│   │       │   │   ├── complexity-heatmap.tsx  # File complexity heatmap
│   │       │   │   ├── drift-timeline.tsx      # Arch drift over time
│   │       │   │   ├── violation-breakdown.tsx # Violation types pie/bar
│   │       │   │   └── contribution-chart.tsx  # Per-dev contribution breakdown
│   │       │   ├── decisions/
│   │       │   │   ├── decision-card.tsx
│   │       │   │   ├── decision-table.tsx
│   │       │   │   ├── evidence-viewer.tsx     # Show code snippets as evidence
│   │       │   │   └── decision-editor.tsx     # Add/edit/confirm/deprecate
│   │       │   ├── reviews/
│   │       │   │   ├── violation-list.tsx
│   │       │   │   ├── diff-viewer.tsx
│   │       │   │   └── review-summary.tsx
│   │       │   ├── velocity/
│   │       │   │   ├── velocity-card.tsx
│   │       │   │   ├── blocker-list.tsx
│   │       │   │   └── dev-profile.tsx
│   │       │   ├── summaries/
│   │       │   │   ├── summary-card.tsx
│   │       │   │   └── summary-editor.tsx
│   │       │   ├── graphs/
│   │       │   │   └── dependency-graph.tsx    # D3 or react-flow dependency viz
│   │       │   └── layout/
│   │       │       ├── sidebar.tsx
│   │       │       ├── header.tsx
│   │       │       └── org-switcher.tsx
│   │       ├── lib/
│   │       │   ├── api.ts                     # API client (fetch wrapper)
│   │       │   ├── sse.ts                     # SSE hook for live updates
│   │       │   └── auth.ts                    # Auth helpers
│   │       └── hooks/
│   │           ├── use-decisions.ts
│   │           ├── use-velocity.ts
│   │           ├── use-reviews.ts
│   │           └── use-sse.ts
│   │
│   └── cli/                         # CLI entry point
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           └── commands/
│               ├── init.ts              # archguard init
│               ├── analyze.ts           # archguard analyze
│               ├── sync.ts              # archguard sync
│               ├── review.ts            # archguard review
│               ├── serve.ts             # archguard serve (MCP server)
│               ├── decisions.ts         # archguard decisions [list|add|remove|edit]
│               ├── watch.ts             # archguard watch
│               ├── velocity.ts          # archguard velocity [--team|--dev <name>]
│               ├── summary.ts           # archguard summary [--dev <name>] [--period weekly|sprint]
│               ├── login.ts             # archguard login (auth to hosted/self-hosted server)
│               └── server.ts            # archguard server start (run full server locally)
```

---

## Module 1: Codebase Analyzer — Detailed Spec

### Purpose
Scan a codebase and automatically extract architectural decisions, patterns, and dependency structures.

### How It Works

1. **File Discovery:** Walk the repo respecting .gitignore. Identify language by extension. Skip node_modules, vendor, build dirs, binary files.

2. **AST Parsing (tree-sitter):** For each source file, parse the AST and extract:
   - Import/export relationships
   - Class/function/module declarations
   - Decorator/annotation usage (e.g., @Injectable, @Controller)
   - Config file patterns (webpack, tsconfig, docker-compose, etc.)
   - Directory structure conventions (e.g., `/controllers`, `/services`, `/repositories`)

3. **Pattern Detection (heuristic + LLM):**
   - First pass: heuristic rules detect common patterns:
     - MVC / MVVM / Clean Architecture (by directory structure + naming)
     - Repository pattern (interfaces + implementations)
     - Dependency injection (decorators, constructor patterns)
     - Event-driven (event emitters, pub/sub patterns)
     - Middleware chains (Express/Koa style)
     - API versioning strategies
     - State management patterns (Redux, Zustand, etc.)
   - Second pass: Send representative code samples to Claude Sonnet with this prompt structure:

```
You are an expert software architect. Analyze the following code samples from a {language} codebase and identify:

1. Architectural patterns in use (with evidence)
2. Implicit architectural decisions (naming conventions, error handling strategies, data flow patterns, API design choices)
3. Technology choices and their implications
4. Anti-patterns or inconsistencies that suggest architectural drift

Code samples:
{samples}

Directory structure:
{tree}

Respond as structured JSON matching this schema:
{ArchDecision schema}
```

4. **Dependency Mapping:** Build a directed graph of module dependencies. Identify:
   - Circular dependencies
   - Layer violations (e.g., controller importing from repository directly)
   - Coupling hotspots

5. **Output:** Store all decisions in the database + generate a markdown report.

### ArchDecision Schema

```typescript
interface ArchDecision {
  id: string;
  title: string;
  description: string;
  category: ArchCategory;
  status: 'detected' | 'confirmed' | 'deprecated' | 'custom';
  confidence: number;              // 0-1
  evidence: Evidence[];
  constraints: string[];
  relatedDecisions: string[];
  detectedAt: string;
  confirmedBy?: string;
  tags: string[];
}

interface Evidence {
  filePath: string;
  lineRange: [number, number];
  snippet: string;
  explanation: string;
}

type ArchCategory = 'structural' | 'behavioral' | 'deployment' | 'data' | 'api' | 'testing' | 'security';
```

### Drift Detection & Trend Analysis

The analyzer tracks decisions over configurable time windows (1mo, 3mo, 6mo, 12mo). On each analysis run:

1. **Snapshot:** Store a timestamped snapshot of all detected decisions + confidence scores.
2. **Diff:** Compare current snapshot against the previous one. Identify:
   - New decisions (patterns that appeared)
   - Lost decisions (patterns that disappeared — possible drift)
   - Confidence changes (a pattern becoming less consistent)
   - Constraint violations trending up or down
3. **Drift Score:** Calculate an overall architectural drift score (0-100) based on:
   - Number of lost/weakened decisions
   - Violation trend direction
   - Dependency graph instability (new circular deps, coupling increase)
4. **Timeline:** Store drift scores over time for the dashboard trend chart.

```typescript
interface ArchSnapshot {
  id: string;
  repoId: string;
  commitSha: string;
  decisions: ArchDecision[];
  driftScore: number;
  dependencyStats: {
    totalModules: number;
    circularDeps: number;
    avgCoupling: number;
  };
  createdAt: string;
}

interface DriftEvent {
  id: string;
  repoId: string;
  type: 'decision_lost' | 'decision_weakened' | 'new_violation_trend' | 'circular_dep_introduced' | 'decision_emerged';
  decisionId?: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  detectedAt: string;
  snapshotId: string;
}
```

---

## Module 2: Context File Sync — Detailed Spec

### Purpose
Take the extracted architectural decisions and automatically generate/update context files used by various AI coding agents.

### Supported Output Formats

Each generator takes the list of ArchDecisions and produces a context file:

1. **`.cursorrules`** — Cursor's project-level instructions
2. **`CLAUDE.md`** — Claude Code's project context file
3. **`.github/copilot-instructions.md`** — GitHub Copilot instructions
4. **`agents.md`** — Generic agent instructions (Agents.md format)
5. **`.windsurfrules`** — Windsurf's project-level instructions
6. **`.kiro/steering.md`** — AWS Kiro's steering document
7. **Custom templates** — User-defined Handlebars templates

### Generation Strategy

For each format, use a two-stage approach:
1. **Template stage:** Fill a structured template with decisions, constraints, and patterns
2. **LLM refinement stage (optional):** Send the template output to Claude to produce natural-language instructions optimized for that specific agent's context window and instruction format

### Sync Engine

- `archguard sync` — One-shot generation of all configured context files
- `archguard watch` — File watcher that re-syncs when source files change (debounced, 5s)
- **Server mode:** BullMQ job triggered by webhook on push to default branch
- Sync preserves user-added sections marked with `<!-- archguard:user-start -->` / `<!-- archguard:user-end -->` comment blocks
- Optionally auto-commits synced files via a PR (configurable)

---

## Module 3: MCP Server — Detailed Spec

### Purpose
Expose architectural decisions as an MCP server so AI coding agents can query architectural guidance in real-time while generating code.

### MCP Tools

```typescript
// Tool 1: Get relevant architectural decisions
{
  name: "get_architectural_decisions",
  description: "Get architectural decisions relevant to a specific file path, module, or topic",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "File path, module name, or architectural topic" },
      category: { type: "string", enum: ["structural", "behavioral", "deployment", "data", "api", "testing", "security"] }
    },
    required: ["query"]
  }
}

// Tool 2: Check architectural compliance
{
  name: "check_architectural_compliance",
  description: "Check if a code snippet complies with the project's architectural decisions",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string" },
      filePath: { type: "string" },
      intent: { type: "string" }
    },
    required: ["code", "filePath"]
  }
}

// Tool 3: Get architectural guidance
{
  name: "get_architectural_guidance",
  description: "Get guidance on the correct architectural approach for a given task",
  inputSchema: {
    type: "object",
    properties: {
      task: { type: "string" },
      constraints: { type: "array", items: { type: "string" } }
    },
    required: ["task"]
  }
}

// Tool 4: Get dependency information
{
  name: "get_dependency_graph",
  description: "Get the dependency graph for a module or file",
  inputSchema: {
    type: "object",
    properties: {
      target: { type: "string" },
      depth: { type: "number", default: 2 }
    },
    required: ["target"]
  }
}
```

### MCP Resources

- `archguard://decisions` — Full list of architectural decisions
- `archguard://decisions/{id}` — Individual decision detail
- `archguard://patterns` — Detected patterns summary
- `archguard://dependencies/{module}` — Dependency graph for a module
- `archguard://constraints` — All architectural constraints

### Transport

Support both `stdio` (for Claude Code, Cursor, etc.) and `SSE` (for web-based agents). Configurable via `.archguard.yml` or CLI flags.

---

## Module 4: Architectural Code Review — Detailed Spec

### Purpose
Review code changes (git diffs) against established architectural decisions and flag violations.

### How It Works

1. **Diff Parsing:** Parse git diff into structured hunks with file paths and changed lines.

2. **Rule Matching (fast pass):** Deterministic rules from arch decisions:
   - Import violations (domain importing from infrastructure)
   - File placement violations (new repo not in `/repositories/`)
   - Naming convention violations
   - Missing required patterns (new endpoint without DTO)
   - Circular dependency introduction

3. **LLM Review (deep pass):** Send diff + relevant decisions to Claude for nuanced review.

4. **Output Formatting:**
   - Terminal: colored output
   - GitHub PR: auto-comment via GitHub App with inline annotations
   - Bitbucket PR: auto-comment via Bitbucket API with inline annotations
   - JSON: machine-readable for CI
   - Slack: summary notification with violation count + link to full review

### GitHub App Integration

ArchGuard runs as a **GitHub App** that:
- Listens for `pull_request.opened`, `pull_request.synchronize`, and `push` events
- Automatically triggers architectural review on new/updated PRs
- Posts review comments with inline violation annotations using the GitHub Check Runs API
- Sets a pass/fail check status based on severity threshold
- Supports per-repo configuration via `.archguard.yml` in the repo

### Bitbucket Integration

Same behavior via Bitbucket webhooks:
- Listens for `pullrequest:created`, `pullrequest:updated` events
- Posts inline comments via Bitbucket Code Insights API
- Sets build status

### CLI Usage

```bash
archguard review                           # Review staged changes
archguard review --diff main               # Review against branch
archguard review --commit abc123           # Review specific commit
archguard review --diff main --format github  # GitHub PR comment format
archguard review --diff main --format bitbucket # Bitbucket format
archguard review --diff main --ci          # Exit code 1 if errors found
```

---

## Module 5: Team Velocity Tracker (Management Agent) — Detailed Spec

### Purpose
Monitor developer and team productivity using code-complexity-weighted metrics, not vanity stats like raw lines of code or commit count.

### Data Collection

The velocity module collects data from git history and PR platforms:

**Git-level metrics (per developer, per time window):**
- Commits count
- Files changed
- Lines added/removed (raw)
- File types touched
- Commit time distribution (working hours pattern)

**Complexity-weighted metrics:**
- **Weighted LOC:** Lines of code weighted by cyclomatic complexity of the functions they touch. Changing a 3-line function with complexity 15 scores higher than changing a 50-line function with complexity 2.
- **Cognitive complexity delta:** Net change in cognitive complexity across the codebase from this developer's changes.
- **Architectural impact score:** How many architectural boundaries a change crosses. A change touching 3 layers scores higher effort than one touching 1 layer.
- **Refactoring ratio:** Percentage of changes that reduce complexity vs add it.

**PR-level metrics:**
- PR size (files, LOC)
- Time to first review
- Time from review to merge
- Review rounds (back-and-forth count)
- PRs with architectural violations

### Velocity Scoring

```typescript
interface VelocityScore {
  developerId: string;
  period: 'daily' | 'weekly' | 'sprint' | 'monthly';
  periodStart: string;
  periodEnd: string;

  // Raw metrics
  commits: number;
  prsOpened: number;
  prsMerged: number;
  linesAdded: number;
  linesRemoved: number;

  // Weighted metrics
  weightedEffort: number;        // Complexity-weighted effort score (0-100 scale)
  architecturalImpact: number;   // How much arch-significant work (0-100)
  refactoringRatio: number;      // 0-1, portion of work that's cleanup
  reviewContribution: number;    // Reviews given to others (weighted by depth)

  // Composite
  velocityScore: number;         // Overall score combining all weighted metrics
  trend: 'accelerating' | 'stable' | 'decelerating';
  blockers: Blocker[];
}

interface Blocker {
  type: 'stalled_pr' | 'long_lived_branch' | 'review_bottleneck' | 'high_violation_rate' | 'dependency_block';
  description: string;
  severity: 'high' | 'medium' | 'low';
  relatedEntity: string;        // PR URL, branch name, etc.
  staleSince?: string;
}

interface TeamVelocity {
  teamId: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  members: VelocityScore[];
  teamVelocityScore: number;
  topBlockers: Blocker[];
  architecturalHealth: number;   // From drift score
  highlights: string[];          // LLM-generated team highlights
}
```

### Blocker Detection

Automatically identify and surface:
- **Stalled PRs:** Open PRs with no activity for >3 days (configurable)
- **Long-lived branches:** Feature branches open >1 week without merge
- **Review bottlenecks:** Developers with >3 PRs awaiting their review
- **High violation rates:** Developers whose PRs consistently trigger arch violations
- **Dependency blocks:** PRs blocked by other unmerged PRs

### Scheduling

Velocity calculation runs as a BullMQ cron job:
- Daily: Calculate daily scores at midnight UTC
- Weekly: Roll up weekly scores on Monday
- On-demand: CLI or API trigger

---

## Module 6: Work Summary Generator (Management Agent) — Detailed Spec

### Purpose
Generate AI-powered summaries of what each developer accomplished, derived from code analysis. Designed for 1:1 prep, standups, sprint reviews, and stakeholder reports.

### Data Sources

For a given developer + time period, collect:
- All commits with messages
- All PRs opened, reviewed, and merged (with descriptions)
- Architectural decisions affected
- Velocity metrics for the period
- Violations introduced vs resolved
- Files/modules primarily worked on

### Summary Generation

Send collected data to Claude with format-specific prompts:

**1:1 Meeting Prep:**
```
Generate a concise 1:1 meeting prep summary for {developer_name} covering {period}.

Include:
- Top 3 accomplishments (tied to specific PRs/commits)
- Current work in progress
- Blockers or areas where they might need help
- Architectural contributions or concerns
- Suggested discussion topics

Data: {collected_data}

Keep it factual and tied to code evidence. No fluff.
```

**Daily Standup:**
```
Generate a standup summary for {developer_name} for yesterday.

Format:
- Done: [completed items]
- Doing: [in progress]
- Blocked: [if any]

Data: {collected_data}
```

**Sprint/Weekly Review:**
```
Generate a sprint review summary for {developer_name} covering {period}.

Include:
- Key deliverables with links to PRs
- Velocity trend vs previous sprint
- Architectural impact of their work
- Code quality metrics (violations introduced vs resolved, complexity changes)

Data: {collected_data}
```

**Progress Report (for stakeholders/managers):**
```
Generate a high-level progress report for the {team_name} team covering {period}.

Include:
- Major features/capabilities delivered
- Architectural health trend
- Team velocity trend
- Top blockers
- Upcoming focus areas (inferred from open PRs and branches)

Data: {collected_data}

Write for a non-technical audience. Focus on outcomes and impact.
```

### Summary Types

```typescript
interface WorkSummary {
  id: string;
  developerId?: string;       // null for team summaries
  teamId: string;
  type: 'one_on_one' | 'standup' | 'sprint_review' | 'progress_report';
  periodStart: string;
  periodEnd: string;
  content: string;            // Generated markdown
  dataPoints: {               // Raw data backing the summary
    commits: number;
    prsOpened: number;
    prsMerged: number;
    reviewsGiven: number;
    violationsIntroduced: number;
    violationsResolved: number;
    filesChanged: number;
    keyPrs: string[];         // PR URLs
  };
  generatedAt: string;
  editedContent?: string;     // If user manually edited
}
```

### Scheduling & Delivery

- **Automatic generation:** Cron-configurable. Example: generate standup summaries at 9am, weekly summaries on Monday, sprint summaries on sprint end date.
- **Slack delivery:** Post summaries to configured Slack channels or DMs.
- **Dashboard:** View and edit summaries in the web UI.
- **CLI:** `archguard summary --dev "jane" --period weekly`

---

## Module 7: Slack Integration — Detailed Spec

### Slack App Features

**Slash Commands:**
- `/archguard status` — Current architectural health score + velocity summary
- `/archguard decisions` — List top architectural decisions
- `/archguard review <pr-url>` — Trigger an architectural review
- `/archguard summary <dev-name> <period>` — Generate a work summary
- `/archguard blockers` — List current blockers

**Automated Notifications (configurable per channel):**
- New architectural violations on merged PRs (with severity filter)
- Drift alerts when drift score exceeds threshold
- Weekly velocity digest
- Work summaries posted on schedule
- Blocker alerts for stalled PRs
- New architectural decisions detected

**Slack Block Kit Messages:**
Each notification uses rich Block Kit formatting with:
- Summary header
- Key metrics in a section
- Action buttons (View in Dashboard, View PR, Dismiss)
- Color-coded severity indicators

---

## Module 8: Auth & RBAC — Detailed Spec

### Roles

```typescript
type Role = 'owner' | 'admin' | 'member' | 'viewer';

const permissions = {
  owner: ['*'],                           // Everything
  admin: [
    'decisions:read', 'decisions:write', 'decisions:confirm', 'decisions:deprecate',
    'reviews:read', 'reviews:trigger',
    'velocity:read',
    'summaries:read', 'summaries:generate',
    'team:read', 'team:invite', 'team:remove',
    'repos:read', 'repos:connect', 'repos:disconnect',
    'settings:read', 'settings:write',
    'rules:read', 'rules:write',
    'integrations:read', 'integrations:write',
  ],
  member: [
    'decisions:read', 'decisions:write', 'decisions:confirm',
    'reviews:read', 'reviews:trigger',
    'velocity:read:own',                  // Can only see own velocity
    'summaries:read:own',                 // Can only see own summaries
    'repos:read',
    'rules:read',
  ],
  viewer: [
    'decisions:read',
    'reviews:read',
    'repos:read',
  ],
};
```

### Auth Methods

Using **Better Auth** library:
- **Email/Password** — Default for all tiers
- **OAuth** — GitHub and Google OAuth for convenience
- **SAML 2.0** — Enterprise tier only. Configure via dashboard settings page. Supports Okta, Azure AD, OneLogin, etc.
- **API Keys** — For CI/CD and CLI authentication. Scoped to specific permissions.

### Multi-tenancy

- Organizations as top-level entity
- Users belong to one or more orgs with a role per org
- Repos are connected to orgs
- All data is org-scoped
- Org switcher in dashboard sidebar

---

## Database Schema

```sql
-- Organizations
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',  -- free, starter, teams, enterprise
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'email', -- email, github, google, saml
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Org memberships
CREATE TABLE org_members (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',  -- owner, admin, member, viewer
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- API Keys
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  permissions TEXT[] NOT NULL,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Connected repositories
CREATE TABLE repositories (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,  -- github, bitbucket
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,  -- org/repo
  default_branch TEXT NOT NULL DEFAULT 'main',
  clone_url TEXT NOT NULL,
  webhook_secret TEXT,
  last_analyzed_at TIMESTAMPTZ,
  config JSONB DEFAULT '{}',  -- per-repo overrides
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Developers (mapped from git authors)
CREATE TABLE developers (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),  -- linked platform user, if any
  git_name TEXT NOT NULL,
  git_email TEXT NOT NULL,
  github_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, git_email)
);

-- Architectural decisions
CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'detected',
  confidence REAL NOT NULL DEFAULT 0.5,
  constraints JSONB DEFAULT '[]',
  related_decisions JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  detected_at TIMESTAMPTZ NOT NULL,
  confirmed_by TEXT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL
);

-- Evidence supporting decisions
CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  snippet TEXT NOT NULL,
  explanation TEXT NOT NULL
);

-- Architectural snapshots (for drift tracking)
CREATE TABLE arch_snapshots (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_sha TEXT NOT NULL,
  drift_score REAL NOT NULL DEFAULT 0,
  decision_count INTEGER NOT NULL,
  dependency_stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL
);

-- Drift events
CREATE TABLE drift_events (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL REFERENCES arch_snapshots(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  decision_id TEXT REFERENCES decisions(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL
);

-- Dependencies
CREATE TABLE dependencies (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  source_file TEXT NOT NULL,
  target_file TEXT NOT NULL,
  import_type TEXT,
  snapshot_id TEXT REFERENCES arch_snapshots(id) ON DELETE CASCADE,
  detected_at TIMESTAMPTZ NOT NULL
);

-- Code reviews
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  ref TEXT NOT NULL,
  pr_number INTEGER,
  pr_url TEXT,
  total_violations INTEGER NOT NULL,
  errors INTEGER NOT NULL,
  warnings INTEGER NOT NULL,
  infos INTEGER NOT NULL,
  results JSONB NOT NULL,
  triggered_by TEXT,  -- 'webhook', 'cli', 'manual'
  reviewed_at TIMESTAMPTZ NOT NULL
);

-- Velocity scores
CREATE TABLE velocity_scores (
  id TEXT PRIMARY KEY,
  developer_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  period TEXT NOT NULL,          -- daily, weekly, sprint, monthly
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  commits INTEGER NOT NULL DEFAULT 0,
  prs_opened INTEGER NOT NULL DEFAULT 0,
  prs_merged INTEGER NOT NULL DEFAULT 0,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_removed INTEGER NOT NULL DEFAULT 0,
  weighted_effort REAL NOT NULL DEFAULT 0,
  architectural_impact REAL NOT NULL DEFAULT 0,
  refactoring_ratio REAL NOT NULL DEFAULT 0,
  review_contribution REAL NOT NULL DEFAULT 0,
  velocity_score REAL NOT NULL DEFAULT 0,
  trend TEXT NOT NULL DEFAULT 'stable',
  blockers JSONB DEFAULT '[]',
  calculated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(developer_id, repo_id, period, period_start)
);

-- Work summaries
CREATE TABLE work_summaries (
  id TEXT PRIMARY KEY,
  developer_id TEXT REFERENCES developers(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,            -- one_on_one, standup, sprint_review, progress_report
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  content TEXT NOT NULL,
  data_points JSONB DEFAULT '{}',
  edited_content TEXT,
  generated_at TIMESTAMPTZ NOT NULL
);

-- Context file sync history
CREATE TABLE sync_history (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  output_path TEXT NOT NULL,
  decisions_count INTEGER NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL
);

-- SAML configurations (enterprise)
CREATE TABLE saml_configs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  idp_entity_id TEXT NOT NULL,
  idp_sso_url TEXT NOT NULL,
  idp_certificate TEXT NOT NULL,
  sp_entity_id TEXT NOT NULL,
  default_role TEXT NOT NULL DEFAULT 'member',
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Config File: `.archguard.yml`

```yaml
version: 1

# Connection to ArchGuard server (for team features)
server:
  url: "https://archguard.yourcompany.com"   # or http://localhost:3000 for local
  api_key_env: ARCHGUARD_API_KEY

# Analysis settings
analysis:
  include:
    - "src/**"
    - "lib/**"
  exclude:
    - "**/*.test.*"
    - "**/*.spec.*"
    - "**/node_modules/**"
    - "**/dist/**"
  languages:
    - typescript
    - python
  max_file_size_kb: 500
  llm_analysis: true
  analysis_period_months: 6       # How far back to analyze for drift

# LLM settings
llm:
  provider: anthropic
  model: claude-sonnet-4-20250514
  api_key_env: ANTHROPIC_API_KEY
  max_tokens_per_analysis: 4096
  cache_ttl_hours: 24

# Context file sync
sync:
  formats:
    - cursorrules
    - claude
    - copilot
    - windsurf
    - kiro
  output_dir: "."
  preserve_user_sections: true
  auto_commit: false              # Auto-commit synced files
  auto_pr: false                  # Open PR with synced files

# MCP server
mcp:
  transport: stdio
  llm_enhanced: true

# Architectural review
review:
  severity_threshold: warning
  max_violations: 50
  auto_fix_suggestions: true
  auto_review_prs: true           # Auto-review via GitHub/Bitbucket bot

# Velocity tracking
velocity:
  enabled: true
  calculation_schedule: "0 0 * * *"   # Daily at midnight UTC
  complexity_weight: 0.4              # Weight for complexity in effort score
  arch_impact_weight: 0.3             # Weight for architectural impact
  review_weight: 0.15                 # Weight for review contributions
  refactoring_weight: 0.15            # Weight for refactoring ratio
  stale_pr_days: 3                    # Days before PR is flagged stale
  long_branch_days: 7                 # Days before branch is flagged long-lived

# Work summaries
summaries:
  enabled: true
  schedules:
    - type: standup
      cron: "0 9 * * 1-5"            # Weekdays at 9am
      slack_channel: "#dev-standups"
    - type: sprint_review
      cron: "0 10 * * 5"             # Friday at 10am
      slack_channel: "#engineering"
    - type: progress_report
      cron: "0 9 * * 1"              # Monday at 9am
      slack_channel: "#leadership"

# Slack
slack:
  bot_token_env: SLACK_BOT_TOKEN
  signing_secret_env: SLACK_SIGNING_SECRET
  notifications:
    violations:
      channel: "#arch-reviews"
      severity_threshold: error
    drift:
      channel: "#engineering"
      score_threshold: 30
    blockers:
      channel: "#dev-blockers"

# Custom architectural rules
rules:
  - name: "No direct DB access outside repositories"
    pattern: "import.*from.*prisma|import.*from.*typeorm"
    allowed_in:
      - "src/infrastructure/repositories/**"
    severity: error

  - name: "API routes must use DTOs"
    pattern: "req\\.body\\."
    not_allowed_in:
      - "src/application/controllers/**"
    severity: warning
```

---

## Docker & Self-Hosted Deployment

### docker-compose.yml (development)

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: archguard
      POSTGRES_USER: archguard
      POSTGRES_PASSWORD: archguard
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  server:
    build:
      context: .
      dockerfile: Dockerfile
      target: server
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://archguard:archguard@postgres:5432/archguard
      REDIS_URL: redis://redis:6379
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      SLACK_BOT_TOKEN: ${SLACK_BOT_TOKEN}
      SLACK_SIGNING_SECRET: ${SLACK_SIGNING_SECRET}
      GITHUB_APP_ID: ${GITHUB_APP_ID}
      GITHUB_PRIVATE_KEY: ${GITHUB_PRIVATE_KEY}
      GITHUB_WEBHOOK_SECRET: ${GITHUB_WEBHOOK_SECRET}
    depends_on:
      - postgres
      - redis

  dashboard:
    build:
      context: .
      dockerfile: Dockerfile
      target: dashboard
    ports:
      - "3001:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3000

  worker:
    build:
      context: .
      dockerfile: Dockerfile
      target: worker
    environment:
      DATABASE_URL: postgresql://archguard:archguard@postgres:5432/archguard
      REDIS_URL: redis://redis:6379
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    depends_on:
      - postgres
      - redis

volumes:
  pgdata:
```

### Dockerfile (multi-stage)

```dockerfile
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build

FROM base AS server
CMD ["node", "packages/server/dist/index.js"]

FROM base AS dashboard
CMD ["node", "packages/dashboard/.next/standalone/server.js"]

FROM base AS worker
CMD ["node", "packages/server/dist/worker.js"]
```

### Kubernetes Helm Chart (enterprise)

Include a basic Helm chart in `deploy/helm/archguard/` with:
- Deployment for server, dashboard, worker
- Service + Ingress
- PostgreSQL + Redis as subcharts (or external connection config)
- ConfigMap for `.archguard.yml` server config
- Secrets for API keys
- HPA for worker scaling

---

## CLI Commands Summary

```bash
# Setup
archguard init                              # Initialize in a project
archguard login                             # Auth to ArchGuard server

# Architecture Agent
archguard analyze [--path <dir>] [--no-llm]
archguard decisions list|add|confirm|deprecate|remove|export
archguard sync [--format all|cursorrules|claude|copilot|windsurf|kiro]
archguard review [--diff <ref>] [--format terminal|github|bitbucket|json] [--ci]
archguard serve [--transport stdio|sse]     # MCP server
archguard watch                             # File watcher mode

# Management Agent
archguard velocity [--team] [--dev <name>] [--period weekly|monthly]
archguard summary [--dev <name>] [--type standup|one_on_one|sprint_review|progress_report] [--period weekly|sprint]
archguard blockers [--team]

# Server (self-hosted)
archguard server start                      # Run API server locally
archguard server migrate                    # Run DB migrations
```

---

## Implementation Order

Build in this order, verifying each module works before moving on:

1. **`packages/core`** — Types, config loader, DB (Drizzle schema + migrations for both Postgres and SQLite), LLM client, git helpers, auth types
2. **`packages/analyzer`** — Scanner, pattern detection, decision extraction, drift detection, trend analysis
3. **`packages/cli`** — `init`, `analyze`, `decisions` commands (local SQLite mode first)
4. **`packages/context-sync`** — All 7 generators (cursorrules, claude, copilot, agents, windsurf, kiro, custom) + sync engine
5. **`packages/cli`** — Add `sync` and `watch` commands
6. **`packages/mcp-server`** — MCP tools and resources, stdio + SSE transport
7. **`packages/cli`** — Add `serve` command
8. **`packages/reviewer`** — Diff analysis, rule engine, LLM review, all 4 formatters (terminal, github, bitbucket, json)
9. **`packages/cli`** — Add `review` command
10. **`packages/velocity`** — Git stats collector, complexity analysis, effort model, velocity calculator, blocker detection
11. **`packages/work-summary`** — Data collector, LLM summarizer, all 4 templates, scheduler
12. **`packages/cli`** — Add `velocity`, `summary`, `blockers` commands
13. **`packages/server`** — Hono API server, Better Auth setup (email + OAuth + API keys), RBAC middleware, all route handlers, BullMQ job queue, webhook receivers
14. **`packages/integrations`** — GitHub App (PR bot, check runs), Bitbucket (webhook handler, PR comments), Slack (Bolt app, slash commands, notifications, Block Kit messages)
15. **`packages/dashboard`** — Next.js app: auth pages, decision management, review history, velocity charts, work summaries, drift timeline, dependency graph viz, team management, settings, integration config, SAML config
16. **Docker** — Dockerfile, docker-compose.yml, docker-compose.prod.yml
17. **Helm chart** — Basic Kubernetes deployment for enterprise self-hosted
18. **`packages/cli`** — Add `login`, `server start`, `server migrate` commands
19. **Tests** — Unit tests for every module, integration tests for CLI and API, E2E tests for dashboard critical paths

---

## Key Implementation Notes

- **Dual database mode:** CLI solo mode uses SQLite (zero config). Server mode uses PostgreSQL. The Drizzle ORM schema should abstract this — use a db client factory in `packages/core/src/db/index.ts` that picks the right driver based on config.
- **LLM calls should be optional.** Every feature that uses Claude should have a `--no-llm` fallback that uses only heuristic/AST analysis.
- **Cache aggressively.** Store LLM responses with TTL. Don't re-analyze files that haven't changed (use file content hashes).
- **Tree-sitter grammars:** Install as optional peer deps. Gracefully degrade if a grammar isn't installed for a language.
- **MCP server must work with stdio transport** for Claude Code/Cursor compatibility. SSE is for web-based agents.
- **All CLI output should respect `--json` flag** for machine consumption.
- **Use streaming for LLM calls** where possible to show progress in CLI.
- **The GitHub App should be installable** via a `/api/github/install` redirect that initiates the OAuth flow.
- **Bitbucket integration** uses Bitbucket's REST API 2.0 and webhook events.
- **Slack app** should be installable via OAuth flow from the dashboard settings page.
- **SAML 2.0** should support SP-initiated SSO. Use Better Auth's enterprise SAML plugin. The dashboard settings page should allow admins to paste IdP metadata XML or manually configure entity ID, SSO URL, and certificate.
- **SSE for live dashboard:** The server should push events for new reviews, velocity updates, drift alerts, and summary generation completions. The dashboard subscribes via EventSource.
- **The `init` command should be interactive** — ask which languages, which context file formats, whether to enable LLM, whether to connect to a server.
- **Git integration:** Auto-detect CI environment (GitHub Actions, GitLab CI, Bitbucket Pipelines) and adjust output format.
- **Velocity charts** should use Recharts with rolling 7-day and 30-day averages. Show per-developer and team aggregate views.
- **Dependency graph visualization** should use react-flow or d3-force for an interactive node graph in the dashboard.

---

## README Structure

1. One-liner description + badges (npm, license, CI, Discord)
2. Hero screenshot of the dashboard
3. Why this exists (AI agents + architectural drift problem statement)
4. Quick start — CLI mode (npm install, archguard init, archguard analyze)
5. Quick start — Server mode (docker-compose up)
6. Feature walkthrough:
   - Architecture Agent (analyze, sync, review, MCP)
   - Management Agent (velocity, summaries)
   - Integrations (GitHub App, Bitbucket, Slack)
7. MCP server setup guide for Cursor, Claude Code, Windsurf, Kiro, Copilot
8. Configuration reference (.archguard.yml)
9. CI/CD integration guide (GitHub Actions example workflow)
10. Self-hosted deployment guide (Docker, Kubernetes)
11. SAML SSO configuration guide
12. API documentation link
13. Contributing guide
14. License (MIT)

---

## Go build this. Start with `packages/core` and work through the implementation order. Make each module functional and tested before moving to the next. Write clean, well-documented TypeScript with JSDoc on all public APIs. This should be a production-quality open-source project that teams would actually adopt.
