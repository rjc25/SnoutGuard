import { apiFetch } from './api';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  orgId: string;
  orgName: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  email: string;
  password: string;
  name: string;
  orgName?: string;
}

const SESSION_KEY = 'snoutguard_session';

/**
 * Retrieve the current session from local storage.
 * Returns null if no session exists or if the session has expired.
 */
export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const session: Session = JSON.parse(raw);

    // Check expiration
    if (Date.now() >= session.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

/**
 * Store the session in local storage.
 */
function setSession(session: Session): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Clear the stored session.
 */
function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Get the current access token for API requests.
 */
export function getAccessToken(): string | null {
  const session = getSession();
  return session?.accessToken ?? null;
}

/**
 * Login with email and password.
 */
export async function login(credentials: LoginCredentials): Promise<Session> {
  const session = await apiFetch<Session>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
  setSession(session);
  return session;
}

/**
 * Create a new account.
 */
export async function signup(data: SignupData): Promise<Session> {
  const session = await apiFetch<Session>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  setSession(session);
  return session;
}

/**
 * Logout the current user.
 */
export async function logout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch {
    // Ignore errors during logout -- always clear local session
  } finally {
    clearSession();
  }
}

/**
 * Initiate OAuth login flow by redirecting to the provider.
 */
export function initiateOAuthLogin(provider: 'github' | 'google'): void {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
  window.location.href = `${baseUrl}/auth/oauth/${provider}`;
}

/**
 * Initiate SAML SSO login by redirecting to the SSO endpoint.
 */
export function initiateSSOLogin(orgSlug: string): void {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
  window.location.href = `${baseUrl}/auth/sso/${orgSlug}`;
}

/**
 * Handle the OAuth/SSO callback.
 * Extracts the session token from URL params and stores it.
 */
export async function handleAuthCallback(): Promise<Session | null> {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (!token) return null;

  const session = await apiFetch<Session>('/auth/session', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  setSession(session);

  // Clean URL
  window.history.replaceState({}, '', window.location.pathname);

  return session;
}

/**
 * Refresh the access token using the refresh token.
 */
export async function refreshAccessToken(): Promise<Session | null> {
  const session = getSession();
  if (!session?.refreshToken) return null;

  try {
    const newSession = await apiFetch<Session>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    setSession(newSession);
    return newSession;
  } catch {
    clearSession();
    return null;
  }
}
