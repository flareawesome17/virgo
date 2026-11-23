import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
  firstPageSize,
  linkPreviewsApi,
  retryUnlessGone,
  savedRepliesApi,
  shouldPollChat,
  type Conversation,
  type ConversationList,
  type ConversationMessage,
  type LinkPreview,
  type ListStatePatch,
  type MessageReaction,
  type ReactionKey,
  type SavedReply,
  type SendMessageInput,
  type Thread,
} from '@/api';
import { toast } from 'sonner';
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
import { readConnectionQuality } from '@/components/chat/connection';
import { chatProblem } from '@/components/chat/chat-errors';

export const chatKeys = {
  conversations: (q?: string) => ['chat', 'conversations', q ?? ''] as const,
  /**
   * The archived chats. Under the list's own prefix, so everything that
   * refreshes the list refreshes this too.
   */
  archivedConversations: (q?: string) => ['chat', 'conversations', q ?? '', 'archived'] as const,
  unread: ['chat', 'unread'] as const,
  /** Your saved replies, for the composer. */
  savedReplies: ['chat', 'saved-replies'] as const,
  /** What a chat draws under one Virgo link. */
  linkPreview: (url: string) => ['chat', 'link-preview', url] as const,
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
export type ConversationPages = InfiniteData<ConversationList, number>;
/** A page of a thread, with how many it asked for — the first page's size depends on the line. */
export type ThreadPage = Thread & { requested?: number };
export type ThreadPages = InfiniteData<ThreadPage, string | undefined>;

/*
 * Whether the live socket is up.
 *
 * useRealtime says so; the thread, the list and the badge read it. While it
 * is up every new message arrives through it, so the backup polls stop — on a
 * metered line they were a request a minute per screen for nothing.
 */
let liveSocket = false;
const liveListeners = new Set<() => void>();

export function setLiveSocket(connected: boolean): void {
  if (liveSocket === connected) return;
  liveSocket = connected;
  for (const listener of liveListeners) listener();
}

function subscribeToLiveSocket(listener: () => void): () => void {
  liveListeners.add(listener);
  return () => liveListeners.delete(listener);
}

/** Whether the live socket is connected, kept current. */
export function useLiveSocket(): boolean {
  return useSyncExternalStore(
    subscribeToLiveSocket,
    () => liveSocket,
    () => false,
  );
}

/** A poll's interval, or none while the socket brings everything. */
function pollEvery(ms: number, live: boolean): number | false {
  return shouldPollChat(live) ? ms : false;
}

/** How many of a chat's latest messages a report from it may carry. */
export const REPORTED_MESSAGES = 20;

/**
 * The latest messages between two people in a chat, as this device already
 * has them, for a report about one of them.
 *
 * Read from the cached thread rather than fetched: what goes with a report
 * is what the reporter could see, and nothing is loaded just to send it.
 * Deleted messages are left out. The API checks every id again and copies
 * only what passed between the two of them.
 */
export function reportableMessageIds(
  queryClient: QueryClient,
  conversationId: string,
  people: string[],
): string[] {
  const cached = queryClient.getQueryData<ThreadPages>(chatKeys.thread(conversationId));
  const ids: string[] = [];
  for (const page of cached?.pages ?? []) {
    for (const m of page.data) {
      if (m.deleted_at || !people.includes(m.sender_id) || ids.includes(m.id)) continue;
      ids.push(m.id);
      if (ids.length === REPORTED_MESSAGES) return ids;
    }
  }
  return ids;
}

/**
 * The list's page size.
 *
 * The API's default, so the first page is asked for with no paging
 * parameters at all and reads the same on an API that predates them.
 */
const LIST_PAGE = 100;
/**
 * The page size for older messages, loaded as you scroll back. The first page
 * is firstPageSize: fewer on a slow line.
 */
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
export function useConversations(q?: string, options: { archived?: boolean } = {}) {
  const term = q?.trim() || undefined;
  // A search looks everywhere, archived chats included, so it has one list.
  const archived = !!options.archived && !term;
  const live = useLiveSocket();
  const query = useInfiniteQuery({
    queryKey: archived ? chatKeys.archivedConversations(term) : chatKeys.conversations(term),
    queryFn: ({ pageParam }) =>
      chatApi.conversations(term, {
        ...(pageParam ? { limit: LIST_PAGE, offset: pageParam } : {}),
        ...(archived ? { archived: true } : {}),
      }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.data.length < LIST_PAGE ? undefined : pages.length * LIST_PAGE,
    // A slow safety net for when the WebSocket is down. While it is up it
    // delivers every new message, and a reconnect refreshes the list once.
    refetchInterval: pollEvery(60_000, live),
    // Not across the switch to Archived and back: the chats it held would
    // stand in for a list they are not in.
    placeholderData: (previous, previousQuery) =>
      (previousQuery?.queryKey[3] === 'archived') === archived ? previous : undefined,
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
    /** How many chats wait in Archived. Only the list's first page says. */
    archivedCount: pages?.[0]?.archivedCount ?? 0,
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
  const live = useLiveSocket();
  const query = useQuery({
    queryKey: chatKeys.unread,
    queryFn: () => chatApi.unread(),
    // Every change to it arrives over the socket while that is up.
    refetchInterval: pollEvery(60_000, live),
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

/** One message as it is cached, wherever it is in the thread. */
function cachedMessage(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string,
): ConversationMessage | undefined {
  const cached = queryClient.getQueryData<ThreadPages>(chatKeys.thread(conversationId));
  if (!cached || !Array.isArray(cached.pages)) return undefined;
  for (const page of cached.pages) {
    const found = page.data.find((m) => m.id === messageId);
    if (found) return found;
  }
  return undefined;
}

/**
 * A changed message, from the edit's answer or the socket.
 *
 * Merged rather than swapped, so a field the frame leaves out keeps what the
 * thread already had. Replies quoting it quote the new words.
 */
export function applyMessageEdited(
  queryClient: QueryClient,
  conversationId: string,
  message: ConversationMessage,
): void {
  patchThreadMessages(queryClient, conversationId, (m) => {
    if (m.id === message.id) return { ...m, ...message };
    if (m.reply_to_id === message.id && !m.reply_to_deleted && m.reply_to_body !== message.body) {
      return { ...m, reply_to_body: message.body };
    }
    return m;
  });
}

/** A message's reactions, all at once: the server's answer, or a rollback. */
function setMessageReactions(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string,
  reactions: MessageReaction[],
): void {
  patchThreadMessages(queryClient, conversationId, (m) =>
    m.id === messageId ? { ...m, reactions } : m,
  );
}

/**
 * One person's reaction changing: set, swapped, or taken back with `null`.
 * One each, so theirs is replaced rather than added to.
 */
export function applyReaction(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string,
  userId: string,
  reaction: ReactionKey | null,
): void {
  patchThreadMessages(queryClient, conversationId, (m) => {
    if (m.id !== messageId) return m;
    const current = m.reactions ?? [];
    const mine = current.find((r) => r.userId === userId);
    if ((mine?.reaction ?? null) === reaction) return m;
    const others = current.filter((r) => r.userId !== userId);
    return { ...m, reactions: reaction ? [...others, { userId, reaction }] : others };
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
  const live = useLiveSocket();
  const query = useInfiniteQuery({
    queryKey: chatKeys.thread(conversationId ?? ''),
    queryFn: async ({ pageParam }): Promise<ThreadPage> => {
      // Opens on fewer messages on a slow line; older ones load on scroll.
      // The size asked for is kept with the page, so whether there is more
      // behind it does not depend on what the line is like later.
      const requested = pageParam ? THREAD_PAGE : firstPageSize(readConnectionQuality());
      const page = await chatApi.messages(conversationId!, requested, pageParam);
      return { ...page, requested };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.data.length < (last.requested ?? THREAD_PAGE)
        ? undefined
        : last.data[last.data.length - 1]?.id,
    enabled: !!conversationId,
    // A deleted conversation, or one you were removed from, is an answer.
    retry: retryUnlessGone,
    // The socket pushes new messages; this only backstops it while it is
    // down. A reconnect catches the thread up with `after` instead.
    refetchInterval: pollEvery(45_000, live),
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

// ─────────────────────────────────────────────────────────────────────────────
// Reactions and edits made with no connection
// ─────────────────────────────────────────────────────────────────────────────

/** No answer at all: the connection, not a refusal. */
function isOffline(err: unknown): boolean {
  if (err instanceof ApiError && err.status === 0) return true;
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

interface PendingReaction {
  conversationId: string;
  messageId: string;
  reaction: ReactionKey | null;
}

interface PendingEdit {
  conversationId: string;
  messageId: string;
  body: string;
  mentionIds?: string[];
}

/*
 * What could not go because there was no connection, kept and sent when
 * there is one. One of each per message: a later reaction or edit replaces
 * the one waiting, as it would have replaced it on the server.
 *
 * In memory, for the session. The thread already shows each as done; what is
 * kept here is only the request still owed.
 */
const pendingReactions = new Map<string, PendingReaction>();
const pendingEdits = new Map<string, PendingEdit>();
const pendingListeners = new Set<() => void>();
const NO_EDITS: ReadonlySet<string> = new Set();
let waitingEdits: ReadonlySet<string> = NO_EDITS;
let writesTimer: ReturnType<typeof setTimeout> | undefined;
let flushingWrites = false;

function pendingChanged(): void {
  waitingEdits = pendingEdits.size > 0 ? new Set(pendingEdits.keys()) : NO_EDITS;
  for (const listener of pendingListeners) listener();
}

function subscribeToPending(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => pendingListeners.delete(listener);
}

/** The messages whose edit is waiting for a connection. */
export function useWaitingEdits(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribeToPending,
    () => waitingEdits,
    () => NO_EDITS,
  );
}

function resetPendingWrites(): void {
  clearTimeout(writesTimer);
  pendingReactions.clear();
  pendingEdits.clear();
  pendingChanged();
}

/**
 * Sends whatever reactions and edits are owed, oldest first.
 *
 * Coming back online, the socket reconnecting and the tab coming forward each
 * start a run; a run that still finds no connection stops, and tries again
 * shortly. A refusal — the edit window closed while it waited, say — puts the
 * thread back as the server has it, and says so.
 */
export async function flushPendingWrites(queryClient: QueryClient): Promise<void> {
  if (flushingWrites || (pendingReactions.size === 0 && pendingEdits.size === 0)) return;
  flushingWrites = true;
  clearTimeout(writesTimer);
  let offline = false;
  try {
    for (const item of [...pendingReactions.values()]) {
      try {
        const { reactions } = await chatApi.react(item.conversationId, item.messageId, item.reaction);
        if (pendingReactions.get(item.messageId) === item) {
          pendingReactions.delete(item.messageId);
          if (Array.isArray(reactions)) {
            setMessageReactions(queryClient, item.conversationId, item.messageId, reactions);
          }
        }
      } catch (err) {
        if (isOffline(err)) {
          offline = true;
          break;
        }
        if (pendingReactions.get(item.messageId) === item) pendingReactions.delete(item.messageId);
        queryClient.invalidateQueries({ queryKey: chatKeys.thread(item.conversationId) });
        toast.error('Could not react', { description: chatProblem(err) });
      }
    }
    for (const item of offline ? [] : [...pendingEdits.values()]) {
      try {
        const message = await chatApi.edit(
          item.conversationId,
          item.messageId,
          item.body,
          item.mentionIds,
        );
        if (pendingEdits.get(item.messageId) === item) {
          pendingEdits.delete(item.messageId);
          applyMessageEdited(queryClient, item.conversationId, message);
          invalidateConversationRows(queryClient);
        }
      } catch (err) {
        if (isOffline(err)) {
          offline = true;
          break;
        }
        if (pendingEdits.get(item.messageId) === item) pendingEdits.delete(item.messageId);
        queryClient.invalidateQueries({ queryKey: chatKeys.thread(item.conversationId) });
        toast.error('Could not save the change', { description: chatProblem(err) });
      }
    }
  } finally {
    flushingWrites = false;
    pendingChanged();
    if (pendingReactions.size > 0 || pendingEdits.size > 0) {
      writesTimer = setTimeout(() => void flushPendingWrites(queryClient), 15_000);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Catching up after the socket was away
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Brings one cached thread up to date with only what is new.
 *
 * Asks for the messages after the newest one held, and puts them on top. An
 * answer that fills the page may have a gap behind it, so then the newest
 * page replaces what was held instead. Refetching the thread did it the long
 * way: every page scrolled back through, again, for what is usually nothing.
 */
async function catchUpThread(queryClient: QueryClient, conversationId: string): Promise<void> {
  const key = chatKeys.thread(conversationId);
  const held = queryClient.getQueryData<ThreadPages>(key);
  const newest = held?.pages?.[0]?.data[0];
  if (!held || !Array.isArray(held.pages) || !newest) {
    // Nothing to measure from: an empty thread costs little to read again.
    if (held) await queryClient.invalidateQueries({ queryKey: key });
    return;
  }
  const size = firstPageSize(readConnectionQuality());
  try {
    const answer = await chatApi.messages(conversationId, size, undefined, newest.id);
    if (answer.data.length >= size) {
      const page = await chatApi.messages(conversationId, size);
      queryClient.setQueryData<ThreadPages>(key, {
        pages: [{ ...page, requested: size }],
        pageParams: [undefined],
      });
      return;
    }
    queryClient.setQueryData<ThreadPages>(key, (old) => {
      if (!old || !Array.isArray(old.pages) || old.pages.length === 0) return old;
      const known = new Set(old.pages.flatMap((p) => p.data.map((m) => m.id)));
      const fresh = answer.data.filter((m) => !known.has(m.id));
      const [first, ...rest] = old.pages;
      const data = fresh.length > 0 ? [...fresh, ...first.data].sort(newestFirst) : first.data;
      return {
        ...old,
        pages: [
          {
            ...first,
            data,
            // A block may have frozen it, or lifted, while the socket was away.
            canSend: answer.canSend ?? first.canSend,
            blockedByMe: answer.blockedByMe ?? first.blockedByMe,
            blockId: answer.blockId !== undefined ? answer.blockId : first.blockId,
          },
          ...rest,
        ],
      };
    });
    // Your own, sent while the socket was away: the bubble that stood in for
    // each goes now, as it would have when its frame arrived.
    for (const m of answer.data) if (m.client_id) removeFromOutbox(m.client_id);
  } catch (err) {
    // Still no connection: the next reconnect tries again. Anything else —
    // an API from before `after`, say — falls back to reading it again.
    if (!isOffline(err)) await queryClient.invalidateQueries({ queryKey: key });
  }
}

/**
 * The socket is (back) up: catch up what it missed.
 *
 * Every thread on screen catches up with `after`. On a reconnect, the lists,
 * the badge, the by-id rows and the receipts are read again once; threads
 * that are not on screen are only marked stale, for when they are opened.
 */
export async function catchUpChat(queryClient: QueryClient, reconnect: boolean): Promise<void> {
  if (reconnect) {
    queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
    queryClient.invalidateQueries({ queryKey: chatKeys.anyConversation });
    queryClient.invalidateQueries({ queryKey: chatKeys.unread });
    queryClient.invalidateQueries({ queryKey: ['chat', 'participants'] });
  }
  const threads = queryClient.getQueryCache().findAll({ queryKey: ['chat', 'thread'] });
  await Promise.all(
    threads.map(async (query) => {
      const id = query.queryKey[2];
      if (typeof id !== 'string' || !id) return;
      if (query.getObserversCount() > 0) {
        await catchUpThread(queryClient, id);
      } else if (reconnect) {
        await queryClient.invalidateQueries({ queryKey: query.queryKey, refetchType: 'none' });
      }
    }),
  );
}

/**
 * Keeps the queue moving. Mounted once, with the session.
 *
 * Loads what was left unsent last time, and sends whatever is waiting the
 * moment there is a connection to send it on — messages, and the reactions
 * and edits made while there was none.
 */
export function useOutboxSender(userId: string | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) {
      resetOutbox();
      resetPendingWrites();
      return undefined;
    }
    loadOutbox(userId);
    void flushOutbox(queryClient);

    const flushAll = () => {
      void flushOutbox(queryClient);
      void flushPendingWrites(queryClient);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') flushAll();
    };
    window.addEventListener('online', flushAll);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', flushAll);
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(retryTimer);
      clearTimeout(writesTimer);
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

/**
 * Your reaction on a message: set, changed, or `null` to take it back.
 *
 * Drawn at once and put back if the server says no. Only that message's
 * reactions are restored, so anything else that arrived meanwhile stays.
 *
 * With no connection it is not a failure: it stays drawn, waits, and goes
 * when the connection is back (flushPendingWrites).
 */
export function useReactToMessage(conversationId: string, meId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      reaction,
    }: {
      messageId: string;
      reaction: ReactionKey | null;
    }): Promise<{ reactions: MessageReaction[] } | { queued: true }> => {
      try {
        return await chatApi.react(conversationId, messageId, reaction);
      } catch (err) {
        if (!isOffline(err)) throw err;
        pendingReactions.set(messageId, { conversationId, messageId, reaction });
        pendingChanged();
        return { queued: true };
      }
    },
    onMutate: async ({ messageId, reaction }) => {
      // A newer reaction replaces one still waiting to go.
      if (pendingReactions.delete(messageId)) pendingChanged();
      await queryClient.cancelQueries({ queryKey: chatKeys.thread(conversationId) });
      const previous = cachedMessage(queryClient, conversationId, messageId)?.reactions ?? [];
      if (meId) applyReaction(queryClient, conversationId, messageId, meId, reaction);
      return { previous };
    },
    onError: (_err, { messageId }, context) => {
      if (context) setMessageReactions(queryClient, conversationId, messageId, context.previous);
    },
    onSuccess: (result, { messageId }) => {
      if ('reactions' in result && Array.isArray(result.reactions)) {
        setMessageReactions(queryClient, conversationId, messageId, result.reactions);
      }
    },
  });
}

/**
 * Changes the words of your own message.
 *
 * The new words show at once, marked Edited; a refusal puts the old ones
 * back. The list's preview may be this message, so the rows refresh too.
 *
 * With no connection the new words stay, the message says it is waiting for
 * one (useWaitingEdits), and the edit goes when it is back.
 */
export function useEditMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      body,
      mentionIds,
    }: {
      messageId: string;
      body: string;
      mentionIds?: string[];
    }): Promise<ConversationMessage | { queued: true }> => {
      try {
        return await chatApi.edit(conversationId, messageId, body, mentionIds);
      } catch (err) {
        if (!isOffline(err)) throw err;
        pendingEdits.set(messageId, { conversationId, messageId, body, mentionIds });
        pendingChanged();
        return { queued: true };
      }
    },
    onMutate: async ({ messageId, body }) => {
      if (pendingEdits.delete(messageId)) pendingChanged();
      await queryClient.cancelQueries({ queryKey: chatKeys.thread(conversationId) });
      const previous = cachedMessage(queryClient, conversationId, messageId);
      if (previous) {
        applyMessageEdited(queryClient, conversationId, {
          ...previous,
          body,
          edited_at: new Date().toISOString(),
        });
      }
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) applyMessageEdited(queryClient, conversationId, context.previous);
    },
    onSuccess: (result) => {
      if ('queued' in result) return;
      applyMessageEdited(queryClient, conversationId, result);
      invalidateConversationRows(queryClient);
    },
  });
}

/** Sends a message on to up to five other chats, as your own, marked Forwarded. */
export function useForwardMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, targets }: { messageId: string; targets: string[] }) =>
      chatApi.forward(conversationId, messageId, targets),
    onSuccess: (_result, { targets }) => {
      invalidateConversationRows(queryClient);
      for (const target of targets) {
        queryClient.invalidateQueries({ queryKey: chatKeys.thread(target) });
      }
    },
  });
}

/** What a list-state change really sets: pinning unarchives, archiving unpins. */
function listFlags(patch: ListStatePatch): ListStatePatch {
  const flags: ListStatePatch = { ...patch };
  if (patch.pinned === true) flags.archived = false;
  if (patch.archived === true) flags.pinned = false;
  return flags;
}

/**
 * Pins, archives or marks a chat unread, in your own list.
 *
 * The row moves now: archiving takes it out of the list and into Archived,
 * and the count on the Archived row follows. The lists are read again once
 * the server has answered either way — it decides the order pinned chats sit
 * in — and its `conversation` frame does the same on your other devices.
 */
export function useSetListState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, patch }: { conversationId: string; patch: ListStatePatch }) =>
      chatApi.setListState(conversationId, patch),
    onMutate: async ({ conversationId, patch }) => {
      await queryClient.cancelQueries({ queryKey: chatKeys.allConversations });
      const flags = listFlags(patch);
      const snapshot = queryClient.getQueriesData<ConversationPages>({
        queryKey: chatKeys.allConversations,
      });
      const wasArchived = !!findConversation(queryClient, conversationId)?.archived;
      const archivedDelta =
        flags.archived === undefined || flags.archived === wasArchived
          ? 0
          : flags.archived
            ? 1
            : -1;
      for (const [key, list] of snapshot) {
        if (!list || !Array.isArray(list.pages)) continue;
        const archivedList = key[3] === 'archived';
        const searching = typeof key[2] === 'string' && key[2] !== '';
        const pages = list.pages.map((page) => ({
          ...page,
          data: page.data.flatMap((c) => {
            if (c.id !== conversationId) return [c];
            const next = { ...c, ...flags };
            // A search shows both, so only the flags change there.
            const leaves =
              !searching && flags.archived !== undefined && !!next.archived !== archivedList;
            return leaves ? [] : [next];
          }),
        }));
        if (!searching && !archivedList && pages[0] && archivedDelta !== 0) {
          pages[0] = {
            ...pages[0],
            archivedCount: Math.max(0, (pages[0].archivedCount ?? 0) + archivedDelta),
          };
        }
        queryClient.setQueryData<ConversationPages>(key, { ...list, pages });
      }
      const byId = queryClient.getQueryData<Conversation | null>(
        chatKeys.conversation(conversationId),
      );
      if (byId && typeof byId === 'object') {
        queryClient.setQueryData(chatKeys.conversation(conversationId), { ...byId, ...flags });
      }
      return { snapshot, byId };
    },
    onError: (_err, { conversationId }, context) => {
      for (const [key, list] of context?.snapshot ?? []) queryClient.setQueryData(key, list);
      if (context?.byId !== undefined) {
        queryClient.setQueryData(chatKeys.conversation(conversationId), context.byId);
      }
    },
    onSettled: () => {
      invalidateConversationRows(queryClient);
      queryClient.invalidateQueries({ queryKey: chatKeys.unread });
    },
  });
}

/** Your saved replies, newest change first as the server keeps them. */
export function useSavedReplies(enabled = true) {
  const query = useQuery({
    queryKey: chatKeys.savedReplies,
    queryFn: () => savedRepliesApi.list(),
    enabled,
    staleTime: 60_000,
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    replies: query.data?.data ?? [],
  };
}

/** Adds a saved reply, or changes one when given its id. */
export function useSaveReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title, body }: { id?: string; title: string; body: string }) =>
      id ? savedRepliesApi.update(id, { title, body }) : savedRepliesApi.create(title, body),
    onSuccess: (saved) => {
      queryClient.setQueryData<{ data: SavedReply[]; total: number }>(
        chatKeys.savedReplies,
        (old) => {
          if (!old || !Array.isArray(old.data)) return old;
          const exists = old.data.some((r) => r.id === saved.id);
          return exists
            ? { ...old, data: old.data.map((r) => (r.id === saved.id ? saved : r)) }
            : { ...old, data: [saved, ...old.data], total: old.total + 1 };
        },
      );
      queryClient.invalidateQueries({ queryKey: chatKeys.savedReplies });
    },
  });
}

/** Removes a saved reply. Gone from the list at once; back if the server refuses. */
export function useDeleteSavedReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => savedRepliesApi.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: chatKeys.savedReplies });
      const previous = queryClient.getQueryData<{ data: SavedReply[]; total: number }>(
        chatKeys.savedReplies,
      );
      if (previous && Array.isArray(previous.data)) {
        queryClient.setQueryData(chatKeys.savedReplies, {
          ...previous,
          data: previous.data.filter((r) => r.id !== id),
          total: Math.max(0, previous.total - 1),
        });
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(chatKeys.savedReplies, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.savedReplies });
    },
  });
}

/**
 * What to draw under a Virgo link, or null when there is nothing to draw.
 *
 * A 404 is the answer "no preview" — a page that is not one of Virgo's, or a
 * link that no longer works — and is kept as null rather than an error, so it
 * is not asked again on every render. Nothing is retried: the plain link is
 * already on screen, and a card is not worth a second request.
 */
export function useLinkPreview(url: string | null) {
  return useQuery({
    queryKey: chatKeys.linkPreview(url ?? ''),
    queryFn: async (): Promise<LinkPreview | null> => {
      try {
        return await linkPreviewsApi.get(url!);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !!url,
    staleTime: 5 * 60_000,
    retry: false,
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
                  // Reading also clears "marked unread", on the server too.
                  data: page.data.map((c) =>
                    c.id === conversationId ? { ...c, unread: 0, markedUnread: false } : c,
                  ),
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
