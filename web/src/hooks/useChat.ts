import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import {
  ApiError,
  chatApi,
  chatRefusal,
  retryUnlessGone,
  type Conversation,
  type ConversationMessage,
  type SendMessageInput,
  type Thread,
} from '@/api';
import { seedPresence } from '@/lib/presence-store';
import { buzzForMessage, setUnreadTitle } from '@/lib/alerts';
import {
  loadOutbox,
  newClientId,
  outboxItems,
  removeFromOutbox,
  resetOutbox,
  updateOutbox,
  type OutboxItem,
} from '@/lib/outbox';

export const chatKeys = {
  conversations: (q?: string) => ['chat', 'conversations', q ?? ''] as const,
  unread: ['chat', 'unread'] as const,
  thread: (id: string) => ['chat', 'thread', id] as const,
  participants: (id: string) => ['chat', 'participants', id] as const,
  /** One conversation's row, fetched by id. */
  conversation: (id: string) => ['chat', 'conversation', id] as const,
  /** Every conversation list, whatever the search term. */
  allConversations: ['chat', 'conversations'] as const,
  /** Every conversation fetched by id. */
  anyConversation: ['chat', 'conversation'] as const,
};

/** What the list and the thread are cached as. */
export type ConversationPages = InfiniteData<{ data: Conversation[]; total: number }, number>;
export type ThreadPages = InfiniteData<Thread, string | undefined>;

/**
 * The list's page size.
 *
 * The API's default, so the first page is asked for with no paging
 * parameters at all and reads the same on an API that predates them.
 */
const LIST_PAGE = 100;
/** The thread's page size, the first page included. */
const THREAD_PAGE = 50;

/** The list rows and the by-id rows, both of which hold a title and mute state. */
export function invalidateConversationRows(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
  queryClient.invalidateQueries({ queryKey: chatKeys.anyConversation });
}

/** Every conversation row cached anywhere, list pages first. */
function cachedConversations(queryClient: QueryClient): Conversation[] {
  const rows: Conversation[] = [];
  for (const [, list] of queryClient.getQueriesData<ConversationPages>({
    queryKey: chatKeys.allConversations,
  })) {
    // A shape check, not just a cast: a cache written by an older build is
    // thrown away by the persister's buster, but nothing else promises it.
    if (!list || !Array.isArray(list.pages)) continue;
    for (const page of list.pages) rows.push(...(page?.data ?? []));
  }
  for (const [, row] of queryClient.getQueriesData<Conversation | null>({
    queryKey: chatKeys.anyConversation,
  })) {
    if (row && typeof row === 'object' && 'id' in row) rows.push(row);
  }
  return rows;
}

function findConversation(queryClient: QueryClient, id: string): Conversation | undefined {
  return cachedConversations(queryClient).find((c) => c.id === id);
}

/**
 * The conversation list, optionally filtered by a search term, a page at a
 * time.
 *
 * It was the newest 100 and nothing more: a chat past the hundredth could
 * only be found by searching for it.
 *
 * Searching runs on the server rather than filtering the loaded page, so a
 * thread can be found by something said in it, not only by its name.
 * `placeholderData` keeps the previous results on screen while a new term
 * loads, so the list does not blink empty on every keystroke.
 */
export function useConversations(q?: string) {
  const term = q?.trim() || undefined;
  const query = useInfiniteQuery({
    queryKey: chatKeys.conversations(term),
    queryFn: ({ pageParam }) =>
      chatApi.conversations(term, pageParam ? { limit: LIST_PAGE, offset: pageParam } : {}),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.data.length < LIST_PAGE ? undefined : pages.length * LIST_PAGE,
    // A slow safety net: the WebSocket delivers new messages, so this only
    // has to catch what a dropped connection missed.
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });

  const pages = query.data?.pages;
  const conversations = useMemo(() => {
    // Offset pages can overlap by a row when a conversation moves to the top
    // between two fetches; the first sighting wins.
    const seen = new Set<string>();
    const rows: Conversation[] = [];
    for (const page of pages ?? []) {
      for (const c of page.data) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        rows.push(c);
      }
    }
    return rows;
  }, [pages]);

  // Seeds the presence store from the response. The socket only sends
  // *changes*, so without this a client that just opened shows every
  // contact as offline until one of them happens to connect.
  useEffect(() => {
    const known = conversations
      .filter((c) => c.otherUserId && c.otherOnline !== null)
      .map((c) => ({
        userId: c.otherUserId as string,
        online: c.otherOnline as boolean,
        lastSeenAt: c.otherLastSeenAt,
      }));
    if (known.length > 0) seedPresence(known);
  }, [conversations]);

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    /** Nothing has arrived yet, so an empty list says nothing about the inbox. */
    loadingFirst: query.data === undefined && !query.isError && !query.isPaused,
    conversations,
  };
}

/**
 * Total unread, for the tab badge.
 *
 * `enabled` is not optional decoration. Hooks cannot be called conditionally,
 * so `useMessageAlerts` gated its *effects* on the session while still calling
 * this — which meant a signed-out visitor on the public landing page fired an
 * authenticated request, and then repeated it every sixty seconds. From the
 * apex it is not even same-origin, so it failed CORS and put a red error in
 * the console of the one page most people ever see.
 */
export function useUnreadCount(enabled = true) {
  const query = useQuery({
    queryKey: chatKeys.unread,
    queryFn: () => chatApi.unread(),
    refetchInterval: 60_000,
    enabled,
  });
  return query.data?.count ?? 0;
}

/**
 * The conversation currently on screen.
 *
 * Module state rather than context: the only readers are the alert watchers,
 * which need to know whether a new message is one the user is already looking
 * at. Threading that through a provider for one value would be more plumbing
 * than the question deserves.
 */
let openConversationId: string | null = null;

export function setOpenConversation(id: string | null): void {
  openConversationId = id;
}

export function getOpenConversation(): string | null {
  return openConversationId;
}

/** Marks this conversation as the one on screen while its thread is mounted. */
export function useOpenConversation(id: string | undefined): void {
  useEffect(() => {
    if (!id) return undefined;
    openConversationId = id;
    return () => {
      // Only if nothing else has claimed it since: the next thread's effect
      // can run before this one's cleanup.
      if (openConversationId === id) openConversationId = null;
    };
  }, [id]);
}

/**
 * Whether a conversation is muted, from whichever conversation rows are cached.
 *
 * Muting only reached push. In the browser a muted chat chimed and raised a
 * notification like any other, which is exactly what somebody muting a busy
 * group was trying to stop.
 */
export function isConversationMuted(queryClient: QueryClient, conversationId: string): boolean {
  const found = findConversation(queryClient, conversationId);
  if (!found) return false;
  return Boolean(found.muted) &&
    (!found.mutedUntil || new Date(found.mutedUntil).getTime() > Date.now());
}

/**
 * When the socket last delivered a message.
 *
 * It chimes, notifies or deliberately stays quiet for that message itself. The
 * unread count rising a moment later is the same message, and useMessageAlerts
 * alerting for it again was a second chime — or the only one, for a muted chat.
 */
let lastLiveMessageAt = 0;
export function noteLiveMessage(): void {
  lastLiveMessageAt = Date.now();
}

const newestFirst = (a: ConversationMessage, b: ConversationMessage) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

/**
 * Puts a message at the newest end of a cached thread, once.
 *
 * Whichever arrives first — the send's response or the socket's copy of it —
 * draws it; the other finds it there.
 */
export function insertThreadMessage(
  queryClient: QueryClient,
  conversationId: string,
  message: ConversationMessage,
): void {
  queryClient.setQueryData<ThreadPages>(chatKeys.thread(conversationId), (old) => {
    if (!old || !Array.isArray(old.pages) || old.pages.length === 0) return old;
    if (old.pages.some((p) => p.data.some((m) => m.id === message.id))) return old;
    const [first, ...rest] = old.pages;
    const data = [message, ...first.data];
    // Out of order only when two arrive crossed in flight.
    if (data.length > 1 && newestFirst(data[0], data[1]) > 0) data.sort(newestFirst);
    return { ...old, pages: [{ ...first, data }, ...rest] };
  });
}

/**
 * Changes or drops messages wherever they are in a cached thread — on the
 * first page or one loaded by scrolling back.
 *
 * Deleting refetched the thread, which was only ever the newest hundred, so a
 * message deleted further back stayed on screen with its text.
 */
export function patchThreadMessages(
  queryClient: QueryClient,
  conversationId: string,
  patch: (message: ConversationMessage) => ConversationMessage | null,
): void {
  queryClient.setQueryData<ThreadPages>(chatKeys.thread(conversationId), (old) => {
    if (!old || !Array.isArray(old.pages)) return old;
    let changed = false;
    const pages = old.pages.map((page) => {
      let pageChanged = false;
      const data: ConversationMessage[] = [];
      for (const m of page.data) {
        const next = patch(m);
        if (next !== m) pageChanged = true;
        if (next) data.push(next);
      }
      if (!pageChanged) return page;
      changed = true;
      return { ...page, data };
    });
    return changed ? { ...old, pages } : old;
  });
}

/** A message deleted for everyone, or hidden for you, as the thread shows it. */
export function applyMessageDeleted(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string,
  scope: 'me' | 'everyone',
): void {
  patchThreadMessages(queryClient, conversationId, (m) => {
    if (m.id === messageId) {
      return scope === 'me'
        ? null
        : { ...m, body: '', deleted_at: m.deleted_at ?? new Date().toISOString() };
    }
    // A reply quoting it now quotes a deleted message.
    if (scope === 'everyone' && m.reply_to_id === messageId && !m.reply_to_deleted) {
      return { ...m, reply_to_body: null, reply_to_deleted: true };
    }
    return m;
  });
}

/**
 * One conversation's messages, newest first, a page at a time.
 *
 * It was one query for the newest hundred. Each new message pushed the oldest
 * of them out of the window and off the screen, and nothing older could be
 * reached at all. An infinite query refetches its pages from the newest one
 * down, each cursor taken from the page before, so there is no seam to lose a
 * message in.
 */
export function useThread(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: chatKeys.thread(conversationId ?? ''),
    queryFn: ({ pageParam }) => chatApi.messages(conversationId!, THREAD_PAGE, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.data.length < THREAD_PAGE ? undefined : last.data[last.data.length - 1]?.id,
    enabled: !!conversationId,
    // A deleted conversation, or one you were removed from, is an answer.
    retry: retryUnlessGone,
    // The socket pushes new messages; this only backstops a dropped one.
    refetchInterval: 45_000,
  });

  // Leaving keeps only the newest page, so coming back is one request rather
  // than one per page scrolled through last time.
  useEffect(() => {
    if (!conversationId) return undefined;
    return () => {
      queryClient.setQueryData<ThreadPages>(chatKeys.thread(conversationId), (old) =>
        old && Array.isArray(old.pages) && old.pages.length > 1
          ? { pages: old.pages.slice(0, 1), pageParams: old.pageParams.slice(0, 1) }
          : old,
      );
    };
  }, [conversationId, queryClient]);

  const first = query.data?.pages[0];
  const pages = query.data?.pages;
  const messages = useMemo(() => {
    const seen = new Set<string>();
    const rows: ConversationMessage[] = [];
    for (const page of pages ?? []) {
      for (const m of page.data) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        rows.push(m);
      }
    }
    return rows;
  }, [pages]);

  /**
   * Frozen on first sight.
   *
   * The thread marks itself read on open, so the server's `lastReadAt` jumps
   * to now on the very next fetch. Keeping the value from the first load is
   * what lets the "new messages" divider stay put while you read, instead of
   * vanishing eight seconds in.
   *
   * State set during render, not a ref: a ref written during render survives
   * a render React throws away, and state does not.
   */
  const [dividerAt, setDividerAt] = useState<{
    id: string | undefined;
    at: string | null;
  } | null>(null);
  if (first && dividerAt?.id !== conversationId) {
    setDividerAt({ id: conversationId, at: first.lastReadAt ?? null });
  }

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    /** Every loaded message, newest first. */
    messages,
    lastReadAt: dividerAt?.at ?? null,
    // True when the field is missing: an API from before blocking — a rolled
    // back one, say — sends none of these and never freezes a thread.
    canSend: first?.canSend ?? true,
    blockedByMe: first?.blockedByMe ?? false,
    blockId: first?.blockId ?? null,
  };
}

export function useParticipants(conversationId: string | undefined) {
  const query = useQuery({
    queryKey: chatKeys.participants(conversationId ?? ''),
    queryFn: () => chatApi.participants(conversationId!),
    enabled: !!conversationId,
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    participants: query.data?.data ?? [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sending
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether the API takes a client id. Assumed until it says otherwise: an API
 * from before the field refuses any request that has it, and the send is
 * then repeated without one for the rest of the session.
 */
let serverTakesClientId = true;

function refusesClientId(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 400) return false;
  try {
    return JSON.stringify(err.body ?? err.message).includes('clientId should not exist');
  } catch {
    return false;
  }
}

/** A failure worth trying again by itself: no answer, or the server falling over. */
function isTransient(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500;
}

async function post(item: OutboxItem): Promise<ConversationMessage> {
  const input: SendMessageInput = {
    body: item.body,
    replyToId: item.replyToId,
    mentionIds: item.mentionIds,
  };
  if (!serverTakesClientId) return chatApi.send(item.conversationId, input);
  try {
    return await chatApi.send(item.conversationId, { ...input, clientId: item.clientId });
  } catch (err) {
    if (!refusesClientId(err)) throw err;
    serverTakesClientId = false;
    return chatApi.send(item.conversationId, input);
  }
}

const inFlight = new Set<string>();
let flushing: Promise<void> | null = null;
let flushAgain = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

/** One attempt at one message. True when it went, or will never go by itself. */
async function deliver(queryClient: QueryClient, item: OutboxItem): Promise<boolean> {
  inFlight.add(item.clientId);
  updateOutbox(item.clientId, { status: 'sending', attempts: item.attempts + 1 });
  try {
    const message = await post(item);
    // Into the cache before the bubble goes, so there is never a gap
    // between the two.
    insertThreadMessage(queryClient, item.conversationId, message);
    removeFromOutbox(item.clientId);
    invalidateConversationRows(queryClient);
    return true;
  } catch (err) {
    if (chatRefusal(err)) {
      // The thread on screen is out of date: it still offers a composer the
      // server will no longer accept. Refetching it is what swaps the
      // composer for the notice, and the participants carry who is blocked.
      updateOutbox(item.clientId, { status: 'refused' });
      queryClient.invalidateQueries({ queryKey: chatKeys.thread(item.conversationId) });
      queryClient.invalidateQueries({ queryKey: chatKeys.participants(item.conversationId) });
      invalidateConversationRows(queryClient);
      return true;
    }
    if (isTransient(err)) {
      updateOutbox(item.clientId, { status: 'waiting' });
      return false;
    }
    // Answered, and not with a yes: kept for a click, not retried by itself.
    updateOutbox(item.clientId, { status: 'failed' });
    return true;
  } finally {
    inFlight.delete(item.clientId);
  }
}

/**
 * Sends everything queued, oldest first, one at a time.
 *
 * In order, so three lines written offline arrive as they were written. A
 * network failure stops the run — the next one would fail the same way — and
 * schedules another try on a backoff. Coming back online, returning to the
 * tab and the socket reconnecting each start a run straight away.
 */
export function flushOutbox(queryClient: QueryClient): Promise<void> {
  if (flushing) {
    flushAgain = true;
    return flushing;
  }
  clearTimeout(retryTimer);
  flushing = (async () => {
    do {
      flushAgain = false;
      const queue = outboxItems()
        .filter(
          (i) => (i.status === 'sending' || i.status === 'waiting') && !inFlight.has(i.clientId),
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const [index, item] of queue.entries()) {
        const settled = await deliver(queryClient, item);
        if (!settled) {
          // The ones behind it wait with it, and say so, rather than going on
          // reading "Sending…" while nothing is being sent.
          for (const behind of queue.slice(index + 1)) {
            if (!inFlight.has(behind.clientId)) updateOutbox(behind.clientId, { status: 'waiting' });
          }
          retryTimer = setTimeout(
            () => void flushOutbox(queryClient),
            Math.min(2000 * 2 ** Math.min(item.attempts + 1, 5), 60_000),
          );
          return;
        }
      }
    } while (flushAgain);
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/**
 * One send, outside the queue.
 *
 * The thread queues through the outbox instead, which survives the route and
 * the connection. This stays for anything that sends once and handles its
 * own failure, and it still carries a client id, so a retry by its caller is
 * not stored twice.
 */
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageInput) =>
      post({
        clientId: input.clientId ?? newClientId(),
        conversationId,
        body: input.body,
        replyToId: input.replyToId,
        mentionIds: input.mentionIds ?? [],
        status: 'sending',
        createdAt: new Date().toISOString(),
        attempts: 0,
      }),
    onSuccess: (message) => {
      insertThreadMessage(queryClient, conversationId, message);
      invalidateConversationRows(queryClient);
    },
  });
}

/** Sends one message now: a click on a failed bubble. */
export function retryOutboxItem(queryClient: QueryClient, clientId: string): void {
  updateOutbox(clientId, { status: 'sending' });
  void flushOutbox(queryClient);
}

/**
 * Keeps the queue moving. Mounted once, with the session.
 *
 * Loads what was left unsent last time, and sends whatever is waiting the
 * moment there is a connection to send it on.
 */
export function useOutboxSender(userId: string | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) {
      resetOutbox();
      return undefined;
    }
    loadOutbox(userId);
    void flushOutbox(queryClient);

    const onOnline = () => void flushOutbox(queryClient);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void flushOutbox(queryClient);
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(retryTimer);
    };
  }, [userId, queryClient]);
}

/**
 * Deletes a message, for yourself or for everyone.
 *
 * Patched into whichever page holds it rather than refetched: the message may
 * be on a page scrolled back to, and refetching every page to change one row
 * is the slow way round.
 */
export function useDeleteMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      messageId,
      scope,
    }: {
      messageId: string;
      scope: 'me' | 'everyone';
    }) => chatApi.deleteMessage(conversationId, messageId, scope),
    onSuccess: (_result, { messageId, scope }) => {
      applyMessageDeleted(queryClient, conversationId, messageId, scope);
      invalidateConversationRows(queryClient);
      queryClient.invalidateQueries({ queryKey: chatKeys.unread });
    },
  });
}

export function useOpenDirectChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => chatApi.openDirect(userId),
    onSuccess: () => {
      invalidateConversationRows(queryClient);
    },
  });
}

export function useCreateGroupChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ title, memberIds }: { title: string; memberIds: string[] }) =>
      chatApi.createGroup(title, memberIds),
    onSuccess: () => {
      invalidateConversationRows(queryClient);
    },
  });
}

export function useMarkThreadRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => chatApi.markRead(conversationId),
    onSuccess: (_result, conversationId) => {
      // The row's count goes to zero now rather than on the refetch, so the
      // list beside the thread does not show it unread for a moment.
      queryClient.setQueriesData<ConversationPages>(
        { queryKey: chatKeys.allConversations },
        (old) =>
          old && Array.isArray(old.pages)
            ? {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  data: page.data.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
                })),
              }
            : old,
      );
      invalidateConversationRows(queryClient);
      queryClient.invalidateQueries({ queryKey: chatKeys.unread });
    },
  });
}

export function useLeaveConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => chatApi.leave(conversationId),
    onSuccess: () => {
      invalidateConversationRows(queryClient);
      // Its unread messages stop being yours to read.
      queryClient.invalidateQueries({ queryKey: chatKeys.unread });
    },
  });
}

/**
 * The caller's own view of one conversation: title, mute state, group or not.
 *
 * Fetched by id, with whatever row a list already holds shown meanwhile. It
 * was only ever looked up in the first page of the list, so a thread opened
 * from a profile or a notification, if it was not among the newest hundred,
 * had no title and no mute state at all.
 */
export function useConversation(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: chatKeys.conversation(conversationId ?? ''),
    queryFn: async (): Promise<Conversation | null> => {
      try {
        return await chatApi.conversation(conversationId!);
      } catch (err) {
        // An API from before the endpoint answers 404 for every id; the
        // lists are then the only place the row can come from. On a current
        // one a 404 means you are not in it, and the lists agree.
        if (err instanceof ApiError && err.status === 404) {
          return findConversation(queryClient, conversationId!) ?? null;
        }
        throw err;
      }
    },
    enabled: !!conversationId,
    placeholderData: () =>
      conversationId ? findConversation(queryClient, conversationId) : undefined,
    retry: retryUnlessGone,
  });
  return {
    ...query,
    conversation: query.data ?? null,
  };
}

export function useMuteConversation(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (minutes: number) => chatApi.mute(conversationId, minutes),
    onSuccess: () => {
      invalidateConversationRows(queryClient);
      // A muted chat no longer counts towards the badge.
      queryClient.invalidateQueries({ queryKey: chatKeys.unread });
    },
  });
}

export function useRenameConversation(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => chatApi.rename(conversationId, title),
    onSuccess: () => {
      invalidateConversationRows(queryClient);
    },
  });
}

export function useAddConversationMember(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => chatApi.addMember(conversationId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.participants(conversationId) });
      invalidateConversationRows(queryClient);
    },
  });
}

/** Removes the conversation from your list, and leaves it if it is a group. */
export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => chatApi.remove(conversationId),
    onSuccess: () => {
      invalidateConversationRows(queryClient);
      queryClient.invalidateQueries({ queryKey: chatKeys.unread });
    },
  });
}

/**
 * Announces a message that arrives while the app is open.
 *
 * A browser tab is usually not the window you are looking at, so the unread
 * count goes in the page title — the one signal that needs no permission and
 * is visible from another tab. An OS notification and a buzz are layered on
 * where the browser allows them.
 *
 * Mounted once, app-wide, so a message announces itself from any route. A rise
 * in the total is the signal; a fall (reading a thread) is not, and the
 * baseline is seeded from the first reading so arriving with unread messages
 * already waiting does not fire an alert for old news.
 */
export function useMessageAlerts(enabled: boolean): void {
  const unread = useUnreadCount(enabled);
  const previous = useRef<number | null>(null);
  // Each route now sets its own title through a metadata export, which
  // replaces the whole string — count included — on every navigation. Reacting
  // to the path puts the count back on the new page's name.
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled) return;
    setUnreadTitle(unread);
    // Again on the next frame. On a navigation this effect can run before Next
    // has written the new route's title, and that write would drop the prefix;
    // re-applying after the frame lands on top of it. Without this the count
    // followed some navigations and not others. It is not load-bearing either
    // way — the unread query polls, so a missed one corrects itself shortly —
    // but "usually immediately" beats "eventually".
    const frame = requestAnimationFrame(() => setUnreadTitle(unread));
    return () => cancelAnimationFrame(frame);
  }, [enabled, unread, pathname]);

  useEffect(() => {
    if (!enabled) {
      previous.current = null;
      return;
    }
    const before = previous.current;
    previous.current = unread;

    if (before === null || unread <= before) return;
    // The thread on screen already shows the message and alerts for itself.
    if (getOpenConversation()) return;
    // The socket already dealt with it (see noteLiveMessage).
    if (Date.now() - lastLiveMessageAt < 15_000) return;

    buzzForMessage();
  }, [enabled, unread]);
}
