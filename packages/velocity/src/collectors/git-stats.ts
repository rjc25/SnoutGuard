/**
 * Git statistics collector.
 * Collects per-developer git metrics for a given time window using
 * getDevStats and getLog from @archguard/core.
 */

import type { SimpleGit, DefaultLogFields, ListLogLine } from 'simple-git';
import { getDevStats, getLog } from '@archguard/core';
import type { GitMetrics } from '../types.js';

/**
 * Collect git-level metrics per developer for a given time window.
 *
 * Gathers commit counts, files changed, lines added/removed, and
 * file types touched by parsing git log data.
 *
 * @param git - simple-git client for the repository
 * @param periodStart - ISO date string for the start of the period
 * @param periodEnd - ISO date string for the end of the period
 * @returns Array of GitMetrics, one per developer active in the period
 */
export async function collectGitStats(
  git: SimpleGit,
  periodStart: string,
  periodEnd: string
): Promise<GitMetrics[]> {
  // Fetch per-developer aggregated stats from core
  const devStats = await getDevStats(git, periodStart, periodEnd);

  // Fetch detailed log entries to determine file types touched per developer
  const logResult = await getLog(git, {
    since: periodStart,
    until: periodEnd,
  });

  // Build a map of developer email -> file extensions touched with counts
  const fileTypeMap = new Map<string, Record<string, number>>();

  if (logResult && logResult.all) {
    for (const entry of logResult.all) {
      const email = extractEmail(entry);
      if (!email) continue;

      if (!fileTypeMap.has(email)) {
        fileTypeMap.set(email, {});
      }

      const extensions = fileTypeMap.get(email)!;
      // The diff_summary or body may contain file paths — parse from hash
      // Since simple-git log entries include diff info, we extract file types
      // from the commit diff stats. For a more detailed breakdown we use
      // the numstat-based approach via getDevStats.
      const files = extractFilesFromLogEntry(entry);
      for (const filePath of files) {
        const ext = getFileExtension(filePath);
        if (ext) {
          extensions[ext] = (extensions[ext] || 0) + 1;
        }
      }
    }
  }

  // Map developer stats to GitMetrics
  return devStats.map((stats) => ({
    developerId: stats.email,
    commits: stats.commits,
    filesChanged: stats.filesChanged,
    linesAdded: stats.additions,
    linesRemoved: stats.deletions,
    fileTypesTouched: fileTypeMap.get(stats.email) ?? {},
    periodStart,
    periodEnd,
  }));
}

/**
 * Collect git stats for a specific developer.
 *
 * @param git - simple-git client
 * @param authorEmail - git author email to filter by
 * @param periodStart - ISO date string start
 * @param periodEnd - ISO date string end
 * @returns GitMetrics for the specified developer, or null if no activity
 */
export async function collectGitStatsForDeveloper(
  git: SimpleGit,
  authorEmail: string,
  periodStart: string,
  periodEnd: string
): Promise<GitMetrics | null> {
  const allStats = await collectGitStats(git, periodStart, periodEnd);
  return allStats.find((s) => s.developerId === authorEmail) ?? null;
}

/**
 * Calculate the total lines of code changed (added + removed) from git metrics.
 */
export function totalLinesChanged(metrics: GitMetrics): number {
  return metrics.linesAdded + metrics.linesRemoved;
}

/**
 * Get the dominant file type for a developer's contributions.
 * Returns the extension with the highest touch count, or undefined if none.
 */
export function getDominantFileType(metrics: GitMetrics): string | undefined {
  const entries = Object.entries(metrics.fileTypesTouched);
  if (entries.length === 0) return undefined;

  let maxExt = entries[0][0];
  let maxCount = entries[0][1];

  for (const [ext, count] of entries) {
    if (count > maxCount) {
      maxExt = ext;
      maxCount = count;
    }
  }

  return maxExt;
}

// ─── Internal Helpers ───────────────────────────────────────────────

/**
 * Extract email from a log entry. simple-git LogResult entries have
 * author_email or email fields depending on version.
 */
function extractEmail(entry: DefaultLogFields & ListLogLine): string {
  return entry.author_email ?? '';
}

/**
 * Extract file paths mentioned in a log entry.
 * simple-git's log entries have a `diff` property with changed files,
 * but this depends on log options. We parse from the body/diff when available.
 */
function extractFilesFromLogEntry(
  entry: DefaultLogFields & ListLogLine
): string[] {
  const files: string[] = [];

  // simple-git log entries may have a diff property with file info
  if (entry.diff) {
    const diff = entry.diff as { files?: Array<{ file: string }> };
    if (diff.files) {
      for (const f of diff.files) {
        if (f.file) files.push(f.file);
      }
    }
  }

  // Also try parsing body for file paths (numstat format)
  if (entry.body) {
    const lines = entry.body.split('\n');
    for (const line of lines) {
      const match = line.match(/^\d+\t\d+\t(.+)$/);
      if (match && match[1]) {
        files.push(match[1]);
      }
    }
  }

  return files;
}

/**
 * Extract file extension from a path, returning it with the dot prefix.
 * Returns empty string for files without extensions.
 */
function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));

  if (lastDot <= 0 || lastDot < lastSlash) return '';
  return filePath.slice(lastDot);
}
