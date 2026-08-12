import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { promosApi, queryKeys } from '@/src/api';

/**
 * Rewards waiting to be claimed.
 *
 * Fetched on sign-in and refreshed over the `promo` realtime topic, so an
 * offer an admin makes while somebody is using the app appears without them
 * reloading anything.
 */
export function usePromoOffers(enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.promos.offers,
    queryFn: () => promosApi.offers(),
    enabled,
  });
  return {
    ...query,
    offers: query.data ?? [],
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
  };
}

/**
 * This account's referral code.
 *
 * Lazy on purpose: the query only runs where the code is actually shown, and
 * reading it is what allocates it. Fetching this app-wide would give every
 * account a code whether or not they ever share one.
 */
export function useReferralCode(enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.promos.referralCode,
    queryFn: () => promosApi.referralCode(),
    enabled,
    // It never changes once allocated, so refetching it is pure noise.
    staleTime: Infinity,
  });
  return { ...query, code: query.data?.code ?? null };
}

/**
 * Takes an offer.
 *
 * Invalidates usage as well as the offer list: claiming raises the account's
 * real limits, and the storage screen quoting the old ceiling right after
 * somebody claimed more of it is the one thing that would make this feel
 * broken.
 */
export function useClaimPromo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (grantId: string) => promosApi.claim(grantId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.promos.all });
      void queryClient.invalidateQueries({ queryKey: ['usage'] });
    },
  });
}

/**
 * Uses somebody else's invite code.
 *
 * Rewards both sides, so on success this account has an offer waiting — hence
 * invalidating the offer list rather than only reporting the result.
 */
export function useRedeemReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => promosApi.redeemReferral(code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.promos.all });
    },
  });
}
