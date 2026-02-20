/**
 * Data collector for work summaries.
 * Gathers commits, PR data, velocity metrics, and file/module information
 * for a given developer and time period.
 */

import {
  createGitClient,
  getLog,
  getDevStats,
  type DevGitStats,
  type VelocityScore,
  type Blocker,
  type SummaryDataPoints,
} from '@archguard/core';

/** Git client type inferred from the core createGitClient factory */
type GitClient = ReturnType<typeof createGitClient>;

// ─── Interfaces ───────────────────────────────────────────────────

/** A single commit with metadata */
export interface CommitInfo {
  sha: string;
  message: string;
  date: string;
  filesChanged: number;
  additions: number;
  deletions: number;
}

/** Pull request data provided externally */
export interface PullRequestInfo {
  number: number;
  title: string;
  url: string;
  status: 'open' | 'merged' | 'closed';
  createdAt: string;
  mergedAt?: string;
  reviewers: string[];
  additions: number;
  deletions: number;
  filesChanged: number;
}

/** Module/directory grouping of changed files */
export interface ModuleActivity {
  module: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  commits: number;
}

/** Velocity metrics for the period */
export interface PeriodVelocity {
  score: VelocityScore | null;
  commitCount: number;
  linesAdded: number;
  linesRemoved: number;
  prsOpened: number;
  prsMerged: number;
  reviewsGiven: number;
  blockers: Blocker[];
}

/** All collected data for summary generation */
export interface CollectedData {
  developer: string;
  periodStart: string;
  periodEnd: string;
  commits: CommitInfo[];
  pullRequests: PullRequestInfo[];
  velocity: PeriodVelocity;
  filesChanged: string[];
  modules: ModuleActivity[];
  gitStats: DevGitStats | null;
  dataPoints: SummaryDataPoints;
}

/** Options for the data collection process */
export interface CollectorOptions {
  repoPath: string;
  developer: string;
  periodStart: string;
  periodEnd: string;
  pullRequests?: PullRequestInfo[];
  velocityScore?: VelocityScore | null;
  reviewsGiven?: number;
}

// ─── Collection Logic ─────────────────────────────────────────────

/**
 * Collect all relevant data for a developer within a time period.
 * Gathers git commits, maps them to modules, and assembles velocity metrics.
 */
export async function collectData(options: CollectorOptions): Promise<CollectedData> {
  const {
    repoPath,
    developer,
    periodStart,
    periodEnd,
    pullRequests = [],
    velocityScore = null,
    reviewsGiven = 0,
  } = options;

  const git = createGitClient(repoPath);

  // Gather commits from git log
  const commits = await collectCommits(git, developer, periodStart, periodEnd);

  // Gather per-developer stats
  const devStatsArray = await getDevStats(git, periodStart, periodEnd);
  const gitStats = devStatsArray.find(
    (s: { author: string; email: string }) => s.author.toLowerCase() === developer.toLowerCase()
      || s.email.toLowerCase() === developer.toLowerCase()
  ) ?? null;

  // Collect all changed files across commits
  const filesChanged = extractChangedFiles(commits, git, periodStart, periodEnd, developer);
  const allFiles = await filesChanged;

  // Group files into modules
  const modules = groupByModule(allFiles);

  // Assemble velocity metrics
  const prsOpened = pullRequests.filter(
    (pr) => pr.createdAt >= periodStart && pr.createdAt <= periodEnd
  ).length;
  const prsMerged = pullRequests.filter(
    (pr) => pr.status === 'merged' && pr.mergedAt && pr.mergedAt >= periodStart && pr.mergedAt <= periodEnd
  ).length;

  const velocity: PeriodVelocity = {
    score: velocityScore,
    commitCount: commits.length,
    linesAdded: gitStats?.additions ?? 0,
    linesRemoved: gitStats?.deletions ?? 0,
    prsOpened,
    prsMerged,
    reviewsGiven,
    blockers: velocityScore?.blockers ?? [],
  };

  // Build summary data points
  const violationsIntroduced = 0;
  const violationsResolved = 0;
  const keyPrs = pullRequests
    .filter((pr) => pr.status === 'merged')
    .slice(0, 5)
    .map((pr) => `#${pr.number}: ${pr.title}`);

  const dataPoints: SummaryDataPoints = {
    commits: commits.length,
    prsOpened,
    prsMerged,
    reviewsGiven,
    violationsIntroduced,
    violationsResolved,
    filesChanged: allFiles.length,
    keyPrs,
  };

  return {
    developer,
    periodStart,
    periodEnd,
    commits,
    pullRequests,
    velocity,
    filesChanged: allFiles,
    modules,
    gitStats,
    dataPoints,
  };
}

/**
 * Gather commits for a developer within a time period using git log.
 */
async function collectCommits(
  git: GitClient,
  developer: string,
  since: string,
  until: string
): Promise<CommitInfo[]> {
  try {
    const log = await getLog(git, {
      since,
      until,
      author: developer,
    });

    return log.all.map((entry: { hash: string; message: string; date: string }) => ({
      sha: entry.hash,
      message: entry.message,
      date: entry.date,
      filesChanged: 0, // Populated separately if needed
      additions: 0,
      deletions: 0,
    }));
  } catch {
    // Repository may not have commits in range
    return [];
  }
}

/**
 * Extract all unique file paths that were changed across commits.
 * Uses git diff --name-only for the period range.
 */
async function extractChangedFiles(
  _commits: CommitInfo[],
  git: GitClient,
  since: string,
  until: string,
  developer: string
): Promise<string[]> {
  try {
    const raw = await git.raw([
      'log',
      `--since=${since}`,
      `--until=${until}`,
      `--author=${developer}`,
      '--name-only',
      '--pretty=format:',
    ]);

    const rawStr = String(raw);
    const files: string[] = rawStr
      .split('\n')
      .map((f: string) => f.trim())
      .filter((f: string) => f.length > 0);

    // Return unique file paths
    return [...new Set(files)];
  } catch {
    return [];
  }
}

/**
 * Group changed files by top-level module/directory.
 * For example, "src/api/routes.ts" maps to module "src/api".
 */
function groupByModule(files: string[]): ModuleActivity[] {
  const moduleMap = new Map<string, { files: Set<string>; count: number }>();

  for (const file of files) {
    const parts = file.split('/');
    // Use first two path segments as the module, or the directory if only one level
    const module = parts.length >= 2
      ? `${parts[0]}/${parts[1]}`
      : parts[0];

    if (!moduleMap.has(module)) {
      moduleMap.set(module, { files: new Set(), count: 0 });
    }

    const entry = moduleMap.get(module)!;
    entry.files.add(file);
    entry.count++;
  }

  return Array.from(moduleMap.entries()).map(([module, data]) => ({
    module,
    filesChanged: data.files.size,
    additions: 0,
    deletions: 0,
    commits: data.count,
  }));
}
