import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/api';

/**
 * The roles a person can hold.
 *
 * Fetched rather than kept in a constant here, so the list a form offers is
 * the same one the API validates against and the same one Nearby filters on.
 * Three copies of it would be three chances to drift.
 *
 * `staleTime: Infinity` — it changes when the server is redeployed, not while
 * anybody has it open.
 */
export function useRoles() {
  const query = useQuery({
    queryKey: ['auth', 'roles'],
    queryFn: () => authApi.listRoles(),
    staleTime: Infinity,
  });
  return { ...query, roles: query.data?.data ?? [] };
}
