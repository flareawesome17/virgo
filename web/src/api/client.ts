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
  /** For the few calls that are slow by design; everything else gets REQUEST_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * Called when the session cannot be recovered. useAuth registers a handler that
 * clears cached queries so the app falls back to the signed-out UI, rather than
 * every screen independently discovering its queries now 401.
 *
 * It is given the refresh token the server just refused. It is no use for
 * signing in, but it still says whose session this was, which is what taking
 * the device off that account needs (authApi.forgetDevice).
 */
type AuthFailureHandler = (refusedRefreshToken: string | null) => void;
let onAuthFailure: AuthFailureHandler | null = null;

export function setAuthFailureHandler(handler: AuthFailureHandler | null): void {
  onAuthFailure = handler;
}

/**
 * For a call that ends this session on purpose — turning two-factor off
 * revokes every session, this one included. Runs the same handler as a
 * refused refresh, so the device is tidied up the same way.
 */
export function sessionEnded(refusedRefreshToken: string | null): void {
  onAuthFailure?.(refusedRefreshToken);
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
let refreshPromise: Promise<RefreshOutcome> | null = null;

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

/**
 * A body that was not JSON.
 *
 * Every route this client calls answers JSON, errors included. Anything else
 * came from something in between — a Wi-Fi login page, a proxy's or
 * Cloudflare's error page — and it used to be handed back as the data: a 200
 * login page became a screen's list (and a crash on `.map`), saved to disk
 * with the rest of the cache for a day, and a 502's HTML became the text of an
 * error message.
 */
class NotJson {
  constructor(readonly text: string) {}
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return new NotJson(text);
  }
}

async function rawFetch(
  method: Method,
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);

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

/**
 * How a refresh went.
 *
 * 'ok'          a new pair is stored.
 * 'rejected'    the server looked at the refresh token and refused it (400,
 *               401, or 403 for a suspended or unverified account): the
 *               session is over.
 * 'unreachable' no answer worth acting on — offline, a timeout, a 5xx or 429
 *               during a deploy, or a page that is not a token pair (a Wi-Fi
 *               login, a proxy's error). Nothing is known to be wrong with the
 *               tokens, so they are kept.
 *
 * Every failure used to count as 'rejected' and cleared the tokens. With a
 * 15-minute access token a refresh runs on almost every resume, so a flaky
 * connection or a deploy at the wrong moment signed people out.
 */
type RefreshOutcome = 'ok' | 'rejected' | 'unreachable';

async function refreshSession(): Promise<RefreshOutcome> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return 'rejected';

  let response: Response;
  try {
    response = await rawFetch(
      'POST',
      '/auth/refresh',
      { body: { refreshToken } },
      null,
    );
  } catch {
    return 'unreachable';
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return 'rejected';
  }
  if (!response.ok) return 'unreachable';

  let body: { accessToken?: string; refreshToken?: string } | null;
  try {
    body = (await parseBody(response)) as typeof body;
  } catch {
    return 'unreachable';
  }
  if (!body?.accessToken || !body?.refreshToken) return 'unreachable';
  await setTokens(body.accessToken, body.refreshToken);
  return 'ok';
}

function refreshOnce(): Promise<RefreshOutcome> {
  refreshPromise ??= refreshSession().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/**
 * rawFetch, with a transport failure turned into an ApiError.
 *
 * fetch only rejects for transport-level failures; status 0 marks those so
 * callers can distinguish "offline" from "server said no". Both the first try
 * and the retry after a refresh go through here — the retry used to call
 * rawFetch bare, so a connection lost in between surfaced as a TypeError that
 * nothing recognised as offline.
 */
async function send(
  method: Method,
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<Response> {
  try {
    return await rawFetch(method, path, options, token);
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new ApiError(
      0,
      aborted ? 'The request timed out.' : 'Could not reach the server.',
      err,
    );
  }
}

export async function request<T>(
  method: Method,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  // Tokens live in localStorage. On a fresh page load a route's query can fire
  // before anything has read them, which would send no Authorization header and
  // draw a 401 — clearing a session that was actually fine. hydrateTokens is
  // idempotent and resolves immediately after the first call.
  if (!options.anonymous) await hydrateTokens();

  let response = await send(
    method,
    path,
    options,
    options.anonymous ? null : getAccessToken(),
  );

  // One transparent refresh-and-retry on an expired access token.
  if (response.status === 401 && !options.anonymous && getRefreshToken()) {
    const refreshed = await refreshOnce();

    if (refreshed === 'ok') {
      response = await send(method, path, options, getAccessToken());
    } else if (refreshed === 'rejected') {
      const refused = getRefreshToken();
      await clearTokens();
      onAuthFailure?.(refused);
      throw new ApiError(401, 'Your session has expired. Please sign in again.');
    } else {
      // Still signed in; just not reachable. Status 0 is what every caller
      // already reads as "offline" rather than "signed out".
      throw new ApiError(0, 'Could not reach the server.');
    }
  }

  let body: unknown;
  try {
    body = await parseBody(response);
  } catch (err) {
    // The connection went while the body was still arriving.
    throw new ApiError(0, 'Could not reach the server.', err);
  }

  if (body instanceof NotJson) {
    // A 200 that is not ours is a connection problem from where the person
    // sits — they are not reaching the server, whatever did answer.
    if (response.ok) throw new ApiError(0, 'Could not reach the server.', body.text);
    throw new ApiError(
      response.status,
      response.status >= 500
        ? 'The server had a problem. Please try again in a moment.'
        : `Request failed (${response.status})`,
      body.text,
    );
  }

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
