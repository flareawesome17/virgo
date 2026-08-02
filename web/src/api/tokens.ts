/**
 * Token storage.
 *
 * localStorage, which is the browser's equivalent of the AsyncStorage the
 * mobile app uses — and carries the same caveat: it is readable by any script
 * running on this origin, so an XSS hole is a session compromise. The API's
 * short access-token lifetime and rotating refresh tokens limit the blast
 * radius; httpOnly cookies would remove it entirely and are the upgrade path.
 *
 * The keys deliberately match mobile's, so the two clients read the same shape
 * and a session seeded by one is legible to the other during development.
 */
const ACCESS_KEY = 'virgo.auth.accessToken';
const REFRESH_KEY = 'virgo.auth.refreshToken';

/**
 * Cached in memory so the request path does not touch storage on every call.
 * Storage stays the source of truth across reloads.
 */
let accessToken: string | null = null;
let refreshToken: string | null = null;
let hydrated = false;

/**
 * Async to match the mobile client's signature, so `client.ts` ports across
 * unchanged. It resolves synchronously here.
 */
export async function hydrateTokens(): Promise<void> {
  if (hydrated) return;
  try {
    accessToken = localStorage.getItem(ACCESS_KEY);
    refreshToken = localStorage.getItem(REFRESH_KEY);
  } catch {
    // Private browsing and blocked storage both throw rather than returning
    // null. An in-memory session still works for this tab.
    accessToken = null;
    refreshToken = null;
  }
  hydrated = true;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  accessToken = access;
  refreshToken = refresh;
  hydrated = true;
  try {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    // Keep the in-memory pair: the session survives until the tab closes.
  }
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // Nothing to clear if storage was never writable.
  }
}

/**
 * Signing out in one tab should sign out the others.
 *
 * A browser-only concern with no mobile equivalent: two tabs share an origin
 * and its storage, so without this a second tab keeps a token the user has
 * revoked and carries on as if signed in.
 */
export function watchTokensAcrossTabs(onCleared: () => void): () => void {
  const handle = (event: StorageEvent) => {
    if (event.key !== ACCESS_KEY && event.key !== REFRESH_KEY) return;
    if (event.newValue === null) {
      accessToken = null;
      refreshToken = null;
      onCleared();
      return;
    }
    // Signed in elsewhere, or refreshed — adopt the new pair rather than
    // sending a token this tab has already had rotated out from under it.
    if (event.key === ACCESS_KEY) accessToken = event.newValue;
    if (event.key === REFRESH_KEY) refreshToken = event.newValue;
  };

  window.addEventListener('storage', handle);
  return () => window.removeEventListener('storage', handle);
}
