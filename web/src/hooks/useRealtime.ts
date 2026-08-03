import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  API_BASE_URL,
  getAccessToken,
  hydrateTokens,
  queryKeys,
  type ConversationMessage,
  type Thread,
} from '@/api';
import { chatKeys, getOpenConversation } from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';
import {
  registerTypingSender,
  resetPresence,
  setPresence,
  setTyping,
} from '@/lib/presence-store';
import { buzzForMessage, notifyMessage } from '@/lib/alerts';

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
 * What each topic makes stale, and where its notification leads.
 *
 * A table rather than a switch because the two are the same decision: a
 * notification the user can act on has a screen to act on it from, and that
 * screen's data is exactly what needs refetching.
 */
const TOPICS: Record<
  NotificationTopic,
  { keys: readonly (readonly unknown[])[]; href?: string }
> = {
  'friend-request': { keys: [queryKeys.friends.all], href: '/network' },
  'friend-accepted': { keys: [queryKeys.friends.all], href: '/network' },
  'collaborator-invite': {
    keys: [queryKeys.collaborators.all, queryKeys.workspaces.all],
    href: '/network',
  },
  'collaborator-response': {
    keys: [queryKeys.collaborators.all, queryKeys.workspaces.all],
    href: '/network',
  },
  'event-invite': {
    keys: [queryKeys.scheduleEvents.all],
    href: '/schedule?tab=invites',
  },
  'event-response': { keys: [queryKeys.scheduleEvents.all], href: '/schedule' },
  'hire-enquiry': { keys: [queryKeys.hire.all], href: '/network?tab=enquiries' },
  // Accepting also creates a friendship and a conversation, so all three lists
  // are stale for the sender the moment this arrives.
  'hire-response': {
    keys: [queryKeys.hire.all, queryKeys.friends.all, ['chat']],
    href: '/network?tab=enquiries',
  },
  reminder: { keys: [queryKeys.reminders.all], href: '/schedule' },
  // These two exist on the server and were missing here, so their notifications
  // arrived without refreshing anything.
  billing: { keys: [['usage'], ['plans']], href: '/settings/billing' },
  retention: { keys: [queryKeys.albums.all], href: '/albums' },
};

/**
 * Shows a notification and refreshes whatever it invalidated.
 *
 * Both surfaces, deliberately: a toast for someone looking at the tab, and an
 * OS notification for someone who is not — notifyMessage already stays quiet
 * when the tab is visible, so the two never double up.
 */
function applyNotification(
  event: Extract<ServerEvent, { type: 'notification' }>,
  queryClient: QueryClient,
): void {
  const topic = TOPICS[event.topic];
  for (const key of topic?.keys ?? []) {
    queryClient.invalidateQueries({ queryKey: key });
  }

  toast(event.title, {
    description: event.body,
    action: topic?.href
      ? { label: 'View', onClick: () => (window.location.href = topic.href!) }
      : undefined,
  });

  buzzForMessage();
  notifyMessage({
    title: event.title,
    body: event.body,
    // Keyed by topic so a run of invitations replaces itself rather than
    // stacking seven notifications the user has to dismiss one at a time.
    tag: event.topic,
    onClick: () => {
      if (topic?.href) window.location.href = topic.href;
    },
  });
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
 * Mounted once, app-wide.
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
          if (!mine && !looking) {
            buzzForMessage();
            notifyMessage({
              title: event.message.sender_name ?? 'New message',
              body: event.message.body,
              tag: event.conversationId,
              onClick: () => {
                window.location.href = `/chat/${event.conversationId}`;
              },
            });
          }
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

    // A tab woken from the background may hold a socket the OS already killed.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (socketRef.current?.readyState === WebSocket.OPEN) return;
      backoff.current = 1000;
      void connect();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped.current = true;
      registerTypingSender(null);
      resetPresence();
      document.removeEventListener('visibilitychange', onVisible);
      if (retry) clearTimeout(retry);
      socket?.close();
      socketRef.current = null;
    };
  }, [enabled, user?.id, queryClient]);
}
