import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, supportApi } from '@/src/api';

/**
 * The customer's view of their own support threads.
 *
 * Replies arrive as a realtime `support` notification, which invalidates these
 * keys — so an open thread updates without the reader refreshing, and a closed
 * app still shows the reply on next open because the list is refetched then.
 */
export function useSupportTickets(enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.support.list,
    queryFn: () => supportApi.list(),
    enabled,
  });
  return {
    ...query,
    tickets: query.data ?? [],
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
  };
}

export function useSupportThread(id: string) {
  const query = useQuery({
    queryKey: queryKeys.support.thread(id),
    queryFn: () => supportApi.thread(id),
    enabled: !!id,
  });
  return {
    ...query,
    ticket: query.data?.ticket,
    messages: query.data?.messages ?? [],
    loadFailed: query.isError || query.isPaused,
  };
}

export function useOpenTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subject, body }: { subject: string; body: string }) =>
      supportApi.open(subject, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.support.all });
    },
  });
}

export function useReplyToTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => supportApi.reply(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.support.all });
    },
  });
}
