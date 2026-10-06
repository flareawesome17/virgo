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

/** `attachments` are ids from supportApi.signAttachment, uploaded already. */
export function useOpenTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      subject,
      body,
      attachments,
    }: {
      subject: string;
      body: string;
      attachments?: string[];
    }) => supportApi.open(subject, body, attachments),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.support.all });
    },
  });
}

export function useReplyToTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, attachments }: { body: string; attachments?: string[] }) =>
      supportApi.reply(id, body, attachments),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.support.all });
    },
  });
}

/** How it went, once the ticket is resolved or closed. Rating again replaces it. */
export function useRateTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rating, comment }: { rating: number; comment?: string }) =>
      supportApi.rate(id, rating, comment),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.support.thread(id) });
    },
  });
}
