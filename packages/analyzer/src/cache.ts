/**
 * Analysis cache management with file hashing and TTL.
 *
 * Caches analysis results to avoid redundant LLM calls when files haven't changed.
 * Uses SHA-256 hashing of file contents to detect changes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { ArchDecision, ParsedFile } from '@snoutguard/core';
import { getLogger } from '@snoutguard/core';

/** Cache entry structure */
export interface AnalysisCache {
  /** Combined hash of all file contents */
  filesHash: string;
  /** Individual file hashes for incremental analysis */
  fileHashes: Record<string, string>;
  /** Cached decisions */
  decisions: ArchDecision[];
  /** When this cache was created */
  createdAt: string;
  /** TTL in hours */
  ttlHours: number;
  /** Total files in the cache */
  totalFiles: number;
}

/**
 * Compute SHA-256 hash of a string.
 */
function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Hash all file contents and return combined hash + individual hashes.
 */
export function hashFiles(files: ParsedFile[]): {
  filesHash: string;
  fileHashes: Record<string, string>;
} {
  const fileHashes: Record<string, string> = {};
  const contents: string[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file.filePath, 'utf-8');
      const hash = hashContent(content);
      fileHashes[file.filePath] = hash;
      contents.push(hash);
    } catch (error) {
      // If we can't read a file, skip it
      const log = getLogger();
      log.warn('cache', `Could not read ${file.filePath} for hashing: ${error}`);
    }
  }

  // Combined hash is the hash of all individual hashes concatenated
  const filesHash = hashContent(contents.join(''));

  return { filesHash, fileHashes };
}

/**
 * Identify which files have changed between two hash sets.
 */
export function identifyChangedFiles(
  currentHashes: Record<string, string>,
  cachedHashes: Record<string, string>
): {
  added: string[];
  modified: string[];
  deleted: string[];
  unchanged: string[];
} {
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  const unchanged: string[] = [];

  // Check for added and modified files
  for (const [filePath, hash] of Object.entries(currentHashes)) {
    if (!(filePath in cachedHashes)) {
      added.push(filePath);
    } else if (cachedHashes[filePath] !== hash) {
      modified.push(filePath);
    } else {
      unchanged.push(filePath);
    }
  }

  // Check for deleted files
  for (const filePath of Object.keys(cachedHashes)) {
    if (!(filePath in currentHashes)) {
      deleted.push(filePath);
    }
  }

  return { added, modified, deleted, unchanged };
}

/**
 * Get the cache file path for a project.
 */
export function getCacheFilePath(projectDir: string): string {
  const snoutguardDir = path.join(projectDir, '.snoutguard');
  return path.join(snoutguardDir, 'cache.json');
}

/**
 * Load cached analysis if it exists and is valid.
 * Returns null if cache is missing, expired, or invalid.
 */
export function loadCache(projectDir: string, ttlHours: number): AnalysisCache | null {
  const cacheFile = getCacheFilePath(projectDir);
  const log = getLogger();

  if (!fs.existsSync(cacheFile)) {
    log.debug('cache', 'No cache file found');
    return null;
  }

  try {
    const raw = fs.readFileSync(cacheFile, 'utf-8');
    const cache = JSON.parse(raw) as AnalysisCache;

    // Validate cache structure
    if (!cache.filesHash || !cache.fileHashes || !cache.decisions || !cache.createdAt) {
      log.warn('cache', 'Cache file is malformed, ignoring');
      return null;
    }

    // Check TTL
    const createdAt = new Date(cache.createdAt);
    const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

    if (ageHours > ttlHours) {
      log.info('cache', `Cache expired (${ageHours.toFixed(1)}h old, TTL: ${ttlHours}h)`);
      return null;
    }

    log.info('cache', `Loaded valid cache (${ageHours.toFixed(1)}h old, ${cache.totalFiles} files)`);
    return cache;
  } catch (error) {
    log.warn('cache', `Failed to load cache: ${error}`);
    return null;
  }
}

/**
 * Save analysis results to cache.
 */
export function saveCache(
  projectDir: string,
  filesHash: string,
  fileHashes: Record<string, string>,
  decisions: ArchDecision[],
  ttlHours: number
): void {
  const cacheFile = getCacheFilePath(projectDir);
  const log = getLogger();

  // Ensure .snoutguard directory exists
  const snoutguardDir = path.dirname(cacheFile);
  if (!fs.existsSync(snoutguardDir)) {
    fs.mkdirSync(snoutguardDir, { recursive: true });
  }

  const cache: AnalysisCache = {
    filesHash,
    fileHashes,
    decisions,
    createdAt: new Date().toISOString(),
    ttlHours,
    totalFiles: Object.keys(fileHashes).length,
  };

  try {
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2), 'utf-8');
    log.info('cache', `Saved cache with ${decisions.length} decisions and ${cache.totalFiles} file hashes`);
  } catch (error) {
    log.warn('cache', `Failed to save cache: ${error}`);
  }
}

/**
 * Clear the analysis cache.
 */
export function clearCache(projectDir: string): void {
  const cacheFile = getCacheFilePath(projectDir);
  const log = getLogger();

  if (fs.existsSync(cacheFile)) {
    fs.unlinkSync(cacheFile);
    log.info('cache', 'Cache cleared');
  }
}

/**
 * Merge decisions from incremental analysis.
 * - Keep cached decisions that are still supported by unchanged files
 * - Add new decisions from the incremental analysis
 * - Remove decisions that were only supported by changed/deleted files
 */
export function mergeDecisions(
  cachedDecisions: ArchDecision[],
  newDecisions: ArchDecision[],
  changedFiles: string[],
  deletedFiles: string[]
): ArchDecision[] {
  const log = getLogger();
  const changedSet = new Set([...changedFiles, ...deletedFiles]);

  // Filter cached decisions: keep only those whose evidence doesn't overlap with changed files
  const validCachedDecisions = cachedDecisions.filter((decision) => {
    const evidenceFiles = decision.evidence.map((e) => e.filePath);
    const hasChangedEvidence = evidenceFiles.some((f) => changedSet.has(f));
    
    if (hasChangedEvidence) {
      log.debug('cache', `Removing cached decision "${decision.title}" - evidence files changed`);
      return false;
    }
    
    return true;
  });

  // Merge: cached decisions + new decisions
  // Deduplicate by title (new decisions win if there's a conflict)
  const decisionMap = new Map<string, ArchDecision>();

  for (const decision of validCachedDecisions) {
    const key = decision.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    decisionMap.set(key, decision);
  }

  for (const decision of newDecisions) {
    const key = decision.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    decisionMap.set(key, decision);
  }

  const merged = [...decisionMap.values()];
  log.info('cache', `Merged decisions: ${validCachedDecisions.length} cached + ${newDecisions.length} new = ${merged.length} total`);

  return merged;
}
