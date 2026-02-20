/**
 * Parse and analyze git diffs for architectural review.
 * Uses getDiff from @snoutguard/core to retrieve FileDiff[] objects,
 * then categorizes and enriches them with context for downstream
 * rule matching and LLM review.
 */

import {
  createGitClient,
  getDiff,
  type FileDiff,
  type DiffHunk,
} from '@snoutguard/core';

// ─── Types ────────────────────────────────────────────────────────

/** Categorized change groups from a diff */
export interface CategorizedChanges {
  /** Newly added files */
  newFiles: FileDiff[];
  /** Modified existing files */
  modifications: FileDiff[];
  /** Deleted files */
  deletions: FileDiff[];
  /** Renamed files */
  renames: FileDiff[];
}

/** A single changed region with surrounding context */
export interface ChangeContext {
  /** The file this change belongs to */
  filePath: string;
  /** The status of the file (added, modified, deleted, renamed) */
  status: FileDiff['status'];
  /** The hunk containing the change */
  hunk: DiffHunk;
  /** Lines added in this hunk (without the '+' prefix) */
  addedLines: string[];
  /** Lines removed in this hunk (without the '-' prefix) */
  removedLines: string[];
  /** Unchanged context lines surrounding the change */
  contextLines: string[];
  /** Import statements found in added lines */
  newImports: string[];
  /** The start line in the new file */
  lineStart: number;
  /** The end line in the new file */
  lineEnd: number;
}

/** Summary statistics for a diff */
export interface DiffSummary {
  /** Total number of files changed */
  totalFiles: number;
  /** Total lines added across all files */
  totalAdditions: number;
  /** Total lines deleted across all files */
  totalDeletions: number;
  /** Number of new files */
  newFileCount: number;
  /** Number of modified files */
  modifiedCount: number;
  /** Number of deleted files */
  deletedCount: number;
  /** Number of renamed files */
  renamedCount: number;
  /** File extensions touched in this diff */
  fileExtensions: string[];
  /** Directories touched in this diff */
  touchedDirectories: string[];
}

/** Full analysis result from analyzing a diff */
export interface DiffAnalysis {
  /** The raw file diffs from git */
  fileDiffs: FileDiff[];
  /** Changes categorized by type */
  categorized: CategorizedChanges;
  /** Enriched change contexts for each hunk */
  changeContexts: ChangeContext[];
  /** Summary statistics */
  summary: DiffSummary;
}

// ─── Core Functions ───────────────────────────────────────────────

/**
 * Analyze a git diff for the given project directory.
 * Fetches the diff using the provided ref (e.g., "HEAD~1", a branch, or commit SHA),
 * then categorizes changes and extracts relevant code context.
 */
export async function analyzeDiff(
  projectDir: string,
  ref: string
): Promise<DiffAnalysis> {
  const git = createGitClient(projectDir);
  const fileDiffs = await getDiff(git, ref);

  const categorized = categorizeChanges(fileDiffs);
  const changeContexts = extractChangeContexts(fileDiffs);
  const summary = buildDiffSummary(fileDiffs, categorized);

  return {
    fileDiffs,
    categorized,
    changeContexts,
    summary,
  };
}

/**
 * Categorize file diffs by their change type.
 */
export function categorizeChanges(fileDiffs: FileDiff[]): CategorizedChanges {
  const newFiles: FileDiff[] = [];
  const modifications: FileDiff[] = [];
  const deletions: FileDiff[] = [];
  const renames: FileDiff[] = [];

  for (const diff of fileDiffs) {
    switch (diff.status) {
      case 'added':
        newFiles.push(diff);
        break;
      case 'modified':
        modifications.push(diff);
        break;
      case 'deleted':
        deletions.push(diff);
        break;
      case 'renamed':
        renames.push(diff);
        break;
    }
  }

  return { newFiles, modifications, deletions, renames };
}

/**
 * Extract enriched change contexts from each hunk in the diff.
 * Each context includes the added/removed lines, surrounding context,
 * and any import statements found in added lines.
 */
export function extractChangeContexts(fileDiffs: FileDiff[]): ChangeContext[] {
  const contexts: ChangeContext[] = [];

  for (const diff of fileDiffs) {
    for (const hunk of diff.hunks) {
      const lines = hunk.content.split('\n');
      const addedLines: string[] = [];
      const removedLines: string[] = [];
      const contextLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith('+')) {
          addedLines.push(line.slice(1));
        } else if (line.startsWith('-')) {
          removedLines.push(line.slice(1));
        } else if (line.startsWith(' ')) {
          contextLines.push(line.slice(1));
        }
      }

      // Extract import statements from newly added lines
      const newImports = addedLines.filter((line) => isImportStatement(line));

      contexts.push({
        filePath: diff.filePath,
        status: diff.status,
        hunk,
        addedLines,
        removedLines,
        contextLines,
        newImports,
        lineStart: hunk.newStart,
        lineEnd: hunk.newStart + hunk.newLines - 1,
      });
    }
  }

  return contexts;
}

/**
 * Build summary statistics for a set of file diffs.
 */
export function buildDiffSummary(
  fileDiffs: FileDiff[],
  categorized: CategorizedChanges
): DiffSummary {
  const totalAdditions = fileDiffs.reduce((sum, d) => sum + d.additions, 0);
  const totalDeletions = fileDiffs.reduce((sum, d) => sum + d.deletions, 0);

  const extensionSet = new Set<string>();
  const directorySet = new Set<string>();

  for (const diff of fileDiffs) {
    const ext = getFileExtension(diff.filePath);
    if (ext) extensionSet.add(ext);

    const dir = getParentDirectory(diff.filePath);
    if (dir) directorySet.add(dir);
  }

  return {
    totalFiles: fileDiffs.length,
    totalAdditions,
    totalDeletions,
    newFileCount: categorized.newFiles.length,
    modifiedCount: categorized.modifications.length,
    deletedCount: categorized.deletions.length,
    renamedCount: categorized.renames.length,
    fileExtensions: Array.from(extensionSet).sort(),
    touchedDirectories: Array.from(directorySet).sort(),
  };
}

/**
 * Get all unique file paths from a set of change contexts.
 */
export function getAffectedFiles(contexts: ChangeContext[]): string[] {
  const files = new Set<string>();
  for (const ctx of contexts) {
    files.add(ctx.filePath);
  }
  return Array.from(files).sort();
}

/**
 * Get change contexts for a specific file.
 */
export function getContextsForFile(
  contexts: ChangeContext[],
  filePath: string
): ChangeContext[] {
  return contexts.filter((ctx) => ctx.filePath === filePath);
}

/**
 * Get all new imports across all change contexts.
 */
export function getAllNewImports(contexts: ChangeContext[]): string[] {
  const imports: string[] = [];
  for (const ctx of contexts) {
    imports.push(...ctx.newImports);
  }
  return imports;
}

// ─── Helpers ──────────────────────────────────────────────────────

/** Check if a line is an import/require statement */
function isImportStatement(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('import ') ||
    trimmed.startsWith('import{') ||
    trimmed.startsWith('from ') ||
    trimmed.includes('require(') ||
    trimmed.startsWith('export * from') ||
    trimmed.startsWith('export { ') ||
    // Python imports
    trimmed.startsWith('from ') ||
    // Go imports
    trimmed.startsWith('import (') ||
    // Java imports
    (trimmed.startsWith('import ') && trimmed.endsWith(';'))
  );
}

/** Extract file extension from a path */
function getFileExtension(filePath: string): string | null {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filePath.length - 1) return null;
  return filePath.slice(lastDot);
}

/** Extract parent directory from a path */
function getParentDirectory(filePath: string): string | null {
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash === -1) return null;
  return filePath.slice(0, lastSlash);
}
