import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  API_BASE_URL,
  CATEGORY_OF_TOPIC,
  getAccessToken,
  hydrateTokens,
  notificationsApi,
  queryKeys,
  type ConversationMessage,
  type NotificationSetting,
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
import { playAlert, primeSounds } from '@/lib/sounds';

/*
 * The one definition, imported rather than mirrored.
 *
 * This was a hand-kept copy of the server union, and a copy of a closed set
 * is a copy that goes stale: the TOPICS table below is exhaustive over it, so
 * a topic missing here silently opts out of type checking for the topic that
 * was added. Importing the shared type makes adding one on the server a
 * compile error in every client that has not handled it.
 */
import type { NotificationTopic } from '@/api';

type ServerEvent =
  | { type: 'ready'; userId: string }
  | { type: 'message'; conversationId: string; message: ConversationMessage }
  | { type: 'message-deleted'; conversationId: string; messageId: string; scope: 'me' | 'everyone' }
  | { type: 'read'; conversationId: string; userId: string; at: string }
  | { type: 'delivered'; conversationId: string; userId: string; at: string }
  | { type: 'conversation'; conversationId: string }
  // Ambient board change. Not a notification: nothing is addressed to you, so
  // it must not toast or buzz — it only marks the list and the badge stale.
  | { type: 'job-posted'; slug: string; at: string }
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
  {
    keys: readonly (readonly unknown[])[];
    /**
     * Where "View" goes.
     *
     * A function when the destination depends on what happened — an accepted
     * application carries the conversation it opened, and sending somebody to
     * a list instead is throwing away the one thing they want.
     */
    href?: string | ((data: Record<string, unknown> | undefined) => string);
  }
> = {
  'friend-request': { keys: [queryKeys.friends.all], href: '/network' },
  'friend-accepted': { keys: [queryKeys.friends.all], href: '/network' },
  'collaborator-invite': {
    keys: [queryKeys.collaborators.all, queryKeys.workspaces.all],
    href: '/workspaces',
  },
  // Albums too: someone leaving takes their access with them, and the
  // sharing on each album card says so.
  'collaborator-response': {
    keys: [queryKeys.collaborators.all, queryKeys.workspaces.all, queryKeys.albums.all],
    href: (data) =>
      typeof data?.workspaceId === 'string'
        ? `/workspaces/${data.workspaceId}?tab=members`
        : '/workspaces',
  },
  'event-invite': {
    keys: [queryKeys.scheduleEvents.all],
    href: '/schedule?tab=invites',
  },
  'event-response': { keys: [queryKeys.scheduleEvents.all], href: '/schedule' },
  'event-updated': { keys: [queryKeys.scheduleEvents.all], href: '/schedule' },
  'hire-enquiry': { keys: [queryKeys.hire.all], href: '/network?tab=enquiries' },
  // Accepting also creates a friendship and a conversation, so all three lists
  // are stale for the sender the moment this arrives.
  'hire-response': {
    keys: [queryKeys.hire.all, queryKeys.friends.all, ['chat']],
    href: '/network?tab=enquiries',
  },
  // Applications arrive on your own posts, so land on that tab rather than
  // the board — which is where a bare /jobs/mine opens.
  'job-application': {
    keys: [queryKeys.jobs.all],
    href: '/jobs/mine?tab=posted',
  },
  support: { keys: [queryKeys.support.all], href: '/support' },
  booking: {
    keys: [queryKeys.bookings.all],
    href: (data) =>
      typeof data?.bookingId === 'string'
        ? `/bookings/${data.bookingId}`
        : '/bookings',
  },
  // Accepting also connects the two and opens a chat.
  //
  // A function, because the destination depends on the outcome: an acceptance
  // carries the conversation it just opened and should go straight there,
  // while a shortlist or decline has nowhere better than the applicant's own
  // list. This used to be a constant pointing at /jobs/applications, which
  // redirects to the board — so somebody was told they got the job and then
  // shown a list of other jobs, with the conversation id sitting unread in
  // the payload.
  'job-response': {
    keys: [queryKeys.jobs.all, queryKeys.friends.all, ['chat']],
    href: (data) =>
      typeof data?.conversationId === 'string'
        ? `/chat/${data.conversationId}`
        : '/jobs/mine?tab=applications',
  },
  reminder: { keys: [queryKeys.reminders.all], href: '/schedule' },
  // These two exist on the server and were missing here, so their notifications
  // arrived without refreshing anything.
  // There is no /settings/billing; plans and what you are paying live here.
  billing: { keys: [['usage'], ['plans']], href: '/settings/plans' },
  retention: { keys: [queryKeys.albums.all], href: '/albums' },
  // The picks are on each file's row, so the album's grids are stale as well
  // as its counts.
  'client-picks': {
    keys: [queryKeys.albums.all, ['storage', 'files']],
    href: (data) =>
      typeof data?.albumId === 'string' ? `/albums/${data.albumId}?picked=1` : '/albums',
  },
  // Usage too: an offer is not a reward yet, but the Rewards page shows both
  // what is waiting and what the account currently gets.
  promo: { keys: [queryKeys.promos.all, ['usage']], href: '/rewards' },
  // Never arrives over the socket: announcements are aimed at a platform and
  // version, and a frame reaches every session an account has open. Listed
  // so the table stays complete; it reaches the list through the feed.
  'app-update': { keys: [] },
};

/**
 * Whether this kind of notification is switched on for desktop alerts.
 *
 * Read from the settings the socket prefetches when it starts. Not loaded yet
 * counts as on — the server's default too — because a missed alert is worse
 * than one the person had not got round to switching off.
 */
function wantsDesktopAlert(queryClient: QueryClient, topic: NotificationTopic): boolean {
  const settings = queryClient.getQueryData<{ data: NotificationSetting[] }>(
    queryKeys.notifications.settings,
  );
  const row = settings?.data.find((r) => r.category === CATEGORY_OF_TOPIC[topic]);
  return row?.desktop !== false;
}

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

  // Every topic, not one of them: the notification list holds all of these, so
  // it is stale by definition the moment any frame arrives. Outside the table
  // above because it is not a per-topic decision — putting it in each row is
  // how the next topic added would quietly leave the list behind.
  queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });

  const href =
    typeof topic?.href === 'function' ? topic.href(event.data) : topic?.href;

  toast(event.title, {
    description: event.body,
    action: href
      ? { label: 'View', onClick: () => (window.location.href = href) }
      : undefined,
  });

  // A reminder is a shoot about to start, which is a different kind of urgent
  // from somebody asking you a question — so it gets its own sound. Told apart
  // by ear, you know whether to look now without looking at all.
  playAlert(event.topic === 'reminder' ? 'event' : 'global');
  buzzForMessage();
  // The system alert follows the person's desktop switch for this kind. The
  // toast and the sound above do not: they are for someone already looking.
  if (wantsDesktopAlert(queryClient, event.topic)) {
    notifyMessage({
      title: event.title,
      body: event.body,
      // Keyed by topic so a run of invitations replaces itself rather than
      // stacking seven notifications the user has to dismiss one at a time.
      tag: event.topic,
      onClick: () => {
        if (href) window.location.href = href;
      },
    });
  }
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

    // Spends the session's first click on unlocking audio, because browsers
    // refuse to play until the user has interacted — which would otherwise
    // silence the first notification of every session, the one most likely to
    // matter.
    const unprime = primeSounds();

    // Which kinds this account wants as desktop alerts, fetched as the socket
    // starts so the first frame is already checked against them.
    void queryClient.prefetchQuery({
      queryKey: queryKeys.notifications.settings,
      queryFn: () => notificationsApi.settings(),
    });

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

          // Sound whenever somebody else writes, including while their thread
          // is open. It sat inside the `!looking` guard below and was silent
          // for exactly the case people test first — sitting in a chat waiting
          // for a reply. A banner for a message you are reading is noise; a
          // sound for one is how you know it landed without watching for it.
          // Still nothing for your own message: you know you sent it.
          if (!mine) playAlert('chat');

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
        case 'job-posted':
          // Silent on purpose. Somebody else posted a job; that is not an
          // event about you, so it marks the board and the badge stale and
          // does nothing else — no toast, no buzz.
          queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
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
      unprime();
      registerTypingSender(null);
      resetPresence();
      document.removeEventListener('visibilitychange', onVisible);
      if (retry) clearTimeout(retry);
      socket?.close();
      socketRef.current = null;
    };
  }, [enabled, user?.id, queryClient]);
}
