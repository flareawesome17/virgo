'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  useCallback,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  AtSign,
  Check,
  CheckCheck,
  Clock,
  Forward,
  Info,
  Loader2,
  MessageSquareOff,
  Pencil,
  Reply,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { usePublishComposerOffset } from '@/lib/edge-offsets';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CenteredSpinner, EmptyState, ErrorState } from '@/components/states';
import {
  flushOutbox,
  retryOutboxItem,
  useConversation,
  useDeleteMessage,
  useEditMessage,
  useMarkThreadRead,
  useOpenConversation,
  useParticipants,
  useReactToMessage,
  useThread,
  useWaitingEdits,
} from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';
import { useUnblock } from '@/hooks/useBlocks';
import {
  addToOutbox,
  newClientId,
  removeFromOutbox,
  thawOutbox,
  useOutbox,
  type OutboxItem,
} from '@/lib/outbox';
import { PresenceDot, PresenceLine, TypingIndicator } from '@/components/presence';
import { sendTyping } from '@/lib/presence-store';
import { buzzForMessage } from '@/lib/alerts';
import { JobAcceptedCard } from '@/components/chat/job-accepted-card';
import { MessageFrame, MessageToolbar } from '@/components/chat/message-actions';
import { LinkPreviewCard, MessageBody } from '@/components/chat/message-body';
import { ReactionBar } from '@/components/chat/reactions';
import { SeenBy } from '@/components/chat/seen-by';
import { ShareMenu } from '@/components/chat/share/share-menu';
import { ChatCard, cardIsCentred, cardReadout, type CardEnv } from '@/components/chat/cards';
import { ForwardDialog } from '@/components/chat/forward-dialog';
import { PayChatCard } from '@/components/money/pay-card';
import { chatProblem } from '@/components/chat/chat-errors';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { GroupAvatar } from '@/components/chat/group-avatar';
import { PinnedPanel, PinnedStrip, ReplacePinDialog } from '@/components/chat/pins';
import { ChatSearchCount, ChatSearchFooter, ChatSearchHeader } from '@/components/chat/chat-search';
import { takeChatJump, useChatJump, type ChatJump } from '@/components/chat/chat-jump';
import {
  useChatSearch,
  usePinMessage,
  usePins,
  useThreadAround,
  useUnpinMessage,
} from '@/hooks/useChatCrew';
import {
  ApiError,
  cardSummary,
  firstVirgoLink,
  groupSubtitle,
  isCardKind,
  isNotice,
  isPinsFull,
  myReaction,
  type CardKind,
  type ConversationMessage,
  type JobAcceptedContext,
  type Participant,
  type ReactionKey,
} from '@/api';

type Delivery = 'sending' | 'failed' | 'sent' | 'delivered' | 'read';

type Row =
  | { kind: 'message'; message: ConversationMessage }
  | { kind: 'outgoing'; outgoing: OutboxItem }
  | { kind: 'divider' };

/** The most matches a search in one chat answers with; past it the count says "200+". */
const SEARCH_MATCH_CAP = 200;

/** What an unsent bubble says under its text. */
const UNSENT_LABEL: Record<OutboxItem['status'], string> = {
  sending: 'Sending…',
  waiting: 'Waiting for connection',
  failed: 'Not sent',
  refused: 'Not sent',
};

/** Whether the tab is the one being looked at. */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

/** How a notice addresses someone: by first name, as a person would. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/**
 * A message as a quote: its words, or for a shared card what it is —
 * "Album photos · 12 photos · Santos Wedding" rather than the card's
 * stored text and link.
 */
function quoteOf(message: ConversationMessage): string {
  const card = cardSummary(message);
  return card ? `${card.label} · ${card.title}` : message.body;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The tick, clock or warning next to your own message. */
function DeliveryMark({ state }: { state: Delivery }) {
  if (state === 'failed') return <AlertCircle className="size-3 text-destructive" />;
  if (state === 'sending') return <Clock className="size-3 opacity-60" />;
  if (state === 'sent') return <Check className="size-3 opacity-60" />;
  // Delivered and read differ by weight, not shape — the convention people
  // already read without a legend.
  return <CheckCheck className={cn('size-3', state === 'read' ? 'opacity-100' : 'opacity-60')} />;
}

export function Thread({
  conversationId,
  onBack,
  onOpenInfo,
}: {
  conversationId: string;
  /** Only shown on narrow windows, where the list and thread are separate views. */
  onBack?: () => void;
  onOpenInfo: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const {
    messages,
    lastReadAt,
    isLoading,
    canSend: threadAllowsSending,
    blockedByMe,
    blockId,
    data: threadData,
    error: threadError,
    loadFailed: threadFailed,
    refetch: refetchThread,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useThread(conversationId);
  /*
   * Nothing is said, and nothing can be sent, until the thread has arrived.
   *
   * `canSend` is true when the server does not say — so a thread that failed
   * to load, or one you are no longer in, would show "No messages yet" over a
   * composer that failed every send.
   */
  const threadReady = threadData !== undefined;
  const canSend = threadReady && threadAllowsSending;
  const threadGone =
    !threadReady &&
    threadError instanceof ApiError &&
    (threadError.status === 404 || threadError.status === 403);

  const { participants } = useParticipants(conversationId);
  const { conversation } = useConversation(conversationId);
  const outbox = useOutbox(conversationId);
  const remove = useDeleteMessage(conversationId);
  const markRead = useMarkThreadRead();
  const unblock = useUnblock();
  const visible = usePageVisible();

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ConversationMessage | null>(null);
  const [mentioned, setMentioned] = useState<Participant[]>([]);
  const [askUnblock, setAskUnblock] = useState(false);
  /** The message the composer is changing, while it is. */
  const [editing, setEditing] = useState<ConversationMessage | null>(null);
  /** What was being written before Edit took the box, put back after. */
  const beforeEdit = useRef<{
    draft: string;
    mentioned: Participant[];
    replyTo: ConversationMessage | null;
  }>({ draft: '', mentioned: [], replyTo: null });
  const [forwarding, setForwarding] = useState<ConversationMessage | null>(null);
  /** Where the caret last was, for a saved reply to go in at; null until placed. */
  const caret = useRef<{ start: number; end: number } | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const composerRowRef = usePublishComposerOffset<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const olderRef = useRef<HTMLDivElement>(null);
  const meId = user?.id;
  const react = useReactToMessage(conversationId, meId);
  const edit = useEditMessage(conversationId);
  /** Edits made with no connection, shown as done and said to be waiting. */
  const waitingEdits = useWaitingEdits();

  /*
   * Pins (board 136): up to three per chat, the same for everyone. Which
   * messages are pinned is read from the pins themselves once they are here,
   * so the ⋯ says Pin or Unpin rightly the moment somebody changes one; the
   * message's own `pinned_at` covers the moment before.
   */
  const pinsQuery = usePins(conversationId);
  const pins = pinsQuery.pins;
  const pinsKnown = pinsQuery.data !== undefined;
  const pinnedIds = useMemo(() => new Set(pins.map((p) => p.id)), [pins]);
  const pinMessage = usePinMessage(conversationId);
  const unpinMessage = useUnpinMessage(conversationId);
  const [pinsOpen, setPinsOpen] = useState(false);
  /** A message waiting to go up while the chat holds three: which comes down. */
  const [replacing, setReplacing] = useState<ConversationMessage | null>(null);

  /*
   * Search in this chat (board 140). The header becomes the box; each match
   * opens the messages around it in place of the live thread, which carries
   * on underneath and is what Done goes back to.
   */
  const [searching, setSearching] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  /** What is searched for: the box, once typing pauses. */
  const [searchTerm, setSearchTerm] = useState('');
  /** Which match is showing, and for which term — a new term starts at the newest. */
  const [cursor, setCursor] = useState({ term: '', index: 0 });
  /** The match the list's search opened this chat at, until the matches arrive to place it. */
  const [landing, setLanding] = useState<{ term: string; id: string } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const chatSearch = useChatSearch(conversationId, searching ? searchTerm : '');
  const matches = chatSearch.matches;
  const searchReady = chatSearch.data !== undefined;
  /** A pin jumped to, outside a search. */
  const [pinJump, setPinJump] = useState<string | null>(null);

  // Typing pauses before the search goes, as the list's does.
  useEffect(() => {
    const id = setTimeout(() => setSearchTerm(searchDraft.trim()), 300);
    return () => clearTimeout(id);
  }, [searchDraft]);

  // Another chat: nothing of this one's search or jump carries over.
  const [modeFor, setModeFor] = useState(conversationId);
  if (modeFor !== conversationId) {
    setModeFor(conversationId);
    setSearching(false);
    setSearchDraft('');
    setSearchTerm('');
    setLanding(null);
    setPinJump(null);
    setPinsOpen(false);
    setReplacing(null);
  }

  /*
   * Opened from somewhere else: at a match from the list's search, or at the
   * search box or the pins from group info. Applied as it arrives, then
   * cleared, so coming back to this chat later does not open it that way
   * again.
   */
  const jump = useChatJump(conversationId);
  const [appliedJump, setAppliedJump] = useState<ChatJump | null>(null);
  if (jump && jump !== appliedJump) {
    setAppliedJump(jump);
    if (jump.kind === 'pins') {
      setSearching(false);
      setSearchDraft('');
      setSearchTerm('');
      setLanding(null);
      setPinsOpen(true);
    } else {
      const term = jump.q.trim();
      setSearching(true);
      setSearchDraft(jump.q);
      setSearchTerm(term);
      setCursor({ term, index: 0 });
      setLanding(jump.matchId && term ? { term, id: jump.matchId } : null);
      setPinJump(null);
      setPinsOpen(false);
    }
  }
  useEffect(() => {
    if (jump) takeChatJump(jump);
  }, [jump]);

  // The list's match placed among this chat's own matches, once they are here.
  if (landing && landing.term === searchTerm && searchReady) {
    const at = matches.findIndex((m) => m.id === landing.id);
    setLanding(null);
    setCursor({ term: searchTerm, index: Math.max(at, 0) });
  }

  const matchIndex =
    cursor.term === searchTerm ? Math.min(cursor.index, Math.max(matches.length - 1, 0)) : 0;
  /** The message the chat is open at: the current match, or a pin. */
  const focusId = searching ? (landing?.id ?? matches[matchIndex]?.id ?? null) : pinJump;
  /** While a new term's matches are on their way, the chat stays where it is. */
  const searchSettling =
    searching &&
    (searchDraft.trim() !== searchTerm || (!!searchTerm && !searchReady && !chatSearch.loadFailed));

  /*
   * The window on screen: the messages around one message. Stepping to a
   * match already in it only scrolls; anything else loads its own window.
   */
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const around = useThreadAround(conversationId, anchorId);
  if (focusId !== anchorId && !(searchSettling && !focusId)) {
    if (!focusId) {
      setAnchorId(null);
    } else if (!(anchorId && around.data && around.messages.some((m) => m.id === focusId))) {
      setAnchorId(focusId);
    }
  }
  const windowMode = anchorId !== null;
  const aroundReady = around.data !== undefined;
  /** What a search marks in the bubbles on screen. */
  const highlight = searching ? searchTerm : null;

  // The match or pin, brought into the middle of the view once it is drawn.
  useLayoutEffect(() => {
    if (!focusId || !aroundReady) return;
    const target = scrollRef.current?.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(focusId)}"]`,
    );
    target?.scrollIntoView({ block: 'center' });
  }, [focusId, aroundReady, anchorId]);

  // Back from a window to the live thread: at its newest, as Done promises.
  const wasWindow = useRef(false);
  useLayoutEffect(() => {
    if (wasWindow.current && !windowMode) scrollRef.current?.scrollTo({ top: 0 });
    wasWindow.current = windowMode;
  }, [windowMode]);

  /**
   * Whether we have already told the server this user is typing.
   *
   * A keystroke must not become a socket frame — a fast typist would send
   * dozens a second. One frame on the first character, one when they stop,
   * and a repeat only after the flag has been cleared.
   */
  const typingSent = useRef(false);
  const typingIdle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stopTyping = useCallback(() => {
    clearTimeout(typingIdle.current);
    if (!typingSent.current) return;
    typingSent.current = false;
    sendTyping(conversationId, false);
  }, [conversationId]);

  const noteTyping = useCallback(
    (value: string) => {
      // An emptied box is not typing. Without this, clearing a draft would
      // leave the indicator running on the other side until it timed out.
      if (!value.trim()) {
        stopTyping();
        return;
      }
      if (!typingSent.current) {
        typingSent.current = true;
        sendTyping(conversationId, true);
      }
      // Falls quiet on its own if they stop without sending or blurring —
      // shorter than the receiver's 6s expiry, so the stop arrives first.
      clearTimeout(typingIdle.current);
      typingIdle.current = setTimeout(stopTyping, 3000);
    },
    [conversationId, stopTyping],
  );

  // Leaving the thread must not strand the indicator on everyone else's screen.
  useEffect(() => stopTyping, [stopTyping]);

  // Tells the app-wide alert watcher not to fire for this thread — it is on
  // screen, and this component alerts for itself.
  useOpenConversation(conversationId);

  /*
   * Read when it is actually being looked at.
   *
   * Keyed on the newest message rather than on how many are loaded: the
   * thread was the newest hundred, so in a long one the count stopped
   * changing, new messages were never marked read and the badge never
   * cleared. And only while the tab is visible — a chat left open in a
   * background tab marked messages read that nobody had seen.
   */
  const newest = messages[0];
  const lastMarked = useRef<string | null>(null);
  useEffect(() => {
    if (!newest || !visible) return;
    if (lastMarked.current === newest.id) return;
    lastMarked.current = newest.id;
    markRead.mutate(conversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, newest?.id, visible]);

  /**
   * Buzz when someone else's message arrives while you are reading.
   *
   * Only for something newer than what was newest before. Keyed on the id
   * alone, deleting your own newest message buzzed whenever the one before it
   * was somebody else's. The first load is seeded silently, per conversation —
   * opening a thread should not buzz at you.
   */
  const newestSeen = useRef<{ id: string; at: number } | null>(null);
  useEffect(() => {
    if (!newest) return;
    const at = new Date(newest.created_at).getTime();
    const previous = newestSeen.current?.id === conversationId ? newestSeen.current.at : null;
    if (previous !== null && at <= previous) return;
    newestSeen.current = { id: conversationId, at };
    if (previous === null) return;
    if (newest.sender_id === user?.id) return;
    // Somebody joining or leaving is not a message to buzz for.
    if (isNotice(newest)) return;
    buzzForMessage();
  }, [newest, conversationId, user?.id]);

  /*
   * A refusal only holds while the thread is frozen. Once it thaws — you
   * unblocked them from the notice, or from another device — the same send
   * would go through, so what was refused becomes an ordinary failure with
   * Retry again.
   */
  const couldSend = useRef(canSend);
  useEffect(() => {
    const thawed = !couldSend.current && canSend;
    couldSend.current = canSend;
    if (thawed) thawOutbox(conversationId);
  }, [canSend, conversationId]);

  /*
   * Older messages load as their end of the list comes into view.
   *
   * The thread was the newest hundred and nothing else: anything older could
   * not be reached at all.
   */
  useEffect(() => {
    const target = olderRef.current;
    const root = scrollRef.current;
    if (!target || !root || !hasNextPage) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (!isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
      },
      { root, rootMargin: '400px 0px 0px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, threadReady, windowMode]);

  const others = useMemo(
    () => participants.filter((p) => p.id !== user?.id),
    [participants, user?.id],
  );
  /** Everyone by id, for who reacted. */
  const people = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  /** Everyone's name, for drawing @mentions. */
  const mentionNames = useMemo(() => participants.map((p) => p.name), [participants]);
  /*
   * A group is a group because the server says so, not by head count: one
   * with two members left rendered as a direct chat — the other person's name
   * and presence where the group should be. And the group's own name was
   * never shown; the header said "3 people".
   */
  const isGroup = conversation?.isGroup ?? participants.length > 2;
  const title = isGroup
    ? conversation?.title?.trim() || `${participants.length} people`
    : (others[0]?.name ?? conversation?.title ?? 'Conversation');
  /** Who the frozen-thread notice names. */
  const noticeName = (!isGroup ? others[0]?.name : undefined) ?? conversation?.title ?? title;

  /**
   * Read beats delivered beats sent, each a comparison against one timestamp
   * per person. In a group the weakest link decides: only *delivered* once it
   * has reached everyone.
   */
  const deliveryOf = (sentAt: string): Delivery => {
    if (others.length === 0) return 'sent';
    const sent = new Date(sentAt).getTime();
    const at = (value: string | null) => (value ? new Date(value).getTime() : -1);
    if (others.every((p) => at(p.last_read_at) >= sent)) return 'read';
    if (others.every((p) => at(p.last_delivered_at) >= sent)) return 'delivered';
    return 'sent';
  };

  // The partial @word at the end of the draft, if any.
  const mentionQuery = useMemo(() => {
    const match = /(?:^|\s)@([^\s@]*)$/.exec(draft);
    return match ? match[1] : null;
  }, [draft]);

  const mentionOptions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return others.filter((p) => p.name.toLowerCase().startsWith(q)).slice(0, 6);
  }, [mentionQuery, others]);

  const pickMention = (person: Participant) => {
    setDraft((current) => current.replace(/@[^\s@]*$/, `@${person.name} `));
    setMentioned((prev) => (prev.some((p) => p.id === person.id) ? prev : [...prev, person]));
    composerRef.current?.focus();
  };

  /** Puts the caret at `at` once the box has its new value. */
  const focusComposer = (at?: number) => {
    requestAnimationFrame(() => {
      const box = composerRef.current;
      if (!box) return;
      box.focus();
      const end = at ?? box.value.length;
      box.setSelectionRange(end, end);
    });
  };

  const startReply = (message: ConversationMessage) => {
    // A reply is a new message, so an edit in progress steps aside first.
    if (editing) endEdit();
    setReplyTo(message);
    focusComposer();
  };

  /**
   * The composer becomes the message (board 123): its words in the box, a bar
   * saying who will see it marked Edited, and Save in place of Send. Whatever
   * was being written waits, and comes back when the edit is done.
   */
  const startEdit = (message: ConversationMessage) => {
    if (!editing) beforeEdit.current = { draft, mentioned, replyTo };
    setEditing(message);
    setReplyTo(null);
    setDraft(message.body);
    setMentioned(participants.filter((p) => message.mentions?.includes(p.id)));
    // An edit is not somebody writing a new message.
    stopTyping();
    caret.current = null;
    focusComposer(message.body.length);
  };

  const endEdit = () => {
    setEditing(null);
    setDraft(beforeEdit.current.draft);
    setMentioned(beforeEdit.current.mentioned);
    setReplyTo(beforeEdit.current.replyTo);
    beforeEdit.current = { draft: '', mentioned: [], replyTo: null };
    caret.current = null;
    focusComposer();
  };

  /**
   * Saves an edit. Drawn at once, marked Edited; if the server refuses — the
   * window closed while it was open, say — the old words come back and the
   * toast says why.
   */
  const saveEdit = () => {
    const target = editing;
    if (!target) return;
    const body = draft.trim();
    if (!body) return;
    if (body !== target.body) {
      const named = mentioned.filter((p) => body.includes(`@${p.name}`)).map((p) => p.id);
      edit.mutate(
        {
          messageId: target.id,
          body,
          // Only when there is something to say about mentions: left out, the
          // server keeps the ones it has.
          mentionIds: named.length > 0 || (target.mentions?.length ?? 0) > 0 ? named : undefined,
        },
        {
          onError: (err) =>
            toast.error('Could not save the change', { description: chatProblem(err) }),
        },
      );
    }
    endEdit();
  };

  /** A saved reply, into the box at the caret, or after what is there. */
  const insertSaved = (text: string) => {
    const at = caret.current;
    let next: string;
    let end: number;
    if (at && at.start <= draft.length && at.end <= draft.length) {
      next = draft.slice(0, at.start) + text + draft.slice(at.end);
      end = at.start + text.length;
    } else {
      const gap = draft && !/\s$/.test(draft) ? ' ' : '';
      next = draft + gap + text;
      end = next.length;
    }
    setDraft(next);
    if (!editing) noteTyping(next);
    caret.current = { start: end, end };
    focusComposer(end);
  };

  const reactTo = (message: ConversationMessage, reaction: ReactionKey | null) => {
    react.mutate(
      { messageId: message.id, reaction },
      { onError: (err) => toast.error('Could not react', { description: chatProblem(err) }) },
    );
  };

  /** A pill under a message: yours of that kind on, or off again. */
  const togglePill = (message: ConversationMessage, reaction: ReactionKey) =>
    reactTo(message, myReaction(message.reactions, meId) === reaction ? null : reaction);

  const aroundMessages = around.messages;
  const rows = useMemo<Row[]>(() => {
    // A window around a match or a pin: just those messages. Nothing unsent
    // and no "New messages" line belong in the middle of history.
    if (windowMode) return aroundMessages.map((message) => ({ kind: 'message', message }));
    const pending: Row[] = outbox
      .slice()
      .reverse()
      .map((outgoing) => ({ kind: 'outgoing', outgoing }));
    const base: Row[] = messages.map((message) => ({ kind: 'message', message }));
    if (!lastReadAt) return [...pending, ...base];

    const boundary = new Date(lastReadAt).getTime();
    let firstUnread = -1;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      // A notice is never unread: "Jo joined" is not something to catch up on.
      if (isNotice(m)) continue;
      if (m.sender_id !== user?.id && new Date(m.created_at).getTime() > boundary) {
        firstUnread = i;
      }
    }
    if (firstUnread === -1) return [...pending, ...base];

    return [
      ...pending,
      ...base.slice(0, firstUnread + 1),
      { kind: 'divider' },
      ...base.slice(firstUnread + 1),
    ];
  }, [messages, outbox, lastReadAt, user?.id, windowMode, aroundMessages]);

  /**
   * Sends, keeping the text on screen until the server has it.
   *
   * Through the outbox, which outlives this thread: a message that cannot go
   * now goes when the connection comes back, whether or not this chat is
   * still open, and a retry carries the same id so it is never stored twice.
   * It was component state, so going to another chat or reloading the tab
   * threw away whatever had not gone yet.
   */
  const submit = () => {
    if (editing) {
      saveEdit();
      return;
    }
    const body = draft.trim();
    if (!body || !canSend) return;
    addToOutbox({
      clientId: newClientId(),
      conversationId,
      body,
      replyToId: replyTo?.id,
      replyToBody: replyTo ? quoteOf(replyTo) : null,
      replyToSender: replyTo?.sender_name ?? null,
      mentionIds: mentioned.filter((p) => body.includes(`@${p.name}`)).map((p) => p.id),
      status: 'sending',
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
    setDraft('');
    setReplyTo(null);
    setMentioned([]);
    // Sending is the clearest possible "stopped typing".
    stopTyping();
    void flushOutbox(queryClient);
    // Off a pin's window too: what was sent is at the newest end.
    setPinJump(null);
    // What you just sent is what you want to see, wherever you had scrolled.
    // The list runs bottom-up, so the newest end is the top of the scroll.
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const copyText = (text: string) => {
    void navigator.clipboard.writeText(text).then(
      () => toast.success('Copied'),
      () => toast.error('Could not copy'),
    );
  };

  const confirmUnblock = () => {
    if (!blockId) return;
    unblock.mutate(blockId, {
      onSuccess: () => setAskUnblock(false),
      onError: (err: Error) => toast.error('Could not unblock', { description: err.message }),
    });
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (editing && event.key === 'Escape') {
      event.preventDefault();
      endEdit();
      return;
    }
    if (mentionOptions.length > 0 && event.key === 'Tab') {
      event.preventDefault();
      pickMention(mentionOptions[0]);
      return;
    }
    // Enter sends, Shift+Enter breaks the line — the convention every chat
    // client on a keyboard uses.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const deleteMessage = (message: ConversationMessage, scope: 'me' | 'everyone') => {
    remove.mutate(
      { messageId: message.id, scope },
      { onError: (err: Error) => toast.error('Could not delete', { description: err.message }) },
    );
  };

  const isPinned = (message: ConversationMessage) =>
    pinsKnown ? pinnedIds.has(message.id) : !!message.pinned_at;

  /**
   * Pin or Unpin from a message's ⋯. A fourth pin is refused (409) and asks
   * which of the three comes down, with the pins as they are now.
   */
  const togglePin = (message: ConversationMessage) => {
    if (isPinned(message)) {
      unpinMessage.mutate(message.id, {
        onError: (err) => toast.error('Could not unpin it', { description: chatProblem(err) }),
      });
      return;
    }
    pinMessage.mutate(
      { messageId: message.id },
      {
        onError: (err) => {
          if (isPinsFull(err)) {
            void pinsQuery.refetch();
            setReplacing(message);
            return;
          }
          toast.error('Could not pin it', { description: chatProblem(err) });
        },
      },
    );
  };

  /** The chooser's answer: this one comes down, the waiting one goes up. */
  const replacePin = (old: ConversationMessage) => {
    const target = replacing;
    if (!target) return;
    pinMessage.mutate(
      { messageId: target.id, replace: old.id },
      {
        onSuccess: () => setReplacing(null),
        onError: (err) => {
          // Somebody changed the pins meanwhile: ask again with them as they are.
          if (isPinsFull(err)) {
            void pinsQuery.refetch();
            return;
          }
          setReplacing(null);
          toast.error('Could not pin it', { description: chatProblem(err) });
        },
      },
    );
  };

  /** Pin and Unpin, where they apply: anything said, while the chat takes changes. */
  const pinControl = (message: ConversationMessage) =>
    canSend ? { pinned: isPinned(message), onToggle: () => togglePin(message) } : undefined;

  const unpinFromList = (message: ConversationMessage) =>
    unpinMessage.mutate(message.id, {
      onError: (err) => toast.error('Could not unpin it', { description: chatProblem(err) }),
    });

  /** A pin, from the Pinned popover: the messages around it, with it ringed. */
  const jumpToPin = (message: ConversationMessage) => {
    setPinsOpen(false);
    setPinJump(message.id);
  };

  /** Off a pin's window, to the newest messages. */
  const backToLatest = () => setPinJump(null);

  const openSearch = () => {
    setSearching(true);
    setPinsOpen(false);
    setPinJump(null);
    // Already open: back into the box.
    searchInputRef.current?.focus();
  };

  /** Done: the live thread again, at its newest. */
  const closeSearch = () => {
    setSearching(false);
    setSearchDraft('');
    setSearchTerm('');
    setLanding(null);
    setCursor({ term: '', index: 0 });
  };

  const stepOlder = () => {
    if (matches.length === 0) return;
    setLanding(null);
    setCursor({ term: searchTerm, index: Math.min(matchIndex + 1, matches.length - 1) });
  };

  const stepNewer = () => {
    if (matches.length === 0) return;
    setLanding(null);
    setCursor({ term: searchTerm, index: Math.max(matchIndex - 1, 0) });
  };

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Header, or the search box in its place (board 140). */}
      {searching ? (
        <>
          <ChatSearchHeader
            inputRef={searchInputRef}
            value={searchDraft}
            onChange={setSearchDraft}
            onDone={closeSearch}
            onOlder={stepOlder}
            onNewer={stepNewer}
          />
          <ChatSearchCount
            term={searchTerm}
            title={title}
            total={matches.length}
            index={matchIndex}
            capped={matches.length >= SEARCH_MATCH_CAP}
            loading={chatSearch.isFetching || searchSettling}
            failed={chatSearch.loadFailed}
            onRetry={() => void chatSearch.refetch()}
            onOlder={stepOlder}
            onNewer={stepNewer}
          />
        </>
      ) : (
        <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          {onBack && (
            <Button size="icon" variant="ghost" onClick={onBack} aria-label="Back">
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <button
            onClick={onOpenInfo}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-accent/50"
          >
            {isGroup ? (
              // The group's photo or initial; a team chat is a rounded square
              // like the workspace it belongs to (board 135).
              <GroupAvatar
                title={title}
                photoUrl={conversation?.avatarUrl}
                team={conversation?.origin === 'workspace'}
                className="size-8"
                initialClassName="text-[13px]"
              />
            ) : (
              <div className="relative shrink-0">
                <Avatar className="size-8">
                  {others[0]?.avatar_url && <AvatarImage src={others[0].avatar_url} alt="" />}
                  <AvatarFallback className="bg-primary/15 text-[11px] font-bold text-primary">
                    {(others[0]?.name ?? '?').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <PresenceDot userId={others[0]?.id} className="size-2.5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{title}</p>
              <p className="truncate">
                {isGroup ? (
                  // "Team chat · 6 people", "5 people · From the Santos Wedding
                  // job": what the group is, rather than a run of names.
                  <span className="text-xs text-muted-foreground">
                    {(conversation && groupSubtitle(conversation)) ||
                      participants.map((p) => p.name).join(', ')}
                  </span>
                ) : (
                  // Online / last seen, kept current by the socket.
                  <PresenceLine userId={others[0]?.id} />
                )}
              </p>
            </div>
          </button>
          <Button size="icon" variant="ghost" onClick={openSearch} aria-label="Search in this chat" title="Search in this chat">
            <Search className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onOpenInfo} aria-label="Conversation info">
            <Info className="size-4" />
          </Button>
        </div>
      )}

      {/* Pinned (boards 135, 136 and 148): the strip while anything is
          pinned, opening the list of pins. Not while searching: the search
          has the top of the chat then. The popover hangs from here even with
          nothing pinned, for group info's Pinned tile. */}
      <Popover open={pinsOpen} onOpenChange={setPinsOpen}>
        <PopoverAnchor asChild>
          <div className="shrink-0">
            {!searching && pins.length > 0 && (
              <PopoverTrigger asChild>
                <PinnedStrip pins={pins} />
              </PopoverTrigger>
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="ml-4 w-[min(26rem,calc(100vw-2rem))] p-4"
        >
          <PinnedPanel
            pins={pins}
            meId={meId}
            loading={pinsQuery.isLoading}
            failed={pinsQuery.loadFailed}
            onRetry={() => void pinsQuery.refetch()}
            canChange={canSend}
            unpinning={unpinMessage.isPending ? (unpinMessage.variables ?? null) : null}
            onJump={jumpToPin}
            onUnpin={unpinFromList}
          />
        </PopoverContent>
      </Popover>

      {/* Messages. The scroller itself runs bottom-up, which keeps the newest
          pinned as items arrive and keeps your place as older pages load
          above, without a scroll call that fights someone reading history.
          It was a column-reverse list inside a top-down scroller, which
          opened a long thread at its oldest message. */}
      {isLoading && messages.length === 0 && !threadFailed ? (
        <CenteredSpinner className="flex-1" />
      ) : threadGone ? (
        <EmptyState
          icon={MessageSquareOff}
          title="This conversation isn't available"
          description="It was deleted, or you're no longer in it."
          className="flex-1"
        />
      ) : !threadReady && threadFailed ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <ErrorState
            message="Couldn't load this conversation."
            onRetry={() => void refetchThread()}
          />
        </div>
      ) : windowMode && !aroundReady ? (
        // The messages around a match or a pin, on their way.
        around.loadFailed ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
            <ErrorState
              message="Couldn't open the chat at that message."
              onRetry={() => void around.refetch()}
            />
            {!searching && (
              <Button variant="ghost" size="sm" onClick={backToLatest}>
                Back to the latest
              </Button>
            )}
          </div>
        ) : (
          <CenteredSpinner className="flex-1" />
        )
      ) : (
        <div
          ref={scrollRef}
          // `data-thread-scroller`: where a message's toolbar looks to see if
          // there is room above it. Never sideways: a toolbar waiting off the
          // edge of a wide bubble must not give the thread a scrollbar.
          data-thread-scroller
          className="flex min-h-0 flex-1 flex-col-reverse gap-2 overflow-y-auto overflow-x-hidden p-4"
        >
          {/* First child of a column-reverse list, so it sits visually at
              the bottom — below the newest message, where a typing bubble
              belongs. Not in a window on history. */}
          {!windowMode && <TypingIndicator conversationId={conversationId} meId={meId} />}

          {/* Off a pin's window and back to the newest; a search has Done.
              Held to the bottom of the view while the window scrolls. */}
          {windowMode && !searching && (
            <div className="pointer-events-none sticky bottom-0 z-10 flex justify-center pt-1">
              <Button
                size="sm"
                variant="secondary"
                onClick={backToLatest}
                className="pointer-events-auto rounded-full shadow-md"
              >
                <ArrowDown className="size-3.5" />
                Back to the latest
              </Button>
            </div>
          )}

          {rows.length === 0 && (
            <EmptyState
              icon={Users}
              title={windowMode ? "That message isn't here any more" : 'No messages yet'}
              description={!windowMode && canSend ? 'Say hello.' : undefined}
            />
          )}

          {rows.map((row, index) => {
            if (row.kind === 'divider') {
              return (
                <div key={`divider-${index}`} className="flex items-center gap-3 py-1">
                  <span className="h-px flex-1 bg-primary/40" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
                    New messages
                  </span>
                  <span className="h-px flex-1 bg-primary/40" />
                </div>
              );
            }

            if (row.kind === 'outgoing') {
              const o = row.outgoing;
              const failed = o.status === 'failed' || o.status === 'refused';
              return (
                <MessageFrame
                  key={o.clientId}
                  side="end"
                  label={`You: ${UNSENT_LABEL[o.status]}`}
                  // Not sent yet: Delete only, which takes it off this device.
                  // Not while it is on its way — it could still arrive.
                  toolbar={
                    o.status === 'sending'
                      ? null
                      : (hold) => (
                          <MessageToolbar
                            hold={hold}
                            side="end"
                            onDiscard={() => removeFromOutbox(o.clientId)}
                          />
                        )
                  }
                >
                  <div
                    className={cn(
                      'rounded-2xl bg-primary px-3.5 py-2.5 text-primary-foreground',
                      failed ? 'opacity-75' : 'opacity-85',
                    )}
                  >
                    {o.replyToBody != null && (
                      <div className="mb-1.5 rounded-lg border-l-2 border-white/60 bg-black/15 px-2 py-1.5">
                        <p className="text-[10px] font-bold opacity-80">{o.replyToSender}</p>
                        <p className="truncate text-[11px] opacity-70">{o.replyToBody}</p>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap text-sm wrap-anywhere">{o.body}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] opacity-70">
                      <span>{UNSENT_LABEL[o.status]}</span>
                      <DeliveryMark state={failed ? 'failed' : 'sending'} />
                      {failed && (
                        <>
                          {/* A refused message would be refused again: Copy
                              keeps the words for somewhere they can go. */}
                          {o.status === 'refused' ? (
                            <button
                              onClick={() => copyText(o.body)}
                              className="font-bold underline underline-offset-2"
                            >
                              Copy
                            </button>
                          ) : (
                            <button
                              onClick={() => retryOutboxItem(queryClient, o.clientId)}
                              className="font-bold underline underline-offset-2"
                            >
                              Retry
                            </button>
                          )}
                          <button
                            onClick={() => removeFromOutbox(o.clientId)}
                            className="underline underline-offset-2"
                          >
                            Discard
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </MessageFrame>
              );
            }

            const message = row.message;

            /*
             * A notice (board 135): the chat saying who joined, left or was
             * removed. A small centred line, never a bubble — nobody said
             * it — with no name and nothing to do to it.
             */
            if (isNotice(message)) {
              return (
                <div
                  key={message.id}
                  data-message-id={message.id}
                  className="flex justify-center py-1"
                >
                  <p className="max-w-[85%] rounded-full bg-muted px-3 py-1 text-center text-xs text-muted-foreground">
                    {message.body}
                  </p>
                </div>
              );
            }

            const mine = message.sender_id === user?.id;
            const deleted = !!message.deleted_at;
            /** The match or pin the chat was opened at. */
            const lit = windowMode && message.id === focusId;

            const sender = mine ? 'You' : (message.sender_name ?? 'Someone');
            const label = `${sender}, ${timeLabel(message.created_at)}`;
            // Reacting and replying are new things said in the chat, so a
            // frozen thread offers neither; Copy and Delete stay.
            const reactControl = canSend
              ? {
                  current: myReaction(message.reactions, meId),
                  onReact: (reaction: ReactionKey | null) => reactTo(message, reaction),
                }
              : undefined;
            const reactions = (side: 'start' | 'end' | 'center') => (
              <ReactionBar
                reactions={message.reactions}
                meId={meId}
                people={people}
                excerpt={quoteOf(message)}
                side={side}
                onToggle={canSend ? (reaction) => togglePill(message, reaction) : undefined}
              />
            );

            /*
             * Not a bubble, and not anyone's side of the conversation.
             *
             * The app wrote this one, so it sits centred rather than left or
             * right — attaching it to the poster would read as something
             * they typed, and the applicant would have no more reason to act
             * on it than on any other line they sent.
             *
             * It takes reactions and a reply like any message, but it is the
             * app's own words: nobody edits it, and it is not forwarded.
             */
            if (message.kind === 'job-accepted' && message.context) {
              return (
                <MessageFrame
                  key={message.id}
                  messageId={message.id}
                  lit={lit}
                  side="center"
                  label={`${label}, hired`}
                  width="w-full max-w-md"
                  below={reactions('center')}
                  toolbar={(hold) => (
                    <MessageToolbar
                      hold={hold}
                      side="center"
                      react={reactControl}
                      onReply={canSend ? () => startReply(message) : undefined}
                      onCopy={() => copyText(message.body)}
                      pin={pinControl(message)}
                      onDelete={(scope) => deleteMessage(message, scope)}
                    />
                  )}
                >
                  <JobAcceptedCard context={message.context as JobAcceptedContext} />
                </MessageFrame>
              );
            }

            if (deleted) {
              return (
                <div
                  key={message.id}
                  data-message-id={message.id}
                  className={cn('flex', mine ? 'justify-end' : 'justify-start')}
                >
                  <div className="max-w-[75%] rounded-2xl bg-muted px-3.5 py-2.5">
                    <p className="text-sm italic text-muted-foreground">
                      {mine ? 'You deleted this message' : 'This message was deleted'}
                    </p>
                  </div>
                </div>
              );
            }

            const state = mine ? deliveryOf(message.created_at) : 'sent';
            const side = mine ? 'end' : 'start';
            const typed = (message.kind ?? 'text') === 'text';

            /** Under a card: when it went, and for your own how far it has got. */
            const cardMeta = (at: 'start' | 'end' | 'center') => (
              <div
                className={cn(
                  'mt-1 flex items-center gap-1 px-1 text-[10px] text-muted-foreground',
                  at === 'end' ? 'justify-end' : at === 'center' ? 'justify-center' : 'justify-start',
                )}
              >
                <span>{timeLabel(message.created_at)}</span>
                {mine &&
                  (isGroup && others.length > 1 ? (
                    <SeenBy sentAt={message.created_at} others={others} excerpt={quoteOf(message)}>
                      <DeliveryMark state={state} />
                    </SeenBy>
                  ) : (
                    <DeliveryMark state={state} />
                  ))}
              </div>
            );

            /*
             * A card's actions: react, reply, copy its line and link, delete.
             * No Edit and no Forward — both are for typed words, and the
             * server takes neither for a card.
             */
            const cardToolbar = (at: 'start' | 'end' | 'center', hold: (open: boolean) => void) => (
              <MessageToolbar
                hold={hold}
                side={at}
                react={reactControl}
                onReply={canSend ? () => startReply(message) : undefined}
                onCopy={() => copyText(message.body)}
                pin={pinControl(message)}
                onDelete={(scope) => deleteMessage(message, scope)}
                canDeleteForEveryone={mine}
              />
            );

            const senderName =
              isGroup && !mine ? (
                <p className="mb-0.5 ml-1 text-[11px] text-muted-foreground">{message.sender_name}</p>
              ) : undefined;

            // How to pay the sender: a card on their side, like their own line.
            if (message.kind === 'pay-card') {
              return (
                <MessageFrame
                  key={message.id}
                  messageId={message.id}
                  lit={lit}
                  side={side}
                  label={`${label}, how to pay ${mine ? 'you' : firstName(message.sender_name ?? 'them')}`}
                  width="max-w-full"
                  header={senderName}
                  below={
                    <>
                      {reactions(side)}
                      {cardMeta(side)}
                    </>
                  }
                  toolbar={(hold) => cardToolbar(side, hold)}
                >
                  <PayChatCard message={message} mine={mine} />
                </MessageFrame>
              );
            }

            // A Virgo thing somebody shared: album photos, a booking, a job
            // post, a post, a package, a date.
            if (isCardKind(message.kind)) {
              const card = message as ConversationMessage & { kind: CardKind };
              const centred = cardIsCentred(card.kind);
              const at = centred ? 'center' : side;
              const env: CardEnv = { conversationId, mine, meId, isGroup, others, people };
              return (
                <MessageFrame
                  key={message.id}
                  messageId={message.id}
                  lit={lit}
                  side={at}
                  label={`${label}, ${cardReadout(card, env)}`}
                  width={centred ? 'w-full max-w-sm' : 'max-w-full'}
                  header={
                    centred ? (
                      // Centred, so not on anyone's side: who shared it is said.
                      <p className="mb-1 text-center text-[11px] text-muted-foreground">
                        {mine ? 'You shared' : `${firstName(message.sender_name ?? 'Someone')} shared`}
                      </p>
                    ) : (
                      senderName
                    )
                  }
                  below={
                    <>
                      {reactions(at)}
                      {cardMeta(at)}
                    </>
                  }
                  toolbar={(hold) => cardToolbar(at, hold)}
                >
                  <ChatCard message={card} env={env} />
                </MessageFrame>
              );
            }

            const preview = firstVirgoLink(message.body);

            return (
              <MessageFrame
                key={message.id}
                messageId={message.id}
                lit={lit}
                side={side}
                label={label}
                header={
                  isGroup && !mine ? (
                    <p className="mb-0.5 ml-1 text-[11px] text-muted-foreground">
                      {message.sender_name}
                    </p>
                  ) : undefined
                }
                below={reactions(side)}
                toolbar={(hold) => (
                  <MessageToolbar
                    hold={hold}
                    side={side}
                    react={reactControl}
                    onReply={canSend ? () => startReply(message) : undefined}
                    onForward={canSend && typed ? () => setForwarding(message) : undefined}
                    onCopy={() => copyText(message.body)}
                    pin={pinControl(message)}
                    edit={
                      canSend && mine && typed
                        ? { message, meId, onEdit: () => startEdit(message) }
                        : undefined
                    }
                    onDelete={(scope) => deleteMessage(message, scope)}
                    canDeleteForEveryone={mine}
                  />
                )}
              >
                <div
                  className={cn(
                    'rounded-2xl px-3.5 py-2.5 transition-shadow',
                    mine ? 'bg-primary text-primary-foreground' : 'bg-card border',
                    // The board's lift: the message being acted on is ringed.
                    'group-hover/message:ring-3 group-hover/message:ring-accent',
                    'group-focus-visible/message:ring-2 group-focus-visible/message:ring-ring',
                    editing?.id === message.id && 'ring-2 ring-ring',
                  )}
                >
                  {message.forwarded && (
                    <p
                      className={cn(
                        'mb-1 flex items-center gap-1 text-[11px] font-medium italic',
                        mine ? 'opacity-80' : 'text-muted-foreground',
                      )}
                    >
                      <Forward className="size-3" aria-hidden />
                      Forwarded
                    </p>
                  )}

                  {message.reply_to_id && (
                    <div
                      className={cn(
                        'mb-1.5 rounded-lg border-l-2 px-2 py-1.5',
                        mine ? 'border-white/60 bg-black/15' : 'border-primary bg-muted',
                      )}
                    >
                      <p
                        className={cn(
                          'text-[10px] font-bold',
                          mine ? 'opacity-80' : 'text-primary',
                        )}
                      >
                        {message.reply_to_sender ?? 'Message'}
                      </p>
                      <p className={cn('truncate text-[11px]', mine ? 'opacity-70' : 'text-muted-foreground')}>
                        {message.reply_to_deleted
                          ? 'Message deleted'
                          : (message.reply_to_body ?? 'Message unavailable')}
                      </p>
                    </div>
                  )}

                  <p className="whitespace-pre-wrap text-sm wrap-anywhere">
                    <MessageBody
                      body={message.body}
                      names={mentionNames}
                      mine={mine}
                      highlight={highlight}
                    />
                  </p>

                  {preview && <LinkPreviewCard href={preview} mine={mine} />}

                  <div
                    className={cn(
                      'mt-1 flex items-center gap-1 text-[10px]',
                      mine ? 'opacity-70' : 'text-muted-foreground',
                    )}
                  >
                    <span>{timeLabel(message.created_at)}</span>
                    {waitingEdits.has(message.id) ? (
                      // Not an error: it goes when the connection is back.
                      <span>· Waiting for a connection</span>
                    ) : (
                      message.edited_at && <span>· Edited</span>
                    )}
                    {mine &&
                      (isGroup && others.length > 1 ? (
                        // "Seen by 3" opens who, with names (board 125).
                        <SeenBy sentAt={message.created_at} others={others} excerpt={message.body}>
                          <DeliveryMark state={state} />
                        </SeenBy>
                      ) : (
                        <DeliveryMark state={state} />
                      ))}
                  </div>
                </div>
              </MessageFrame>
            );
          })}

          {/* The visual top: older pages load as this comes into view. A
              failed page was dropped silently before, and scrolling up
              never tried again. */}
          {hasNextPage && !windowMode && (
            <div ref={olderRef} className="flex justify-center py-2">
              {isFetchNextPageError ? (
                <button
                  onClick={() => void fetchNextPage()}
                  className="text-xs font-semibold text-primary underline underline-offset-2"
                >
                  Couldn&apos;t load older messages. Try again
                </button>
              ) : isFetchingNextPage ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading older messages" />
              ) : (
                <button
                  onClick={() => void fetchNextPage()}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Load older messages
                </button>
              )}
            </div>
          )}
        </div>

      )}

      {/* Mention picker */}
      {mentionOptions.length > 0 && (
        <div className="mx-4 mb-2 overflow-hidden rounded-xl border bg-popover shadow-lg">
          <p className="flex items-center gap-2 border-b px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <AtSign className="size-3 text-primary" />
            Mention <span className="ml-auto font-normal normal-case tracking-normal">Tab to pick</span>
          </p>
          <ul className="max-h-48 overflow-y-auto">
            {mentionOptions.map((person, i) => (
              <li key={person.id}>
                <button
                  onClick={() => pickMention(person)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent',
                    i === 0 && 'bg-accent/50',
                  )}
                >
                  <Avatar className="size-6">
                    <AvatarFallback className="bg-primary/15 text-[10px] font-bold text-primary">
                      {person.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {person.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reply banner */}
      {replyTo && (
        <div className="mx-4 mb-2 flex items-center gap-3 rounded-xl border border-l-4 border-l-primary bg-card px-3 py-2">
          <Reply className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-primary">
              Replying to {replyTo.sender_name}
            </p>
            <p className="truncate text-xs text-muted-foreground">{quoteOf(replyTo)}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {/* Edit bar (board 123): who will see the change. Esc or × puts back
          whatever was being written before. */}
      {editing && canSend && (
        <div className="mx-4 mb-2 flex items-center gap-3 rounded-xl border border-l-4 border-l-primary bg-card px-3 py-2">
          <Pencil className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-primary">Editing</p>
            <p className="truncate text-xs text-muted-foreground">
              {isGroup
                ? 'Everyone here will see it marked Edited'
                : `${firstName(others[0]?.name ?? noticeName)} will see it marked Edited`}
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={endEdit} aria-label="Stop editing">
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {/* Composer, or why there is none. A frozen thread keeps its history but
          takes no new messages, and a composer that fails every send is worse
          than a plain line saying so. */}
      {searching ? (
        <ChatSearchFooter />
      ) : !canSend ? (
        threadReady && (
          <div className="shrink-0 border-t bg-muted/50 px-4 py-3">
            {blockedByMe ? (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">You blocked {noticeName}.</p>
                  <p className="text-xs text-muted-foreground">Unblock them to send messages.</p>
                </div>
                {blockId && (
                  <Button size="sm" variant="outline" onClick={() => setAskUnblock(true)}>
                    Unblock
                  </Button>
                )}
              </div>
            ) : (
              // Worded to say nothing about why. Being blocked must look like
              // the other person simply not being reachable here.
              <p className="text-center text-sm text-muted-foreground">
                You can&apos;t reply to this conversation.
              </p>
            )}
          </div>
        )
      ) : (
        <div ref={composerRowRef} className="flex shrink-0 items-end gap-2 border-t p-3">
          <ShareMenu
            conversationId={conversationId}
            audience={{ isGroup, others }}
            onInsertSaved={insertSaved}
            // What you just shared is what you want to see, as after Send.
            onSent={() => {
              setPinJump(null);
              scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
          <Textarea
            ref={composerRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              caret.current = {
                start: e.target.selectionStart,
                end: e.target.selectionEnd,
              };
              // Changing a sent message is not writing a new one.
              if (!editing) noteTyping(e.target.value);
            }}
            onSelect={(e) => {
              caret.current = {
                start: e.currentTarget.selectionStart,
                end: e.currentTarget.selectionEnd,
              };
            }}
            // Leaving the box stops the indicator immediately, rather than
            // letting it time out on the other side.
            onBlur={stopTyping}
            onKeyDown={onComposerKeyDown}
            placeholder={isGroup ? 'Message — @ to mention, Enter to send' : 'Message — Enter to send'}
            aria-label={editing ? 'Edit message' : 'Message'}
            rows={1}
            className="max-h-40 min-h-10 resize-none"
          />
          {editing ? (
            <Button onClick={submit} disabled={!draft.trim()} size="icon" aria-label="Save the change">
              <Check className="size-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={!draft.trim()} size="icon" aria-label="Send">
              <Send className="size-4" />
            </Button>
          )}
        </div>
      )}

      <ForwardDialog
        conversationId={conversationId}
        message={forwarding}
        onOpenChange={(open) => !open && setForwarding(null)}
      />

      <ReplacePinDialog
        message={replacing}
        pins={pins}
        meId={meId}
        pending={pinMessage.isPending ? (pinMessage.variables?.replace ?? null) : null}
        onPick={replacePin}
        onOpenChange={(open) => !open && setReplacing(null)}
      />

      <AlertDialog open={askUnblock} onOpenChange={setAskUnblock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unblock {firstName(noticeName)}?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll be able to find you and send you requests again. Your connection
              isn&apos;t restored — send a new request if you want to reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Stays open until it has worked, so a failure is seen.
                event.preventDefault();
                confirmUnblock();
              }}
              disabled={unblock.isPending}
            >
              {unblock.isPending ? 'Unblocking…' : 'Unblock'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

