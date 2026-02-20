# Integrating ArchGuard with OpenClaw

**Keep your autonomous AI agents architecturally aligned — automatically.**

## The Problem

You're running AI coding agents — through OpenClaw, Claude Code, or any autonomous workflow. They're fast, they're productive, and they're slowly destroying your architecture.

Every agent session starts fresh. It doesn't know your team decided on repository pattern three months ago. It doesn't know you banned direct database access outside the data layer. It doesn't know that the `utils/` directory has a specific purpose and isn't a dumping ground.

So it writes code that works, passes tests, and quietly violates every architectural decision your team has made. Multiply that across dozens of agent sessions per day and you've got architectural drift that would take weeks to untangle.

## The Fix: Three Commands

```bash
# 1. Analyze your codebase (finds architectural decisions automatically)
archguard analyze

# 2. Generate context files (Opus compresses decisions into dense agent context)
archguard sync

# 3. Done. Your agents now have architectural awareness.
```

That's it. `archguard analyze` uses Claude Opus to scan your codebase and extract architectural decisions — patterns, constraints, layer boundaries, technology choices. `archguard sync` takes those decisions and compresses them into an optimally dense context file (CLAUDE.md, .cursorrules, etc.) that fits within a configurable token budget.

Every agent that touches your code now knows your architecture.

## How It Works with OpenClaw

### Automatic Context for Every Session

OpenClaw reads `CLAUDE.md` from your project root and includes it in every agent session. After running `archguard sync`, your main session and every sub-agent you spawn automatically gets your architectural decisions as context.

No configuration needed. No prompt engineering. Just run sync and your agents are aligned.

### Sub-Agent Alignment

This is where it gets powerful. When you spawn sub-agents for parallel work:

```
Spawn a sub-agent to refactor the authentication module.
```

That sub-agent gets your `CLAUDE.md` in its context. It knows:
- Which patterns your codebase follows
- Which layers can depend on which
- What technologies are approved and how they're used
- What constraints are non-negotiable

Without ArchGuard, that sub-agent would make reasonable but uninformed decisions. With it, the sub-agent follows your architecture from the first line of code.

### Pre-Flight and Post-Flight Checks

For critical work, add architectural review to your workflow:

**Before coding:**
```bash
# Get relevant architectural constraints for a task
archguard serve  # Start MCP server

# Then ask your agent:
# "Before you start, call get_architectural_guidance with a description of your task"
```

The MCP server's `get_architectural_guidance` tool returns only the decisions relevant to the task at hand — not the entire architecture document.

**After coding:**
```bash
# Review changes against architectural decisions
archguard review --diff main
```

This catches violations before they're merged. The review uses Claude Sonnet to check your diff against every known architectural decision and flags violations with severity levels.

### Sprint Reviews

Track what your agents (and humans) are actually building:

```bash
# Team sprint review with velocity metrics
archguard summary --type sprint_review --period sprint

# Individual developer standup
archguard summary --type standup --dev alice
```

Sprint reviews include velocity trends, architectural impact analysis, code quality metrics, and a sprint score. Useful for understanding what a week of AI-assisted development actually produced.

## Setup Guide

### 1. Install ArchGuard

```bash
git clone https://github.com/rjc25/ArchGuard
cd ArchGuard
pnpm install
pnpm build
npm link packages/cli
```

### 2. Initialize Your Project

```bash
cd ~/your-project
export ANTHROPIC_API_KEY=sk-ant-...

archguard init      # Creates .archguard.yml
archguard analyze   # Extracts decisions (~$0.50-3.00, uses Opus)
archguard sync      # Generates CLAUDE.md (~$0.10-0.50, uses Opus)
```

### 3. Configure (Optional)

Edit `.archguard.yml` to customize:

```yaml
llm:
  models:
    analyze: claude-opus-4-6    # Deep analysis
    sync: claude-opus-4-6       # Context compression
    review: claude-sonnet-4-6   # PR review
    summary: claude-sonnet-4-6  # Work summaries

sync:
  formats:
    - claude            # CLAUDE.md for Claude Code / OpenClaw
    - cursorrules       # .cursorrules for Cursor
  max_context_tokens: 8192    # Token budget for context files
  use_llm: true               # Opus compression (false = template-only, free)

summaries:
  sprint_length_days: 14      # Your sprint cadence
```

### 4. MCP Server (Optional)

For real-time architectural guidance during agent sessions:

```json
// .claude/settings.json or equivalent
{
  "mcpServers": {
    "archguard": {
      "command": "archguard",
      "args": ["serve", "--transport", "stdio"]
    }
  }
}
```

This gives agents access to:
- `get_architectural_decisions` — search decisions by keyword
- `check_architectural_compliance` — validate code against all decisions
- `get_architectural_guidance` — get constraints relevant to a specific task

## Why LLM-Powered Sync Matters

The old approach was template-based: dump every decision into a markdown file. It was free but produced bloated, repetitive context files that wasted tokens in every agent session.

The new approach sends your decisions to Opus, which intelligently compresses them:

| Metric | Template | LLM-Powered |
|--------|----------|-------------|
| Output size | ~1.5KB per decision | Configurable budget (default 8192 tokens) |
| 18 decisions | 22KB | 7.4KB |
| 100 decisions | ~120KB | ~8KB (same budget) |
| Quality | Mechanical dump | Prioritized, merged, imperative rules |
| Cost | Free | ~$0.30 per sync |

A single Opus sync call costs ~$0.30. That compressed context file then saves tokens across every agent session that loads it — potentially hundreds per day. The ROI is immediate.

Use `--no-llm` if you want free, deterministic output.

## Cost Breakdown

| What | Cost | When |
|------|------|------|
| `archguard analyze` | $0.50 - $3.00 | After major changes, weekly |
| `archguard sync` | $0.10 - $0.50 | After analyze |
| `archguard review` | $0.01 - $0.10 | Per PR or branch |
| `archguard summary` | $0.02 - $0.05 | Daily/weekly |
| MCP queries | $0.005 - $0.02 | Per agent query |

Typical monthly cost for an active team: **$15-40/month**. That's less than one hour of architectural cleanup after a week of unguided agent coding.

## The One-Liner for OpenClaw

Paste this into your OpenClaw session to get started:

```
Install ArchGuard from source (https://github.com/rjc25/ArchGuard). Clone the repo,
install dependencies with pnpm, build all packages, and link the CLI globally. Then in
my current project: run "archguard init", "archguard analyze", and "archguard sync" to
generate CLAUDE.md. Show me the decisions found and the generated context file.
```

Your agents will thank you. Your architecture will survive them.
