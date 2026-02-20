/**
 * Shared utility functions used across the SnoutGuard platform.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { nanoid } from 'nanoid';

/** Generate a unique ID */
export function generateId(): string {
  return nanoid();
}

/** Get the current ISO timestamp */
export function now(): string {
  return new Date().toISOString();
}

/** Compute SHA-256 hash of a string */
export function hash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** Compute content hash of a file */
export function fileHash(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  return hash(content);
}

/** Extension to language mapping */
const EXTENSION_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
};

/** Detect language from file extension */
export function detectLanguage(filePath: string): string | undefined {
  const ext = path.extname(filePath);
  return EXTENSION_MAP[ext];
}

/** Check if a file should be included based on include/exclude glob patterns */
export function shouldIncludeFile(
  filePath: string,
  include: string[],
  exclude: string[]
): boolean {
  const { minimatch } = requireMinimatch();
  const isIncluded =
    include.length === 0 || include.some((p) => minimatch(filePath, p));
  const isExcluded = exclude.some((p) => minimatch(filePath, p));
  return isIncluded && !isExcluded;
}

/** Lazy-load minimatch to avoid hard dependency */
function requireMinimatch(): { minimatch: (path: string, pattern: string) => boolean } {
  try {
    return require('minimatch');
  } catch {
    // Simple fallback glob matcher for basic patterns
    return {
      minimatch: (filePath: string, pattern: string) => {
        const regex = pattern
          .replace(/\*\*/g, '{{GLOBSTAR}}')
          .replace(/\*/g, '[^/]*')
          .replace(/\{\{GLOBSTAR\}\}/g, '.*')
          .replace(/\?/g, '.');
        return new RegExp(`^${regex}$`).test(filePath);
      },
    };
  }
}

/** Truncate a string to a max length with ellipsis */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/** Read a file safely, returning null if it doesn't exist */
export function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/** Parse JSON safely, returning default value on failure */
export function parseJsonSafe<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

/** Debounce a function */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Sleep for a given number of milliseconds */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get the root directory of the project (walks up to find .snoutguard.yml or .git).
 */
export function findProjectRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  while (dir !== path.dirname(dir)) {
    if (
      fs.existsSync(path.join(dir, '.snoutguard.yml')) ||
      fs.existsSync(path.join(dir, '.git'))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir;
}

/** Format a number as a percentage string */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
