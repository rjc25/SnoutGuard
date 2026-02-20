# Configuration Reference

ArchGuard is configured via `.archguard.yml` in your project root. Run `archguard init` to generate one with defaults.

The config file uses `snake_case` keys (e.g. `max_file_size_kb`), which are automatically converted to camelCase internally.

## version

| Field | Type | Default |
|-------|------|---------|
| `version` | number | `1` |

Configuration schema version.

## server (optional)

Connect to a remote ArchGuard server instance. Omit this section entirely for local-only usage.

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
| `include` | string[] | `["src/**", "lib/**"]` | Glob patterns for files to analyze |
| `exclude` | string[] | `["**/*.test.*", "**/*.spec.*", "**/node_modules/**", "**/dist/**"]` | Glob patterns to exclude |
| `languages` | enum[] | `["typescript"]` | Languages to analyze: `typescript`, `javascript`, `python`, `go`, `rust`, `java` |
| `max_file_size_kb` | number | `500` | Maximum file size in KB to analyze |
| `llm_analysis` | boolean | `true` | Enable LLM-powered architectural pattern detection |
| `analysis_period_months` | number | `6` | Time window in months for architectural drift analysis |

```yaml
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
  analysis_period_months: 6
```

## llm

LLM provider settings.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `provider` | string | `"anthropic"` | LLM provider |
| `model` | string | `"claude-sonnet-4-6"` | Model ID |
| `api_key_env` | string | `"ANTHROPIC_API_KEY"` | Environment variable containing the API key |
| `max_tokens_per_analysis` | number | `4096` | Max tokens per LLM request |
| `cache_ttl_hours` | number | `24` | How long to cache LLM responses (hours) |

```yaml
llm:
  provider: anthropic
  model: claude-sonnet-4-6
  api_key_env: ANTHROPIC_API_KEY
  max_tokens_per_analysis: 4096
  cache_ttl_hours: 24
```

## sync

Controls AI agent context file generation.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `formats` | enum[] | `["claude", "cursorrules"]` | Output formats: `cursorrules`, `claude`, `copilot`, `agents`, `windsurf`, `kiro`, `custom` |
| `output_dir` | string | `"."` | Directory for generated files (relative to project root) |
| `preserve_user_sections` | boolean | `true` | Keep user-added sections when re-syncing |
| `auto_commit` | boolean | `false` | Auto-commit generated context files |
| `auto_pr` | boolean | `false` | Auto-create PRs for context file changes |

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
```

## mcp

MCP server settings for real-time architectural guidance.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `transport` | enum | `"stdio"` | Transport method: `stdio` or `sse` |
| `llm_enhanced` | boolean | `true` | Enable LLM-enhanced guidance responses |

```yaml
mcp:
  transport: stdio
  llm_enhanced: true
```

## review

Architectural code review settings.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `severity_threshold` | enum | `"warning"` | Minimum severity to report: `error`, `warning`, `info` |
| `max_violations` | number | `50` | Max violations per review |
| `auto_fix_suggestions` | boolean | `true` | Include fix suggestions in output |
| `auto_review_prs` | boolean | `true` | Auto-review PRs (requires GitHub App) |

```yaml
review:
  severity_threshold: warning
  max_violations: 50
  auto_fix_suggestions: true
  auto_review_prs: true
```

## velocity

Team velocity tracking settings. The four weights should sum to 1.0.

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

## Full example

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
  llm_analysis: true
  analysis_period_months: 6

llm:
  provider: anthropic
  model: claude-sonnet-4-6
  api_key_env: ANTHROPIC_API_KEY
  max_tokens_per_analysis: 4096
  cache_ttl_hours: 24

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

mcp:
  transport: stdio
  llm_enhanced: true

review:
  severity_threshold: warning
  max_violations: 50
  auto_fix_suggestions: true
  auto_review_prs: true

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
