import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect } from 'expo-router';
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
  REACTION_EMOJI,
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
} from '@/src/api';
import { seedPresence } from '@/src/lib/presence-store';
import { getConnectionQuality, useChatSocketLive } from '@/src/hooks/useConnectionQuality';
import { buzzForMessage } from '@/src/lib/notifications';
import {
  loadOutbox,
  newClientId,
  outboxItems,
  removeFromOutbox,
  resetOutbox,
  updateOutbox,
  type OutboxItem,
} from '@/src/lib/outbox';

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
  /**
   * The archived chats. Under the conversation lists, so everything that
   * refreshes the list refreshes these too, and a fourth part no search key
   * has, so no search term can land on it.
   */
  archived: ['chat', 'conversations', '', 'archived'] as const,
  /** Your saved replies, which follow you to every device. */
  savedReplies: ['chat', 'saved-replies'] as const,
  /** What a chat draws under one Virgo link. */
  linkPreview: (url: string) => ['chat', 'link-preview', url] as const,
};

/** What the list and the thread are cached as. */
export type ConversationPages = InfiniteData<ConversationList, number>;

/** Whether a cached list is the archived one rather than the inbox or a search. */
function isArchivedKey(queryKey: readonly unknown[]): boolean {
  return queryKey[3] === 'archived';
}
export type ThreadPages = InfiniteData<ThreadPage, string | undefined>;

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
 * How many older messages one scroll back asks for. The first page's size is
 * firstPageSize(): 30 on a slow line, else 100.
 */
const THREAD_PAGE = 50;
const THREAD_PAGE_SLOW = 30;

/** How long the backup polls wait, and only while the live socket is down. */
const LIST_POLL_MS = 60_000;
const THREAD_POLL_MS = 45_000;

/** A thread page, with how many it asked for — which says whether there are more. */
type ThreadPage = Thread & { requestedLimit?: number };

async function fetchThreadPage(conversationId: string, before: string | undefined): Promise<ThreadPage> {
  const quality = getConnectionQuality();
  const limit =
    before === undefined
      ? firstPageSize(quality)
      : quality === 'slow'
        ? THREAD_PAGE_SLOW
        : THREAD_PAGE;
  const page = await chatApi.messages(conversationId, limit, before);
  return { ...page, requestedLimit: limit };
}

/** The list rows and the by-id rows, both of which hold a title and mute state. */
function invalidateConversationRows(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
  queryClient.invalidateQueries({ queryKey: chatKeys.anyConversation });
}

/**
 * Changes rows in every cached list, the archived one included, and in the
 * by-id rows. `patch` answers the row, a changed copy, or null to take it out
 * of that list; `key` says which list it is looking at.
 */
function patchConversationRows(
  queryClient: QueryClient,
  patch: (row: Conversation, key: readonly unknown[]) => Conversation | null,
): void {
  for (const [key, list] of queryClient.getQueriesData<ConversationPages>({
    queryKey: chatKeys.allConversations,
  })) {
    if (!list || !Array.isArray(list.pages)) continue;
    let changed = false;
    const pages = list.pages.map((page) => {
      const data: Conversation[] = [];
      let pageChanged = false;
      for (const row of page?.data ?? []) {
        const next = patch(row, key);
        if (next !== row) pageChanged = true;
        if (next) data.push(next);
      }
      if (!pageChanged) return page;
      changed = true;
      return { ...page, data };
    });
    if (changed) queryClient.setQueryData<ConversationPages>(key, { ...list, pages });
  }
  for (const [key, row] of queryClient.getQueriesData<Conversation | null>({
    queryKey: chatKeys.anyConversation,
  })) {
    if (!row || typeof row !== 'object' || !('id' in row)) continue;
    const next = patch(row, key);
    if (next && next !== row) queryClient.setQueryData(key, next);
  }
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
  return useConversationPages(chatKeys.conversations(term), (offset) =>
    chatApi.conversations(term, offset ? { limit: LIST_PAGE, offset } : {}),
  );
}

/**
 * The chats you archived, a page at a time. Each comes back to the list by
 * itself when somebody writes in it.
 */
export function useArchivedConversations() {
  return useConversationPages(chatKeys.archived, (offset) =>
    chatApi.conversations(undefined, {
      archived: true,
      ...(offset ? { limit: LIST_PAGE, offset } : {}),
    }),
  );
}

function useConversationPages(
  queryKey: readonly unknown[],
  fetchPage: (offset: number) => Promise<ConversationList>,
) {
  const live = useChatSocketLive();
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.data.length < LIST_PAGE ? undefined : pages.length * LIST_PAGE,
    // A slow safety net, and only while the socket is down: when it is up it
    // delivers every new message, and polling on top of it was a whole list
    // a minute for nothing, which a 2G phone pays for.
    refetchInterval: shouldPollChat(live) ? LIST_POLL_MS : false,
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
    /** How many wait in Archived. Zero from an API that predates it. */
    archivedCount: query.data?.pages[0]?.archivedCount ?? 0,
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
  const live = useChatSocketLive();
  const query = useQuery({
    queryKey: chatKeys.unread,
    queryFn: () => chatApi.unread(),
    // Each live message marks it stale, so it only polls with the socket down.
    refetchInterval: shouldPollChat(live) ? LIST_POLL_MS : false,
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
 *
 * Set on focus and cleared on blur (useOpenConversation), not on mount and
 * unmount. Mounted, a thread under its own Info screen or under a second
 * thread still counted as open: it went on silencing banners, and going from
 * A to B and back cleared the flag while A was the one on screen.
 */
let openConversationId: string | null = null;

export function setOpenConversation(id: string | null): void {
  openConversationId = id;
}

export function getOpenConversation(): string | null {
  return openConversationId;
}

/** Marks this conversation as the one on screen while its screen has focus. */
export function useOpenConversation(id: string | undefined): void {
  useFocusEffect(
    useCallback(() => {
      if (!id) return undefined;
      openConversationId = id;
      return () => {
        // Only if nothing else has claimed it since: the next screen's focus
        // can run before this one's blur.
        if (openConversationId === id) openConversationId = null;
      };
    }, [id]),
  );
}

/**
 * Whether a conversation is muted, from whichever conversation rows are cached.
 *
 * Muting only reached push. In the app a muted chat chimed and buzzed like any
 * other, which is exactly what somebody muting a busy group was trying to stop.
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
 * It chimes, buzzes or deliberately stays quiet for that message itself. The
 * unread count rising a moment later is the same message, and useMessageAlerts
 * buzzing for it again was a second buzz — or the only one, for a muted chat.
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
 * Deleting refetched only the newest page, so a message deleted further back
 * stayed on screen with its text, for the person who deleted it and for
 * everyone else.
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

/** One message as this device holds it, wherever it is in the thread. */
export function findThreadMessage(
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
 * A message whose words changed, from the socket or the edit's own answer.
 *
 * Merged over what is held, so anything the payload leaves out — reactions
 * from an older API — stays. Replies quoting it quote the new words.
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

/**
 * One person's reaction on one message: set, changed, or taken back (`null`).
 *
 * One per person, so theirs is replaced rather than added to. A key this
 * build does not know is dropped, the same as groupReactions would.
 */
export function applyReaction(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string,
  userId: string,
  reaction: ReactionKey | null,
): void {
  const known = reaction && REACTION_EMOJI[reaction] ? reaction : null;
  patchThreadMessages(queryClient, conversationId, (m) => {
    if (m.id !== messageId) return m;
    const others = (m.reactions ?? []).filter((r) => r.userId !== userId);
    return { ...m, reactions: known ? [...others, { userId, reaction: known }] : others };
  });
}

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
 * One conversation's messages, newest first, a page at a time.
 *
 * Paged through the query rather than beside it. Older pages used to live in
 * the screen's own state, fetched before a boundary that the newest page kept
 * moving: each new message pushed the oldest of the newest hundred out of the
 * first page and out of view, and deleting anything older changed nothing on
 * screen. An infinite query refetches its pages from the newest one down,
 * each cursor taken from the page before, so there is no seam to lose a
 * message in.
 */
export function useThread(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const live = useChatSocketLive();
  const query = useInfiniteQuery({
    queryKey: chatKeys.thread(conversationId ?? ''),
    // Opens on fewer messages on a slow line; older ones come on scroll.
    queryFn: ({ pageParam }) => fetchThreadPage(conversationId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ThreadPage) =>
      last.data.length < (last.requestedLimit ?? THREAD_PAGE)
        ? undefined
        : last.data[last.data.length - 1]?.id,
    enabled: !!conversationId,
    // A deleted conversation, or one you were removed from, is an answer.
    retry: retryUnlessGone,
    // The socket pushes new messages; this only backstops it while it is
    // down. With it up, every page refetched each 45 seconds was a thread's
    // worth of data spent on nothing.
    refetchInterval: shouldPollChat(live) ? THREAD_POLL_MS : false,
  });

  // What is waiting to go — an edit, a reaction — drawn over what the server
  // last said, so a refetch while offline does not undo it on screen.
  const pending = usePendingChatActions(conversationId);

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
        rows.push(pending.length > 0 ? withPendingActions(m, pending) : m);
      }
    }
    return rows;
  }, [pages, pending]);

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
    // Answered, and not with a yes: kept for a tap, not retried by itself.
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
 * app and the socket reconnecting each start a run straight away.
 */
export function flushOutbox(queryClient: QueryClient): Promise<void> {
  // Whatever wakes the message queue — a connection back, the app in front,
  // the socket up — wakes the reactions and edits waiting beside it too.
  void flushChatActions(queryClient);
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
 * The thread queues through the outbox instead, which survives the screen
 * and the connection. This stays for anything that sends once and handles
 * its own failure, and it still carries a client id, so a retry by its
 * caller is not stored twice.
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

/** Sends one message now: a tap on a failed bubble. */
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
      resetChatActions();
      return undefined;
    }
    void Promise.all([loadOutbox(userId), loadChatActions(userId)]).then(() =>
      flushOutbox(queryClient),
    );

    let wasOnline = true;
    const offNet = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      if (online && !wasOnline) void flushOutbox(queryClient);
      wasOnline = online;
    });
    const offApp = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushOutbox(queryClient);
    });
    return () => {
      offNet();
      offApp.remove();
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


// ─────────────────────────────────────────────────────────────────────────────
// Reactions and edits that wait for a connection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A reaction or an edit made with no signal, kept until the server has it.
 *
 * Like the message outbox and the money one: on the phone, across restarts,
 * sent the moment there is a connection. One of each kind per message — a
 * second reaction or a second edit replaces the one waiting. A reaction just
 * stays drawn as it was given; an edit says "Waiting for a connection" in its
 * time line until it goes.
 */
export type ChatAction =
  | {
      kind: 'reaction';
      conversationId: string;
      messageId: string;
      reaction: ReactionKey | null;
      queuedAt: string;
      attempts: number;
    }
  | {
      kind: 'edit';
      conversationId: string;
      messageId: string;
      body: string;
      mentionIds?: string[];
      queuedAt: string;
      attempts: number;
    };

/** What a waiting edit that the server then refused hands back to the screen. */
export interface EditFailure {
  conversationId: string;
  messageId: string;
  body: string;
  error: unknown;
}

const NO_ACTIONS: readonly ChatAction[] = [];
let actionOwner: string | null = null;
let actions: readonly ChatAction[] = NO_ACTIONS;
/** Each conversation's, rebuilt on change so a screen gets a stable array. */
let actionsByConversation = new Map<string, readonly ChatAction[]>();
const actionListeners = new Set<() => void>();
const editFailureListeners = new Set<(failure: EditFailure) => void>();

const actionsKey = (userId: string) => `virgo.chat-actions.v1:${userId}`;

function publishActions(next: readonly ChatAction[]): void {
  actions = next.length > 0 ? next : NO_ACTIONS;
  const grouped = new Map<string, ChatAction[]>();
  for (const a of actions) {
    const list = grouped.get(a.conversationId) ?? [];
    list.push(a);
    grouped.set(a.conversationId, list);
  }
  actionsByConversation = grouped;
  const userId = actionOwner;
  if (userId) {
    const write =
      actions.length > 0
        ? AsyncStorage.setItem(actionsKey(userId), JSON.stringify(actions))
        : AsyncStorage.removeItem(actionsKey(userId));
    write.catch(() => {
      // Storage full or unavailable. The queue still works for this session.
    });
  }
  for (const listener of actionListeners) listener();
}

/** Loads the signed-in person's waiting reactions and edits from last time. */
export async function loadChatActions(userId: string): Promise<void> {
  if (actionOwner === userId) return;
  if (actionOwner !== null) actions = NO_ACTIONS;
  actionOwner = userId;
  let stored: ChatAction[] = [];
  try {
    const raw = await AsyncStorage.getItem(actionsKey(userId));
    if (raw) stored = JSON.parse(raw) as ChatAction[];
  } catch {
    stored = [];
  }
  if (actionOwner !== userId) return;
  const valid = Array.isArray(stored)
    ? stored.filter(
        (a) =>
          a &&
          (a.kind === 'reaction' || a.kind === 'edit') &&
          typeof a.conversationId === 'string' &&
          typeof a.messageId === 'string',
      )
    : [];
  // Anything queued this session before the load wins over the stored copy.
  const fresh = actions.filter((a) => !valid.some((v) => sameTarget(v, a)));
  publishActions([...valid.filter((v) => !fresh.some((a) => sameTarget(a, v))), ...fresh]);
}

/** Signing out takes them with it: they are that account's. */
export function resetChatActions(): void {
  const userId = actionOwner;
  actionOwner = null;
  publishActions(NO_ACTIONS);
  if (userId) AsyncStorage.removeItem(actionsKey(userId)).catch(() => undefined);
}

function sameTarget(a: ChatAction, b: ChatAction): boolean {
  return a.kind === b.kind && a.messageId === b.messageId && a.conversationId === b.conversationId;
}

function queueChatAction(action: ChatAction): void {
  publishActions([...actions.filter((a) => !sameTarget(a, action)), action]);
}

function hasQueued(kind: ChatAction['kind'], conversationId: string, messageId: string): boolean {
  return actions.some(
    (a) => a.kind === kind && a.messageId === messageId && a.conversationId === conversationId,
  );
}

function subscribeActions(listener: () => void): () => void {
  actionListeners.add(listener);
  return () => actionListeners.delete(listener);
}

/** What is waiting to go in one conversation. */
export function usePendingChatActions(conversationId: string | undefined): readonly ChatAction[] {
  return useSyncExternalStore(
    subscribeActions,
    () => (conversationId ? (actionsByConversation.get(conversationId) ?? NO_ACTIONS) : NO_ACTIONS),
    () => NO_ACTIONS,
  );
}

/** The messages in a conversation whose edit is waiting for a connection. */
export function usePendingEdits(conversationId: string | undefined): ReadonlySet<string> {
  const pending = usePendingChatActions(conversationId);
  return useMemo(
    () => new Set(pending.filter((a) => a.kind === 'edit').map((a) => a.messageId)),
    [pending],
  );
}

/**
 * Says when an edit that was waiting is turned down once it could be sent —
 * the window closed while the phone was offline — so the screen can give the
 * words back. Nothing is lost silently.
 */
export function useEditFailures(
  conversationId: string | undefined,
  onFailure: (failure: EditFailure) => void,
): void {
  const latest = useRef(onFailure);
  latest.current = onFailure;
  useEffect(() => {
    if (!conversationId) return undefined;
    const listener = (failure: EditFailure) => {
      if (failure.conversationId === conversationId) latest.current(failure);
    };
    editFailureListeners.add(listener);
    return () => {
      editFailureListeners.delete(listener);
    };
  }, [conversationId]);
}

/** A message as it will be once what is waiting for it has gone. */
function withPendingActions(m: ConversationMessage, pending: readonly ChatAction[]): ConversationMessage {
  if (m.deleted_at) return m;
  let next = m;
  for (const a of pending) {
    if (a.messageId !== m.id) continue;
    if (a.kind === 'edit') {
      if (next.body !== a.body) next = { ...next, body: a.body, edited_at: a.queuedAt };
    } else if (actionOwner) {
      const owner = actionOwner;
      const others = (next.reactions ?? []).filter((r) => r.userId !== owner);
      next = {
        ...next,
        reactions: a.reaction ? [...others, { userId: owner, reaction: a.reaction }] : others,
      };
    }
  }
  return next;
}

let actionsFlushing: Promise<void> | null = null;
let actionsRetry: ReturnType<typeof setTimeout> | undefined;

/**
 * Sends the waiting reactions and edits, oldest first.
 *
 * A connection failure stops the run and tries again on a backoff, as the
 * message outbox does. A refusal drops the one refused and reads the thread
 * again; a refused edit's words go back to the screen (useEditFailures).
 */
export function flushChatActions(queryClient: QueryClient): Promise<void> {
  if (actionsFlushing) return actionsFlushing;
  if (actions.length === 0) return Promise.resolve();
  clearTimeout(actionsRetry);
  actionsFlushing = (async () => {
    for (const action of actions.slice()) {
      // Replaced by a newer one while an earlier one was going.
      if (!actions.includes(action)) continue;
      try {
        if (action.kind === 'reaction') {
          const result = await chatApi.react(action.conversationId, action.messageId, action.reaction);
          publishActions(actions.filter((a) => a !== action));
          if (Array.isArray(result?.reactions)) {
            setMessageReactions(queryClient, action.conversationId, action.messageId, result.reactions);
          }
        } else {
          const row = await chatApi.edit(
            action.conversationId,
            action.messageId,
            action.body,
            action.mentionIds,
          );
          publishActions(actions.filter((a) => a !== action));
          if (row && typeof row === 'object' && 'id' in row) {
            applyMessageEdited(queryClient, action.conversationId, row);
          }
          invalidateConversationRows(queryClient);
        }
      } catch (err) {
        if (isTransient(err)) {
          const attempts = action.attempts + 1;
          publishActions(actions.map((a) => (a === action ? { ...a, attempts } : a)));
          actionsRetry = setTimeout(
            () => void flushChatActions(queryClient),
            Math.min(2000 * 2 ** Math.min(attempts, 5), 60_000),
          );
          break;
        }
        publishActions(actions.filter((a) => a !== action));
        queryClient.invalidateQueries({ queryKey: chatKeys.thread(action.conversationId) });
        if (action.kind === 'edit') {
          const failure: EditFailure = {
            conversationId: action.conversationId,
            messageId: action.messageId,
            body: action.body,
            error: err,
          };
          for (const listener of editFailureListeners) listener(failure);
        }
      }
    }
  })().finally(() => {
    actionsFlushing = null;
  });
  return actionsFlushing;
}

/**
 * Your reaction on a message: set, changed, or `null` to take it back.
 *
 * Drawn at once and put back if the server says no. What the server answers
 * with is everyone's reactions on it, which replaces the guess. With no
 * connection it waits, still drawn, and goes when there is one — no alert,
 * since nothing went wrong that needs you.
 */
export function useReactToMessage(conversationId: string, myId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    // Always tried, rather than paused by React Query while offline: a paused
    // one is forgotten when the app closes, and the queue above is not.
    networkMode: 'always',
    mutationFn: async ({
      messageId,
      reaction,
    }: {
      messageId: string;
      reaction: ReactionKey | null;
    }): Promise<{ queued: boolean; reactions?: MessageReaction[] }> => {
      const queue = () => {
        queueChatAction({
          kind: 'reaction',
          conversationId,
          messageId,
          reaction,
          queuedAt: new Date().toISOString(),
          attempts: 0,
        });
        return { queued: true };
      };
      // Behind one already waiting for this message, or with no connection
      // at all, there is no point trying first.
      if (getConnectionQuality() === 'offline' || hasQueued('reaction', conversationId, messageId)) {
        return queue();
      }
      try {
        const result = await chatApi.react(conversationId, messageId, reaction);
        return { queued: false, reactions: result?.reactions };
      } catch (err) {
        if (isTransient(err)) return queue();
        throw err;
      }
    },
    onMutate: ({ messageId, reaction }) => {
      const previous = findThreadMessage(queryClient, conversationId, messageId)?.reactions ?? [];
      if (myId) applyReaction(queryClient, conversationId, messageId, myId, reaction);
      return { previous };
    },
    onError: (_err, { messageId }, context) => {
      if (context) setMessageReactions(queryClient, conversationId, messageId, context.previous);
    },
    onSuccess: (result, { messageId }) => {
      if (!result.queued && Array.isArray(result.reactions)) {
        setMessageReactions(queryClient, conversationId, messageId, result.reactions);
      }
    },
  });
}

/**
 * Changes the words of one of your own messages.
 *
 * Drawn at once, marked Edited, and put back as it was if the server says no
 * — the window closing in flight, say. With no connection it waits, drawn as
 * changed, its time line saying "Waiting for a connection".
 */
export function useEditMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: async ({
      messageId,
      body,
      mentionIds,
    }: {
      messageId: string;
      body: string;
      mentionIds?: string[];
    }): Promise<{ queued: boolean; message?: ConversationMessage }> => {
      const queue = () => {
        queueChatAction({
          kind: 'edit',
          conversationId,
          messageId,
          body,
          mentionIds,
          queuedAt: new Date().toISOString(),
          attempts: 0,
        });
        return { queued: true };
      };
      if (getConnectionQuality() === 'offline' || hasQueued('edit', conversationId, messageId)) {
        return queue();
      }
      try {
        return { queued: false, message: await chatApi.edit(conversationId, messageId, body, mentionIds) };
      } catch (err) {
        if (isTransient(err)) return queue();
        throw err;
      }
    },
    onMutate: ({ messageId, body }) => {
      const before = findThreadMessage(queryClient, conversationId, messageId);
      patchThreadMessages(queryClient, conversationId, (m) =>
        m.id === messageId ? { ...m, body, edited_at: new Date().toISOString() } : m,
      );
      return { before };
    },
    onError: (_err, { messageId }, context) => {
      const before = context?.before;
      if (!before) return;
      patchThreadMessages(queryClient, conversationId, (m) =>
        m.id === messageId
          ? { ...m, body: before.body, edited_at: before.edited_at, mentions: before.mentions }
          : m,
      );
    },
    onSuccess: (result) => {
      const message = result.message;
      if (message && typeof message === 'object' && 'id' in message) {
        applyMessageEdited(queryClient, conversationId, message);
      }
      // The list's preview line, when it was the newest.
      if (!result.queued) invalidateConversationRows(queryClient);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Catching up after the socket comes back
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a reconnect does, in place of refetching every page of every chat.
 *
 * The open thread asks only for what is newer than its newest message and
 * adds it. If that fills a page there may be a gap, so the thread starts
 * again from the newest page instead. The lists, the badge and the open
 * chat's receipts are read once; every other thread is only marked stale, to
 * be read when it is next opened.
 */
export function catchUpChats(queryClient: QueryClient, openId: string | null): void {
  queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
  queryClient.invalidateQueries({ queryKey: chatKeys.anyConversation });
  queryClient.invalidateQueries({ queryKey: chatKeys.unread });
  queryClient.invalidateQueries({
    queryKey: ['chat', 'thread'],
    refetchType: 'none',
    predicate: (q) => q.queryKey[2] !== openId,
  });
  queryClient.invalidateQueries({
    queryKey: ['chat', 'participants'],
    refetchType: 'none',
    predicate: (q) => q.queryKey[2] !== openId,
  });
  if (!openId) return;
  queryClient.invalidateQueries({ queryKey: chatKeys.participants(openId) });
  void catchUpThread(queryClient, openId);
}

async function catchUpThread(queryClient: QueryClient, conversationId: string): Promise<void> {
  const key = chatKeys.thread(conversationId);
  const cached = queryClient.getQueryData<ThreadPages>(key);
  const newest = cached?.pages?.[0]?.data?.[0];
  if (!cached || !Array.isArray(cached.pages) || !newest) {
    await queryClient.invalidateQueries({ queryKey: key });
    return;
  }
  const limit = firstPageSize(getConnectionQuality());
  let page: Thread;
  try {
    page = await chatApi.messages(conversationId, limit, undefined, newest.id);
  } catch {
    // An API that cannot answer `after`, or the newest has gone: read the
    // thread the long way.
    await queryClient.invalidateQueries({ queryKey: key });
    return;
  }
  if (page.data.length >= limit) {
    // A gap between what came and what is held: start from the newest page.
    try {
      const fresh = await fetchThreadPage(conversationId, undefined);
      queryClient.setQueryData<ThreadPages>(key, { pages: [fresh], pageParams: [undefined] });
    } catch {
      await queryClient.invalidateQueries({ queryKey: key });
    }
    return;
  }
  queryClient.setQueryData<ThreadPages>(key, (old) => {
    if (!old || !Array.isArray(old.pages) || old.pages.length === 0) return old;
    const [first, ...rest] = old.pages;
    const held = new Set(old.pages.flatMap((p) => p.data.map((m) => m.id)));
    const added = page.data.filter((m) => !held.has(m.id));
    const data = [...added, ...first.data].sort(newestFirst);
    return {
      ...old,
      pages: [
        {
          ...first,
          data,
          // The thread's own state as it is now: a block may have come or gone.
          ...(page.canSend !== undefined ? { canSend: page.canSend } : {}),
          ...(page.blockedByMe !== undefined ? { blockedByMe: page.blockedByMe } : {}),
          ...(page.blockId !== undefined ? { blockId: page.blockId } : {}),
        },
        ...rest,
      ],
    };
  });
}

/** Sends a message on to other chats, as your own, marked Forwarded. */
export function useForwardMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, targetIds }: { messageId: string; targetIds: string[] }) =>
      chatApi.forward(conversationId, messageId, targetIds),
    onSuccess: (_result, { targetIds }) => {
      invalidateConversationRows(queryClient);
      for (const id of targetIds) {
        queryClient.invalidateQueries({ queryKey: chatKeys.thread(id) });
      }
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
      // The row's count goes to zero now rather than on the refetch, so going
      // back to the list does not show it unread for a moment. Reading it
      // also clears "marked unread", as the server does.
      patchConversationRows(queryClient, (c) =>
        c.id === conversationId ? { ...c, unread: 0, markedUnread: false } : c,
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
 * Pins, archives or marks a chat unread, in your own list only.
 *
 * The list moves at once: an archived chat leaves it, a pinned one joins the
 * pinned group at the top. If the server says no — a sixth pin — every list
 * goes back as it was. Either way they are fetched again afterwards, since
 * the server decides the final order.
 */
export function useSetListState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, patch }: { conversationId: string; patch: ListStatePatch }) =>
      chatApi.setListState(conversationId, patch),
    onMutate: ({ conversationId, patch }) => {
      const lists = queryClient.getQueriesData<ConversationPages>({
        queryKey: chatKeys.allConversations,
      });
      const rows = queryClient.getQueriesData<Conversation | null>({
        queryKey: chatKeys.anyConversation,
      });

      const flags = (c: Conversation): Conversation => ({
        ...c,
        ...(patch.pinned !== undefined
          ? { pinned: patch.pinned, ...(patch.pinned ? { archived: false } : {}) }
          : {}),
        ...(patch.archived !== undefined
          ? { archived: patch.archived, ...(patch.archived ? { pinned: false } : {}) }
          : {}),
        ...(patch.markedUnread !== undefined ? { markedUnread: patch.markedUnread } : {}),
      });
      const leavesArchive = patch.archived === false || patch.pinned === true;

      patchConversationRows(queryClient, (c, key) => {
        if (c.id !== conversationId) return c;
        if (isArchivedKey(key)) return leavesArchive ? null : flags(c);
        // Out of the inbox and searches; it waits in Archived.
        if (patch.archived === true) return null;
        return flags(c);
      });

      // Pinned joins the pinned group, and the count of what is archived moves
      // with whatever went in or came out.
      for (const [key, list] of queryClient.getQueriesData<ConversationPages>({
        queryKey: chatKeys.allConversations,
      })) {
        if (!list || !Array.isArray(list.pages) || list.pages.length === 0 || isArchivedKey(key)) {
          continue;
        }
        const [first, ...rest] = list.pages;
        let data = first.data;
        if (patch.pinned === true) {
          const row = data.find((c) => c.id === conversationId);
          if (row) {
            const without = data.filter((c) => c.id !== conversationId);
            const lastPinned = without.reduce((at, c, i) => (c.pinned ? i : at), -1);
            data = [...without.slice(0, lastPinned + 1), row, ...without.slice(lastPinned + 1)];
          }
        }
        const delta = patch.archived === true ? 1 : leavesArchive ? -1 : 0;
        const archivedCount =
          first.archivedCount !== undefined && delta !== 0
            ? Math.max(0, first.archivedCount + delta)
            : first.archivedCount;
        if (data === first.data && archivedCount === first.archivedCount) continue;
        queryClient.setQueryData<ConversationPages>(key, {
          ...list,
          pages: [{ ...first, data, archivedCount }, ...rest],
        });
      }
      return { lists, rows };
    },
    onError: (_err, _vars, context) => {
      for (const [key, value] of context?.lists ?? []) queryClient.setQueryData(key, value);
      for (const [key, value] of context?.rows ?? []) queryClient.setQueryData(key, value);
    },
    onSettled: () => {
      invalidateConversationRows(queryClient);
      queryClient.invalidateQueries({ queryKey: chatKeys.unread });
    },
  });
}

/** Mutes or unmutes any chat (`minutes: 0`), for a list's menu. */
export function useMuteChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, minutes }: { conversationId: string; minutes: number }) =>
      chatApi.mute(conversationId, minutes),
    onSuccess: (result, { conversationId }) => {
      patchConversationRows(queryClient, (c) =>
        c.id === conversationId ? { ...c, muted: result.muted, mutedUntil: result.mutedUntil } : c,
      );
      invalidateConversationRows(queryClient);
      queryClient.invalidateQueries({ queryKey: chatKeys.unread });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Saved replies
// ─────────────────────────────────────────────────────────────────────────────

/** Your saved replies, oldest first. Only fetched once the sheet asks. */
export function useSavedReplies(enabled = true) {
  const query = useQuery({
    queryKey: chatKeys.savedReplies,
    queryFn: () => savedRepliesApi.list(),
    enabled,
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    replies: query.data?.data ?? [],
  };
}

type SavedReplyList = { data: SavedReply[]; total: number };

export function useSaveReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title, body }: { id?: string; title: string; body: string }) =>
      id ? savedRepliesApi.update(id, { title, body }) : savedRepliesApi.create(title, body),
    onSuccess: (reply) => {
      queryClient.setQueryData<SavedReplyList>(chatKeys.savedReplies, (old) => {
        if (!old || !Array.isArray(old.data)) return old;
        const exists = old.data.some((r) => r.id === reply.id);
        return exists
          ? { ...old, data: old.data.map((r) => (r.id === reply.id ? reply : r)) }
          : { data: [...old.data, reply], total: old.total + 1 };
      });
      queryClient.invalidateQueries({ queryKey: chatKeys.savedReplies });
    },
  });
}

export function useDeleteSavedReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => savedRepliesApi.remove(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<SavedReplyList>(chatKeys.savedReplies, (old) =>
        old && Array.isArray(old.data)
          ? { data: old.data.filter((r) => r.id !== id), total: Math.max(0, old.total - 1) }
          : old,
      );
      queryClient.invalidateQueries({ queryKey: chatKeys.savedReplies });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Link previews
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a chat draws under a Virgo link, or null when there is nothing to draw.
 *
 * A 404 is an answer, not a failure: the link is not one of Virgo's pages, or
 * no longer works, and it stays a plain link. Not retried — a card that never
 * comes is fine; a bubble that jumps three times while it tries is not.
 */
export function useLinkPreview(url: string | null) {
  return useQuery({
    queryKey: chatKeys.linkPreview(url ?? ''),
    queryFn: async (): Promise<LinkPreview | null> => {
      try {
        return await linkPreviewsApi.get(url!);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) return null;
        throw err;
      }
    },
    enabled: !!url,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * Buzzes the device when a message arrives while the app is open.
 *
 * The push channel covers the background case, but a foreground message never
 * produces a system notification — polling just drops it into the list — so
 * nothing would tell the user without this.
 *
 * Mounted once, app-wide, so a message announces itself from any screen.
 * A rise in the total is the signal; a fall (reading a thread) is not, and the
 * baseline is seeded from the first reading so opening the app with unread
 * messages already waiting does not buzz.
 */
export function useMessageAlerts(enabled: boolean): void {
  const unread = useUnreadCount(enabled);
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      previous.current = null;
      return;
    }
    const before = previous.current;
    previous.current = unread;

    if (before === null || unread <= before) return;
    // The thread on screen already shows the message and buzzes for itself.
    if (getOpenConversation()) return;
    // The socket already dealt with it (see noteLiveMessage).
    if (Date.now() - lastLiveMessageAt < 15_000) return;
    // In the background the push is what tells them.
    if (AppState.currentState !== 'active') return;

    void buzzForMessage();
  }, [enabled, unread]);
}
