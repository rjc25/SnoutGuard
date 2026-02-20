# ArchGuard

**Architectural guardrails for AI coding agents.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

Your AI agents write code that works but violates your architecture. They introduce layer violations, ignore established patterns, and create inconsistencies across the codebase — because they can't see your architectural decisions.

ArchGuard fixes this. It analyzes your codebase, extracts architectural decisions, and syncs them into the context files your agents already read (CLAUDE.md, .cursorrules, copilot-instructions.md). It also provides an MCP server for real-time guidance, runs architectural code reviews on PRs, and tracks team velocity weighted by code complexity.

> *"You built something that solves a problem I was literally having. Credit where it's due."* — **Clawd 🦞**, OpenClaw autonomous coding agent

<details>
<summary>Full endorsement from Clawd</summary>

Yeah, I was dead wrong earlier. This is genuinely useful for me — not just theoretically.

Think about what happens with sub-agents. They drift because every one I spawn starts from zero context about the architecture. They'd do stuff like:

- Use raw HTTP instead of the project's SDK patterns (or vice versa inconsistently)
- Not follow the script-per-task pattern
- Ignore resource allocation rules

If I feed them the CLAUDE.md or query the MCP guidance tool before spawning them, they'd know the rules before writing a single line.

The guidance tool is the big one. Instead of me manually writing "make sure you use the SDK, make sure it's a standalone script" in every sub-agent prompt — I just ask ArchGuard "what should I know about adding a new script?" and it gives me the exact constraints to pass along.

</details>

## Prerequisites

**An Anthropic API key is required.** ArchGuard uses Claude as its core analysis engine — the LLM is the product, not an optional enhancement.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# Get one at: https://console.anthropic.com/settings/keys
```

## Quick Start

```bash
# Clone and build from source
git clone https://github.com/rjc25/ArchGuard
cd ArchGuard
pnpm install
pnpm build

# Link the CLI globally
npm link packages/cli

# In any project:
cd ~/your-project
archguard init                    # Generate .archguard.yml
archguard analyze                 # Extract decisions (Opus, ~$10-16)
archguard sync                    # Generate CLAUDE.md + .cursorrules
archguard serve                   # Start MCP server
archguard review --diff main      # Review changes (Sonnet)
archguard costs                   # Check model costs
```

## Setup via AI Coding Agent

Copy and paste this into [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [OpenClaw](https://github.com/openclaw/openclaw), or any AI coding agent:

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
- Create .claude/settings.json with an "archguard" MCP server entry:
  command: "archguard", args: ["serve", "--transport", "stdio"],
  env: { "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}" }
- Create .claude/settings.local.json with the actual API key hardcoded (for local use)
- Add ".claude/settings.local.json" to .gitignore (it contains secrets)
- For Cursor: same config in .cursor/mcp.json
- For OpenClaw: see the OpenClaw section under MCP Server Setup below for native tool
  integration via the mcp-client plugin (tools appear directly in the agent's palette,
  including sub-agents — add tools to both tools.alsoAllow and tools.subagents.tools.alsoAllow)
- The server exposes 4 tools: get_architectural_guidance (describe a task, get relevant
  constraints), get_architectural_decisions (search by keyword), check_architectural_compliance
  (validate code), get_dependency_graph (query module coupling)
```

## How It Works

**CLAUDE.md is the floor, not the ceiling.**

`archguard analyze` + `archguard sync` generates a CLAUDE.md that gets committed to your repo. That single file gives your entire team architectural awareness with zero per-person setup:

| | CLAUDE.md (everyone) | MCP Server (power users) |
|---|---|---|
| **Setup** | One person runs `archguard sync`, commits the file | Each user configures MCP in their editor |
| **Who gets it** | Every developer who opens the repo | Developers who opt into the MCP server |
| **How it works** | Claude Code / Cursor reads it automatically on boot | Agent calls tools like `get_architectural_guidance` interactively |
| **What it provides** | All decisions, constraints, and workflow rules as static context | Real-time, task-specific guidance — describe what you're doing, get only the relevant constraints |
| **Cost** | Free (file already generated) | ~$0.01 per query (Sonnet) |

The generated context files include a **Workflow** section that tells agents to:

1. **Before writing code** — call `get_architectural_guidance` (if MCP is configured), or review the relevant constraints in the context file
2. **After changes** — run `archguard review --diff <branch>` to catch violations before committing
3. **After significant refactors** — re-run `archguard analyze` then `archguard sync` to keep context files fresh

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
- LLM-powered compression of architectural decisions into AI agent context files:
  - `CLAUDE.md` for Claude Code
  - `.cursorrules` for Cursor
  - `.github/copilot-instructions.md` for GitHub Copilot
  - `agents.md` for Agents.md format
  - `.windsurfrules` for Windsurf
  - `.kiro/steering.md` for AWS Kiro
  - Custom Handlebars templates for any other format
- Opus intelligently prioritizes and compresses decisions to fit a configurable token budget (default 8192 tokens), typically 60-70% smaller than raw output
- Watch mode auto-syncs on file changes
- Preserves user-added sections between marker comments

**MCP Server** (`archguard serve`)
- Exposes architectural decisions via Model Context Protocol
- Tools: `get_architectural_decisions`, `check_architectural_compliance`, `get_architectural_guidance`, `get_dependency_graph`
- Resources: decisions, patterns, constraints, dependencies
- Works with Claude Code, Cursor, Windsurf, and other MCP-compatible agents
- Supports stdio, SSE, and streamable HTTP transports
- Uses Claude Sonnet for fast query responses

**Architectural Code Review** (`archguard review`)
- Reviews git diffs against established architectural decisions (Claude Sonnet by default)
- Expert-level prompts with XML-tagged context and Zod-validated structured output
- Output formats: terminal, GitHub PR comments, Bitbucket PR comments, JSON
- CI mode with configurable severity threshold

> ArchGuard review is intentionally opinionated. It flags potential violations and expects the consuming agent to reason about them. False positives aren't noise — they're architectural checkpoints.

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
    analyze: claude-opus-4-6
    sync: claude-opus-4-6
    review: claude-sonnet-4-6
    mcp: claude-sonnet-4-6
    summary: claude-sonnet-4-6
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

> **Why sync uses Opus:** The context file is loaded into every agent session. A $0.30 Opus call that produces a 67% smaller file saves far more in cumulative token costs across hundreds of agent interactions.

Run `archguard costs` for detailed estimates based on your configuration.

## MCP Server Setup

> CLAUDE.md handles basic architectural awareness for everyone on the team. The MCP server is for power users who want real-time, interactive guidance while coding.

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

For the API key, create a gitignored `.claude/settings.local.json` — don't commit secrets.

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

### OpenClaw

OpenClaw's MCP client plugin wires ArchGuard tools directly into the agent's tool palette — no shell commands needed. See the [OpenClaw integration guide](docs/guides/openclaw-integration.md) for full setup.

### Available MCP Tools

| Tool | What It Does | When to Use |
|------|-------------|-------------|
| `get_architectural_guidance` | Returns relevant decisions + constraints for a task description | **Before writing code** — describe what you're about to do |
| `get_architectural_decisions` | Search decisions by keyword, category, or file path | Looking up specific patterns or conventions |
| `check_architectural_compliance` | Check a code snippet against architectural constraints | Validating code before committing |
| `get_dependency_graph` | Query the dependency graph for a module | Understanding coupling and dependencies |

**`get_architectural_guidance` is the most valuable tool.** It takes a plain-English task description and returns all relevant architectural decisions, constraints, and code examples — so the agent writes architecturally compliant code from the start, instead of fixing violations after the fact.

## Configuration

ArchGuard is configured via `.archguard.yml` in your project root. Run `archguard init` to generate one with defaults.

See the full [Configuration Reference](docs/configuration.md) for all options.

## CI/CD Integration

### GitHub Actions

```yaml
- name: Architectural Review
  run: |
    git clone https://github.com/rjc25/ArchGuard /tmp/archguard
    cd /tmp/archguard && pnpm install && pnpm build && npm link packages/cli
    cd $GITHUB_WORKSPACE
    archguard review --diff origin/main --ci --format github
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Server Mode

```bash
git clone https://github.com/rjc25/ArchGuard
cd ArchGuard
cp .env.example .env  # Set ANTHROPIC_API_KEY
docker-compose up -d

# Dashboard: http://localhost:3001
# API: http://localhost:3000
```

## Architecture

TypeScript monorepo built with Turborepo + pnpm workspaces:

```
packages/
  core/           # Shared types, DB, LLM client, git helpers, cost tracking
  analyzer/       # Codebase analysis engine (decisions, dependencies, layers, drift)
  context-sync/   # AI agent context file generation (LLM-powered compression)
  mcp-server/     # MCP server for real-time guidance
  reviewer/       # Architectural code review
  velocity/       # Team velocity tracking
  work-summary/   # Work summary generation
  integrations/   # GitHub, Bitbucket, Slack
  server/         # Hono API server
  dashboard/      # Next.js 14 + Tailwind + Recharts web dashboard
  cli/            # CLI entry point (Commander.js)
```

Key dependencies: Anthropic SDK, @modelcontextprotocol/sdk, Drizzle (PostgreSQL/SQLite), Zod, simple-git, BullMQ + Redis, @slack/bolt.

## Contributing

```bash
git clone https://github.com/rjc25/ArchGuard
cd ArchGuard
pnpm install
pnpm build
pnpm test
npm link packages/cli
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
