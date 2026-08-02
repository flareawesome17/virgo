import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  API_BASE_URL,
  getAccessToken,
  hydrateTokens,
  type ConversationMessage,
  type Thread,
} from '@/src/api';
import { chatKeys, getOpenConversation } from '@/src/hooks/useChat';
import { useAuth } from '@/src/hooks/useAuth';
import { buzzForMessage } from '@/src/lib/notifications';

type ServerEvent =
  | { type: 'ready'; userId: string }
  | { type: 'message'; conversationId: string; message: ConversationMessage }
  | { type: 'message-deleted'; conversationId: string; messageId: string; scope: 'me' | 'everyone' }
  | { type: 'read'; conversationId: string; userId: string; at: string }
  | { type: 'delivered'; conversationId: string; userId: string; at: string }
  | { type: 'conversation'; conversationId: string };

/** http(s) -> ws(s), same host. */
function socketUrl(): string {
  return `${API_BASE_URL.replace(/^http/, 'ws')}/ws`;
}

/**
 * Live chat over a WebSocket.
 *
 * Polling still runs underneath — see useChat — but slowly. This is an
 * accelerator, not the source of truth: every event it delivers is something
 * the next poll would have fetched anyway, so a dropped connection degrades to
 * the old behaviour rather than losing messages.
 *
 * Mounted once, app-wide. React Native's WebSocket speaks the same protocol
 * as the browser's, so this is the web hook with two platform differences:
 * AppState instead of visibilitychange, and no OS notification (push already
 * covers the backgrounded case).
 */
export function useRealtime(enabled: boolean): void {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const socketRef = useRef<WebSocket | null>(null);
  /** Grows on each failed attempt, resets when a connection succeeds. */
  const backoff = useRef(1000);
  const stopped = useRef(false);

  useEffect(() => {
    if (!enabled || !user?.id) return;
    stopped.current = false;

    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const apply = (event: ServerEvent) => {
      switch (event.type) {
        case 'message': {
          // Written straight into the cache rather than invalidating: the point
          // is that it appears now, and a refetch is another round trip.
          queryClient.setQueryData<Thread>(
            chatKeys.thread(event.conversationId),
            (old) =>
              old && !old.data.some((m) => m.id === event.message.id)
                ? { ...old, data: [event.message, ...old.data] }
                : old,
          );
          queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
          queryClient.invalidateQueries({ queryKey: chatKeys.unread });

          const mine = event.message.sender_id === user.id;
          const looking = getOpenConversation() === event.conversationId;
          // The push notification covers a backgrounded app; this is the
          // foreground case, where no system notification is produced.
          if (!mine && !looking) void buzzForMessage();
          break;
        }
        case 'message-deleted':
        case 'read':
        case 'delivered':
          // Cheaper to refetch than to model each mutation twice: these change
          // derived state — ticks, counts — the server already computes.
          queryClient.invalidateQueries({
            queryKey: chatKeys.thread(event.conversationId),
          });
          queryClient.invalidateQueries({
            queryKey: chatKeys.participants(event.conversationId),
          });
          if (event.type !== 'read') {
            queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
          }
          break;
        case 'conversation':
          queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
          break;
      }
    };

    const schedule = () => {
      if (stopped.current) return;
      retry = setTimeout(
        () => {
          backoff.current = Math.min(backoff.current * 2, 30_000);
          void connect();
        },
        // Jittered, so a server restart does not bring every client back in
        // the same instant.
        backoff.current + Math.random() * 500,
      );
    };

    const connect = async () => {
      if (stopped.current) return;
      await hydrateTokens();
      const token = getAccessToken();
      if (!token) return;

      try {
        socket = new WebSocket(socketUrl());
      } catch {
        schedule();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        // Authentication is the first frame, not a query parameter: a token in
        // a URL ends up in proxy logs and browser history.
        socket?.send(JSON.stringify({ type: 'auth', token }));
      };

      socket.onmessage = (raw) => {
        let event: ServerEvent;
        try {
          event = JSON.parse(String(raw.data)) as ServerEvent;
        } catch {
          return;
        }
        if (event.type === 'ready') {
          backoff.current = 1000;
          return;
        }
        apply(event);
      };

      socket.onclose = (closeEvent) => {
        socketRef.current = null;
        // 4001 means the token was rejected. Reconnecting with the same one
        // would loop; the REST layer's refresh fixes the session and the next
        // mount reconnects.
        if (closeEvent.code === 4001 || stopped.current) return;
        schedule();
      };

      socket.onerror = () => socket?.close();
    };

    void connect();

    // An app returning from the background usually holds a socket the OS
    // tore down while it slept.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (socketRef.current?.readyState === WebSocket.OPEN) return;
      backoff.current = 1000;
      void connect();
    });

    return () => {
      stopped.current = true;
      subscription.remove();
      if (retry) clearTimeout(retry);
      socket?.close();
      socketRef.current = null;
    };
  }, [enabled, user?.id, queryClient]);
}
