/**
 * Git helper utilities using simple-git.
 * Provides diff, blame, log, and statistics for codebase analysis.
 */

import simpleGit, { type SimpleGit, type LogResult } from 'simple-git';

/** Create a git client for the given directory */
export function createGitClient(cwd: string): SimpleGit {
  return simpleGit(cwd);
}

/** Information about a git diff hunk */
export interface DiffHunk {
  filePath: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
  additions: number;
  deletions: number;
}

/** Parsed file diff */
export interface FileDiff {
  filePath: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

/** Get the diff between a ref and the working tree (or two refs) */
export async function getDiff(
  git: SimpleGit,
  ref?: string,
  ref2?: string
): Promise<FileDiff[]> {
  const args = ref2 ? [ref!, ref2] : ref ? [ref] : ['--staged'];
  const raw = await git.diff([...args, '--unified=3']);
  return parseDiff(raw);
}

/** Get the diff for a specific commit */
export async function getCommitDiff(
  git: SimpleGit,
  commitSha: string
): Promise<FileDiff[]> {
  const raw = await git.diff([`${commitSha}^`, commitSha, '--unified=3']);
  return parseDiff(raw);
}

/** Get git log for the repository */
export async function getLog(
  git: SimpleGit,
  options?: {
    maxCount?: number;
    since?: string;
    until?: string;
    author?: string;
    file?: string;
  }
): Promise<LogResult> {
  // simple-git's LogOptions supports maxCount and file natively, but
  // --since/--until/--author must be passed as custom string args.
  const customArgs: string[] = [];
  if (options?.since) customArgs.push(`--since=${options.since}`);
  if (options?.until) customArgs.push(`--until=${options.until}`);
  if (options?.author) customArgs.push(`--author=${options.author}`);

  const logOptions: any = {};
  if (options?.maxCount) logOptions.maxCount = options.maxCount;
  if (options?.file) logOptions.file = options.file;

  // When we have custom args, pass them as the first argument (string array)
  // and structured options as second. simple-git merges both.
  if (customArgs.length > 0) {
    return git.log([...customArgs] as any);
  }

  return git.log(logOptions);
}

/** Get the current HEAD commit SHA */
export async function getHeadSha(git: SimpleGit): Promise<string> {
  const result = await git.revparse(['HEAD']);
  return result.trim();
}

/** Get the current branch name */
export async function getCurrentBranch(git: SimpleGit): Promise<string> {
  const result = await git.revparse(['--abbrev-ref', 'HEAD']);
  return result.trim();
}

/** Get list of all tracked files */
export async function getTrackedFiles(git: SimpleGit): Promise<string[]> {
  const result = await git.raw(['ls-files']);
  return result
    .trim()
    .split('\n')
    .filter((f) => f.length > 0);
}

/** Get git blame for a file */
export async function getBlame(
  git: SimpleGit,
  filePath: string
): Promise<string> {
  return git.raw(['blame', '--porcelain', filePath]);
}

/** Git stats for a developer over a period */
export interface DevGitStats {
  author: string;
  email: string;
  commits: number;
  filesChanged: number;
  additions: number;
  deletions: number;
  firstCommit?: string;
  lastCommit?: string;
}

/** Get per-developer stats from git log */
export async function getDevStats(
  git: SimpleGit,
  since?: string,
  until?: string
): Promise<DevGitStats[]> {
  const logArgs: string[] = ['--format=%ae|%an|%H', '--numstat'];
  if (since) logArgs.push(`--since=${since}`);
  if (until) logArgs.push(`--until=${until}`);

  const raw = await git.raw(['log', ...logArgs]);
  const statsMap = new Map<string, DevGitStats>();

  let currentEmail = '';
  let currentName = '';

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;

    if (line.includes('|') && !line.startsWith('\t')) {
      const parts = line.split('|');
      if (parts.length >= 2) {
        currentEmail = parts[0].trim();
        currentName = parts[1].trim();

        if (!statsMap.has(currentEmail)) {
          statsMap.set(currentEmail, {
            author: currentName,
            email: currentEmail,
            commits: 0,
            filesChanged: 0,
            additions: 0,
            deletions: 0,
          });
        }

        const stats = statsMap.get(currentEmail)!;
        stats.commits++;
      }
    } else if (/^\d+\t\d+\t/.test(line)) {
      const [adds, dels] = line.split('\t');
      if (currentEmail && statsMap.has(currentEmail)) {
        const stats = statsMap.get(currentEmail)!;
        stats.additions += parseInt(adds, 10) || 0;
        stats.deletions += parseInt(dels, 10) || 0;
        stats.filesChanged++;
      }
    }
  }

  return Array.from(statsMap.values());
}

/** Check if a directory is a git repository */
export async function isGitRepo(dir: string): Promise<boolean> {
  const git = simpleGit(dir);
  try {
    await git.revparse(['--git-dir']);
    return true;
  } catch {
    return false;
  }
}

/** Parse a unified diff string into structured FileDiff objects */
function parseDiff(raw: string): FileDiff[] {
  const files: FileDiff[] = [];
  const fileSections = raw.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const lines = section.split('\n');
    const headerMatch = lines[0]?.match(/a\/(.+) b\/(.+)/);
    if (!headerMatch) continue;

    const oldPath = headerMatch[1];
    const newPath = headerMatch[2];

    let status: FileDiff['status'] = 'modified';
    if (section.includes('new file mode')) status = 'added';
    else if (section.includes('deleted file mode')) status = 'deleted';
    else if (oldPath !== newPath) status = 'renamed';

    const hunks: DiffHunk[] = [];
    const hunkRegex = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)$/gm;
    let match: RegExpExecArray | null;

    while ((match = hunkRegex.exec(section)) !== null) {
      const hunkStart = section.indexOf(match[0]);
      const nextHunk = section.indexOf('\n@@', hunkStart + 1);
      const nextDiff = section.indexOf('\ndiff --git', hunkStart + 1);

      let end = section.length;
      if (nextHunk > 0 && (nextDiff < 0 || nextHunk < nextDiff)) end = nextHunk;
      else if (nextDiff > 0) end = nextDiff;

      const content = section.slice(hunkStart + match[0].length + 1, end);
      const additionCount = (content.match(/^\+/gm) || []).length;
      const deletionCount = (content.match(/^-/gm) || []).length;

      hunks.push({
        filePath: newPath,
        oldStart: parseInt(match[1], 10),
        oldLines: parseInt(match[2] || '1', 10),
        newStart: parseInt(match[3], 10),
        newLines: parseInt(match[4] || '1', 10),
        content,
        additions: additionCount,
        deletions: deletionCount,
      });
    }

    const totalAdditions = hunks.reduce((sum, h) => sum + h.additions, 0);
    const totalDeletions = hunks.reduce((sum, h) => sum + h.deletions, 0);

    files.push({
      filePath: newPath,
      oldPath: status === 'renamed' ? oldPath : undefined,
      status,
      hunks,
      additions: totalAdditions,
      deletions: totalDeletions,
    });
  }

  return files;
}
