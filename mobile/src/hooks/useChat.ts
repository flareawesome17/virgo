import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '@/src/api';

export const chatKeys = {
  conversations: ['chat', 'conversations'] as const,
  unread: ['chat', 'unread'] as const,
  thread: (id: string) => ['chat', 'thread', id] as const,
  participants: (id: string) => ['chat', 'participants', id] as const,
};

/**
 * The conversation list.
 *
 * Polled while the screen is open: there is no websocket, so a new message
 * would otherwise only appear on a manual refresh.
 */
export function useConversations() {
  const query = useQuery({
    queryKey: chatKeys.conversations,
    queryFn: () => chatApi.conversations(),
    refetchInterval: 15_000,
  });
  return { ...query, conversations: query.data?.data ?? [] };
}

/** Total unread, for the tab badge. */
export function useUnreadCount() {
  const query = useQuery({
    queryKey: chatKeys.unread,
    queryFn: () => chatApi.unread(),
    refetchInterval: 30_000,
  });
  return query.data?.count ?? 0;
}

export function useThread(conversationId: string | undefined) {
  const query = useQuery({
    queryKey: chatKeys.thread(conversationId ?? ''),
    queryFn: () => chatApi.messages(conversationId!),
    enabled: !!conversationId,
    // Faster than the list: an open thread is where a reply is expected.
    refetchInterval: 8_000,
  });
  return { ...query, messages: query.data?.data ?? [] };
}

export function useParticipants(conversationId: string | undefined) {
  const query = useQuery({
    queryKey: chatKeys.participants(conversationId ?? ''),
    queryFn: () => chatApi.participants(conversationId!),
    enabled: !!conversationId,
  });
  return { ...query, participants: query.data?.data ?? [] };
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => chatApi.send(conversationId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.thread(conversationId) });
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
    },
  });
}

export function useOpenDirectChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => chatApi.openDirect(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
    },
  });
}

export function useCreateGroupChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ title, memberIds }: { title: string; memberIds: string[] }) =>
      chatApi.createGroup(title, memberIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
    },
  });
}

export function useMarkThreadRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => chatApi.markRead(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
      queryClient.invalidateQueries({ queryKey: chatKeys.unread });
    },
  });
}

export function useLeaveConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => chatApi.leave(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
    },
  });
}
