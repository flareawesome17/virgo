/**
 * The console's HTTP client.
 *
 * Separate from `web/src/api/client.ts` on purpose, and not shared with it.
 * The console runs on its own origin with its own credentials, and the one
 * thing that must never happen is an app token reaching an /admin route or a
 * console token reaching the app. Keeping the two clients apart means there is
 * no shared storage key to confuse them, and the server refuses the crossover
 * anyway via a different audience claim.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '') ?? 'https://api.virgo.ph';

/**
 * Storage keys, prefixed so they cannot collide with the app's if someone ever
 * runs both on the same hostname.
 */
const ACCESS_KEY = 'virgo.console.access';
const REFRESH_KEY = 'virgo.console.refresh';

export const tokens = {
  access: () =>
    typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_KEY),
  refresh: () =>
    typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_KEY),
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The message a Nest validation error actually carries. */
function messageFrom(body: unknown, fallback: string): string {
  const m = (body as { message?: string | string[] })?.message;
  if (Array.isArray(m)) return m[0] ?? fallback;
  return m ?? fallback;
}

/**
 * Refresh is deduplicated.
 *
 * A dashboard page fires six queries at once. Without this, an expired access
 * token means six simultaneous refresh calls, five of which present a token
 * the first has already rotated and burned — logging the admin out moments
 * after they arrived.
 */
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const token = tokens.refresh();
  if (!token) return false;

  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      });
      if (!res.ok) return false;
      const body = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      tokens.set(body.accessToken, body.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so callers awaiting this one still see it.
      setTimeout(() => {
        refreshing = null;
      }, 0);
    }
  })();

  return refreshing;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const access = tokens.access();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401 && retry && (await refreshTokens())) {
    return request<T>(path, init, false);
  }

  if (res.status === 401) {
    tokens.clear();
    // A full navigation rather than a router push: the query cache holds
    // another admin's data and must not survive into the next session.
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/sign-in')) {
      window.location.href = '/sign-in';
    }
    throw new ApiError(401, 'Session expired');
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* a proxy error page is not JSON, and that is not worth throwing over */
    }
    throw new ApiError(res.status, messageFrom(body, `Request failed (${res.status})`));
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Sign-in bypasses `request`: there is no token yet and nothing to refresh. */
export async function signIn(email: string, password: string) {
  const res = await fetch(`${API_BASE_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, messageFrom(body, 'Could not sign in'));
  }
  const parsed = body as {
    accessToken: string;
    refreshToken: string;
    admin: unknown;
  };
  tokens.set(parsed.accessToken, parsed.refreshToken);
  return parsed.admin;
}

export async function signOut() {
  const refresh = tokens.refresh();
  // Best effort: the local tokens go regardless, so a network failure here
  // cannot strand somebody in a session they asked to end.
  if (refresh) {
    await fetch(`${API_BASE_URL}/admin/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    }).catch(() => {});
  }
  tokens.clear();
}
