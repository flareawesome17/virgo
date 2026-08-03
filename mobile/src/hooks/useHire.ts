import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  hireApi,
  queryKeys,
  type HireEnquiry,
  type SendEnquiryInput,
} from '@/src/api';

/**
 * Hire enquiries, both directions.
 *
 * One query for both inboxes because the server returns one list — splitting
 * it here would mean two fetches of the same rows and two chances to go stale
 * apart from each other.
 */
export function useHireEnquiries() {
  const query = useQuery({
    queryKey: queryKeys.hire.list(),
    queryFn: () => hireApi.list(),
  });

  const all = query.data?.data ?? ([] as HireEnquiry[]);

  return {
    ...query,
    enquiries: all,
    received: all.filter((e) => e.direction === 'received'),
    sent: all.filter((e) => e.direction === 'sent'),
    /** What the badge counts: enquiries waiting on the user to answer. */
    pending: all.filter((e) => e.direction === 'received' && e.status === 'new'),
  };
}

export function useSendEnquiry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SendEnquiryInput) => hireApi.send(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hire.all });
    },
  });
}

/**
 * Accepting connects the two accounts and opens a chat, so friends and
 * conversations are stale too — not just the enquiry list.
 */
export function useAnswerEnquiry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      accept ? hireApi.accept(id) : hireApi.decline(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hire.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
      queryClient.invalidateQueries({ queryKey: ['chat'] });
    },
  });
}
