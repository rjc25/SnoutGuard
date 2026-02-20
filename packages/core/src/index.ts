/**
 * @archguard/core - Shared types, utilities, database, LLM client, and git helpers.
 * This is the foundation package that all other ArchGuard packages depend on.
 */

// Types
export * from './types.js';

// Config
export { loadConfig, writeDefaultConfig, getDefaultConfig } from './config.js';

// Database
export {
  createSqliteClient,
  initializeDatabase,
  schema,
  type DbClient,
} from './db/index.js';

// LLM
export {
  createLlmClient,
  analyzeWithLlm,
  streamAnalysis,
  clearCache,
  type AnalysisOptions,
} from './llm.js';

// Git
export {
  createGitClient,
  getDiff,
  getCommitDiff,
  getLog,
  getHeadSha,
  getCurrentBranch,
  getTrackedFiles,
  getBlame,
  getDevStats,
  isGitRepo,
  type DiffHunk,
  type FileDiff,
  type DevGitStats,
} from './git.js';

// Auth
export {
  ROLE_PERMISSIONS,
  hasPermission,
  getRolePermissions,
  isRoleAtLeast,
  type Permission,
} from './auth.js';

// Utils
export {
  generateId,
  now,
  hash,
  fileHash,
  detectLanguage,
  shouldIncludeFile,
  truncate,
  readFileSafe,
  parseJsonSafe,
  debounce,
  sleep,
  findProjectRoot,
  formatPercent,
  clamp,
} from './utils.js';
