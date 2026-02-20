-- Migration: 0001_initial_schema
-- Description: Create all initial tables for ArchGuard
-- Created: 2026-02-20

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  settings TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'email',
  created_at TEXT NOT NULL
);

-- Org memberships
CREATE TABLE IF NOT EXISTS org_members (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL,
  UNIQUE(org_id, user_id)
);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  permissions TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

-- Connected repositories
CREATE TABLE IF NOT EXISTS repositories (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  clone_url TEXT NOT NULL,
  webhook_secret TEXT,
  last_analyzed_at TEXT,
  config TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

-- Developers (mapped from git authors)
CREATE TABLE IF NOT EXISTS developers (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  git_name TEXT NOT NULL,
  git_email TEXT NOT NULL,
  github_username TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(org_id, git_email)
);

-- Architectural decisions
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'detected',
  confidence REAL NOT NULL DEFAULT 0.5,
  constraints TEXT DEFAULT '[]',
  related_decisions TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]',
  detected_at TEXT NOT NULL,
  confirmed_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);

-- Evidence supporting decisions
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  snippet TEXT NOT NULL,
  explanation TEXT NOT NULL
);

-- Architectural snapshots (for drift tracking)
CREATE TABLE IF NOT EXISTS arch_snapshots (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_sha TEXT NOT NULL,
  drift_score REAL NOT NULL DEFAULT 0,
  decision_count INTEGER NOT NULL,
  dependency_stats TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

-- Drift events
CREATE TABLE IF NOT EXISTS drift_events (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL REFERENCES arch_snapshots(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  decision_id TEXT REFERENCES decisions(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  detected_at TEXT NOT NULL
);

-- Dependencies
CREATE TABLE IF NOT EXISTS dependencies (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  source_file TEXT NOT NULL,
  target_file TEXT NOT NULL,
  import_type TEXT,
  snapshot_id TEXT REFERENCES arch_snapshots(id) ON DELETE CASCADE,
  detected_at TEXT NOT NULL
);

-- Code reviews
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  ref TEXT NOT NULL,
  pr_number INTEGER,
  pr_url TEXT,
  total_violations INTEGER NOT NULL,
  errors INTEGER NOT NULL,
  warnings INTEGER NOT NULL,
  infos INTEGER NOT NULL,
  results TEXT NOT NULL,
  triggered_by TEXT,
  reviewed_at TEXT NOT NULL
);

-- Velocity scores
CREATE TABLE IF NOT EXISTS velocity_scores (
  id TEXT PRIMARY KEY,
  developer_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  commits INTEGER NOT NULL DEFAULT 0,
  prs_opened INTEGER NOT NULL DEFAULT 0,
  prs_merged INTEGER NOT NULL DEFAULT 0,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_removed INTEGER NOT NULL DEFAULT 0,
  weighted_effort REAL NOT NULL DEFAULT 0,
  architectural_impact REAL NOT NULL DEFAULT 0,
  refactoring_ratio REAL NOT NULL DEFAULT 0,
  review_contribution REAL NOT NULL DEFAULT 0,
  velocity_score REAL NOT NULL DEFAULT 0,
  trend TEXT NOT NULL DEFAULT 'stable',
  blockers TEXT DEFAULT '[]',
  calculated_at TEXT NOT NULL,
  UNIQUE(developer_id, repo_id, period, period_start)
);

-- Work summaries
CREATE TABLE IF NOT EXISTS work_summaries (
  id TEXT PRIMARY KEY,
  developer_id TEXT REFERENCES developers(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  content TEXT NOT NULL,
  data_points TEXT DEFAULT '{}',
  edited_content TEXT,
  generated_at TEXT NOT NULL
);

-- Context file sync history
CREATE TABLE IF NOT EXISTS sync_history (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  output_path TEXT NOT NULL,
  decisions_count INTEGER NOT NULL,
  synced_at TEXT NOT NULL
);

-- SAML configurations (enterprise)
CREATE TABLE IF NOT EXISTS saml_configs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  idp_entity_id TEXT NOT NULL,
  idp_sso_url TEXT NOT NULL,
  idp_certificate TEXT NOT NULL,
  sp_entity_id TEXT NOT NULL,
  default_role TEXT NOT NULL DEFAULT 'member',
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
