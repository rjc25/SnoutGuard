# ArchGuard

**Open-source architectural guardrails and engineering intelligence for AI-powered development teams.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/archguard/archguard/actions/workflows/ci.yml/badge.svg)](https://github.com/archguard/archguard/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@archguard/cli)](https://www.npmjs.com/package/@archguard/cli)

---

ArchGuard analyzes your codebase to automatically extract architectural decisions, syncs them to AI agent context files (CLAUDE.md, .cursorrules, copilot-instructions.md, and more), provides an MCP server for real-time architectural guidance, runs architectural code reviews on PRs, tracks team velocity weighted by code complexity, and generates developer work summaries.

## Why ArchGuard?

AI coding agents are powerful but architecturally unaware. They generate code that works but often violates your team's established patterns, introduces layer violations, or creates inconsistencies. Meanwhile, engineering managers lack visibility into what AI-assisted development is actually producing.

ArchGuard solves both problems:

- **Architecture Agent** keeps AI coding assistants aligned with your team's architectural decisions
- **Management Agent** provides complexity-weighted velocity tracking and AI-generated work summaries

## Quick Start (CLI)

```bash
# Install globally
npm install -g @archguard/cli

# Initialize in your project
cd your-project
archguard init

# Analyze your codebase
archguard analyze

# Generate AI agent context files
archguard sync

# Start the MCP server for real-time guidance
archguard serve

# Review changes against architectural decisions
archguard review --diff main
```

## Quick Start (Server Mode)

```bash
# Clone and run with Docker
git clone https://github.com/rjc25/ArchGuard.git
cd ArchGuard
pnpm install
pnpm build

# Set up environment
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY

# Start all services
docker-compose up -d

# Dashboard available at http://localhost:3001
# API server at http://localhost:3000
```

## Features

### Architecture Agent

**Codebase Analysis** (`archguard analyze`)
- Scans your codebase using AST parsing and LLM analysis
- Detects architectural patterns: MVC, Clean Architecture, Repository, DI, Event-Driven, and more
- Maps module dependencies and identifies circular dependencies
- Tracks architectural drift over time with configurable time windows
- Works with TypeScript, JavaScript, Python, Go, Rust, and Java

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

**MCP Server** (`archguard serve`)
- Exposes architectural decisions via Model Context Protocol
- Tools: `get_architectural_decisions`, `check_architectural_compliance`, `get_architectural_guidance`, `get_dependency_graph`
- Resources: decisions, patterns, constraints, dependencies
- Works with Claude Code, Cursor, Windsurf, and other MCP-compatible agents
- Supports stdio and SSE transports

**Architectural Code Review** (`archguard review`)
- Reviews git diffs against established architectural decisions
- Fast pass: deterministic rule matching (import violations, file placement, naming conventions)
- Deep pass: LLM-powered nuanced review
- Output formats: terminal, GitHub PR comments, Bitbucket PR comments, JSON
- CI mode with configurable severity threshold

### Management Agent

**Team Velocity Tracking** (`archguard velocity`)
- Complexity-weighted effort scoring (not raw LOC)
- Architectural impact scoring
- Refactoring ratio tracking
- Review contribution metrics
- Rolling velocity per developer and per team
- Automatic blocker detection: stalled PRs, long-lived branches, review bottlenecks

**Work Summary Generation** (`archguard summary`)
- AI-powered summaries from code analysis
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
- Interactive dependency graph
- Team management with RBAC
- Settings for integrations and custom rules

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

## Configuration

ArchGuard is configured via `.archguard.yml` in your project root:

```yaml
version: 1

analysis:
  include: ["src/**", "lib/**"]
  exclude: ["**/*.test.*", "**/node_modules/**"]
  languages: [typescript, python]
  llm_analysis: true

llm:
  provider: anthropic
  model: claude-sonnet-4-20250514
  api_key_env: ANTHROPIC_API_KEY

sync:
  formats: [cursorrules, claude, copilot, windsurf, kiro]
  preserve_user_sections: true

review:
  severity_threshold: warning
  auto_review_prs: true

velocity:
  enabled: true
  complexity_weight: 0.4
  arch_impact_weight: 0.3

rules:
  - name: "No direct DB access outside repositories"
    pattern: "import.*from.*prisma"
    allowed_in: ["src/infrastructure/repositories/**"]
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
# Edit .env with production values
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
- **LLM:** Anthropic SDK (Claude Sonnet)
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
  core/           # Shared types, DB, LLM client, git helpers
  analyzer/       # Codebase analysis engine
  context-sync/   # AI agent context file generators
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
git clone https://github.com/rjc25/ArchGuard.git
cd ArchGuard
pnpm install
pnpm build
pnpm test
```

## License

[MIT](LICENSE)
