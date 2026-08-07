/**
 * Query Client Configuration
 *
 * Designer mode: no caching, always fetch fresh data, no offline persistence.
 * Standalone mode: full caching + offline persistence using AsyncStorage.
 */

import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import AsyncStorage from '@react-native-async-storage/async-storage'

const isDesigner = process.env.EXPO_PUBLIC_RAPIDNATIVE_MODE === 'designer'

// ─────────────────────────────────────────────────────────────────────────────
// Query Client
// ─────────────────────────────────────────────────────────────────────────────

export const queryClient = new QueryClient({
  defaultOptions: isDesigner
    ? {
        // Designer: no caching, always fetch fresh data
        queries: {
          staleTime: 0,
          gcTime: 0,
          retry: 2,
          retryDelay: (attemptIndex) =>
            Math.min(1000 * 2 ** attemptIndex, 30000),
          // Now that AppState drives focusManager (src/lib/query-focus.ts),
          // this fires when the app returns to the foreground — which is what
          // makes every screen current without a pull-to-refresh.
          refetchOnWindowFocus: true,
          refetchOnReconnect: true,
          networkMode: 'always',
        },
        mutations: {
          retry: false,
          networkMode: 'always',
        },
      }
    : {
        // Standalone: full caching + offline persistence
        queries: {
          // 30s, not 5 minutes. Stale data is what a focus refetch is meant
          // to replace, and a 5-minute window swallowed most of them.
          staleTime: 1000 * 30,
          gcTime: 1000 * 60 * 60 * 24, // 24 hours (must be >= persister maxAge)
          retry: 2,
          retryDelay: (attemptIndex) =>
            Math.min(1000 * 2 ** attemptIndex, 30000),
          // See the designer branch: focusManager is wired to AppState, so
          // returning to the app refreshes what is on screen.
          refetchOnWindowFocus: true,
          refetchOnReconnect: true,
          networkMode: 'offlineFirst',
        },
        mutations: {
          retry: false,
          networkMode: 'offlineFirst',
        },
      },
})

// ─────────────────────────────────────────────────────────────────────────────
// AsyncStorage Persister
// ─────────────────────────────────────────────────────────────────────────────

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  // Key used to store the cache
  key: 'REACT_QUERY_OFFLINE_CACHE',
  // Throttle writes to storage (prevents excessive writes)
  throttleTime: 1000,
  // Optional: serialize/deserialize functions
  serialize: (data) => JSON.stringify(data),
  deserialize: (data) => JSON.parse(data),
})

// ─────────────────────────────────────────────────────────────────────────────
// Persist Options
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bump this when a cached response's shape changes.
 *
 * The persisted cache outlives an app update, so a payload that changed
 * server-side meets client code expecting the old one. Renaming a price field
 * did exactly that: phones kept a catalogue on disk and priced Freelance at
 * ₱25 — the old amount — for a day after the change. Changing the buster
 * throws the whole persisted cache away on next launch.
 */
/*
 * Bumped to throw away caches written by the buggy predicate above. Phones
 * that already stored a pending query would otherwise keep rehydrating it and
 * keep hanging — the fix has to invalidate what the bug wrote, not just stop
 * writing more.
 */
const CACHE_VERSION = 'v3-success-only-dehydrate'

/**
 * Never written to disk, whatever their staleTime says.
 *
 * Matched against the real key each hook uses — `['me', 'usage']` is the
 * quota reading, not `['usage']`, and a guess would have silently kept
 * persisting it.
 */
function isPerishable(queryKey: readonly unknown[]): boolean {
  const [root, second] = queryKey
  // Auth, for security — a session should not be readable from storage.
  if (root === 'auth') return true
  // Prices and what the current plan is. Showing a stale price is not a
  // cosmetic problem: somebody who reads ₱25 can reasonably expect to pay ₱25.
  // Both are small and quick to fetch, so there is nothing to gain by keeping
  // them on disk.
  if (root === 'plans' || root === 'billing') return true
  // ['me', 'usage'] — the plan and its limits.
  if (root === 'me' && second === 'usage') return true

  /*
   * Filtered job searches.
   *
   * Every distinct filter is its own key, so typing a city produces one per
   * debounce — persisting them fills AsyncStorage with searches nobody will
   * repeat. The unfiltered board is the one worth keeping on disk, and it is
   * the one that makes the screen look instant on a cold start.
   */
  if (root === 'jobs' && second === 'list') {
    const params = queryKey[2] as { roles?: unknown[]; location?: string } | undefined
    const filtered = Boolean(params?.location) || Boolean(params?.roles?.length)
    if (filtered) return true
  }
  return false
}

export const persistOptions = {
  persister: asyncStoragePersister,
  // Maximum age of persisted data (24 hours)
  maxAge: 1000 * 60 * 60 * 24,
  buster: CACHE_VERSION,
  // Only persist successful queries
  dehydrateOptions: {
    shouldDehydrateQuery: (query: any) => {
      /*
       * Successful queries only.
       *
       * This used to exclude just errors, which meant a query that was still
       * in flight when the app went to the background was written to disk as
       * *pending*. On the next launch React Query rehydrates that as a pending
       * query with no fetch behind it, so it hangs until the 20s client
       * timeout and then reports "a query that was dehydrated as pending ended
       * up rejecting". On screen that is a spinner that turns for twenty
       * seconds and then gives up.
       *
       * React Query's own default is success-only for exactly this reason;
       * the custom predicate replaced it and lost that.
       */
      if (query.state.status !== 'success') return false
      if (isPerishable(query.queryKey)) return false
      return true
    },
  },
}