import { QueryClient, type Query } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { ApiError } from '@/api';

/**
 * Shared query client.
 *
 * Two web-specific choices against mobile's defaults:
 *
 *   refetchOnWindowFocus is ON. A browser tab is routinely left open for hours
 *   behind other windows; coming back to stale data is the common case here in
 *   a way it is not on a phone.
 *
 *   Retries skip 4xx. A 401 is answered by the client's refresh-and-retry, and
 *   a 403 or 404 will not become true by asking again — retrying those only
 *   delays the error the user needs to see.
 */

/**
 * Whether this build is the desktop app.
 *
 * Everything below about persistence is desktop-only, and deliberately so. A
 * desktop app is one person's, on one machine, in an application directory —
 * keeping their workspace on disk so it opens without a network is the whole
 * point of installing it. A browser is not that: web.virgo.ph is opened on
 * shared and borrowed computers, and writing a signed-in account's data to
 * localStorage there is a privacy decision nobody asked for.
 *
 * So the web build keeps exactly the behaviour it has today.
 */
const IS_DESKTOP = process.env.NEXT_PUBLIC_VIRGO_DESKTOP === '1';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: IS_DESKTOP
        ? // Must be at least the persister's maxAge, or the cache is collected
          // out of memory before it is ever written to disk.
          1000 * 60 * 60 * 24
        : 1000 * 60 * 5,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // `offlineFirst` on the desktop: try once, and on failure serve what is
      // cached rather than reporting an error. The default, `online`, refuses
      // to run at all when the browser believes it is offline, which turns
      // every screen into a spinner that never resolves.
      networkMode: IS_DESKTOP ? 'offlineFirst' : 'online',
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
      // Not `offlineFirst`: a paused mutation looks to the user like a save
      // that worked and did not. Failing outright is honest, and the UI already
      // says the request could not be sent.
      networkMode: 'always',
    },
  },
});

/**
 * Bump when a cached response's shape changes.
 *
 * The persisted cache outlives an app update, so a payload that changed
 * server-side meets client code expecting the old one. Changing this throws
 * the whole persisted cache away on next launch.
 */
const CACHE_VERSION = 'v1-desktop-offline';

/**
 * Queries never written to disk, whatever their staleTime says.
 *
 * Mirrors the mobile list, which was learned the hard way: prices and plan
 * limits are excluded because showing a stale price is not cosmetic — somebody
 * who reads a number can reasonably expect to pay it — and filtered searches
 * are excluded because every distinct filter is its own key, so typing a city
 * writes one entry per keystroke and fills storage with searches nobody will
 * repeat.
 *
 * The session is deliberately *not* excluded here, and that is the one
 * departure from mobile. Mobile drops it for security, which also means mobile
 * cannot open offline — its first act is a `/auth/me` that fails. Keeping it is
 * what lets the desktop app start with no network at all, and it costs little
 * that is not already true: the tokens themselves are in localStorage beside
 * it, so this adds a name and an email to something that already grants access.
 */
function isPerishable(queryKey: readonly unknown[]): boolean {
  const [root, second] = queryKey;

  if (root === 'plans' || root === 'billing') return true;
  if (root === 'me' && second === 'usage') return true;

  if (root === 'jobs' && second === 'list') {
    const params = queryKey[2] as
      | { roles?: unknown[]; location?: string }
      | undefined;
    if (params?.location || params?.roles?.length) return true;
  }

  return false;
}

/**
 * Where the cache is kept, and null when it should not be kept at all.
 *
 * `localStorage` rather than IndexedDB: what is stored is JSON metadata —
 * albums, events, people — not media, which is fetched from signed URLs and
 * never enters the cache. That fits comfortably in the ~5 MB a browser allows,
 * and a synchronous persister avoids a rehydration race on a cold start.
 */
export const persister =
  IS_DESKTOP && typeof window !== 'undefined'
    ? createSyncStoragePersister({
        storage: window.localStorage,
        key: 'virgo.offline.cache',
        throttleTime: 1000,
      })
    : null;

export const persistOptions = persister
  ? {
      persister,
      maxAge: 1000 * 60 * 60 * 24 * 7,
      buster: CACHE_VERSION,
      dehydrateOptions: {
        shouldDehydrateQuery: (query: Query) => {
          // Successful queries only. Persisting a query that was still in
          // flight writes it as *pending*, and on the next start React Query
          // rehydrates a pending query with no fetch behind it — a spinner that
          // turns until it times out. Mobile shipped that bug; this is the
          // behaviour it settled on.
          if (query.state.status !== 'success') return false;
          return !isPerishable(query.queryKey);
        },
      },
    }
  : null;
