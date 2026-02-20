/**
 * @archguard/context-sync - Generate AI agent context files from architectural decisions.
 *
 * This package generates context files for various AI coding assistants:
 * - Cursor (.cursorrules)
 * - Claude Code (CLAUDE.md)
 * - GitHub Copilot (.github/copilot-instructions.md)
 * - Agents (agents.md)
 * - Windsurf (.windsurfrules)
 * - Kiro (.kiro/steering.md)
 * - Custom (user-defined Handlebars templates)
 */

// ─── Generators ───────────────────────────────────────────────────

export { generateCursorRules } from './generators/cursorrules.js';
export { generateClaudeMd } from './generators/claude-md.js';
export { generateAgentsMd } from './generators/agents-md.js';
export { generateCopilotInstructions } from './generators/copilot.js';
export { generateWindsurfRules } from './generators/windsurf.js';
export { generateKiroSteering } from './generators/kiro.js';
export { generateCustom, DEFAULT_CUSTOM_TEMPLATE } from './generators/custom.js';
export type { CustomTemplateOptions } from './generators/custom.js';

// ─── Sync Engine ──────────────────────────────────────────────────

export { SyncEngine } from './sync-engine.js';
export type { SyncEngineOptions, SyncResult } from './sync-engine.js';

// ─── Template Utilities ───────────────────────────────────────────

export {
  registerHelpers,
  groupByCategory,
  groupByStatus,
  getAllTags,
  getAllConstraints,
  activeDecisions,
  sortByConfidence,
  compileTemplate,
  extractUserSections,
  insertUserSections,
  generationHeader,
} from './templates.js';
