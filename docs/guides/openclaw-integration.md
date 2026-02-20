# Integrating SnoutGuard with OpenClaw

**Keep your autonomous AI agents architecturally aligned — automatically.**

## The Problem

You're running AI coding agents — through OpenClaw, Claude Code, or any autonomous workflow. They're fast, they're productive, and they're slowly destroying your architecture.

Every agent session starts fresh. It doesn't know your team decided on repository pattern three months ago. It doesn't know you banned direct database access outside the data layer. It doesn't know that the `utils/` directory has a specific purpose and isn't a dumping ground.

So it writes code that works, passes tests, and quietly violates every architectural decision your team has made. Multiply that across dozens of agent sessions per day and you've got architectural drift that would take weeks to untangle.

## The Fix: Three Commands

```bash
# 1. Analyze your codebase (finds architectural decisions automatically)
snoutguard analyze

# 2. Generate context files (Opus compresses decisions into dense agent context)
snoutguard sync

# 3. Done. Your agents now have architectural awareness.
```

That's it. `snoutguard analyze` uses Claude Opus to scan your codebase and extract architectural decisions — patterns, constraints, layer boundaries, technology choices. `snoutguard sync` takes those decisions and compresses them into an optimally dense context file (CLAUDE.md, .cursorrules, etc.) that fits within a configurable token budget.

Every agent that touches your code now knows your architecture.

## How It Works with OpenClaw

### Automatic Context for Every Session

OpenClaw reads `CLAUDE.md` from your project root and includes it in every agent session. After running `snoutguard sync`, your main session and every sub-agent you spawn automatically gets your architectural decisions as context.

No configuration needed. No prompt engineering. Just run sync and your agents are aligned.

### Built-In Workflow Enforcement

The generated context files include a **Workflow** section that instructs agents to:

1. **Before coding** — call `get_architectural_guidance` (if MCP is configured) or review relevant constraints in the context file
2. **After changes** — run `snoutguard review --diff <branch>` to catch violations
3. **After significant refactors** — re-run `snoutguard analyze` then `snoutguard sync` to keep context files current

This means enforcement is baked into the context file itself — every agent session that loads CLAUDE.md gets the workflow rules automatically. You don't need to remember to tell your agent to check architecture; it's already in its instructions.

### Sub-Agent Alignment

This is where it gets powerful. When you spawn sub-agents for parallel work:

```
Spawn a sub-agent to refactor the authentication module.
```

With native MCP tools configured (see below), that sub-agent has `snoutguard_get_architectural_guidance` in its own tool palette. It can query the architectural constraints relevant to its specific task — without you needing to paste CLAUDE.md into every task prompt.

The sub-agent calls `snoutguard_get_architectural_guidance("refactor the authentication module")` and gets back exactly the decisions that matter: which patterns to follow, which layers to respect, what constraints are non-negotiable. Targeted guidance, not a wall of context.

**Key config:** Add the MCP tools to `tools.subagents.tools.alsoAllow` (not just `tools.alsoAllow`) to give sub-agents access. Without this, only the main agent gets the tools.

Without SnoutGuard, that sub-agent would make reasonable but uninformed decisions. With it, the sub-agent follows your architecture from the first line of code.

### Native MCP Tools (Recommended)

The most powerful integration is wiring SnoutGuard's MCP server directly into OpenClaw's tool system. This gives your agent native `snoutguard_get_architectural_guidance` alongside `web_search`, `exec`, and every other built-in tool — no shell commands, no wrapper scripts.

**How it works:** An MCP client plugin spawns the SnoutGuard MCP server as a child process over stdio, discovers its tools via JSON-RPC, and registers each one as a native OpenClaw agent tool. The agent calls them like any other tool and gets structured results back.

**Step 1: Install the MCP client plugin**

Create `~/.openclaw/extensions/mcp-client/` with the plugin manifest and implementation. See the [MCP Client Plugin Source](#mcp-client-plugin-source) at the bottom of this guide for the full code.

**Step 2: Configure in OpenClaw config**

Apply via `gateway config.patch` or edit `~/.openclaw/openclaw.json` directly:

```json
{
  "plugins": {
    "entries": {
      "mcp-client": {
        "enabled": true,
        "config": {
          "servers": {
            "snoutguard": {
              "command": "snoutguard",
              "args": ["serve", "--transport", "stdio", "--path", "/path/to/your/project"],
              "env": { "ANTHROPIC_API_KEY": "sk-ant-..." },
              "toolPrefix": "snoutguard_",
              "timeoutMs": 60000
            }
          }
        }
      }
    }
  },
  "tools": {
    "alsoAllow": [
      "snoutguard_get_architectural_decisions",
      "snoutguard_check_architectural_compliance",
      "snoutguard_get_architectural_guidance",
      "snoutguard_get_dependency_graph"
    ],
    "subagents": {
      "tools": {
        "alsoAllow": [
          "snoutguard_get_architectural_decisions",
          "snoutguard_check_architectural_compliance",
          "snoutguard_get_architectural_guidance",
          "snoutguard_get_dependency_graph"
        ]
      }
    }
  }
}
```

The `tools.subagents.tools.alsoAllow` key is critical — without it, only the main agent gets the MCP tools. With it, every sub-agent you spawn also gets native access. Sub-agents can call `snoutguard_get_architectural_guidance` before writing code instead of relying on CLAUDE.md being pasted into their task prompt.

**Step 3: Restart OpenClaw**

After restart, you'll see `[MCP: snoutguard]` tools in both the main agent's and sub-agents' tool palettes:

| Native Tool | What It Does |
|------------|-------------|
| `snoutguard_get_architectural_guidance` | Describe a task → get all relevant decisions and constraints |
| `snoutguard_get_architectural_decisions` | Search decisions by keyword, category, or file path |
| `snoutguard_check_architectural_compliance` | Validate a code snippet against architectural constraints |
| `snoutguard_get_dependency_graph` | Query the dependency graph for coupling metrics |

`snoutguard_get_architectural_guidance` is the killer feature — it takes a plain-English task description and returns only the decisions relevant to that task. The agent calls it before writing code, naturally, because it's right there in the tool palette.

**Multiple projects:** You can configure multiple servers in the plugin config, each pointing to a different project path. Use different `toolPrefix` values to namespace them (e.g. `"frontend_"`, `"backend_"`).

### Pre-Flight and Post-Flight Checks

For agents without native MCP integration, the CLI provides the same capabilities:

**Before coding:**
```bash
# Start MCP server (configure in .claude/settings.json or equivalent)
snoutguard serve --transport stdio
```

The MCP server exposes four tools:

| Tool | What It Does |
|------|-------------|
| `get_architectural_guidance` | Describe a task, get all relevant decisions and constraints |
| `get_architectural_decisions` | Search decisions by keyword, category, or file path |
| `check_architectural_compliance` | Validate a code snippet against architectural constraints |
| `get_dependency_graph` | Query the dependency graph for coupling metrics |

**After coding:**
```bash
# Review changes against architectural decisions
snoutguard review --diff main
```

This catches violations before they're merged. The review uses Claude Sonnet to check your diff against every known architectural decision and flags violations with severity levels.

> SnoutGuard review is intentionally opinionated. It flags potential violations and expects the consuming agent to reason about them. False positives aren't noise — they're architectural checkpoints.

### Sprint Reviews

Track what your agents (and humans) are actually building:

```bash
# Team sprint review with velocity metrics
snoutguard summary --type sprint_review

# Individual developer standup
snoutguard summary --type standup --dev alice
```

Sprint reviews include velocity trends, architectural impact analysis, code quality metrics, and a sprint score. Useful for understanding what a week of AI-assisted development actually produced.

## Setup Guide

### 1. Install SnoutGuard

```bash
git clone https://github.com/rjc25/SnoutGuard
cd SnoutGuard
pnpm install
pnpm build
npm link packages/cli
```

### 2. Initialize Your Project

```bash
cd ~/your-project
export ANTHROPIC_API_KEY=sk-ant-...

snoutguard init      # Creates .snoutguard.yml
snoutguard analyze   # Extracts decisions (Opus ~$10-16, Sonnet ~$2-3)
snoutguard sync      # Generates CLAUDE.md (Opus ~$0.10-0.50)
```

### 3. Configure (Optional)

Edit `.snoutguard.yml` to customize. See the full [Configuration Reference](../configuration.md) for all options.

```yaml
llm:
  models:
    analyze: claude-opus-4-6    # Deep analysis (or claude-sonnet-4-6 for ~$2-3)
    sync: claude-opus-4-6       # Context compression
    review: claude-sonnet-4-6   # PR review
    summary: claude-sonnet-4-6  # Work summaries
  max_cost_per_run: 10.00       # Safety limit in USD

sync:
  formats:
    - claude            # CLAUDE.md for Claude Code / OpenClaw
    - cursorrules       # .cursorrules for Cursor
  max_context_tokens: 8192    # Token budget for context files
  use_llm: true               # Opus compression (false = template-only, free)
```

### 4. MCP Server (Optional)

For real-time architectural guidance during agent sessions:

```json
// .claude/settings.json or equivalent
{
  "mcpServers": {
    "snoutguard": {
      "command": "snoutguard",
      "args": ["serve", "--transport", "stdio"]
    }
  }
}
```

## Why LLM-Powered Sync Matters

The old approach was template-based: dump every decision into a markdown file. It was free but produced bloated, repetitive context files that wasted tokens in every agent session.

The new approach sends your decisions to Opus, which intelligently compresses them:

| Metric | Template | LLM-Powered |
|--------|----------|-------------|
| Output size | ~1.5KB per decision | Configurable budget (default 8192 tokens) |
| 133 decisions | ~200KB | ~8KB |
| Quality | Mechanical dump | Prioritized, merged, imperative rules |
| Cost | Free | ~$0.30 per sync |

A single Opus sync call costs ~$0.30. That compressed context file then saves tokens across every agent session that loads it — potentially hundreds per day. The ROI is immediate.

Use `snoutguard sync --no-llm` if you want free, deterministic output.

## Cost Breakdown

| What | Cost | When |
|------|------|------|
| `snoutguard analyze` (Opus) | $10 – $16 | After major changes, weekly |
| `snoutguard analyze` (Sonnet) | $2 – $3 | After major changes, weekly |
| `snoutguard sync` | $0.10 – $0.50 | After analyze |
| `snoutguard review` | $0.01 – $0.10 | Per PR or branch |
| `snoutguard summary` | $0.02 – $0.05 | Daily/weekly |
| MCP queries | $0.005 – $0.02 | Per agent query |

Typical monthly cost for an active team: **$15-40/month**. That's less than one hour of architectural cleanup after a week of unguided agent coding.

## The One-Liner for OpenClaw

Paste this into your OpenClaw session to get started:

```
Install SnoutGuard from source (https://github.com/rjc25/SnoutGuard). Clone the repo,
install dependencies with pnpm, build all packages, and link the CLI globally. Then in
my current project: run "snoutguard init", "snoutguard analyze", and "snoutguard sync" to
generate CLAUDE.md.

CLAUDE CODE SETUP:
- Create .claude/settings.json with an "snoutguard" MCP server entry
  (command: "snoutguard", args: ["serve", "--transport", "stdio"],
  env: { "ANTHROPIC_API_KEY": "<key>" })
- Create .claude/settings.local.json with the actual API key (gitignore it)
- Add ".claude/settings.local.json" to .gitignore

OPENCLAW NATIVE MCP SETUP:
1. Create the MCP client plugin at ~/.openclaw/extensions/mcp-client/ (manifest + index.ts
   from the SnoutGuard OpenClaw integration guide)
2. Apply a gateway config.patch to enable the mcp-client plugin with an snoutguard server
   entry (command: "snoutguard", args: ["serve", "--transport", "stdio", "--path", "<project>"],
   toolPrefix: "snoutguard_", timeoutMs: 60000) and add the 4 snoutguard_ tools to BOTH
   tools.alsoAllow (main agent) AND tools.subagents.tools.alsoAllow (sub-agents)
3. Restart the gateway

This gives both the main agent AND any spawned sub-agents native access to the SnoutGuard
tools. Sub-agents can call snoutguard_get_architectural_guidance themselves before writing
code — no need to paste CLAUDE.md into task prompts.

Show me the decisions found, the generated CLAUDE.md, and confirm the MCP tools are live.
```

Your agents will thank you. Your architecture will survive them.

---

## MCP Client Plugin Source

The OpenClaw MCP client plugin is a generic bridge between any MCP server and OpenClaw's native tool system. It's not SnoutGuard-specific — you can use it with any MCP server.

### Plugin Manifest

Save as `~/.openclaw/extensions/mcp-client/openclaw.plugin.json`:

```json
{
  "id": "mcp-client",
  "name": "MCP Client",
  "description": "Connect to MCP servers and expose their tools as native agent tools",
  "version": "0.1.0",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "servers": {
        "type": "object",
        "description": "MCP server definitions keyed by server name",
        "additionalProperties": {
          "type": "object",
          "properties": {
            "command": { "type": "string", "description": "Command to spawn the MCP server" },
            "args": { "type": "array", "items": { "type": "string" } },
            "env": { "type": "object", "additionalProperties": { "type": "string" } },
            "cwd": { "type": "string" },
            "toolPrefix": { "type": "string", "description": "Prefix for tool names (e.g. 'snoutguard_')" },
            "enabled": { "type": "boolean", "default": true },
            "timeoutMs": { "type": "number", "default": 30000 }
          },
          "required": ["command"]
        }
      }
    }
  }
}
```

### Plugin Implementation

Save as `~/.openclaw/extensions/mcp-client/index.ts`:

```typescript
import { spawn, type ChildProcess } from "node:child_process";

interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  toolPrefix?: string;
  enabled?: boolean;
  timeoutMs?: number;
}

interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

class McpConnection {
  private process: ChildProcess | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, {
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private buffer = "";
  private connected = false;
  private logger: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void };

  constructor(private name: string, private config: McpServerConfig, logger?: any) {
    this.logger = logger ?? { info: console.log, error: console.error };
  }

  async connect(): Promise<void> {
    const env = { ...process.env, ...(this.config.env ?? {}) };
    this.process = spawn(this.config.command, this.config.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"], cwd: this.config.cwd, env,
    });

    this.process.on("error", (err) => { this.connected = false; });
    this.process.on("exit", () => {
      this.connected = false;
      for (const [, { reject, timer }] of this.pendingRequests) {
        clearTimeout(timer); reject(new Error(`MCP server "${this.name}" exited`));
      }
      this.pendingRequests.clear();
    });

    this.process.stderr?.on("data", (d: Buffer) => {
      const msg = d.toString().trim();
      if (msg) this.logger.info(`[mcp-client] ${this.name} stderr: ${msg.slice(0, 200)}`);
    });

    this.process.stdout!.on("data", (d: Buffer) => {
      this.buffer += d.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop()!;
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
            const { resolve, reject, timer } = this.pendingRequests.get(msg.id)!;
            clearTimeout(timer); this.pendingRequests.delete(msg.id);
            msg.error ? reject(new Error(msg.error.message ?? JSON.stringify(msg.error))) : resolve(msg.result);
          }
        } catch {}
      }
    });

    await this.request("initialize", {
      protocolVersion: "2024-11-05", capabilities: {},
      clientInfo: { name: "openclaw-mcp-client", version: "0.1.0" },
    });
    this.write({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    this.connected = true;
  }

  private write(msg: Record<string, unknown>): void {
    if (!this.process?.stdin?.writable) throw new Error(`MCP server "${this.name}" stdin not writable`);
    this.process.stdin.write(JSON.stringify(msg) + "\n");
  }

  request(method: string, params: unknown): Promise<unknown> {
    const timeout = this.config.timeoutMs ?? 30_000;
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request "${method}" timed out after ${timeout}ms`));
      }, timeout);
      this.pendingRequests.set(id, { resolve, reject, timer });
      try { this.write({ jsonrpc: "2.0", id, method, params }); }
      catch (err) { clearTimeout(timer); this.pendingRequests.delete(id); reject(err); }
    });
  }

  async listTools(): Promise<McpToolDef[]> {
    const result = await this.request("tools/list", {}) as { tools?: McpToolDef[] };
    return result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>) {
    return await this.request("tools/call", { name, arguments: args });
  }

  isConnected() { return this.connected && this.process !== null && !this.process.killed; }

  disconnect() {
    this.connected = false;
    for (const [, { reject, timer }] of this.pendingRequests) {
      clearTimeout(timer); reject(new Error("Disconnecting"));
    }
    this.pendingRequests.clear();
    try { this.process?.kill(); } catch {}
    this.process = null;
  }
}

export default function register(api: any) {
  const connections = new Map<string, McpConnection>();
  const pluginConfig = api.config?.plugins?.entries?.["mcp-client"]?.config;
  const servers = pluginConfig?.servers ?? {};
  const enabledServers = Object.entries(servers).filter(([, cfg]: any) => cfg.enabled !== false);

  if (enabledServers.length === 0) { api.logger.info("[mcp-client] No MCP servers configured"); return; }

  api.registerService({
    id: "mcp-client",
    start: async () => {
      for (const [name, config] of enabledServers as [string, McpServerConfig][]) {
        const conn = new McpConnection(name, config, api.logger);
        try {
          await conn.connect();
          connections.set(name, conn);
          const tools = await conn.listTools();
          api.logger.info(`[mcp-client] "${name}" exposes ${tools.length} tool(s)`);

          for (const tool of tools) {
            const toolName = (config.toolPrefix ?? "") + tool.name;
            const mcpToolName = tool.name;
            api.registerTool({
              name: toolName,
              description: `[MCP: ${name}] ${tool.description ?? tool.name}`,
              parameters: tool.inputSchema ?? { type: "object", properties: {} },
              execute: async (_id: string, params: Record<string, unknown>) => {
                const c = connections.get(name);
                if (!c?.isConnected()) return { content: [{ type: "text", text: `Error: MCP server "${name}" not connected` }] };
                try { return await c.callTool(mcpToolName, params); }
                catch (err: any) { return { content: [{ type: "text", text: `MCP error: ${err.message}` }] }; }
              },
            }, { optional: true });
          }
        } catch (err: any) {
          api.logger.error(`[mcp-client] Failed to connect to "${name}": ${err.message}`);
        }
      }
    },
    stop: () => { for (const [, conn] of connections) conn.disconnect(); connections.clear(); },
  });
}
```

This plugin is generic — it works with any MCP server, not just SnoutGuard. Configure multiple servers in the `servers` object to wire up different MCP tools into your agent.
