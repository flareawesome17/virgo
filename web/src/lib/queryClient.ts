import { QueryClient } from '@tanstack/react-query';
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
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
