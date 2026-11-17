import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi, queryKeys, type SendCardInput } from '@/src/api';
import { applyMessageEdited, chatKeys, insertThreadMessage } from '@/src/hooks/useChat';

/**
 * Shares a Virgo thing in a chat as a card: album photos, a booking, a job
 * post, a post, a package, or a date to plan.
 *
 * The caller makes the client id once per card (newClientId) and passes it
 * in, so a retry after a lost response stores one card, not two.
 *
 * The card goes straight into the open thread from the answer. The live
 * frame brings the same message and is dropped as a repeat; refetching the
 * thread for it would download every message again, which on a weak signal
 * is exactly the cost the chat avoids.
 */
export function useSendCard(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SendCardInput) => chatApi.sendCard(conversationId, input),
    onSuccess: (message, input) => {
      insertThreadMessage(queryClient, conversationId, message);
      void queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
      // A date is on the sender's Schedule now; album photos made (or reused)
      // a client link the album's Share screen lists.
      if (input.kind === 'date-plan') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.scheduleEvents.all });
      }
    },
  });
}

/**
 * Going, or can't go, to a date somebody planned in the chat. The answer is
 * the calendar's own: Going puts it on your Schedule, and the organiser is
 * told. The card comes back with everyone's answers, and goes to the rest of
 * the chat live.
 */
export function useAnswerDate(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, going }: { messageId: string; going: boolean }) =>
      chatApi.answerDate(conversationId, messageId, going),
    onSuccess: (message) => {
      applyMessageEdited(queryClient, conversationId, message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.scheduleEvents.all });
    },
  });
}
