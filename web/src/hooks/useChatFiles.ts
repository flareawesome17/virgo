import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '@/api';
import { chatKeys } from '@/hooks/useChat';
import { usageQueryKey } from '@/hooks/useUsage';

/**
 * Photos and files from your device (phase 4): what they use of your storage,
 * what you sent in a chat, taking them back, and filing one into an album.
 * Sending them is each app's own (the PUT differs); see deliverChatFile.
 *
 * Every key sits under 'chat', so whatever refreshes chat refreshes these.
 */
export const filesKeys = {
  usage: ['chat', 'files', 'usage'] as const,
  sent: (conversationId: string) => ['chat', 'files', 'sent', conversationId] as const,
  allSent: ['chat', 'files', 'sent'] as const,
};

/** What your chat photos and files use, and in which chats: the storage screen. */
export function useChatFilesUsage() {
  const query = useQuery({
    queryKey: filesKeys.usage,
    queryFn: () => chatApi.filesUsage(),
    staleTime: 60_000,
  });
  return { ...query, usage: query.data ?? null, loadFailed: query.isError || query.isPaused };
}

/** Your own photo and file messages in one chat, newest first. */
export function useSentFiles(conversationId: string | undefined) {
  const query = useQuery({
    queryKey: filesKeys.sent(conversationId ?? ''),
    queryFn: () => chatApi.sentFiles(conversationId!),
    enabled: !!conversationId,
  });
  return {
    ...query,
    messages: query.data?.data ?? [],
    loadFailed: query.isError || query.isPaused,
  };
}

/**
 * Takes back your own photo and file messages for everyone, from the
 * storage screen, freeing the room they used. Works in a chat you have left.
 */
export function useUnsendFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageIds: string[]) => chatApi.unsendFiles(messageIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: filesKeys.usage });
      void queryClient.invalidateQueries({ queryKey: filesKeys.allSent });
      void queryClient.invalidateQueries({ queryKey: usageQueryKey });
      void queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
    },
  });
}

/** Files a copy of a chat photo or PDF into one of your albums. */
export function useAddToAlbum(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { messageId: string; attachmentId: string; albumId: string }) =>
      chatApi.addToAlbum(conversationId, input.messageId, input.attachmentId, input.albumId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usageQueryKey });
    },
  });
}

/**
 * An hour's link that saves a photo or file under its own name. Asked for
 * when tapped, never ahead: it is a download.
 */
export function attachmentLink(conversationId: string, messageId: string, attachmentId: string) {
  return chatApi.attachmentLink(conversationId, messageId, attachmentId);
}
