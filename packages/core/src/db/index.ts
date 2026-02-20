/**
 * Database client factory.
 * Returns a Drizzle ORM client backed by either SQLite (local/CLI mode)
 * or PostgreSQL (server mode), depending on configuration.
 */

import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

export type DbClient = ReturnType<typeof createSqliteClient>;

/** Create a SQLite database client for local/CLI mode */
export function createSqliteClient(dbPath?: string) {
  const resolvedPath = dbPath ?? getDefaultDbPath();
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(resolvedPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzleSqlite(sqlite, { schema });
  return db;
}

/** Initialize the SQLite database with schema tables */
export function initializeDatabase(dbPath?: string): DbClient {
  const resolvedPath = dbPath ?? getDefaultDbPath();
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(resolvedPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      plan TEXT NOT NULL DEFAULT 'free',
      settings TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      avatar_url TEXT,
      auth_provider TEXT NOT NULL DEFAULT 'email',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS org_members (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL,
      UNIQUE(org_id, user_id)
    );

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

    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL,
      snippet TEXT NOT NULL,
      explanation TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS arch_snapshots (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      commit_sha TEXT NOT NULL,
      drift_score REAL NOT NULL DEFAULT 0,
      decision_count INTEGER NOT NULL,
      dependency_stats TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS dependencies (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      source_file TEXT NOT NULL,
      target_file TEXT NOT NULL,
      import_type TEXT,
      snapshot_id TEXT REFERENCES arch_snapshots(id) ON DELETE CASCADE,
      detected_at TEXT NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS sync_history (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      format TEXT NOT NULL,
      output_path TEXT NOT NULL,
      decisions_count INTEGER NOT NULL,
      synced_at TEXT NOT NULL
    );

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
  `);

  return drizzleSqlite(sqlite, { schema });
}

/** Get the default path for the local SQLite database */
function getDefaultDbPath(): string {
  const dataDir =
    process.env.ARCHGUARD_DATA_DIR ??
    path.join(process.env.HOME ?? '/tmp', '.archguard');
  return path.join(dataDir, 'archguard.db');
}

export { schema };

// Re-export commonly used drizzle-orm operators so downstream packages
// do not need a direct dependency on drizzle-orm.
export { eq, and, or, desc, asc, sql } from 'drizzle-orm';
