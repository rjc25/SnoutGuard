/**
 * Bitbucket REST API 2.0 client.
 * Provides typed functions for interacting with the Bitbucket Cloud API
 * including diff retrieval, PR comments, build statuses, and file fetching.
 * Uses the standard fetch API with Bearer token authentication.
 */

// ─── Types ────────────────────────────────────────────────────────

/** Options for creating a Bitbucket API client */
export interface BitbucketClientOptions {
  /** OAuth access token or App password */
  token: string;
  /** Bitbucket workspace slug */
  workspace: string;
  /** Optional base URL for Bitbucket Server (default: Bitbucket Cloud) */
  baseUrl?: string;
}

/** Bitbucket API client instance */
export interface BitbucketClient {
  token: string;
  workspace: string;
  baseUrl: string;
}

/** Repository reference */
export interface BitbucketRepoRef {
  workspace: string;
  repoSlug: string;
}

/** Pull request reference */
export interface BitbucketPRRef extends BitbucketRepoRef {
  prId: number;
}

/** A file from a Bitbucket diff */
export interface BitbucketFileDiff {
  old: { path: string } | null;
  new: { path: string } | null;
  status: 'added' | 'removed' | 'modified' | 'renamed';
  linesAdded: number;
  linesRemoved: number;
  patch?: string;
}

/** An inline comment position */
export interface BitbucketInlinePosition {
  path: string;
  line: number;
  /** 'new' for right side (new file), 'old' for left side (old file) */
  side: 'new' | 'old';
}

/** A comment to create on a PR */
export interface BitbucketComment {
  content: string;
  inline?: BitbucketInlinePosition;
  parentId?: number;
}

/** Build status state */
export type BitbucketBuildState = 'SUCCESSFUL' | 'FAILED' | 'INPROGRESS' | 'STOPPED';

/** Options for creating a build status */
export interface BuildStatusOptions {
  state: BitbucketBuildState;
  key: string;
  name: string;
  description: string;
  url: string;
}

/** Pull request data from the API */
export interface BitbucketPR {
  id: number;
  title: string;
  description: string;
  state: string;
  source: {
    branch: string;
    commitHash: string;
    repoSlug: string;
  };
  destination: {
    branch: string;
    commitHash: string;
    repoSlug: string;
  };
  author: string;
  url: string;
  createdOn: string;
  updatedOn: string;
}

/** Paginated API response */
interface PaginatedResponse<T> {
  values: T[];
  page: number;
  size: number;
  next?: string;
}

// ─── Client ──────────────────────────────────────────────────────

/** Default Bitbucket Cloud API base URL */
const BITBUCKET_CLOUD_BASE = 'https://api.bitbucket.org/2.0';

/**
 * Create a Bitbucket API client.
 */
export function createBitbucketClient(options: BitbucketClientOptions): BitbucketClient {
  return {
    token: options.token,
    workspace: options.workspace,
    baseUrl: options.baseUrl ?? BITBUCKET_CLOUD_BASE,
  };
}

// ─── API Functions ───────────────────────────────────────────────

/**
 * Get the diff (list of changed files) for a pull request.
 */
export async function getDiff(
  client: BitbucketClient,
  ref: BitbucketPRRef
): Promise<BitbucketFileDiff[]> {
  try {
    const url = `${client.baseUrl}/repositories/${ref.workspace}/${ref.repoSlug}/pullrequests/${ref.prId}/diffstat`;
    const response = await fetchAllPages<RawDiffStatEntry>(client, url);

    return response.map((entry) => ({
      old: entry.old ? { path: entry.old.path } : null,
      new: entry.new ? { path: entry.new.path } : null,
      status: mapDiffStatus(entry.status),
      linesAdded: entry.lines_added ?? 0,
      linesRemoved: entry.lines_removed ?? 0,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to get PR diff for ${ref.workspace}/${ref.repoSlug}#${ref.prId}: ${message}`
    );
  }
}

/**
 * Get the raw diff patch for a pull request.
 */
export async function getRawDiff(
  client: BitbucketClient,
  ref: BitbucketPRRef
): Promise<string> {
  try {
    const url = `${client.baseUrl}/repositories/${ref.workspace}/${ref.repoSlug}/pullrequests/${ref.prId}/diff`;
    const response = await fetchRaw(client, url);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to get raw diff for ${ref.workspace}/${ref.repoSlug}#${ref.prId}: ${message}`
    );
  }
}

/**
 * Create a comment on a pull request.
 * Supports both general comments and inline comments on specific lines.
 */
export async function createComment(
  client: BitbucketClient,
  ref: BitbucketPRRef,
  comment: BitbucketComment
): Promise<number> {
  try {
    const url = `${client.baseUrl}/repositories/${ref.workspace}/${ref.repoSlug}/pullrequests/${ref.prId}/comments`;

    const body: Record<string, unknown> = {
      content: {
        raw: comment.content,
      },
    };

    if (comment.inline) {
      body.inline = {
        path: comment.inline.path,
        to: comment.inline.side === 'new' ? comment.inline.line : undefined,
        from: comment.inline.side === 'old' ? comment.inline.line : undefined,
      };
    }

    if (comment.parentId) {
      body.parent = { id: comment.parentId };
    }

    const response = await fetchJson<{ id: number }>(client, url, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return response.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to create comment on ${ref.workspace}/${ref.repoSlug}#${ref.prId}: ${message}`
    );
  }
}

/**
 * Create a build status on a specific commit.
 * This appears in the Bitbucket UI as a build check.
 */
export async function createBuildStatus(
  client: BitbucketClient,
  repoRef: BitbucketRepoRef,
  commitHash: string,
  options: BuildStatusOptions
): Promise<void> {
  try {
    const url = `${client.baseUrl}/repositories/${repoRef.workspace}/${repoRef.repoSlug}/commit/${commitHash}/statuses/build`;

    await fetchJson(client, url, {
      method: 'POST',
      body: JSON.stringify({
        state: options.state,
        key: options.key,
        name: options.name,
        description: options.description,
        url: options.url,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to create build status on ${repoRef.workspace}/${repoRef.repoSlug}@${commitHash}: ${message}`
    );
  }
}

/**
 * Get a file's contents from a repository at a specific ref.
 * Returns the file content as a string, or null if not found.
 */
export async function getFile(
  client: BitbucketClient,
  repoRef: BitbucketRepoRef,
  path: string,
  ref?: string
): Promise<string | null> {
  try {
    const refParam = ref ? `?at=${encodeURIComponent(ref)}` : '';
    const url = `${client.baseUrl}/repositories/${repoRef.workspace}/${repoRef.repoSlug}/src/${ref ?? 'HEAD'}/${encodeURIComponent(path)}${refParam ? '' : ''}`;

    const response = await fetchRaw(client, url);
    return response;
  } catch (error) {
    if (isBitbucketNotFound(error)) {
      return null;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to get file ${path} from ${repoRef.workspace}/${repoRef.repoSlug}: ${message}`
    );
  }
}

/**
 * Get pull request details.
 */
export async function getPR(
  client: BitbucketClient,
  ref: BitbucketPRRef
): Promise<BitbucketPR> {
  try {
    const url = `${client.baseUrl}/repositories/${ref.workspace}/${ref.repoSlug}/pullrequests/${ref.prId}`;
    const data = await fetchJson<RawPR>(client, url);

    return {
      id: data.id,
      title: data.title,
      description: data.description ?? '',
      state: data.state,
      source: {
        branch: data.source?.branch?.name ?? '',
        commitHash: data.source?.commit?.hash ?? '',
        repoSlug: data.source?.repository?.slug ?? ref.repoSlug,
      },
      destination: {
        branch: data.destination?.branch?.name ?? '',
        commitHash: data.destination?.commit?.hash ?? '',
        repoSlug: data.destination?.repository?.slug ?? ref.repoSlug,
      },
      author: data.author?.display_name ?? data.author?.nickname ?? 'unknown',
      url: data.links?.html?.href ?? '',
      createdOn: data.created_on ?? '',
      updatedOn: data.updated_on ?? '',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to get PR ${ref.workspace}/${ref.repoSlug}#${ref.prId}: ${message}`
    );
  }
}

// ─── HTTP Helpers ────────────────────────────────────────────────

/** Make an authenticated JSON request */
async function fetchJson<T>(
  client: BitbucketClient,
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${client.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new BitbucketApiError(response.status, body, url);
  }

  return response.json() as Promise<T>;
}

/** Make an authenticated request returning raw text */
async function fetchRaw(
  client: BitbucketClient,
  url: string,
  options: RequestInit = {}
): Promise<string> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${client.token}`,
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new BitbucketApiError(response.status, body, url);
  }

  return response.text();
}

/** Fetch all pages of a paginated endpoint */
async function fetchAllPages<T>(
  client: BitbucketClient,
  url: string
): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const page = await fetchJson<PaginatedResponse<T>>(client, nextUrl);
    results.push(...page.values);
    nextUrl = page.next;
  }

  return results;
}

// ─── Error Types ─────────────────────────────────────────────────

/** Custom error for Bitbucket API responses */
class BitbucketApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly url: string
  ) {
    super(`Bitbucket API error ${status} for ${url}: ${body}`);
    this.name = 'BitbucketApiError';
  }
}

/** Check if an error is a 404 Not Found */
function isBitbucketNotFound(error: unknown): boolean {
  return error instanceof BitbucketApiError && error.status === 404;
}

// ─── Raw API Response Types ──────────────────────────────────────

/** Raw diffstat entry from the API */
interface RawDiffStatEntry {
  old: { path: string } | null;
  new: { path: string } | null;
  status: string;
  lines_added?: number;
  lines_removed?: number;
}

/** Raw PR response from the API */
interface RawPR {
  id: number;
  title: string;
  description?: string;
  state: string;
  source?: {
    branch?: { name: string };
    commit?: { hash: string };
    repository?: { slug: string };
  };
  destination?: {
    branch?: { name: string };
    commit?: { hash: string };
    repository?: { slug: string };
  };
  author?: {
    display_name?: string;
    nickname?: string;
  };
  links?: {
    html?: { href: string };
  };
  created_on?: string;
  updated_on?: string;
}

/** Map raw Bitbucket diff status to our typed status */
function mapDiffStatus(
  status: string
): BitbucketFileDiff['status'] {
  switch (status) {
    case 'added': return 'added';
    case 'removed': return 'removed';
    case 'modified': return 'modified';
    case 'renamed': return 'renamed';
    default: return 'modified';
  }
}
