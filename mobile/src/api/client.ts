import { API_BASE_URL, REQUEST_TIMEOUT_MS } from './config';
import { ApiError, extractMessage } from './errors';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  hydrateTokens,
  setTokens,
} from './tokens';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  body?: unknown;
  /**
   * Typed as `object` rather than Record<string, unknown> so callers can pass
   * their own param interfaces. TypeScript only gives implicit index
   * signatures to type aliases, not interfaces, so a Record type here would
   * reject every ListXxxParams interface in endpoints/.
   */
  query?: object;
  /** Skips the Authorization header and the refresh-retry. Used by auth calls. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

/**
 * Called when the session cannot be recovered. useAuth registers a handler that
 * clears cached queries so the app falls back to the signed-out UI, rather than
 * every screen independently discovering its queries now 401.
 */
let onAuthFailure: (() => void) | null = null;

export function setAuthFailureHandler(handler: (() => void) | null): void {
  onAuthFailure = handler;
}

/**
 * In-flight refresh, shared across callers.
 *
 * Screens fire several queries at once, so an expired access token produces a
 * burst of simultaneous 401s. Without this, each would start its own refresh —
 * and since refresh tokens rotate, the first would consume the token and the
 * rest would fail with "invalid refresh token", logging the user out despite a
 * perfectly good session.
 */
let refreshPromise: Promise<boolean> | null = null;

function buildUrl(path: string, query?: object): string {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }

  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function rawFetch(
  method: Method,
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Honour a caller-supplied signal (React Query passes one on unmount) while
  // still enforcing our own timeout.
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    return await fetch(buildUrl(path, options.query), {
      method,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Exchanges the refresh token for a new pair. Returns false if unrecoverable. */
async function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await rawFetch(
      'POST',
      '/auth/refresh',
      { body: { refreshToken } },
      null,
    );
    if (!response.ok) return false;

    const body = (await parseBody(response)) as {
      accessToken?: string;
      refreshToken?: string;
    } | null;

    if (!body?.accessToken || !body?.refreshToken) return false;
    await setTokens(body.accessToken, body.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  refreshPromise ??= refreshSession().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function request<T>(
  method: Method,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  // Tokens live in AsyncStorage. On a cold start a screen's query can fire
  // before anything has read them, which would send no Authorization header and
  // draw a 401 — clearing a session that was actually fine. hydrateTokens is
  // idempotent and resolves immediately after the first call.
  if (!options.anonymous) await hydrateTokens();

  let response: Response;

  try {
    response = await rawFetch(
      method,
      path,
      options,
      options.anonymous ? null : getAccessToken(),
    );
  } catch (err) {
    // fetch only rejects for transport-level failures; status 0 marks those so
    // callers can distinguish "offline" from "server said no".
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new ApiError(
      0,
      aborted ? 'The request timed out.' : 'Could not reach the server.',
      err,
    );
  }

  // One transparent refresh-and-retry on an expired access token.
  if (response.status === 401 && !options.anonymous && getRefreshToken()) {
    const refreshed = await refreshOnce();

    if (refreshed) {
      response = await rawFetch(method, path, options, getAccessToken());
    } else {
      await clearTokens();
      onAuthFailure?.();
      throw new ApiError(401, 'Your session has expired. Please sign in again.');
    }
  }

  const body = await parseBody(response);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractMessage(body, `Request failed (${response.status})`),
      body,
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>('GET', path, options),
  post: <T>(path: string, options?: RequestOptions) =>
    request<T>('POST', path, options),
  patch: <T>(path: string, options?: RequestOptions) =>
    request<T>('PATCH', path, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, options),
};
