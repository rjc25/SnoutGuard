# ArchGuard

**Open-source architectural guardrails and engineering intelligence for AI-powered development teams.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/archguard/archguard/actions/workflows/ci.yml/badge.svg)](https://github.com/archguard/archguard/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@archguard/cli)](https://www.npmjs.com/package/@archguard/cli)

---

ArchGuard analyzes your codebase to automatically extract architectural decisions, syncs them to AI agent context files (CLAUDE.md, .cursorrules, copilot-instructions.md, and more), provides an MCP server for real-time architectural guidance, runs architectural code reviews on PRs, tracks team velocity weighted by code complexity, and generates developer work summaries.

## Prerequisites

**An Anthropic API key is required.** ArchGuard uses Claude as its core analysis engine — the LLM is the product, not an optional enhancement.

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Get an API key at: https://console.anthropic.com/settings/keys
```

## Why ArchGuard?

AI coding agents are powerful but architecturally unaware. They generate code that works but often violates your team's established patterns, introduces layer violations, or creates inconsistencies. Meanwhile, engineering managers lack visibility into what AI-assisted development is actually producing.

ArchGuard solves both problems:

- **Architecture Agent** keeps AI coding assistants aligned with your team's architectural decisions
- **Management Agent** provides complexity-weighted velocity tracking and AI-generated work summaries

## Quick Start (CLI)

```bash
# Clone and build from source
git clone https://github.com/rjc25/ArchGuard
cd ArchGuard
pnpm install
pnpm build

# Link the CLI globally (puts 'archguard' in PATH via node's bin)
npm link packages/cli

# Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-...

# Then in any project:
cd ~/your-project
archguard init

# Analyze your codebase (uses Claude Opus)
archguard analyze

# Generate AI agent context files (uses Opus to intelligently compress)
archguard sync

# Start the MCP server for real-time guidance
archguard serve

# Review changes against architectural decisions (uses Claude Sonnet)
archguard review --diff main

# Check model assignments and estimated costs
archguard costs
```

## Quick Start (Server Mode)

```bash
# Clone and run with Docker
git clone https://github.com/rjc25/ArchGuard
cd ArchGuard

# Set up environment
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY (required)

# Start all services
docker-compose up -d

# Dashboard available at http://localhost:3001
# API server at http://localhost:3000
```

## Setup via AI Coding Agent

### One-Shot Install & Analyze

Copy and paste this into [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [OpenClaw](https://github.com/openclaw/openclaw), or any AI coding agent. It will install ArchGuard, analyze your codebase, and configure the MCP server:

```
Install ArchGuard (https://github.com/rjc25/ArchGuard) and analyze my codebase.

INSTALL:
- Clone the repo, install with pnpm, build all packages, link the CLI globally
- If ANTHROPIC_API_KEY isn't set, walk me through getting one from console.anthropic.com

ANALYZE:
- Run "archguard init" in my project to generate .archguard.yml
- Run "archguard analyze" to extract architectural decisions (Opus ~$10-16, or set
  analyze model to Sonnet in .archguard.yml for ~$2-3)
- Run "archguard sync" to generate CLAUDE.md (and other context files) with decisions
  compressed for AI context
- Show me the CLAUDE.md and a summary of decisions found

MCP SERVER:
- Configure "archguard serve" as an MCP server (stdio transport) in my editor's MCP config:
  Claude Code: .claude/settings.json
  Cursor: .cursor/mcp.json
  Windsurf: equivalent config
- The server exposes 4 tools: get_architectural_guidance (describe a task, get relevant
  constraints), get_architectural_decisions (search by keyword), check_architectural_compliance
  (validate code), get_dependency_graph (query module coupling)
```

### What Happens After Setup

The generated context files (CLAUDE.md, .cursorrules, etc.) include a **Workflow** section that tells your AI agent to:

1. **Before writing code** — call `get_architectural_guidance` with a task description (if MCP is configured), or review relevant constraints in the context file
2. **After changes** — run `archguard review --diff <branch>` to catch violations before committing
3. **After significant refactors** — run `archguard analyze` then `archguard sync` to keep context files fresh (incremental — only re-analyzes changed files, costs pennies)

This means the enforcement is **baked into the context file itself** — every agent session that loads CLAUDE.md (or .cursorrules, copilot-instructions.md, etc.) gets the workflow rules automatically. You don't need to remember to tell your agent to check architecture; it's already in its instructions.

**For sub-agents and CI:** Include the generated CLAUDE.md content in sub-agent task prompts, and add `archguard review --diff origin/main --ci` to your CI pipeline for automated PR review.

## Features

### Architecture Agent

**Codebase Analysis** (`archguard analyze`)
- Scans your codebase using AST parsing and LLM analysis (Claude Opus by default)
- Detects architectural patterns: MVC, Clean Architecture, Repository, DI, Event-Driven, and more
- Maps module dependencies with Robert C. Martin coupling metrics (Ca, Ce, Instability, Abstractness, Distance)
- Identifies circular dependencies and coupling hotspots
- Detects layer boundary violations against configurable layer hierarchy
- Tracks architectural drift over time with configurable time windows
- Works with TypeScript, JavaScript, Python, Go, Rust, and Java
- Reports LLM cost per run with detailed per-call breakdown

**Context File Sync** (`archguard sync`)
- Auto-generates context files from your architectural decisions:
  - `CLAUDE.md` for Claude Code
  - `.cursorrules` for Cursor
  - `.github/copilot-instructions.md` for GitHub Copilot
  - `agents.md` for Agents.md format
  - `.windsurfrules` for Windsurf
  - `.kiro/steering.md` for AWS Kiro
  - Custom Handlebars templates
- Watch mode auto-syncs on file changes
- Preserves user-added sections
- **LLM-powered compression** — Opus intelligently prioritizes and compresses decisions to fit a configurable token budget (default 8192 tokens), typically 60-70% smaller than raw templates
- Template-only fallback with `--no-llm` flag

**MCP Server** (`archguard serve`)
- Exposes architectural decisions via Model Context Protocol
- Tools: `get_architectural_decisions`, `check_architectural_compliance`, `get_architectural_guidance`, `get_dependency_graph`
- Resources: decisions, patterns, constraints, dependencies
- Works with Claude Code, Cursor, Windsurf, and other MCP-compatible agents
- Supports stdio and SSE transports
- Uses Claude Sonnet for fast query responses

**Architectural Code Review** (`archguard review`)
- Reviews git diffs against established architectural decisions (Claude Sonnet by default)
- Expert-level prompts with XML-tagged context and Zod-validated structured output
- Output formats: terminal, GitHub PR comments, Bitbucket PR comments, JSON
- CI mode with configurable severity threshold

**Cost Tracking** (`archguard costs`)
- Shows current model assignments with per-million-token pricing
- Estimates costs for typical operations (analysis, review, summary)
- Monthly cost estimates for active teams
- Configurable `max_cost_per_run` safety limit

### Management Agent

**Team Velocity Tracking** (`archguard velocity`)
- Complexity-weighted effort scoring (not raw LOC)
- Architectural impact scoring
- Refactoring ratio tracking
- Review contribution metrics
- Rolling velocity per developer and per team
- Automatic blocker detection: stalled PRs, long-lived branches, review bottlenecks

**Work Summary Generation** (`archguard summary`)
- AI-powered summaries from code analysis (Claude Sonnet)
- Templates: 1:1 meeting prep, daily standup, sprint review, stakeholder progress report
- Scheduled auto-generation via cron
- Slack delivery integration

### Integrations

- **GitHub App** - Auto-review PRs, Check Runs, inline annotations
- **Bitbucket** - Webhook-based PR review, Code Insights
- **Slack** - Slash commands, automated notifications, Block Kit messages

### Web Dashboard

- Architectural decisions browser with evidence viewer
- Review history with violation details
- Velocity charts with Recharts (7-day and 30-day rolling averages)
- Work summary viewer and editor
- Drift timeline visualization
- Interactive dependency graph with coupling metrics
- Layer violation explorer
- Team management with RBAC
- Settings for integrations and custom rules

## Model Configuration

ArchGuard uses **tiered model defaults** optimized for each operation:

| Operation | Default Model | Rationale |
|-----------|--------------|-----------|
| `archguard analyze` | Claude Opus | Deep analysis, runs infrequently — quality matters most |
| `archguard review` | Claude Sonnet | Every PR, speed and cost matter |
| `archguard sync` | Claude Opus | Intelligent compression of decisions into dense context files |
| MCP server queries | Claude Sonnet | Fast interactive responses |
| Work summaries | Claude Sonnet | Summarization task, Sonnet excels |

Each operation's model is independently configurable in `.archguard.yml`:

```yaml
llm:
  provider: anthropic
  api_key_env: ANTHROPIC_API_KEY
  models:
    analyze: claude-opus-4-6        # For deep codebase analysis
    sync: claude-opus-4-6           # For context file generation
    review: claude-sonnet-4-6       # For PR review
    mcp: claude-sonnet-4-6          # For MCP server queries
    summary: claude-sonnet-4-6      # For work summaries
  max_cost_per_run: 10.00           # Safety limit in USD (0 = unlimited)
```

### Estimated Costs

| Operation | Typical Cost | Frequency |
|-----------|-------------|-----------|
| Full analysis (Opus) | $10 - $16 | Weekly or on-demand |
| Full analysis (Sonnet) | $2 - $3 | Weekly or on-demand |
| Context sync (Opus) | $0.10 - $0.50 | After analysis or major refactors |
| PR review (Sonnet) | $0.01 - $0.10 | Per PR |
| Work summary (Sonnet) | $0.02 - $0.05 | Daily/weekly |
| MCP query (Sonnet) | $0.005 - $0.02 | Per query |

> **Why sync uses Opus:** The context file is loaded into every agent session. A $0.30 Opus call that produces a 67% smaller file saves far more in cumulative token costs across hundreds of agent interactions. Use `--no-llm` for free template-based output.

Run `archguard costs` for detailed estimates based on your configuration.

## MCP Server Setup

### Claude Code

Add to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "archguard": {
      "command": "archguard",
      "args": ["serve", "--transport", "stdio"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "archguard": {
      "command": "archguard",
      "args": ["serve", "--transport", "stdio"]
    }
  }
}
```

### Windsurf / Other MCP Clients

Use the same stdio command pattern:

```bash
archguard serve --transport stdio
```

### Available MCP Tools

Once the MCP server is running, your AI agent gets access to these tools:

| Tool | What It Does | When to Use |
|------|-------------|-------------|
| `get_architectural_guidance` | Returns relevant decisions + constraints for a task description | **Before writing code** — describe what you're about to do |
| `get_architectural_decisions` | Search decisions by keyword, category, or file path | Looking up specific patterns or conventions |
| `check_architectural_compliance` | Check a code snippet against architectural constraints | Validating code before committing |
| `get_dependency_graph` | Query the dependency graph for a module | Understanding coupling and dependencies |

**`get_architectural_guidance` is the most valuable tool.** It takes a plain-English task description and returns all relevant architectural decisions, constraints, and code examples — so the agent writes architecturally compliant code from the start, instead of fixing violations after the fact.

### CLI Usage (without MCP)

You can also query the MCP server from the command line via JSON-RPC over stdio:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_architectural_guidance","arguments":{"task":"add a new webhook handler"}}}' \
  | archguard serve --transport stdio 2>/dev/null | tail -1 | python3 -m json.tool
```

## Configuration

ArchGuard is configured via `.archguard.yml` in your project root. Run `archguard init` to generate one with defaults.

The config file uses `snake_case` keys (e.g. `max_file_size_kb`), which are automatically converted to camelCase internally.

```yaml
version: 1

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
  analysis_period_months: 6

llm:
  provider: anthropic
  api_key_env: ANTHROPIC_API_KEY
  models:
    analyze: claude-opus-4-6
    review: claude-sonnet-4-6
    mcp: claude-sonnet-4-6
    summary: claude-sonnet-4-6
  max_tokens_per_analysis: 8192
  cache_ttl_hours: 720
  max_retries: 3
  retry_base_delay_ms: 1000
  request_timeout_ms: 120000
  max_cost_per_run: 10.00

sync:
  formats:
    - cursorrules
    - claude
    - copilot
    - windsurf
    - kiro
  output_dir: "."
  preserve_user_sections: true
  auto_commit: false
  auto_pr: false
  max_context_tokens: 8192   # Token budget for generated context files
  use_llm: true              # Use Opus to compress decisions (false = template-only)

mcp:
  transport: stdio

review:
  severity_threshold: warning
  max_violations: 50
  auto_fix_suggestions: true
  auto_review_prs: true

# Layer hierarchy for violation detection
layers:
  - name: presentation
    patterns:
      - "src/ui/**"
      - "src/pages/**"
      - "src/components/**"
    allowed_dependencies:
      - application
  - name: application
    patterns:
      - "src/services/**"
      - "src/usecases/**"
    allowed_dependencies:
      - domain
  - name: domain
    patterns:
      - "src/domain/**"
      - "src/models/**"
    allowed_dependencies: []
  - name: infrastructure
    patterns:
      - "src/infrastructure/**"
      - "src/repositories/**"
    allowed_dependencies:
      - domain

velocity:
  enabled: true
  calculation_schedule: "0 0 * * *"
  complexity_weight: 0.4
  arch_impact_weight: 0.3
  review_weight: 0.15
  refactoring_weight: 0.15
  stale_pr_days: 3
  long_branch_days: 7

summaries:
  enabled: true
  schedules:
    - type: standup
      cron: "0 10 * * *"
    - type: one_on_one
      cron: "0 9 * * 1"
      slack_channel: "#1-1-summaries"

slack:
  bot_token_env: SLACK_BOT_TOKEN
  signing_secret_env: SLACK_SIGNING_SECRET
  notifications:
    violations:
      channel: "#arch-violations"
      severity_threshold: warning
    drift:
      channel: "#arch-drift"
      score_threshold: 0.3
    blockers:
      channel: "#dev-blockers"

rules:
  - name: "No direct DB access outside repositories"
    pattern: "import.*from.*prisma"
    allowed_in:
      - "src/infrastructure/repositories/**"
    severity: error
```

See the full [Configuration Reference](docs/configuration.md) for all options.

## CI/CD Integration

### GitHub Actions

```yaml
- name: Architectural Review
  run: |
    npm install -g @archguard/cli
    archguard review --diff origin/main --ci --format github
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Self-Hosted Deployment

### Docker Compose

```bash
# Production deployment
cp .env.example .env
# Edit .env with production values (ANTHROPIC_API_KEY required)
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes (Helm)

```bash
# Add required secrets
kubectl create secret generic archguard-secrets \
  --from-literal=anthropic-api-key=sk-ant-... \
  --from-literal=session-secret=... \
  --from-literal=database-url=... \
  --from-literal=redis-url=...

# Install the chart
helm install archguard ./deploy/helm/archguard \
  --set ingress.hosts[0].host=archguard.yourcompany.com
```

## Architecture

ArchGuard is a TypeScript monorepo built with:

- **Runtime:** Node.js 20+
- **Monorepo:** Turborepo + pnpm workspaces
- **CLI:** Commander.js
- **MCP Server:** @modelcontextprotocol/sdk
- **LLM:** Anthropic SDK (Claude Opus for analysis, Sonnet for everything else)
- **Validation:** Zod schemas on all LLM responses
- **Database:** PostgreSQL (server) / SQLite (local CLI)
- **ORM:** Drizzle
- **API Server:** Hono
- **Dashboard:** Next.js 14 + Tailwind + Recharts
- **Queue:** BullMQ + Redis
- **Git:** simple-git + Octokit
- **Slack:** @slack/bolt

### Package Structure

```
packages/
  core/           # Shared types, DB, LLM client, git helpers, cost tracking
  analyzer/       # Codebase analysis engine (decisions, dependencies, layers, drift)
  context-sync/   # AI agent context file generators (LLM-powered compression)
  mcp-server/     # MCP server for real-time guidance
  reviewer/       # Architectural code review
  velocity/       # Team velocity tracking
  work-summary/   # Work summary generation
  integrations/   # GitHub, Bitbucket, Slack
  server/         # Hono API server
  dashboard/      # Next.js web dashboard
  cli/            # CLI entry point
```

## Auth & RBAC

ArchGuard supports multiple authentication methods:

- **Email/Password** - Default for all tiers
- **OAuth** - GitHub and Google
- **SAML 2.0** - Enterprise tier (Okta, Azure AD, OneLogin)
- **API Keys** - For CI/CD and CLI authentication

Roles: **Owner** > **Admin** > **Member** > **Viewer**

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Development setup
git clone https://github.com/rjc25/ArchGuard
cd ArchGuard
pnpm install
pnpm build
pnpm test

# Link CLI for local development
npm link packages/cli
```

## License

[MIT](LICENSE)
