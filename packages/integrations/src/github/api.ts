/**
 * GitHub API client wrapper.
 * Provides typed functions for interacting with the GitHub REST API
 * via Octokit, including diff retrieval, review comments, check runs,
 * and file fetching.
 */

import { Octokit } from '@octokit/rest';

// ─── Types ────────────────────────────────────────────────────────

/** Options for creating a GitHub API client */
export interface GitHubClientOptions {
  /** Personal access token or GitHub App installation token */
  token: string;
  /** Optional base URL for GitHub Enterprise */
  baseUrl?: string;
}

/** Repository owner and name pair */
export interface RepoRef {
  owner: string;
  repo: string;
}

/** Pull request reference */
export interface PRRef extends RepoRef {
  pullNumber: number;
}

/** A parsed file from a GitHub diff */
export interface GitHubFileDiff {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previousFilename?: string;
}

/** Comment position for inline review comments */
export interface InlineCommentPosition {
  path: string;
  line: number;
  side?: 'LEFT' | 'RIGHT';
  startLine?: number;
  startSide?: 'LEFT' | 'RIGHT';
}

/** A review comment to post */
export interface ReviewComment extends InlineCommentPosition {
  body: string;
}

/** Check run conclusion */
export type CheckConclusion =
  | 'success'
  | 'failure'
  | 'neutral'
  | 'cancelled'
  | 'skipped'
  | 'timed_out'
  | 'action_required';

/** Options for creating a check run */
export interface CheckRunOptions {
  name: string;
  headSha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: CheckConclusion;
  title: string;
  summary: string;
  text?: string;
  annotations?: CheckAnnotation[];
}

/** A check run annotation */
export interface CheckAnnotation {
  path: string;
  startLine: number;
  endLine: number;
  annotationLevel: 'notice' | 'warning' | 'failure';
  message: string;
  title?: string;
  rawDetails?: string;
}

/** Pull request data returned from the API */
export interface GitHubPR {
  number: number;
  title: string;
  body: string | null;
  state: string;
  headRef: string;
  headSha: string;
  baseRef: string;
  baseSha: string;
  author: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Client ──────────────────────────────────────────────────────

/** Create a configured Octokit instance */
export function createGitHubClient(options: GitHubClientOptions): Octokit {
  return new Octokit({
    auth: options.token,
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
  });
}

// ─── API Functions ───────────────────────────────────────────────

/**
 * Get the diff (list of changed files with patches) for a pull request.
 * Returns structured file diff information.
 */
export async function getDiff(
  octokit: Octokit,
  ref: PRRef
): Promise<GitHubFileDiff[]> {
  try {
    const { data } = await octokit.pulls.listFiles({
      owner: ref.owner,
      repo: ref.repo,
      pull_number: ref.pullNumber,
      per_page: 300,
    });

    return data.map((file) => ({
      filename: file.filename,
      status: file.status as GitHubFileDiff['status'],
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch,
      previousFilename: file.previous_filename,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get PR diff for ${ref.owner}/${ref.repo}#${ref.pullNumber}: ${message}`);
  }
}

/**
 * Create a general comment on a pull request (not inline).
 */
export async function createComment(
  octokit: Octokit,
  ref: PRRef,
  body: string
): Promise<number> {
  try {
    const { data } = await octokit.issues.createComment({
      owner: ref.owner,
      repo: ref.repo,
      issue_number: ref.pullNumber,
      body,
    });
    return data.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create comment on ${ref.owner}/${ref.repo}#${ref.pullNumber}: ${message}`);
  }
}

/**
 * Create a pull request review with inline comments.
 * Posts a review with the given event type (APPROVE, REQUEST_CHANGES, COMMENT)
 * and optional inline comments on specific lines.
 */
export async function createReview(
  octokit: Octokit,
  ref: PRRef,
  options: {
    body: string;
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    comments?: ReviewComment[];
    commitId?: string;
  }
): Promise<number> {
  try {
    const reviewComments = options.comments?.map((c) => ({
      path: c.path,
      line: c.line,
      side: c.side ?? ('RIGHT' as const),
      start_line: c.startLine,
      start_side: c.startSide,
      body: c.body,
    }));

    const { data } = await octokit.pulls.createReview({
      owner: ref.owner,
      repo: ref.repo,
      pull_number: ref.pullNumber,
      body: options.body,
      event: options.event,
      commit_id: options.commitId,
      comments: reviewComments,
    });

    return data.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create review on ${ref.owner}/${ref.repo}#${ref.pullNumber}: ${message}`);
  }
}

/**
 * Create a check run on a commit.
 * Used to report architectural review pass/fail status with annotations.
 * Annotations are batched in groups of 50 per API limits.
 */
export async function createCheckRun(
  octokit: Octokit,
  repoRef: RepoRef,
  options: CheckRunOptions
): Promise<number> {
  try {
    // GitHub API limits annotations to 50 per request.
    // If we have more, we create the check run first, then update with batches.
    const MAX_ANNOTATIONS = 50;
    const annotations = options.annotations ?? [];
    const firstBatch = annotations.slice(0, MAX_ANNOTATIONS);
    const remainingBatches: CheckAnnotation[][] = [];

    for (let i = MAX_ANNOTATIONS; i < annotations.length; i += MAX_ANNOTATIONS) {
      remainingBatches.push(annotations.slice(i, i + MAX_ANNOTATIONS));
    }

    const { data } = await octokit.checks.create({
      owner: repoRef.owner,
      repo: repoRef.repo,
      name: options.name,
      head_sha: options.headSha,
      status: options.status,
      conclusion: options.conclusion,
      output: {
        title: options.title,
        summary: options.summary,
        text: options.text,
        annotations: firstBatch.map(mapAnnotation),
      },
    });

    // Post remaining annotation batches via update
    for (const batch of remainingBatches) {
      await octokit.checks.update({
        owner: repoRef.owner,
        repo: repoRef.repo,
        check_run_id: data.id,
        output: {
          title: options.title,
          summary: options.summary,
          annotations: batch.map(mapAnnotation),
        },
      });
    }

    return data.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create check run on ${repoRef.owner}/${repoRef.repo}: ${message}`);
  }
}

/**
 * Get a file's contents from a repository at a specific ref.
 * Returns the decoded UTF-8 content as a string.
 */
export async function getFile(
  octokit: Octokit,
  repoRef: RepoRef,
  path: string,
  ref?: string
): Promise<string | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner: repoRef.owner,
      repo: repoRef.repo,
      path,
      ref,
    });

    // getContent returns an object with a content field (base64-encoded) for files
    if ('content' in data && typeof data.content === 'string') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }

    return null;
  } catch (error) {
    // 404 means file not found, which is not an error condition
    if (isOctokitError(error) && error.status === 404) {
      return null;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get file ${path} from ${repoRef.owner}/${repoRef.repo}: ${message}`);
  }
}

/**
 * Get pull request details.
 */
export async function getPR(
  octokit: Octokit,
  ref: PRRef
): Promise<GitHubPR> {
  try {
    const { data } = await octokit.pulls.get({
      owner: ref.owner,
      repo: ref.repo,
      pull_number: ref.pullNumber,
    });

    return {
      number: data.number,
      title: data.title,
      body: data.body,
      state: data.state,
      headRef: data.head.ref,
      headSha: data.head.sha,
      baseRef: data.base.ref,
      baseSha: data.base.sha,
      author: data.user?.login ?? 'unknown',
      url: data.html_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get PR ${ref.owner}/${ref.repo}#${ref.pullNumber}: ${message}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Map our CheckAnnotation to the GitHub API format */
function mapAnnotation(annotation: CheckAnnotation) {
  return {
    path: annotation.path,
    start_line: annotation.startLine,
    end_line: annotation.endLine,
    annotation_level: annotation.annotationLevel,
    message: annotation.message,
    title: annotation.title,
    raw_details: annotation.rawDetails,
  };
}

/** Type guard for Octokit errors with a status property */
function isOctokitError(error: unknown): error is Error & { status: number } {
  return error instanceof Error && 'status' in error && typeof (error as Record<string, unknown>).status === 'number';
}
