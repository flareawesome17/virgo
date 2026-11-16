import { hasId, patchCachedRows, restoreCached, type CachedSnapshot } from './optimistic';
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
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    enquiries: all,
    received: all.filter((e) => e.direction === 'received'),
    sent: all.filter((e) => e.direction === 'sent'),
    /** What the badge counts: enquiries waiting on the user to answer. */
    pending: all.filter((e) => e.direction === 'received' && e.status === 'new'),
  };
}

/** Who an enquiry is going to, for drawing it before the server has it. */
export interface EnquiryRecipient {
  name: string;
  avatarUrl?: string | null;
}

/**
 * Sends an enquiry.
 *
 * With `to`, it is in your sent list at once, as waiting, and is taken out
 * again if the server refuses. `to` is for the screen and never sent.
 */
export function useSendEnquiry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ to: _to, ...input }: SendEnquiryInput & { to?: EnquiryRecipient }) =>
      hireApi.send(input),
    onMutate: async ({ to, ...input }: SendEnquiryInput & { to?: EnquiryRecipient }) => {
      if (!to) return undefined;
      const key = queryKeys.hire.list();
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<{ data: HireEnquiry[]; total?: number }>(key);
      // Nothing loaded to add it to: it arrives with the read that follows.
      if (!before) return undefined;
      const sending = {
        id: `sending-${Date.now()}`,
        direction: 'sent',
        personName: to.name,
        personAvatarUrl: to.avatarUrl ?? null,
        personHandle: input.handle.replace(/^@/, ''),
        roleWanted: input.roleWanted ?? null,
        eventDate: input.eventDate ?? null,
        budget: input.budget ?? null,
        message: input.message,
        status: 'new',
        createdAt: new Date().toISOString(),
        respondedAt: null,
        conversationId: null,
      } as HireEnquiry;
      queryClient.setQueryData(key, {
        ...before,
        data: [sending, ...before.data],
        ...(typeof before.total === 'number' ? { total: before.total + 1 } : {}),
      });
      return { before: [[key, before]] as CachedSnapshot };
    },
    onError: (_error, _input, context) => restoreCached(queryClient, context?.before),
    onSettled: () => {
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
    // Answered on the tap: the row stops asking and the badge drops. Put back
    // if the server refuses.
    onMutate: async ({ id, accept }: { id: string; accept: boolean }) => ({
      before: await patchCachedRows(queryClient, queryKeys.hire.all, hasId, (row) =>
        row.id === id && 'status' in row
          ? { ...row, status: accept ? 'accepted' : 'declined', respondedAt: new Date().toISOString() }
          : row,
      ),
    }),
    onError: (_error, _input, context) => restoreCached(queryClient, context?.before),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hire.all });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
      queryClient.invalidateQueries({ queryKey: ['chat'] });
      // A new connection changes their Connect button and both counts.
      queryClient.invalidateQueries({ queryKey: queryKeys.publicProfiles.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.page });
    },
  });
}
