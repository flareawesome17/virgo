import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '@/api';
import { newClientId } from '@/lib/outbox';
import { chatKeys } from '@/hooks/useChat';

/**
 * Sends one of your ways to pay as a card in a chat, optionally for one of
 * your packages. The card arrives in an open thread live, like any message;
 * the thread and the list are refetched for a chat that is not open.
 *
 * One client id per send, so a retry after a lost response stores one card.
 */
export function useSendPayCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      conversationId,
      payMethodId,
      packageId,
    }: {
      conversationId: string;
      payMethodId: string;
      packageId?: string;
    }) => chatApi.sendPayCard(conversationId, { payMethodId, packageId, clientId: newClientId() }),
    onSuccess: (_message, { conversationId }) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.thread(conversationId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
    },
  });
}
