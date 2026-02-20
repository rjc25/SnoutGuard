# Configuration Reference

ArchGuard is configured via `.archguard.yml` in your project root. Run `archguard init` to generate one with sensible defaults.

The config file uses `snake_case` keys (e.g. `max_file_size_kb`), which are automatically converted to camelCase internally.

## version

| Field | Type | Default |
|-------|------|---------|
| `version` | number | `1` |

Configuration schema version.

## server (optional)

Connect to a remote ArchGuard server instance. Omit this section entirely for local-only CLI usage.

| Field | Type | Default | Required |
|-------|------|---------|----------|
| `url` | string | — | yes |
| `api_key_env` | string | — | no |

```yaml
server:
  url: https://archguard.example.com
  api_key_env: ARCHGUARD_API_KEY
```

## analysis

Controls which files are analyzed and how.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `include` | string[] | `["**"]` | Glob patterns for files to analyze |
| `exclude` | string[] | *(see below)* | Glob patterns to exclude |
| `languages` | enum[] | *(all supported)* | Languages to analyze: `typescript`, `javascript`, `python`, `go`, `rust`, `java` |
| `max_file_size_kb` | number | `2048` | Maximum file size in KB to analyze |
| `analysis_period_months` | number | `6` | Time window in months for architectural drift analysis |

**Default exclude patterns:**
```
**/node_modules/**    **/dist/**          **/build/**
**/out/**             **/.next/**         **/vendor/**
**/target/**          **/__pycache__/**   **/.venv/**
**/venv/**            **/*.min.js         **/*.bundle.js
**/generated/**       **/coverage/**
```

**Default languages:** All six supported languages are enabled by default (`typescript`, `javascript`, `python`, `go`, `rust`, `java`).

```yaml
analysis:
  include:
    - "**"
  exclude:
    - "**/node_modules/**"
    - "**/dist/**"
    - "**/build/**"
    - "**/out/**"
    - "**/.next/**"
    - "**/vendor/**"
    - "**/target/**"
    - "**/__pycache__/**"
    - "**/.venv/**"
    - "**/venv/**"
    - "**/*.min.js"
    - "**/*.bundle.js"
    - "**/generated/**"
    - "**/coverage/**"
  languages:
    - typescript
    - javascript
    - python
    - go
    - rust
    - java
  max_file_size_kb: 2048
  analysis_period_months: 6
```

## llm

LLM provider and model settings. ArchGuard uses **tiered models** — different models for different operations, each independently configurable.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `provider` | string | `"anthropic"` | LLM provider (currently only `anthropic` supported) |
| `api_key_env` | string | `"ANTHROPIC_API_KEY"` | Environment variable containing the API key |
| `models.analyze` | string | `"claude-opus-4-6"` | Model for codebase analysis |
| `models.review` | string | `"claude-sonnet-4-6"` | Model for code review |
| `models.mcp` | string | `"claude-sonnet-4-6"` | Model for MCP server queries |
| `models.summary` | string | `"claude-sonnet-4-6"` | Model for work summaries |
| `models.sync` | string | `"claude-opus-4-6"` | Model for context file generation |
| `max_tokens_per_analysis` | number | `32768` | Max output tokens per LLM request |
| `cache_ttl_hours` | number | `720` | How long to cache file hashes (hours). 720h = 30 days |
| `max_retries` | number | `3` | Max retries on LLM API failures |
| `retry_base_delay_ms` | number | `1000` | Base delay for exponential backoff (ms) |
| `request_timeout_ms` | number | `120000` | Timeout per LLM request (ms) |
| `max_cost_per_run` | number | `10.00` | Safety limit in USD per run. Set to `0` for unlimited |

```yaml
llm:
  provider: anthropic
  api_key_env: ANTHROPIC_API_KEY
  models:
    analyze: claude-opus-4-6        # Deep codebase analysis (runs infrequently)
    sync: claude-opus-4-6           # Context file compression (loaded into every session)
    review: claude-sonnet-4-6       # PR review (runs on every PR)
    mcp: claude-sonnet-4-6          # MCP server queries (fast responses)
    summary: claude-sonnet-4-6      # Work summaries (summarization)
  max_tokens_per_analysis: 32768
  cache_ttl_hours: 720
  max_retries: 3
  retry_base_delay_ms: 1000
  request_timeout_ms: 120000
  max_cost_per_run: 10.00
```

### Estimated Costs

| Operation | Typical Cost | Frequency |
|-----------|-------------|-----------|
| Full analysis (Opus) | $10 – $16 | Weekly or on-demand |
| Full analysis (Sonnet) | $2 – $3 | Weekly or on-demand |
| Context sync (Opus) | $0.10 – $0.50 | After analysis or major refactors |
| PR review (Sonnet) | $0.01 – $0.10 | Per PR |
| Work summary (Sonnet) | $0.02 – $0.05 | Daily/weekly |
| MCP query (Sonnet) | $0.005 – $0.02 | Per query |

Use `archguard costs` to see cost estimates based on your configuration.

## sync

Controls AI agent context file generation.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `formats` | enum[] | `["claude", "cursorrules"]` | Output formats: `cursorrules`, `claude`, `copilot`, `agents`, `windsurf`, `kiro`, `custom` |
| `output_dir` | string | `"."` | Directory for generated files (relative to project root) |
| `preserve_user_sections` | boolean | `true` | Keep user-added sections when re-syncing |
| `auto_commit` | boolean | `false` | Auto-commit generated context files |
| `auto_pr` | boolean | `false` | Auto-create PRs for context file changes |
| `max_context_tokens` | number | `8192` | Token budget for generated context files (min 512, max 32768) |
| `use_llm` | boolean | `true` | Use Opus to intelligently compress decisions. `false` = template-only (free) |

```yaml
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
  max_context_tokens: 8192
  use_llm: true
```

> **Why `use_llm: true` is the default:** The context file is loaded into every agent session. A ~$0.30 Opus call that produces a 60-70% smaller file saves far more in cumulative token costs across hundreds of agent interactions. Use `use_llm: false` for free, deterministic template-based output.

## mcp

MCP server settings for real-time architectural guidance.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `transport` | enum | `"stdio"` | Transport method: `stdio` or `sse` |

```yaml
mcp:
  transport: stdio
```

## review

Architectural code review settings.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `severity_threshold` | enum | `"warning"` | Minimum severity to report: `error`, `warning`, `info` |
| `max_violations` | number | `50` | Max violations per review |
| `auto_fix_suggestions` | boolean | `true` | Include fix suggestions in output |
| `auto_review_prs` | boolean | `true` | Auto-review PRs (requires GitHub App integration) |

```yaml
review:
  severity_threshold: warning
  max_violations: 50
  auto_fix_suggestions: true
  auto_review_prs: true
```

> ArchGuard review is intentionally opinionated. It flags potential violations and expects the consuming agent to reason about them. False positives aren't noise — they're architectural checkpoints.

## layers

Layer definitions for dependency enforcement. Dependencies are checked against `allowed_dependencies` — if module A is in the "presentation" layer and imports from a module in the "infrastructure" layer, that's a violation (unless "infrastructure" is in `allowed_dependencies`).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Layer name (referenced by `allowed_dependencies`) |
| `patterns` | string[] | yes | Glob patterns that identify files in this layer |
| `allowed_dependencies` | string[] | yes | Which layers this layer may depend on (empty = no dependencies) |

**Default layers** (Clean Architecture):

```yaml
layers:
  - name: presentation
    patterns:
      - "**/presentation/**"
      - "**/ui/**"
      - "**/pages/**"
      - "**/components/**"
      - "**/views/**"
    allowed_dependencies:
      - application
      - domain

  - name: application
    patterns:
      - "**/application/**"
      - "**/services/**"
      - "**/use-cases/**"
      - "**/usecases/**"
    allowed_dependencies:
      - domain

  - name: domain
    patterns:
      - "**/domain/**"
      - "**/entities/**"
      - "**/models/**"
    allowed_dependencies: []

  - name: infrastructure
    patterns:
      - "**/infrastructure/**"
      - "**/repositories/**"
      - "**/adapters/**"
      - "**/db/**"
    allowed_dependencies:
      - domain
      - application
```

## velocity

Team velocity tracking settings. The four weights auto-normalize to 1.0 but should ideally sum to 1.0.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable velocity tracking |
| `calculation_schedule` | string | `"0 0 * * *"` | Cron schedule for calculations |
| `complexity_weight` | number | `0.4` | Weight for code complexity (0.0–1.0) |
| `arch_impact_weight` | number | `0.3` | Weight for architectural impact (0.0–1.0) |
| `review_weight` | number | `0.15` | Weight for review contributions (0.0–1.0) |
| `refactoring_weight` | number | `0.15` | Weight for refactoring work (0.0–1.0) |
| `stale_pr_days` | number | `3` | Days before a PR is flagged as stalled |
| `long_branch_days` | number | `7` | Days before a branch is flagged as long-lived |

```yaml
velocity:
  enabled: true
  calculation_schedule: "0 0 * * *"
  complexity_weight: 0.4
  arch_impact_weight: 0.3
  review_weight: 0.15
  refactoring_weight: 0.15
  stale_pr_days: 3
  long_branch_days: 7
```

## summaries

AI-generated work summary settings.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable work summaries |
| `sprint_length_days` | number | `14` | Sprint length in days (used by `sprint_review` summaries). Min 1, max 90 |
| `schedules` | object[] | `[]` | Scheduled summary rules (see below) |

Each schedule entry:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | enum | yes | `one_on_one`, `standup`, `sprint_review`, or `progress_report` |
| `cron` | string | yes | Cron schedule (5-field) |
| `slack_channel` | string | no | Slack channel for delivery |

```yaml
summaries:
  enabled: true
  sprint_length_days: 14
  schedules:
    - type: standup
      cron: "0 10 * * *"
    - type: one_on_one
      cron: "0 9 * * 1"
      slack_channel: "#1-1-summaries"
```

## slack (optional)

Slack integration. Omit this section entirely if not using Slack.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bot_token_env` | string | yes | Env var with Slack bot token |
| `signing_secret_env` | string | yes | Env var with Slack signing secret |
| `notifications.violations.channel` | string | no | Channel for violation alerts |
| `notifications.violations.severity_threshold` | enum | no | Min severity: `error`, `warning`, `info` |
| `notifications.drift.channel` | string | no | Channel for drift alerts |
| `notifications.drift.score_threshold` | number | no | Drift score threshold (0.0–1.0) |
| `notifications.blockers.channel` | string | no | Channel for blocker alerts |

```yaml
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
```

## rules

Custom architectural rules. Each rule matches a regex pattern and restricts where it can appear.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Rule name |
| `pattern` | string | yes | Regex pattern to match in code |
| `allowed_in` | string[] | no | Glob patterns where the pattern is allowed |
| `not_allowed_in` | string[] | no | Glob patterns where the pattern is forbidden |
| `severity` | enum | yes | `error`, `warning`, or `info` |

Use `allowed_in` or `not_allowed_in`, not both.

```yaml
rules:
  - name: "No direct DB access outside repositories"
    pattern: "import.*from.*prisma"
    allowed_in:
      - "src/infrastructure/repositories/**"
    severity: error

  - name: "Controllers must use service layer"
    pattern: "import.*from.*models"
    not_allowed_in:
      - "src/controllers/**"
    severity: warning
```

## Full Example

This is the default config generated by `archguard init`:

```yaml
version: 1

analysis:
  include:
    - "**"
  exclude:
    - "**/node_modules/**"
    - "**/dist/**"
    - "**/build/**"
    - "**/out/**"
    - "**/.next/**"
    - "**/vendor/**"
    - "**/target/**"
    - "**/__pycache__/**"
    - "**/.venv/**"
    - "**/venv/**"
    - "**/*.min.js"
    - "**/*.bundle.js"
    - "**/generated/**"
    - "**/coverage/**"
  languages:
    - typescript
    - javascript
    - python
    - go
    - rust
    - java
  max_file_size_kb: 2048
  analysis_period_months: 6

llm:
  provider: anthropic
  api_key_env: ANTHROPIC_API_KEY
  models:
    analyze: claude-opus-4-6
    sync: claude-opus-4-6
    review: claude-sonnet-4-6
    mcp: claude-sonnet-4-6
    summary: claude-sonnet-4-6
  max_tokens_per_analysis: 32768
  cache_ttl_hours: 720
  max_retries: 3
  retry_base_delay_ms: 1000
  request_timeout_ms: 120000
  max_cost_per_run: 10.00

sync:
  formats:
    - cursorrules
    - claude
  output_dir: "."
  preserve_user_sections: true
  auto_commit: false
  auto_pr: false
  max_context_tokens: 8192
  use_llm: true

mcp:
  transport: stdio

review:
  severity_threshold: warning
  max_violations: 50
  auto_fix_suggestions: true
  auto_review_prs: true

layers:
  - name: presentation
    patterns:
      - "**/presentation/**"
      - "**/ui/**"
      - "**/pages/**"
      - "**/components/**"
      - "**/views/**"
    allowed_dependencies:
      - application
      - domain
  - name: application
    patterns:
      - "**/application/**"
      - "**/services/**"
      - "**/use-cases/**"
      - "**/usecases/**"
    allowed_dependencies:
      - domain
  - name: domain
    patterns:
      - "**/domain/**"
      - "**/entities/**"
      - "**/models/**"
    allowed_dependencies: []
  - name: infrastructure
    patterns:
      - "**/infrastructure/**"
      - "**/repositories/**"
      - "**/adapters/**"
      - "**/db/**"
    allowed_dependencies:
      - domain
      - application

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
  sprint_length_days: 14
  schedules: []

rules: []
```
