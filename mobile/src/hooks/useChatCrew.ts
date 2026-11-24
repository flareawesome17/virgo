import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { chatApi, queryKeys, type ConversationMessage, type GroupPatch } from '@/src/api';
import { chatKeys } from '@/src/hooks/useChat';

/**
 * Crew chats (phase 3): pinned messages, search inside a chat, opening a chat
 * at one message, group admins, and a job's crew chat.
 *
 * Every key sits under 'chat', so whatever refreshes chat refreshes these.
 */
export const crewKeys = {
  pins: (conversationId: string) => ['chat', 'pins', conversationId] as const,
  search: (conversationId: string, q: string) => ['chat', 'search', conversationId, q] as const,
  around: (conversationId: string, messageId: string) =>
    ['chat', 'around', conversationId, messageId] as const,
};

/** The chat's row and its people, wherever they are cached, after a group change. */
function refreshGroup(queryClient: QueryClient, conversationId: string): void {
  void queryClient.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) });
  void queryClient.invalidateQueries({ queryKey: chatKeys.participants(conversationId) });
  void queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
}

/**
 * The chat's pinned messages, newest pin first: the strip under the header
 * and the Pinned sheet. Kept for a minute; a `pins` frame refetches it when
 * somebody pins or takes one down.
 */
export function usePins(conversationId: string | undefined) {
  const query = useQuery({
    queryKey: crewKeys.pins(conversationId ?? ''),
    queryFn: () => chatApi.pins(conversationId!),
    enabled: !!conversationId,
    staleTime: 60_000,
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    pins: query.data?.data ?? [],
  };
}

/** Pins a message for everyone in the chat. A fourth needs `replace`; see isPinsFull. */
export function usePinMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, replace }: { messageId: string; replace?: string }) =>
      chatApi.pin(conversationId, messageId, replace),
    onSuccess: ({ pins }) => {
      queryClient.setQueryData(crewKeys.pins(conversationId), { data: pins, total: pins.length });
    },
  });
}

/** Takes a pin down, for everyone. */
export function useUnpinMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => chatApi.unpin(conversationId, messageId),
    onSuccess: ({ pins }) => {
      queryClient.setQueryData(crewKeys.pins(conversationId), { data: pins, total: pins.length });
    },
  });
}

/**
 * Searches one chat. Only once there is something to look for; the matches
 * are ids and times, newest first, to step through with the arrows.
 */
export function useChatSearch(conversationId: string | undefined, q: string) {
  const term = q.trim();
  const query = useQuery({
    queryKey: crewKeys.search(conversationId ?? '', term),
    queryFn: () => chatApi.search(conversationId!, term),
    enabled: !!conversationId && term.length > 0,
    staleTime: 30_000,
  });
  return {
    ...query,
    loadFailed: query.isError || query.isPaused,
    matches: query.data?.matches ?? [],
  };
}

/**
 * The messages around one — a search match or a pin — newest first, with
 * `hasNewer`. Its own cache, not the live thread's: the live thread carries on
 * underneath and is what the chat goes back to.
 */
export function useThreadAround(conversationId: string | undefined, messageId: string | null) {
  const query = useQuery({
    queryKey: crewKeys.around(conversationId ?? '', messageId ?? ''),
    queryFn: () => chatApi.messagesAround(conversationId!, messageId!),
    enabled: !!conversationId && !!messageId,
    staleTime: 30_000,
  });
  return {
    ...query,
    loadFailed: query.isError || query.isPaused,
    messages: (query.data?.data ?? []) as ConversationMessage[],
    hasNewer: query.data?.hasNewer ?? false,
  };
}

/** An admin takes somebody out of the group. */
export function useRemoveMember(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => chatApi.removeMember(conversationId, userId),
    onSuccess: () => refreshGroup(queryClient, conversationId),
  });
}

/** An admin makes somebody an admin, or stops them being one. */
export function useSetAdmin(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, admin }: { userId: string; admin: boolean }) =>
      chatApi.setAdmin(conversationId, userId, admin),
    onSuccess: () => refreshGroup(queryClient, conversationId),
  });
}

/** An admin changes the group's name, About, photo, or who can add people. */
export function useUpdateGroup(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: GroupPatch) => chatApi.updateGroup(conversationId, patch),
    onSuccess: () => refreshGroup(queryClient, conversationId),
  });
}

/**
 * Starts the crew chat for one of your job posts, or opens the one it has.
 * Answers with its id, to open it.
 */
export function useStartCrewChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => chatApi.startCrew(postId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
      // The job's page shows "Open crew chat" from now on.
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}
