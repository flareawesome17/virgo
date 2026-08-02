import { useQuery } from '@tanstack/react-query';
import { usageApi, type UsageSummary } from '@/src/api';

export const usageQueryKey = ['me', 'usage'] as const;
export const plansQueryKey = ['plans'] as const;

/**
 * The plans on offer.
 *
 * Fetched rather than hardcoded so the screen cannot advertise limits the
 * server does not actually grant. Cached for the session — tiers change on
 * deploys, not between screens.
 */
export function usePlans() {
  const query = useQuery({
    queryKey: plansQueryKey,
    queryFn: () => usageApi.plans(),
    staleTime: Infinity,
  });
  return { ...query, plans: query.data?.data ?? [] };
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
    atAlbumLimit:
      usage?.albums.limit != null && usage.albums.used >= usage.albums.limit,
  };
}
