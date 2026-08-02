import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billingApi, queryKeys } from '@/src/api';

export const billingKeys = {
  status: ['billing', 'status'] as const,
};

/** The caller's plan and subscription. */
export function useBilling() {
  const query = useQuery({
    queryKey: billingKeys.status,
    queryFn: () => billingApi.status(),
  });
  return { ...query, billing: query.data ?? null };
}

/**
 * Starts a checkout.
 *
 * Returns where to send the customer; it does not change the plan, because
 * paying happens at PayMongo and the grant arrives by webhook afterwards.
 */
export function useSubscribe() {
  return useMutation({
    mutationFn: (plan: string) => billingApi.subscribe(plan),
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) => billingApi.cancel(reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.status });
      // The tier drives every limit on screen.
      queryClient.invalidateQueries({ queryKey: ['usage'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    },
  });
}

/**
 * Refetches plan and limits.
 *
 * Called when the user comes back from PayMongo. The webhook is what actually
 * grants the plan, and it may land a moment before or after the redirect, so
 * this is a refetch rather than an assumption — and the screen still reads
 * "waiting for payment" until the server agrees.
 */
export function useRefreshBilling() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: billingKeys.status });
    queryClient.invalidateQueries({ queryKey: ['usage'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
  };
}
