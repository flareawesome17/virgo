import { useQuery } from '@tanstack/react-query';
import { usageApi, type UsageSummary } from '@/api';

export const usageQueryKey = ['me', 'usage'] as const;
export const plansQueryKey = ['plans'] as const;

/**
 * The plans on offer.
 *
 * Fetched rather than hardcoded so the screen cannot advertise limits the
 * server does not actually grant.
 *
 * Deliberately NOT cached for the session, which is what it used to do.
 * These are prices: somebody who reads ₱25 can reasonably expect to pay
 * ₱25, and an immortal cache kept exactly that on screen for a day after
 * the price changed. Refetched on every mount, and never written to disk
 * — see isPerishable in lib/queryClient.
 */
export function usePlans() {
  const query = useQuery({
    queryKey: plansQueryKey,
    queryFn: () => usageApi.plans(),
    staleTime: 60_000,
    refetchOnMount: 'always',
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    plans: query.data?.data ?? [],
  };
}

/**
 * Plan limits and current usage.
 *
 * Short staleTime because creating a workspace/album or finishing an upload
 * changes it, and a stale quota reading is worse than a slightly chatty one.
 */
export function useUsage(options: { enabled?: boolean } = {}) {
  const query = useQuery<UsageSummary>({
    queryKey: usageQueryKey,
    queryFn: () => usageApi.get(),
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  });

  const usage = query.data;

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    usage,
    storageUsedBytes: usage?.storage.usedBytes ?? 0,
    storageLimitBytes: usage?.storage.limitBytes ?? null,
    /** 0-1, or 0 when the plan is unlimited. */
    storageFraction:
      usage?.storage.limitBytes && usage.storage.limitBytes > 0
        ? Math.min(usage.storage.usedBytes / usage.storage.limitBytes, 1)
        : 0,
    atWorkspaceLimit:
      usage?.workspaces.limit != null &&
      usage.workspaces.used >= usage.workspaces.limit,
    /** Albums allowed in each workspace; null is unlimited. */
    albumLimit: usage?.albums.limit ?? null,
    /**
     * Whether a workspace holding this many albums is full.
     *
     * Per workspace, because that is how the limit works. `albums.used` is
     * the total across all of them, and comparing it with the per-workspace
     * limit — which is what `atAlbumLimit` did — told someone with two
     * half-empty workspaces that they could not make another album anywhere.
     */
    isAlbumLimitReached: (albumsInWorkspace: number) =>
      usage?.albums.limit != null && albumsInWorkspace >= usage.albums.limit,
  };
}
