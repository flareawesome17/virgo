import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  API_BASE_URL,
  getAccessToken,
  hydrateTokens,
  queryKeys,
  type ConversationMessage,
  type Thread,
} from '@/src/api';
import { chatKeys, getOpenConversation } from '@/src/hooks/useChat';
import { useAuth } from '@/src/hooks/useAuth';
import {
  registerTypingSender,
  resetPresence,
  setPresence,
  setTyping,
} from '@/src/lib/presence-store';
import { buzzForMessage } from '@/src/lib/notifications';

/** Mirrors NotificationTopic on the server. */
type NotificationTopic =
  | 'friend-request'
  | 'friend-accepted'
  | 'collaborator-invite'
  | 'collaborator-response'
  | 'event-invite'
  | 'event-response'
  | 'hire-enquiry'
  | 'hire-response'
  | 'job-application'
  | 'job-response'
  | 'reminder'
  | 'billing'
  | 'retention';

type ServerEvent =
  | { type: 'ready'; userId: string }
  | { type: 'message'; conversationId: string; message: ConversationMessage }
  | { type: 'message-deleted'; conversationId: string; messageId: string; scope: 'me' | 'everyone' }
  | { type: 'read'; conversationId: string; userId: string; at: string }
  | { type: 'delivered'; conversationId: string; userId: string; at: string }
  | { type: 'conversation'; conversationId: string }
  | { type: 'presence'; userId: string; online: boolean; lastSeenAt: string | null }
  | {
      type: 'typing';
      conversationId: string;
      userId: string;
      name: string;
      typing: boolean;
    }
  | {
      type: 'notification';
      topic: NotificationTopic;
      title: string;
      body: string;
      data: Record<string, unknown>;
      at: string;
    };

/**
 * What each topic makes stale.
 *
 * The screen showing it is already open often enough that refetching is the
 * whole job here — unlike the web, the OS notification is the push channel's
 * responsibility, not this hook's.
 */
const TOPIC_KEYS: Record<NotificationTopic, readonly (readonly unknown[])[]> = {
  'friend-request': [queryKeys.friends.all],
  'friend-accepted': [queryKeys.friends.all],
  'collaborator-invite': [queryKeys.collaborators.all, queryKeys.workspaces.all],
  'collaborator-response': [queryKeys.collaborators.all, queryKeys.workspaces.all],
  'event-invite': [queryKeys.scheduleEvents.all],
  'event-response': [queryKeys.scheduleEvents.all],
  'hire-enquiry': [queryKeys.hire.all],
  // Accepting also creates a friendship and a conversation, so all three lists
  // are stale for the sender the moment this arrives.
  'hire-response': [queryKeys.hire.all, queryKeys.friends.all, ['chat']],
  'job-application': [queryKeys.jobs.all],
  // Accepting also connects the two and opens a chat.
  'job-response': [queryKeys.jobs.all, queryKeys.friends.all, ['chat']],
  reminder: [queryKeys.reminders.all],
  // These two exist on the server and were missing here, so their notifications
  // arrived without refreshing anything.
  billing: [['usage'], ['plans']],
  retention: [queryKeys.albums.all],
};

function applyNotification(
  event: Extract<ServerEvent, { type: 'notification' }>,
  queryClient: QueryClient,
): void {
  for (const key of TOPIC_KEYS[event.topic] ?? []) {
    queryClient.invalidateQueries({ queryKey: key });
  }
  // A buzz, not a local notification: the push for this is already in flight,
  // and posting one here would show the same thing twice.
  void buzzForMessage();
}

/** http(s) -> ws(s), same host. */
function socketUrl(): string {
  return `${API_BASE_URL.replace(/^http/, 'ws')}/ws`;
}

/**
 * Live chat and notifications over a WebSocket.
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
        case 'presence':
          // Straight into the store, not React Query: presence is a
          // stream of deltas about people, not a cached resource.
          setPresence(event.userId, event.online, event.lastSeenAt);
          break;
        case 'typing':
          setTyping(event.conversationId, event.userId, event.name, event.typing);
          break;
        case 'notification':
          applyNotification(event, queryClient);
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

      // The composer needs a way to say "still typing". Registered here
      // rather than exported, so it always points at the socket that is
      // actually open — a stale reference would silently send nothing.
      registerTypingSender((conversationId, isTyping) => {
        if (socket?.readyState !== 1) return;
        socket.send(JSON.stringify({ type: 'typing', conversationId, typing: isTyping }));
      });

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
      registerTypingSender(null);
      resetPresence();
      subscription.remove();
      if (retry) clearTimeout(retry);
      socket?.close();
      socketRef.current = null;
    };
  }, [enabled, user?.id, queryClient]);
}
