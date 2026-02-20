/**
 * YAML configuration loader for .archguard.yml files.
 * Handles loading, validation, and default values.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import type { ArchGuardConfig } from './types.js';

const CONFIG_FILENAME = '.archguard.yml';

const customRuleSchema = z.object({
  name: z.string(),
  pattern: z.string(),
  allowedIn: z.array(z.string()).optional(),
  notAllowedIn: z.array(z.string()).optional(),
  severity: z.enum(['error', 'warning', 'info']),
});

const summaryScheduleSchema = z.object({
  type: z.enum(['one_on_one', 'standup', 'sprint_review', 'progress_report']),
  cron: z.string(),
  slackChannel: z.string().optional(),
});

const layerDefinitionSchema = z.object({
  name: z.string(),
  patterns: z.array(z.string()),
  allowedDependencies: z.array(z.string()),
});

const configSchema = z.object({
  version: z.number().default(1),
  server: z
    .object({
      url: z.string(),
      apiKeyEnv: z.string().optional(),
    })
    .optional(),
  analysis: z
    .object({
      include: z.array(z.string()).default(['**']),
      exclude: z
        .array(z.string())
        .default([
          '**/node_modules/**',
          '**/dist/**',
          '**/build/**',
          '**/out/**',
          '**/.next/**',
          '**/vendor/**',
          '**/target/**',
          '**/__pycache__/**',
          '**/.venv/**',
          '**/venv/**',
          '**/*.min.js',
          '**/*.bundle.js',
          '**/generated/**',
          '**/coverage/**',
        ]),
      languages: z
        .array(
          z.enum([
            'typescript',
            'javascript',
            'python',
            'go',
            'rust',
            'java',
          ])
        )
        .default([
          'typescript',
          'javascript',
          'python',
          'go',
          'rust',
          'java',
        ]),
      maxFileSizeKb: z.number().default(2048),
      analysisPeriodMonths: z.number().default(6),
    })
    .default({}),
  llm: z
    .object({
      provider: z.string().default('anthropic'),
      apiKeyEnv: z.string().default('ANTHROPIC_API_KEY'),
      models: z
        .object({
          analyze: z.string().default('claude-opus-4-6'),
          review: z.string().default('claude-sonnet-4-6'),
          mcp: z.string().default('claude-sonnet-4-6'),
          summary: z.string().default('claude-sonnet-4-6'),
          sync: z.string().default('claude-opus-4-6'),
        })
        .default({}),
      maxTokensPerAnalysis: z.number().default(32768),
      cacheTtlHours: z.number().default(720),
      maxRetries: z.number().default(3),
      retryBaseDelayMs: z.number().default(1000),
      requestTimeoutMs: z.number().default(120_000),
      maxCostPerRun: z.number().default(10.0),
    })
    .default({}),
  sync: z
    .object({
      formats: z
        .array(
          z.enum([
            'cursorrules',
            'claude',
            'copilot',
            'agents',
            'windsurf',
            'kiro',
            'custom',
          ])
        )
        .default(['claude', 'cursorrules']),
      outputDir: z.string().default('.'),
      preserveUserSections: z.boolean().default(true),
      autoCommit: z.boolean().default(false),
      autoPr: z.boolean().default(false),
      maxContextTokens: z.number().min(512).max(32768).default(8192),
      useLlm: z.boolean().default(true),
    })
    .default({}),
  mcp: z
    .object({
      transport: z.enum(['stdio', 'sse']).default('stdio'),
    })
    .default({}),
  review: z
    .object({
      severityThreshold: z.enum(['error', 'warning', 'info']).default('warning'),
      maxViolations: z.number().default(50),
      autoFixSuggestions: z.boolean().default(true),
      autoReviewPrs: z.boolean().default(true),
    })
    .default({}),
  velocity: z
    .object({
      enabled: z.boolean().default(true),
      calculationSchedule: z.string().default('0 0 * * *'),
      complexityWeight: z.number().default(0.4),
      archImpactWeight: z.number().default(0.3),
      reviewWeight: z.number().default(0.15),
      refactoringWeight: z.number().default(0.15),
      stalePrDays: z.number().default(3),
      longBranchDays: z.number().default(7),
    })
    .default({}),
  summaries: z
    .object({
      enabled: z.boolean().default(true),
      sprintLengthDays: z.number().min(1).max(90).default(14),
      schedules: z.array(summaryScheduleSchema).default([]),
    })
    .default({}),
  layers: z.array(layerDefinitionSchema).default([
    {
      name: 'presentation',
      patterns: ['**/presentation/**', '**/ui/**', '**/pages/**', '**/components/**', '**/views/**'],
      allowedDependencies: ['application', 'domain'],
    },
    {
      name: 'application',
      patterns: ['**/application/**', '**/services/**', '**/use-cases/**', '**/usecases/**'],
      allowedDependencies: ['domain'],
    },
    {
      name: 'domain',
      patterns: ['**/domain/**', '**/entities/**', '**/models/**'],
      allowedDependencies: [],
    },
    {
      name: 'infrastructure',
      patterns: ['**/infrastructure/**', '**/repositories/**', '**/adapters/**', '**/db/**'],
      allowedDependencies: ['domain', 'application'],
    },
  ]),
  slack: z
    .object({
      botTokenEnv: z.string(),
      signingSecretEnv: z.string(),
      notifications: z.object({
        violations: z
          .object({
            channel: z.string(),
            severityThreshold: z.enum(['error', 'warning', 'info']),
          })
          .optional(),
        drift: z
          .object({
            channel: z.string(),
            scoreThreshold: z.number(),
          })
          .optional(),
        blockers: z.object({ channel: z.string() }).optional(),
      }),
    })
    .optional(),
  rules: z.array(customRuleSchema).default([]),
});

/** Default configuration when no .archguard.yml is found */
export function getDefaultConfig(): ArchGuardConfig {
  return configSchema.parse({}) as ArchGuardConfig;
}

/**
 * Load and validate an .archguard.yml config file.
 * Falls back to defaults if the file doesn't exist.
 */
export function loadConfig(projectDir: string): ArchGuardConfig {
  const configPath = path.join(projectDir, CONFIG_FILENAME);

  if (!fs.existsSync(configPath)) {
    return getDefaultConfig();
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = yaml.load(raw);

  // Convert snake_case YAML keys to camelCase for TS
  const normalized = normalizeKeys(parsed as Record<string, unknown>);
  const result = configSchema.parse(normalized);
  return result as ArchGuardConfig;
}

/**
 * Write a default .archguard.yml config file to the project directory.
 */
export function writeDefaultConfig(projectDir: string): string {
  const configPath = path.join(projectDir, CONFIG_FILENAME);
  const defaultYaml = `version: 1

# Analysis settings
# By default scans all common project structures and all supported languages.
# Test files ARE included so testing architecture decisions can be detected.
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

# LLM settings — an Anthropic API key is required
# Get one at https://console.anthropic.com
llm:
  provider: anthropic
  api_key_env: ANTHROPIC_API_KEY
  models:
    # Opus for deep analysis (runs infrequently, quality matters most)
    analyze: claude-opus-4-6
    # Sonnet for PR review (runs on every PR, speed matters)
    review: claude-sonnet-4-6
    # Sonnet for MCP server queries (fast responses)
    mcp: claude-sonnet-4-6
    # Sonnet for work summaries (summarization)
    summary: claude-sonnet-4-6
    # Opus for context file generation (intelligent compression of decisions)
    sync: claude-opus-4-6
  max_tokens_per_analysis: 32768
  cache_ttl_hours: 720
  max_retries: 3
  retry_base_delay_ms: 1000
  request_timeout_ms: 120000
  max_cost_per_run: 10.00

# Context file sync (no LLM needed — pure templating)
sync:
  formats:
    - cursorrules
    - claude
  output_dir: "."
  preserve_user_sections: true
  auto_commit: false
  max_context_tokens: 8192   # Token budget for generated context files (LLM is told this limit)
  use_llm: true              # Use Opus to intelligently compress decisions (false = template-only)

# MCP server
mcp:
  transport: stdio

# Architectural review
review:
  severity_threshold: warning
  max_violations: 50
  auto_fix_suggestions: true
  auto_review_prs: true

# Velocity tracking
velocity:
  enabled: true
  calculation_schedule: "0 0 * * *"
  complexity_weight: 0.4
  arch_impact_weight: 0.3
  review_weight: 0.15
  refactoring_weight: 0.15
  stale_pr_days: 3
  long_branch_days: 7

# Work summaries
summaries:
  enabled: true
  sprint_length_days: 14    # Length of a sprint in days (used by sprint_review summaries)
  schedules: []

# Layer definitions for dependency enforcement
# Dependencies flow: presentation -> application -> domain <- infrastructure
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

# Custom architectural rules
rules: []
`;

  fs.writeFileSync(configPath, defaultYaml, 'utf-8');
  return configPath;
}

/** Recursively convert snake_case keys to camelCase */
function normalizeKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(normalizeKeys);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      result[camelKey] = normalizeKeys(value);
    }
    return result;
  }
  return obj;
}
