/**
 * @archguard/context-sync - Generate AI agent context files from architectural decisions.
 *
 * All standard formats (CLAUDE.md, .cursorrules, copilot-instructions.md, etc.) are
 * generated via LLM-powered intelligent compression. Only the 'custom' format uses
 * Handlebars templates for user-defined output.
 */

// ─── Custom Template Generator ────────────────────────────────────

export { generateCustom, DEFAULT_CUSTOM_TEMPLATE } from './generators/custom.js';
export type { CustomTemplateOptions } from './generators/custom.js';

// ─── LLM-Powered Sync ─────────────────────────────────────────────

export { generateWithLlm } from './llm-sync.js';

// ─── Sync Engine ──────────────────────────────────────────────────

export { SyncEngine } from './sync-engine.js';
export type { SyncEngineOptions, SyncResult } from './sync-engine.js';

// ─── Utilities ────────────────────────────────────────────────────

export {
  activeDecisions,
  sortByConfidence,
  extractUserSections,
  insertUserSections,
  groupByCategory,
  groupByStatus,
  getAllTags,
  getAllConstraints,
  registerHelpers,
  compileTemplate,
  generationHeader,
} from './templates.js';
