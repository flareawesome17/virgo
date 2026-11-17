import { useCallback, useRef } from 'react';
import type { SendCardInput } from '@/src/api';
import { useSendCard } from '@/src/hooks/useChatCards';
import { newClientId } from '@/src/lib/outbox';
import { cardSendError } from './card-words';

/**
 * Sends a card, with one client id per card: a second try at the same thing
 * after a lost answer carries the same id, so the server keeps one card, not
 * two. Something different — another selection, a changed date — is a new
 * card and gets a new id.
 *
 * Failures come back as plain words for a toast.
 */
export function useCardSender(conversationId: string) {
  const mutation = useSendCard(conversationId);
  const { mutate } = mutation;
  const ids = useRef(new Map<string, string>());

  const send = useCallback(
    (input: SendCardInput, handlers: { onSuccess?: () => void; onError?: (words: string) => void } = {}) => {
      const key = JSON.stringify({ ...input, clientId: null });
      let clientId = ids.current.get(key);
      if (!clientId) {
        clientId = newClientId();
        ids.current.set(key, clientId);
      }
      mutate(
        { ...input, clientId },
        {
          onSuccess: () => {
            ids.current.delete(key);
            handlers.onSuccess?.();
          },
          onError: (err) => handlers.onError?.(cardSendError(err, input.kind)),
        },
      );
    },
    [mutate],
  );

  return { send, isPending: mutation.isPending, sending: mutation.isPending ? mutation.variables : undefined };
}
