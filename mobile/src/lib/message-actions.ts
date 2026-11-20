import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { chatApi } from '@/src/api';
import { chatKeys, flushOutbox, getOpenConversation } from '@/src/hooks/useChat';
import { addToOutbox, outboxItems } from '@/src/lib/outbox';
import {
  dismissNotification,
  onMessageAction,
  type MessageAction,
} from '@/src/lib/notifications';

/**
 * A reply's message id, the same every time for one notification: a reply
 * delivered twice (the app woken for it, then opened) is stored once.
 *
 * Shaped as a v4 uuid, which the server's client id is. Not a secret, so a
 * plain string hash will do.
 */
export function replyClientId(notificationId: string): string {
  const words: number[] = [];
  for (let seed = 0; seed < 4; seed++) {
    // FNV-1a, a different start for each 32 bits.
    let h = (0x811c9dc5 ^ (seed * 0x9e3779b9)) >>> 0;
    for (let i = 0; i < notificationId.length; i++) {
      h ^= notificationId.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    words.push(h);
  }
  const hex = words.map((w) => w.toString(16).padStart(8, '0')).join('');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function run(queryClient: QueryClient, action: MessageAction): Promise<void> {
  try {
    if (action.kind === 'reply') {
      const body = action.text.trim().slice(0, 4000);
      if (body) {
        const clientId = action.notificationId
          ? replyClientId(`${action.notificationId}:reply`)
          : null;
        // Through the outbox, which is written down: if the phone lets the
        // app sleep before the reply is through, it goes on the next open.
        if (!clientId || !outboxItems().some((i) => i.clientId === clientId)) {
          addToOutbox({
            clientId: clientId ?? replyClientId(`${Date.now()}:${Math.random()}`),
            conversationId: action.conversationId,
            body,
            mentionIds: [],
            status: 'sending',
            createdAt: new Date().toISOString(),
            attempts: 0,
          });
        }
        await flushOutbox(queryClient);
      }
      // Answering is reading.
      await chatApi.markRead(action.conversationId).catch(() => undefined);
      // On Android, Reply opened the app (see ensureMessageCategory): it
      // opens on the chat that was answered.
      if (Platform.OS === 'android' && action.conversationId !== getOpenConversation()) {
        router.push(`/chat/${action.conversationId}`);
      }
    } else if (action.kind === 'read') {
      await chatApi.markRead(action.conversationId);
    } else {
      await chatApi.mute(action.conversationId, 60);
    }
  } catch {
    // Offline, or the chat is gone: the notification stays, which says it
    // didn't happen. A reply is in the outbox regardless.
    return;
  } finally {
    void queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
    void queryClient.invalidateQueries({ queryKey: chatKeys.unread });
    void queryClient.invalidateQueries({ queryKey: chatKeys.conversation(action.conversationId) });
  }
  await dismissNotification(action.notificationId);
}

/**
 * Acts on the buttons under a message's notification: Reply, Mark as read,
 * Mute for 1 hour. Mounted once, with the session, beside the outbox sender.
 */
export function useMessageNotificationActions(enabled: boolean): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return undefined;
    return onMessageAction((action) => void run(queryClient, action));
  }, [enabled, queryClient]);
}
