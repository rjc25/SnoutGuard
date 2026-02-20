const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Retrieve the auth token from local storage.
 */
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('archguard_session');
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Core fetch wrapper with error handling and auth headers.
 */
export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : `API error: ${res.statusText}`;
    throw new ApiError(res.status, message, body);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

/**
 * HTTP GET request.
 */
export function apiGet<T>(path: string, options?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { ...options, method: 'GET' });
}

/**
 * HTTP POST request.
 */
export function apiPost<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * HTTP PUT request.
 */
export function apiPut<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    method: 'PUT',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * HTTP DELETE request.
 */
export function apiDelete<T>(path: string, options?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { ...options, method: 'DELETE' });
}

/**
 * Create an SSE (Server-Sent Events) connection.
 */
export function createSSEConnection(
  path: string,
  onMessage: (event: MessageEvent) => void,
  onError?: (event: Event) => void,
): EventSource {
  const token = getAuthToken();
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (token) {
    url.searchParams.set('token', token);
  }
  const source = new EventSource(url.toString());
  source.onmessage = onMessage;
  if (onError) {
    source.onerror = onError;
  }
  return source;
}
