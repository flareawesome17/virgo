import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  API_BASE_URL,
  authApi,
  getAccessToken,
  hydrateTokens,
  queryKeys,
  type ConversationMessage,
  type Thread,
} from '@/src/api';
import {
  chatKeys,
  getOpenConversation,
  isConversationMuted,
  noteLiveMessage,
} from '@/src/hooks/useChat';
import { useAuth } from '@/src/hooks/useAuth';
import {
  registerTypingSender,
  resetPresence,
  setPresence,
  setTyping,
} from '@/src/lib/presence-store';
import { buzzForMessage, setForegroundNotificationRule } from '@/src/lib/notifications';
import { loadSoundPreference, playAlert } from '@/src/lib/sounds';

/*
 * The one definition, imported rather than mirrored.
 *
 * This was a hand-kept copy of the server union, and a copy of a closed set
 * is a copy that goes stale: the TOPICS table below is exhaustive over it, so
 * a topic missing here silently opts out of type checking for the topic that
 * was added. Importing the shared type makes adding one on the server a
 * compile error in every client that has not handled it.
 */
import type { NotificationTopic } from '@/src/api';

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
 * What each topic makes stale.
 *
 * The screen showing it is already open often enough that refetching is the
 * whole job here — unlike the web, the OS notification is the push channel's
 * responsibility, not this hook's.
 */
const TOPIC_KEYS: Record<NotificationTopic, readonly (readonly unknown[])[]> = {
  // A profile carries your connection to its owner and both of your counts, so
  // every topic that changes a friendship refreshes the profiles too.
  'friend-request': [queryKeys.friends.all, queryKeys.publicProfiles.all, queryKeys.profile.page],
  'friend-accepted': [queryKeys.friends.all, queryKeys.publicProfiles.all, queryKeys.profile.page],
  'collaborator-invite': [queryKeys.collaborators.all, queryKeys.workspaces.all],
  'collaborator-response': [queryKeys.collaborators.all, queryKeys.workspaces.all],
  'event-invite': [queryKeys.scheduleEvents.all],
  'event-response': [queryKeys.scheduleEvents.all],
  'event-updated': [queryKeys.scheduleEvents.all],
  'hire-enquiry': [queryKeys.hire.all],
  // Accepting also creates a friendship and a conversation, so all three lists
  // are stale for the sender the moment this arrives.
  'hire-response': [
    queryKeys.hire.all,
    queryKeys.friends.all,
    ['chat'],
    queryKeys.publicProfiles.all,
    queryKeys.profile.page,
  ],
  'job-application': [queryKeys.jobs.all],
  support: [queryKeys.support.all],
  // Confirming or cancelling one moves the jobs-done count on your own page.
  booking: [queryKeys.bookings.all, queryKeys.profile.page],
  // Accepting also connects the two and opens a chat.
  'job-response': [
    queryKeys.jobs.all,
    queryKeys.friends.all,
    ['chat'],
    queryKeys.publicProfiles.all,
    queryKeys.profile.page,
  ],
  reminder: [queryKeys.reminders.all],
  // These two exist on the server and were missing here, so their notifications
  // arrived without refreshing anything.
  billing: [['me', 'usage'], ['plans']],
  retention: [queryKeys.albums.all],
  // The picks are on each file's row, so the album's grids are stale as well
  // as its counts.
  'client-picks': [queryKeys.albums.all, ['storage', 'files']],
  // Usage too: an offer is not a reward yet, but the Rewards screen shows both
  // what is waiting and what the account currently gets.
  promo: [queryKeys.promos.all, ['me', 'usage']],
  // Never arrives over the socket: announcements are aimed at a platform and
  // version, and a frame reaches every session an account has open. Listed
  // so the table stays complete; it reaches the list through the feed.
  'app-update': [],
};

function applyNotification(
  event: Extract<ServerEvent, { type: 'notification' }>,
  queryClient: QueryClient,
): void {
  for (const key of TOPIC_KEYS[event.topic] ?? []) {
    queryClient.invalidateQueries({ queryKey: key });
  }

  // Every topic, not one of them: the notification list holds all of these, so
  // it is stale by definition the moment any frame arrives. Outside the table
  // above because it is not a per-topic decision — putting it in each row is
  // how the next topic added would quietly leave the list behind.
  queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });

  // A buzz and a sound, not a local notification: the push for this is already
  // in flight, and posting one here would show the same thing twice.
  //
  // A reminder is a shoot about to start, which is a different kind of urgent
  // from somebody asking you a question — so it gets its own sound. Told apart
  // by ear, you know whether to look now without looking at all.
  playAlert(event.topic === 'reminder' ? 'event' : 'global');
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

  /*
   * What a message push does while the app is open.
   *
   * Every push showed its system banner and played its sound in the
   * foreground — over the chat it was about, while that chat was on screen,
   * and on top of the in-app chime for the same message. A message push now
   * makes no sound here (the chime is the sound), and shows no banner for the
   * open chat or a muted one.
   */
  useEffect(() => {
    setForegroundNotificationRule((data) => {
      if (data?.type !== 'message' || !data.conversationId) return null;
      const looking = getOpenConversation() === data.conversationId;
      const muted = isConversationMuted(queryClient, data.conversationId);
      return { banner: !looking && !muted, sound: false };
    });
    return () => setForegroundNotificationRule(null);
  }, [queryClient]);

  useEffect(() => {
    if (!enabled || !user?.id) return;
    stopped.current = false;

    // Read once, here, rather than on each frame: playAlert is called from the
    // socket handler and cannot await storage without putting the sound behind
    // the message it announces.
    void loadSoundPreference();

    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    /** The token a 4001 was answered for, so a refresh is tried once per token. */
    let refusedToken: string | null = null;

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
          const quiet = isConversationMuted(queryClient, event.conversationId);
          noteLiveMessage();
          // Sound whenever somebody else writes, including while their thread
          // is open. It sat inside the `!looking` guard below and was silent
          // for exactly the case people test first — sitting in a chat waiting
          // for a reply. Still nothing for your own message: you know you sent
          // it.
          if (!mine && !quiet) playAlert('chat');

          // The push notification covers a backgrounded app; this is the
          // foreground case, where no system notification is produced.
          if (!mine && !looking && !quiet) void buzzForMessage();
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

      /*
       * One socket at a time. Coming back to the app while a socket was still
       * connecting, or with a retry already scheduled, opened a second one —
       * and every message then arrived, chimed and buzzed twice. The old one
       * is closed with its handlers taken off, so its close does not schedule
       * yet another.
       */
      if (retry) {
        clearTimeout(retry);
        retry = undefined;
      }
      if (socket) {
        const previous = socket;
        previous.onopen = null;
        previous.onmessage = null;
        previous.onclose = null;
        previous.onerror = null;
        try {
          previous.close();
        } catch {
          // Already closed.
        }
        socket = null;
      }

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
          refusedToken = null;
          return;
        }
        apply(event);
      };

      socket.onclose = (closeEvent) => {
        socketRef.current = null;
        socket = null;
        if (stopped.current) return;
        if (closeEvent.code === 4001) {
          /*
           * The token was refused — it expired while the socket was down, most
           * often. Realtime used to stop there until something remounted it,
           * so a phone left open went quiet within fifteen minutes. An ordinary
           * request makes the client refresh the session; with a new token,
           * connect again. Once per token, so a refusal that is not about
           * expiry cannot loop, and a session that is really over is signed
           * out by the client as usual.
           */
          if (refusedToken === token) return;
          refusedToken = token;
          void authApi
            .me()
            .then(() => {
              if (!stopped.current && getAccessToken() && getAccessToken() !== token) {
                void connect();
              }
            })
            .catch(() => {
              // Offline or signed out: the next return to the app tries again.
            });
          return;
        }
        schedule();
      };

      socket.onerror = () => socket?.close();
    };

    void connect();

    // An app returning from the background usually holds a socket the OS
    // tore down while it slept.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const ready = socketRef.current?.readyState;
      // Connecting counts: a second connect here was the duplicate socket.
      if (ready === WebSocket.OPEN || ready === WebSocket.CONNECTING) return;
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
