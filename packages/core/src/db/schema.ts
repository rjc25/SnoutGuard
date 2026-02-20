/**
 * Drizzle ORM schema definitions for both PostgreSQL and SQLite.
 * Exports a unified schema that works with the db client factory.
 */

import {
  sqliteTable,
  text,
  integer,
  real,
} from 'drizzle-orm/sqlite-core';

// ─── Organizations ─────────────────────────────────────────────────

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan').notNull().default('free'),
  settings: text('settings').default('{}'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ─── Users ─────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  authProvider: text('auth_provider').notNull().default('email'),
  createdAt: text('created_at').notNull(),
});

// ─── Org Members ───────────────────────────────────────────────────

export const orgMembers = sqliteTable('org_members', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organizations.id),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role').notNull().default('member'),
  joinedAt: text('joined_at').notNull(),
});

// ─── API Keys ──────────────────────────────────────────────────────

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organizations.id),
  createdBy: text('created_by').notNull().references(() => users.id),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(),
  permissions: text('permissions').notNull(),
  lastUsedAt: text('last_used_at'),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').notNull(),
});

// ─── Repositories ──────────────────────────────────────────────────

export const repositories = sqliteTable('repositories', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organizations.id),
  provider: text('provider').notNull(),
  providerId: text('provider_id').notNull(),
  name: text('name').notNull(),
  fullName: text('full_name').notNull(),
  defaultBranch: text('default_branch').notNull().default('main'),
  cloneUrl: text('clone_url').notNull(),
  webhookSecret: text('webhook_secret'),
  lastAnalyzedAt: text('last_analyzed_at'),
  config: text('config').default('{}'),
  createdAt: text('created_at').notNull(),
});

// ─── Developers ────────────────────────────────────────────────────

export const developers = sqliteTable('developers', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organizations.id),
  userId: text('user_id').references(() => users.id),
  gitName: text('git_name').notNull(),
  gitEmail: text('git_email').notNull(),
  githubUsername: text('github_username'),
  createdAt: text('created_at').notNull(),
});

// ─── Architectural Decisions ───────────────────────────────────────

export const decisions = sqliteTable('decisions', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull().references(() => repositories.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  status: text('status').notNull().default('detected'),
  confidence: real('confidence').notNull().default(0.5),
  constraints: text('constraints').default('[]'),
  relatedDecisions: text('related_decisions').default('[]'),
  tags: text('tags').default('[]'),
  detectedAt: text('detected_at').notNull(),
  confirmedBy: text('confirmed_by').references(() => users.id),
  updatedAt: text('updated_at').notNull(),
});

// ─── Evidence ──────────────────────────────────────────────────────

export const evidence = sqliteTable('evidence', {
  id: text('id').primaryKey(),
  decisionId: text('decision_id').notNull().references(() => decisions.id),
  filePath: text('file_path').notNull(),
  lineStart: integer('line_start').notNull(),
  lineEnd: integer('line_end').notNull(),
  snippet: text('snippet').notNull(),
  explanation: text('explanation').notNull(),
});

// ─── Architectural Snapshots ───────────────────────────────────────

export const archSnapshots = sqliteTable('arch_snapshots', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull().references(() => repositories.id),
  commitSha: text('commit_sha').notNull(),
  driftScore: real('drift_score').notNull().default(0),
  decisionCount: integer('decision_count').notNull(),
  dependencyStats: text('dependency_stats').default('{}'),
  createdAt: text('created_at').notNull(),
});

// ─── Drift Events ──────────────────────────────────────────────────

export const driftEvents = sqliteTable('drift_events', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull().references(() => repositories.id),
  snapshotId: text('snapshot_id').notNull().references(() => archSnapshots.id),
  type: text('type').notNull(),
  decisionId: text('decision_id').references(() => decisions.id),
  description: text('description').notNull(),
  severity: text('severity').notNull(),
  detectedAt: text('detected_at').notNull(),
});

// ─── Dependencies ──────────────────────────────────────────────────

export const dependencies = sqliteTable('dependencies', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull().references(() => repositories.id),
  sourceFile: text('source_file').notNull(),
  targetFile: text('target_file').notNull(),
  importType: text('import_type'),
  snapshotId: text('snapshot_id').references(() => archSnapshots.id),
  detectedAt: text('detected_at').notNull(),
});

// ─── Code Reviews ──────────────────────────────────────────────────

export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull().references(() => repositories.id),
  ref: text('ref').notNull(),
  prNumber: integer('pr_number'),
  prUrl: text('pr_url'),
  totalViolations: integer('total_violations').notNull(),
  errors: integer('errors').notNull(),
  warnings: integer('warnings').notNull(),
  infos: integer('infos').notNull(),
  results: text('results').notNull(),
  triggeredBy: text('triggered_by'),
  reviewedAt: text('reviewed_at').notNull(),
});

// ─── Velocity Scores ───────────────────────────────────────────────

export const velocityScores = sqliteTable('velocity_scores', {
  id: text('id').primaryKey(),
  developerId: text('developer_id').notNull().references(() => developers.id),
  repoId: text('repo_id').notNull().references(() => repositories.id),
  period: text('period').notNull(),
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  commits: integer('commits').notNull().default(0),
  prsOpened: integer('prs_opened').notNull().default(0),
  prsMerged: integer('prs_merged').notNull().default(0),
  linesAdded: integer('lines_added').notNull().default(0),
  linesRemoved: integer('lines_removed').notNull().default(0),
  weightedEffort: real('weighted_effort').notNull().default(0),
  architecturalImpact: real('architectural_impact').notNull().default(0),
  refactoringRatio: real('refactoring_ratio').notNull().default(0),
  reviewContribution: real('review_contribution').notNull().default(0),
  velocityScore: real('velocity_score').notNull().default(0),
  trend: text('trend').notNull().default('stable'),
  blockers: text('blockers').default('[]'),
  calculatedAt: text('calculated_at').notNull(),
});

// ─── Work Summaries ────────────────────────────────────────────────

export const workSummaries = sqliteTable('work_summaries', {
  id: text('id').primaryKey(),
  developerId: text('developer_id').references(() => developers.id),
  orgId: text('org_id').notNull().references(() => organizations.id),
  type: text('type').notNull(),
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  content: text('content').notNull(),
  dataPoints: text('data_points').default('{}'),
  editedContent: text('edited_content'),
  generatedAt: text('generated_at').notNull(),
});

// ─── Sync History ──────────────────────────────────────────────────

export const syncHistory = sqliteTable('sync_history', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull().references(() => repositories.id),
  format: text('format').notNull(),
  outputPath: text('output_path').notNull(),
  decisionsCount: integer('decisions_count').notNull(),
  syncedAt: text('synced_at').notNull(),
});

// ─── SAML Configs ──────────────────────────────────────────────────

export const samlConfigs = sqliteTable('saml_configs', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organizations.id),
  idpEntityId: text('idp_entity_id').notNull(),
  idpSsoUrl: text('idp_sso_url').notNull(),
  idpCertificate: text('idp_certificate').notNull(),
  spEntityId: text('sp_entity_id').notNull(),
  defaultRole: text('default_role').notNull().default('member'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});
