import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chatApi, type SendMessageInput, type Thread } from '@/src/api';
import { seedPresence } from '@/src/lib/presence-store';
import { buzzForMessage } from '@/src/lib/notifications';

export const chatKeys = {
  conversations: (q?: string) => ['chat', 'conversations', q ?? ''] as const,
  unread: ['chat', 'unread'] as const,
  thread: (id: string) => ['chat', 'thread', id] as const,
  participants: (id: string) => ['chat', 'participants', id] as const,
  /** Every conversation list, whatever the search term. */
  allConversations: ['chat', 'conversations'] as const,
};

/**
 * The conversation list, optionally filtered by a search term.
 *
 * Polled while the screen is open: there is no websocket, so a new message
 * would otherwise only appear on a manual refresh.
 *
 * Searching runs on the server rather than filtering the loaded page, so a
 * thread can be found by something said in it, not only by its name.
 * `placeholderData` keeps the previous results on screen while a new term
 * loads, so the list does not blink empty on every keystroke.
 */
export function useConversations(q?: string) {
  const term = q?.trim() || undefined;
  const query = useQuery({
    queryKey: chatKeys.conversations(term),
    queryFn: () => chatApi.conversations(term),
    // A slow safety net: the WebSocket delivers new messages, so this only
    // has to catch what a dropped connection missed.
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });
  // Seeds the presence store from the response. The socket only sends
  // *changes*, so without this a client that just opened shows every
  // contact as offline until one of them happens to connect.
  const conversations = query.data?.data ?? [];
  useEffect(() => {
    const known = conversations
      .filter((c) => c.otherUserId && c.otherOnline !== null)
      .map((c) => ({
        userId: c.otherUserId as string,
        online: c.otherOnline as boolean,
        lastSeenAt: c.otherLastSeenAt,
      }));
    if (known.length > 0) seedPresence(known);
  }, [conversations]);

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    conversations,
  };
}

/** Total unread, for the tab badge. */
/**
 * Total unread, for the tab badge.
 *
 * `enabled` is not optional decoration. Hooks cannot be called conditionally,
 * so `useMessageAlerts` gated its *effects* on the session while still calling
 * this — which meant a signed-out visitor on the public landing page fired an
 * authenticated request, and then repeated it every sixty seconds. From the
 * apex it is not even same-origin, so it failed CORS and put a red error in
 * the console of the one page most people ever see.
 */
export function useUnreadCount(enabled = true) {
  const query = useQuery({
    queryKey: chatKeys.unread,
    queryFn: () => chatApi.unread(),
    refetchInterval: 60_000,
    enabled,
  });
  return query.data?.count ?? 0;
}

/**
 * The conversation currently on screen.
 *
 * Module state rather than context: the only reader is the app-wide alert
 * watcher, which needs to know whether a new message is one the user is
 * already looking at. Threading that through a provider for one boolean would
 * be more plumbing than the question deserves.
 */
let openConversationId: string | null = null;

export function setOpenConversation(id: string | null): void {
  openConversationId = id;
}

export function getOpenConversation(): string | null {
  return openConversationId;
}

export function useThread(conversationId: string | undefined) {
  const query = useQuery({
    queryKey: chatKeys.thread(conversationId ?? ''),
    queryFn: () => chatApi.messages(conversationId!),
    enabled: !!conversationId,
    // The socket pushes new messages; this only backstops a dropped one.
    refetchInterval: 45_000,
  });

  /**
   * Frozen on first sight.
   *
   * The thread marks itself read on open, so the server's `lastReadAt` jumps
   * to now on the very next poll. Keeping the value from the first load is
   * what lets the "new messages" divider stay put while you read, instead of
   * vanishing eight seconds in.
   *
   * State set during render, not a ref: a ref written during render survives
   * a render React throws away, and state does not.
   */
  const [dividerAt, setDividerAt] = useState<{
    id: string | undefined;
    at: string | null;
  } | null>(null);
  if (query.data && dividerAt?.id !== conversationId) {
    setDividerAt({ id: conversationId, at: query.data.lastReadAt ?? null });
  }

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    messages: query.data?.data ?? [],
    lastReadAt: dividerAt?.at ?? null,
  };
}

export function useParticipants(conversationId: string | undefined) {
  const query = useQuery({
    queryKey: chatKeys.participants(conversationId ?? ''),
    queryFn: () => chatApi.participants(conversationId!),
    enabled: !!conversationId,
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    participants: query.data?.data ?? [],
  };
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageInput) => chatApi.send(conversationId, input),
    onSuccess: (message) => {
      // Written straight into the cache rather than waiting on a refetch: the
      // message is already stored, and a round trip's delay before it appears
      // reads as the app having lost it.
      queryClient.setQueryData<Thread>(chatKeys.thread(conversationId), (old) =>
        old && !old.data.some((m) => m.id === message.id)
          ? { ...old, data: [message, ...old.data] }
          : old,
      );
      queryClient.invalidateQueries({ queryKey: chatKeys.thread(conversationId) });
      queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
    },
  });
}

/**
 * Deletes a message, for yourself or for everyone.
 *
 * The thread is refetched rather than patched: 'everyone' turns the message
 * into a tombstone the server renders, and 'me' removes it, so the two
 * outcomes differ enough that guessing locally would be a second
 * implementation of the same rule.
 */
export function useDeleteMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      messageId,
      scope,
    }: {
      messageId: string;
      scope: 'me' | 'everyone';
    }) => chatApi.deleteMessage(conversationId, messageId, scope),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.thread(conversationId) });
      queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
      queryClient.invalidateQueries({ queryKey: chatKeys.unread });
    },
  });
}

export function useOpenDirectChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => chatApi.openDirect(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
    },
  });
}

export function useCreateGroupChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ title, memberIds }: { title: string; memberIds: string[] }) =>
      chatApi.createGroup(title, memberIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
    },
  });
}

export function useMarkThreadRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => chatApi.markRead(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
      queryClient.invalidateQueries({ queryKey: chatKeys.unread });
    },
  });
}

export function useLeaveConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => chatApi.leave(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
    },
  });
}

/**
 * The caller's own view of one conversation.
 *
 * Derived from the list rather than fetched separately: mute state and title
 * already ride along there, and a second endpoint returning the same row would
 * be one more thing to keep in step.
 */
export function useConversation(conversationId: string | undefined) {
  const { conversations, ...rest } = useConversations();
  return {
    ...rest,
    conversation: conversations.find((c) => c.id === conversationId) ?? null,
  };
}

export function useMuteConversation(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (minutes: number) => chatApi.mute(conversationId, minutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
    },
  });
}

export function useRenameConversation(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => chatApi.rename(conversationId, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
    },
  });
}

export function useAddConversationMember(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => chatApi.addMember(conversationId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.participants(conversationId) });
      queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
    },
  });
}

/** Removes the conversation from your list, and leaves it if it is a group. */
export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => chatApi.remove(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
      queryClient.invalidateQueries({ queryKey: chatKeys.unread });
    },
  });
}

/**
 * Buzzes the device when a message arrives while the app is open.
 *
 * The push channel covers the background case, but a foreground message never
 * produces a system notification — polling just drops it into the list — so
 * nothing would tell the user without this.
 *
 * Mounted once, app-wide, so a message announces itself from any screen.
 * A rise in the total is the signal; a fall (reading a thread) is not, and the
 * baseline is seeded from the first reading so opening the app with unread
 * messages already waiting does not buzz.
 */
export function useMessageAlerts(enabled: boolean): void {
  const unread = useUnreadCount(enabled);
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      previous.current = null;
      return;
    }
    const before = previous.current;
    previous.current = unread;

    if (before === null || unread <= before) return;
    // The thread on screen already shows the message and buzzes for itself.
    if (getOpenConversation()) return;

    void buzzForMessage();
  }, [enabled, unread]);
}
