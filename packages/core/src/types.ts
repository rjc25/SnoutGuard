/**
 * Shared type definitions for the ArchGuard platform.
 * All interfaces and types used across packages are defined here.
 */

// ─── Architecture Types ────────────────────────────────────────────

/** Categories of architectural decisions */
export type ArchCategory =
  | 'structural'
  | 'behavioral'
  | 'deployment'
  | 'data'
  | 'api'
  | 'testing'
  | 'security';

/** Status of an architectural decision */
export type DecisionStatus = 'detected' | 'confirmed' | 'deprecated' | 'custom';

/** Code evidence supporting a decision */
export interface Evidence {
  filePath: string;
  lineRange: [number, number];
  snippet: string;
  explanation: string;
}

/** An architectural decision extracted from or declared for a codebase */
export interface ArchDecision {
  id: string;
  title: string;
  description: string;
  category: ArchCategory;
  status: DecisionStatus;
  confidence: number;
  evidence: Evidence[];
  constraints: string[];
  relatedDecisions: string[];
  detectedAt: string;
  confirmedBy?: string;
  tags: string[];
  reasoning?: string;
}

// ─── Drift Types ───────────────────────────────────────────────────

/** A timestamped snapshot of architectural state */
export interface ArchSnapshot {
  id: string;
  repoId: string;
  commitSha: string;
  decisions: ArchDecision[];
  driftScore: number;
  dependencyStats: {
    totalModules: number;
    circularDeps: number;
    avgCoupling: number;
    avgInstability?: number;
    avgDistance?: number;
  };
  createdAt: string;
}

/** Type of drift event */
export type DriftEventType =
  | 'decision_lost'
  | 'decision_weakened'
  | 'new_violation_trend'
  | 'circular_dep_introduced'
  | 'decision_emerged'
  | 'layer_violation_introduced';

/** An event indicating architectural drift */
export interface DriftEvent {
  id: string;
  repoId: string;
  type: DriftEventType;
  decisionId?: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  detectedAt: string;
  snapshotId: string;
}

// ─── Dependency Types ──────────────────────────────────────────────

/** A dependency between two modules/files */
export interface Dependency {
  id: string;
  repoId: string;
  sourceFile: string;
  targetFile: string;
  importType?: string;
  snapshotId?: string;
  detectedAt: string;
}

/** Dependency graph node with coupling metrics */
export interface DependencyNode {
  filePath: string;
  imports: string[];
  importedBy: string[];
}

/** Robert C. Martin coupling metrics for a module */
export interface CouplingMetrics {
  /** Afferent coupling: number of modules that depend on this module */
  afferentCoupling: number;
  /** Efferent coupling: number of modules this module depends on */
  efferentCoupling: number;
  /** Instability: Ce / (Ca + Ce). 0 = maximally stable, 1 = maximally unstable */
  instability: number;
  /** Abstractness: ratio of abstract types to total types (0-1) */
  abstractness: number;
  /** Distance from main sequence: |A + I - 1|. 0 = ideal balance */
  distanceFromMainSequence: number;
}

/** Circular dependency group */
export interface CircularDependency {
  files: string[];
  cycle: string[];
}

/** Layer violation in the dependency graph */
export interface LayerViolation {
  sourceFile: string;
  targetFile: string;
  sourceLayer: string;
  targetLayer: string;
  importStatement: string;
  message: string;
}

// ─── Review Types ──────────────────────────────────────────────────

/** Severity of a review violation */
export type ViolationSeverity = 'error' | 'warning' | 'info';

/** A single violation found during review */
export interface Violation {
  id: string;
  rule: string;
  severity: ViolationSeverity;
  message: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  suggestion?: string;
  decisionId?: string;
}

/** Result of a code review */
export interface ReviewResult {
  id: string;
  repoId: string;
  ref: string;
  prNumber?: number;
  prUrl?: string;
  totalViolations: number;
  errors: number;
  warnings: number;
  infos: number;
  violations: Violation[];
  triggeredBy: 'webhook' | 'cli' | 'manual';
  reviewedAt: string;
}

// ─── Velocity Types ────────────────────────────────────────────────

/** Velocity calculation period */
export type VelocityPeriod = 'daily' | 'weekly' | 'sprint' | 'monthly';

/** Velocity trend direction */
export type VelocityTrend = 'accelerating' | 'stable' | 'decelerating';

/** Blocker type */
export type BlockerType =
  | 'stalled_pr'
  | 'long_lived_branch'
  | 'review_bottleneck'
  | 'high_violation_rate'
  | 'dependency_block';

/** A blocker impeding development velocity */
export interface Blocker {
  type: BlockerType;
  description: string;
  severity: 'high' | 'medium' | 'low';
  relatedEntity: string;
  staleSince?: string;
}

/** Velocity score for a developer over a period */
export interface VelocityScore {
  developerId: string;
  period: VelocityPeriod;
  periodStart: string;
  periodEnd: string;
  commits: number;
  prsOpened: number;
  prsMerged: number;
  linesAdded: number;
  linesRemoved: number;
  weightedEffort: number;
  architecturalImpact: number;
  refactoringRatio: number;
  reviewContribution: number;
  velocityScore: number;
  trend: VelocityTrend;
  blockers: Blocker[];
}

/** Aggregated team velocity */
export interface TeamVelocity {
  teamId: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  members: VelocityScore[];
  teamVelocityScore: number;
  topBlockers: Blocker[];
  architecturalHealth: number;
  highlights: string[];
}

// ─── Work Summary Types ────────────────────────────────────────────

/** Type of work summary */
export type SummaryType = 'one_on_one' | 'standup' | 'sprint_review' | 'progress_report';

/** Data points backing a summary */
export interface SummaryDataPoints {
  commits: number;
  prsOpened: number;
  prsMerged: number;
  reviewsGiven: number;
  violationsIntroduced: number;
  violationsResolved: number;
  filesChanged: number;
  keyPrs: string[];
}

/** A generated work summary */
export interface WorkSummary {
  id: string;
  developerId?: string;
  teamId: string;
  type: SummaryType;
  periodStart: string;
  periodEnd: string;
  content: string;
  dataPoints: SummaryDataPoints;
  generatedAt: string;
  editedContent?: string;
}

// ─── Auth & Org Types ──────────────────────────────────────────────

/** User role within an organization */
export type Role = 'owner' | 'admin' | 'member' | 'viewer';

/** Auth provider used for login */
export type AuthProvider = 'email' | 'github' | 'google' | 'saml';

/** Git hosting provider */
export type GitProvider = 'github' | 'bitbucket';

/** Organization entity */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'starter' | 'teams' | 'enterprise';
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** User entity */
export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  authProvider: AuthProvider;
  createdAt: string;
}

/** Organization membership */
export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  role: Role;
  joinedAt: string;
}

/** Connected repository */
export interface Repository {
  id: string;
  orgId: string;
  provider: GitProvider;
  providerId: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  cloneUrl: string;
  webhookSecret?: string;
  lastAnalyzedAt?: string;
  config: Record<string, unknown>;
  createdAt: string;
}

/** Developer mapped from git authors */
export interface Developer {
  id: string;
  orgId: string;
  userId?: string;
  gitName: string;
  gitEmail: string;
  githubUsername?: string;
  createdAt: string;
}

// ─── Config Types ──────────────────────────────────────────────────

/** Format of context files to generate */
export type SyncFormat =
  | 'cursorrules'
  | 'claude'
  | 'copilot'
  | 'agents'
  | 'windsurf'
  | 'kiro'
  | 'custom';

/** MCP transport method */
export type McpTransport = 'stdio' | 'sse';

/** Supported programming language for analysis */
export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java';

/** Custom architectural rule from config */
export interface CustomRule {
  name: string;
  pattern: string;
  allowedIn?: string[];
  notAllowedIn?: string[];
  severity: ViolationSeverity;
}

/** Summary schedule from config */
export interface SummarySchedule {
  type: SummaryType;
  cron: string;
  slackChannel?: string;
}

/** Layer definition for layer violation detection */
export interface LayerDefinition {
  name: string;
  patterns: string[];
  allowedDependencies: string[];
}

/** Full .archguard.yml config */
export interface ArchGuardConfig {
  version: number;
  server?: {
    url: string;
    apiKeyEnv?: string;
  };
  analysis: {
    include: string[];
    exclude: string[];
    languages: SupportedLanguage[];
    maxFileSizeKb: number;
    analysisPeriodMonths: number;
  };
  llm: {
    provider: string;
    apiKeyEnv: string;
    /** Per-operation model configuration with smart defaults */
    models: {
      /** Model for `archguard analyze` — deep analysis, runs infrequently. Default: opus */
      analyze: string;
      /** Model for `archguard review` — PR diffs against decisions. Default: sonnet */
      review: string;
      /** Model for MCP server queries — fast responses. Default: sonnet */
      mcp: string;
      /** Model for work summaries — summarization. Default: sonnet */
      summary: string;
    };
    maxTokensPerAnalysis: number;
    cacheTtlHours: number;
    maxRetries: number;
    retryBaseDelayMs: number;
    requestTimeoutMs: number;
    maxCostPerRun: number;
  };
  sync: {
    formats: SyncFormat[];
    outputDir: string;
    preserveUserSections: boolean;
    autoCommit: boolean;
    autoPr: boolean;
  };
  mcp: {
    transport: McpTransport;
  };
  review: {
    severityThreshold: ViolationSeverity;
    maxViolations: number;
    autoFixSuggestions: boolean;
    autoReviewPrs: boolean;
  };
  velocity: {
    enabled: boolean;
    calculationSchedule: string;
    complexityWeight: number;
    archImpactWeight: number;
    reviewWeight: number;
    refactoringWeight: number;
    stalePrDays: number;
    longBranchDays: number;
  };
  summaries: {
    enabled: boolean;
    schedules: SummarySchedule[];
  };
  layers: LayerDefinition[];
  slack?: {
    botTokenEnv: string;
    signingSecretEnv: string;
    notifications: {
      violations?: { channel: string; severityThreshold: ViolationSeverity };
      drift?: { channel: string; scoreThreshold: number };
      blockers?: { channel: string };
    };
  };
  rules: CustomRule[];
}

// ─── LLM Types ─────────────────────────────────────────────────────

/** Record of an LLM API call for cost tracking */
export interface LlmCallRecord {
  id: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  latencyMs: number;
  operation: string;
  cacheHit: boolean;
  timestamp: string;
}

/** Cost summary for a time period */
export interface CostSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  byOperation: Record<string, { calls: number; cost: number }>;
  byModel: Record<string, { calls: number; cost: number }>;
  periodStart: string;
  periodEnd: string;
}

// ─── Analysis Types ────────────────────────────────────────────────

/** Parsed source file info */
export interface ParsedFile {
  filePath: string;
  language: SupportedLanguage;
  imports: string[];
  exports: string[];
  classes: string[];
  functions: string[];
  decorators: string[];
  interfaces: string[];
  abstractClasses: string[];
  typeAliases: string[];
  lineCount: number;
  contentHash: string;
}

/** Detected architectural pattern */
export interface DetectedPattern {
  name: string;
  confidence: number;
  evidence: Evidence[];
  description: string;
}

// ─── Context Sync Types ────────────────────────────────────────────

/** Record of a context file sync operation */
export interface SyncRecord {
  id: string;
  repoId: string;
  format: SyncFormat;
  outputPath: string;
  decisionsCount: number;
  syncedAt: string;
}

// ─── MCP Types ─────────────────────────────────────────────────────

/** MCP compliance check result */
export interface ComplianceResult {
  compliant: boolean;
  violations: Violation[];
  suggestions: string[];
}

/** MCP architectural guidance */
export interface ArchitecturalGuidance {
  approach: string;
  relevantDecisions: ArchDecision[];
  constraints: string[];
  examples: string[];
}
