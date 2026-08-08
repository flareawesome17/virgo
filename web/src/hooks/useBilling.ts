import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billingApi, queryKeys } from '@/api';

export const billingKeys = {
  status: ['billing', 'status'] as const,
};

/** The caller's plan and subscription. */
export function useBilling() {
  const query = useQuery({
    queryKey: billingKeys.status,
    queryFn: () => billingApi.status(),
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    billing: query.data ?? null,
  };
}

/**
 * Settles a checkout that was started but never confirmed.
 *
 * Someone who paid and then closed the tab — or whose webhook went astray —
 * has a subscription sitting at `incomplete` against a payment PayMongo has
 * already taken. This notices that on the next visit and asks the server to
 * check, so the account fixes itself rather than waiting for somebody to
 * notice they are still on Free.
 *
 * Bounded on purpose: it only fires when something is actually pending, and
 * once per mount, so a page view does not become a call to PayMongo.
 */
export function useSettlePendingCheckout(): void {
  const { billing } = useBilling();
  const refresh = useRefreshBilling();
  const done = useRef(false);

  const pending = billing?.subscription?.status === 'incomplete';

  useEffect(() => {
    if (!pending || done.current) return;
    done.current = true;
    void refresh();
  }, [pending, refresh]);
}

/**
 * Starts a checkout.
 *
 * Returns where to send the customer; it does not change the plan, because
 * paying happens at PayMongo and the grant arrives by webhook afterwards.
 */
export function useSubscribe(platform: 'web' | 'mobile' = 'web') {
  return useMutation({
    mutationFn: (plan: string) => billingApi.subscribe(plan, platform),
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
 * Confirms a payment with the server, then refetches.
 *
 * Called when the user comes back from PayMongo. It asks the server to check
 * with PayMongo directly rather than waiting on the webhook — the webhook is
 * a URL somebody typed into a dashboard, and a payment that has happened
 * should not depend on that having been typed correctly.
 *
 * useCallback is load-bearing, not tidiness: this goes in an effect's
 * dependency list, and a fresh function each render re-ran the effect, which
 * invalidated queries, which re-rendered — a loop that fired a toast about
 * once a second.
 */
export function useRefreshBilling() {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    try {
      await billingApi.reconcile();
    } catch {
      // Best-effort. The webhook may still land, and the refetch below shows
      // whatever the server currently believes either way.
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: billingKeys.status }),
      queryClient.invalidateQueries({ queryKey: ['me', 'usage'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.all }),
    ]);
  }, [queryClient]);
}
