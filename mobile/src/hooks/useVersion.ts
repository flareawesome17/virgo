import { useQuery } from '@tanstack/react-query';
import { queryKeys, versionApi } from '@/src/api';

/**
 * The release the API is running.
 *
 * Mobile ships through EAS rather than the release workflow that stamps the
 * server images, so asking the API is the only way it can know which release
 * is live. Web and the console read their own build-time constant instead —
 * they *are* the artefact the workflow stamped.
 *
 * Long stale time and no refetch: a deployment is not something that changes
 * while somebody is looking at a settings screen, and this must never be the
 * reason a screen shows a spinner.
 */
export function useServerVersion() {
  const query = useQuery({
    queryKey: queryKeys.version.current,
    queryFn: () => versionApi.get(),
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  return {
    ...query,
    version: query.data?.version ?? null,
    commit: query.data?.commit ?? null,
  };
}
