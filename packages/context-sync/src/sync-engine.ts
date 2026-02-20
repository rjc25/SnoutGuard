/**
 * SyncEngine - Orchestrates generation of AI context files from architectural decisions.
 *
 * Responsibilities:
 * - Generates all configured format files (cursorrules, claude, copilot, etc.)
 * - Preserves user sections between archguard comment markers
 * - Supports watch mode with chokidar (debounced at 5 seconds)
 * - Returns SyncRecord[] for each sync operation
 */

/// <reference types="node" />

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FSWatcher } from 'chokidar';
import type {
  ArchDecision,
  ArchGuardConfig,
  SyncFormat,
  SyncRecord,
} from '@archguard/core';
import { generateId, now } from '@archguard/core';

import { generateCursorRules } from './generators/cursorrules.js';
import { generateClaudeMd } from './generators/claude-md.js';
import { generateAgentsMd } from './generators/agents-md.js';
import { generateCopilotInstructions } from './generators/copilot.js';
import { generateWindsurfRules } from './generators/windsurf.js';
import { generateKiroSteering } from './generators/kiro.js';
import { generateCustom, type CustomTemplateOptions } from './generators/custom.js';
import { generateWithLlm } from './llm-sync.js';
import { extractUserSections, insertUserSections } from './templates.js';

// ─── Types ────────────────────────────────────────────────────────

/** Options for creating a SyncEngine */
export interface SyncEngineOptions {
  /** The project configuration */
  config: ArchGuardConfig;
  /** The architectural decisions to generate from */
  decisions: ArchDecision[];
  /** The repository ID (used in SyncRecord) */
  repoId: string;
  /** Project root directory where files are written */
  projectRoot: string;
  /** Custom template options (required if 'custom' format is configured) */
  customTemplate?: CustomTemplateOptions;
}

/** Result of a full sync operation */
export interface SyncResult {
  records: SyncRecord[];
  errors: Array<{ format: SyncFormat; error: string }>;
}

// ─── Output Path Mapping ──────────────────────────────────────────

/** Get the output file path for a given format */
function getOutputPath(format: SyncFormat, outputDir: string): string {
  switch (format) {
    case 'cursorrules':
      return path.join(outputDir, '.cursorrules');
    case 'claude':
      return path.join(outputDir, 'CLAUDE.md');
    case 'copilot':
      return path.join(outputDir, '.github', 'copilot-instructions.md');
    case 'agents':
      return path.join(outputDir, 'agents.md');
    case 'windsurf':
      return path.join(outputDir, '.windsurfrules');
    case 'kiro':
      return path.join(outputDir, '.kiro', 'steering.md');
    case 'custom':
      return path.join(outputDir, '.archguard-context');
    default:
      return path.join(outputDir, `.archguard-${format}`);
  }
}

// ─── SyncEngine Class ─────────────────────────────────────────────

export class SyncEngine {
  private config: ArchGuardConfig;
  private decisions: ArchDecision[];
  private repoId: string;
  private projectRoot: string;
  private customTemplate?: CustomTemplateOptions;
  private watcher: FSWatcher | null = null;

  constructor(options: SyncEngineOptions) {
    this.config = options.config;
    this.decisions = options.decisions;
    this.repoId = options.repoId;
    this.projectRoot = options.projectRoot;
    this.customTemplate = options.customTemplate;
  }

  /**
   * Update the decisions used for generation.
   * Call this before sync() if decisions have changed.
   */
  updateDecisions(decisions: ArchDecision[]): void {
    this.decisions = decisions;
  }

  /**
   * Update the configuration.
   */
  updateConfig(config: ArchGuardConfig): void {
    this.config = config;
  }

  /**
   * Run a full sync: generate all configured format files.
   * Returns SyncRecord[] for each successfully generated file.
   */
  async sync(): Promise<SyncResult> {
    const formats = this.config.sync.formats;
    const outputDir = path.resolve(this.projectRoot, this.config.sync.outputDir);
    const records: SyncRecord[] = [];
    const errors: Array<{ format: SyncFormat; error: string }> = [];

    for (const format of formats) {
      try {
        const record = await this.generateFormat(format, outputDir);
        records.push(record);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ format, error: message });
      }
    }

    return { records, errors };
  }

  /**
   * Generate a single format file.
   */
  private async generateFormat(format: SyncFormat, outputDir: string): Promise<SyncRecord> {
    // Generate content — use LLM if configured, otherwise template
    const content = this.config.sync.useLlm && format !== 'custom'
      ? await this.renderFormatLlm(format)
      : this.renderFormat(format);

    // Determine output path
    const outputPath = getOutputPath(format, outputDir);

    // Handle user section preservation
    let finalContent = content;
    if (this.config.sync.preserveUserSections) {
      const existingContent = this.readExistingFile(outputPath);
      if (existingContent) {
        const userContent = extractUserSections(existingContent);
        finalContent = insertUserSections(content, userContent);
      } else {
        finalContent = insertUserSections(content, null);
      }
    }

    // Ensure the directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write the file
    fs.writeFileSync(outputPath, finalContent, 'utf-8');

    // Create sync record
    const record: SyncRecord = {
      id: generateId(),
      repoId: this.repoId,
      format,
      outputPath: path.relative(this.projectRoot, outputPath),
      decisionsCount: this.decisions.length,
      syncedAt: now(),
    };

    return record;
  }

  /**
   * Render a format using LLM-powered intelligent compression.
   * Sends all decisions to the sync model (Opus by default) which
   * prioritizes, compresses, and organizes them within the token budget.
   */
  async renderFormatLlm(format: SyncFormat): Promise<string> {
    return generateWithLlm(this.decisions, this.config, format);
  }

  /**
   * Render a format to a string without writing to disk.
   * Uses template-based generation (no LLM). Useful for previewing output.
   */
  renderFormat(format: SyncFormat): string {
    switch (format) {
      case 'cursorrules':
        return generateCursorRules(this.decisions, this.config);
      case 'claude':
        return generateClaudeMd(this.decisions, this.config);
      case 'copilot':
        return generateCopilotInstructions(this.decisions, this.config);
      case 'agents':
        return generateAgentsMd(this.decisions, this.config);
      case 'windsurf':
        return generateWindsurfRules(this.decisions, this.config);
      case 'kiro':
        return generateKiroSteering(this.decisions, this.config);
      case 'custom':
        if (!this.customTemplate) {
          throw new Error(
            'Custom format requires a customTemplate option. ' +
              'Provide a CustomTemplateOptions object with at least a template string.'
          );
        }
        return generateCustom(this.decisions, this.config, this.customTemplate);
      default:
        throw new Error(`Unknown sync format: ${format}`);
    }
  }

  /**
   * Start watch mode: re-sync when source files change.
   * Uses chokidar with a 5-second debounce to avoid excessive regeneration.
   *
   * @param watchPaths - Glob patterns or file paths to watch for changes.
   *                     Defaults to the analysis include patterns.
   * @param onChange - Optional callback invoked after each sync with the results.
   */
  async startWatch(
    watchPaths?: string[],
    onChange?: (result: SyncResult) => void
  ): Promise<void> {
    // Dynamically import chokidar to keep it as a lazy dependency
    const { watch } = await import('chokidar');

    const paths = watchPaths ?? this.config.analysis.include.map(
      (p: string) => path.join(this.projectRoot, p)
    );

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const DEBOUNCE_MS = 5000;

    this.watcher = watch(paths, {
      ignored: this.config.analysis.exclude.map(
        (p: string) => path.join(this.projectRoot, p)
      ),
      persistent: true,
      ignoreInitial: true,
      cwd: this.projectRoot,
    });

    this.watcher.on('all', () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        void this.sync().then((result) => {
          if (onChange) {
            onChange(result);
          }
        });
      }, DEBOUNCE_MS);
    });
  }

  /**
   * Stop watch mode and close the file watcher.
   */
  async stopWatch(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Check if the engine is currently in watch mode.
   */
  isWatching(): boolean {
    return this.watcher !== null;
  }

  /**
   * Get the list of output paths that would be generated.
   */
  getOutputPaths(): Record<SyncFormat, string> {
    const outputDir = path.resolve(this.projectRoot, this.config.sync.outputDir);
    const result: Partial<Record<SyncFormat, string>> = {};

    for (const format of this.config.sync.formats) {
      result[format] = getOutputPath(format, outputDir);
    }

    return result as Record<SyncFormat, string>;
  }

  /**
   * Read an existing file, returning null if it doesn't exist.
   */
  private readExistingFile(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }
}
