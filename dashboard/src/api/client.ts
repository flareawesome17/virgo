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

/**
 * Hostnames that only mean something on this machine or this network.
 *
 * Matched as four whole octets, not by prefix: `/^192\.168\./` also matches
 * `192.168.1.5.evil.com`, a name anybody can register.
 */
function isPrivateIPv4(hostname: string): boolean {
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!parts) return false;

  const octets = parts.slice(1).map(Number);
  if (octets.some((n) => n > 255)) return false;

  const [a, b] = octets;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname === 'local' ||
    hostname.endsWith('.local') ||
    isPrivateIPv4(hostname)
  );
}

/**
 * Follows the browser's own hostname when the configured API is a local one.
 *
 * NEXT_PUBLIC_* is inlined at build time, so a development image carries the
 * LAN address the machine had when it was built. On a DHCP lease that address
 * changes and the console can no longer reach the API — it looks broken, and
 * the only fix is a rebuild. The port is what is actually configured; the host
 * is just "wherever this stack is", which the page already knows.
 *
 * https://api.virgo.ph is not a local hostname, so production is untouched.
 * Mirrors web/src/api/config.ts — the two clients are deliberately separate,
 * so this rule is stated in both rather than shared.
 */
function resolveBaseUrl(raw: string): string {
  if (!raw || typeof window === 'undefined') return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  if (!isLocalHostname(url.hostname)) return raw;
  if (url.hostname === window.location.hostname) return raw;

  url.hostname = window.location.hostname;
  return url.toString();
}

export const API_BASE_URL = resolveBaseUrl(
  process.env.NEXT_PUBLIC_API_URL ?? 'https://api.virgo.ph',
).replace(/\/+$/, '');

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
