import {
  View,
  Text,
  FlatList,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  AppState,
  BackHandler,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  UsersIcon,
  ReplyIcon,
  ForwardIcon,
  CopyIcon,
  PencilIcon,
  Trash2Icon,
  InfoIcon,
  BellOffIcon,
  WifiOffIcon,
  PinIcon,
  PinOffIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useAuth,
  useConversation,
  useDeleteMessage,
  useMarkThreadRead,
  useMoneyPayMethods,
  useOffline,
  useParticipants,
  useTheme,
  useThread,
  useUnblock,
} from '@/src/hooks';
import { useSendPayCard } from '@/src/hooks/usePayCards';
import {
  flushOutbox,
  retryOutboxItem,
  useEditFailures,
  useEditMessage,
  useOpenConversation,
  usePendingEdits,
  useReactToMessage,
} from '@/src/hooks/useChat';
import { useMediaAutoLoad } from '@/src/hooks/useConnectionQuality';
import {
  useChatSearch,
  usePinMessage,
  usePins,
  useThreadAround,
  useUnpinMessage,
} from '@/src/hooks/useChatCrew';
import { PresenceLine, TypingIndicator } from '@/components';
import { askToUnblock, safetyError } from '@/components/PersonSafetySheet';
import { buzzForMessage } from '@/src/lib/notifications';
import {
  addToOutbox,
  newClientId,
  removeFromOutbox,
  thawOutbox,
  useOutbox,
  type OutboxItem,
} from '@/src/lib/outbox';
import {
  ApiError,
  canEditMessage,
  EDIT_WINDOW_MINUTES,
  filesCaption,
  groupSubtitle,
  isFilesMessage,
  isNotice,
  isPinsFull,
  MAX_CHAT_PHOTOS,
  MAX_PINNED_MESSAGES,
  myReaction,
  type ChatAttachment,
  type ConversationMessage,
  type ReactionKey,
  type Thread,
} from '@/src/api';
import { attachmentLink } from '@/src/hooks/useChatFiles';
import { pickChatPdf, pickChatPhotos } from '@/src/lib/chat-files';
import {
  discardUpload,
  onUploadFailure,
  retryUpload,
  useChatUploads,
  type UploadJob,
} from '@/src/lib/chat-uploads';
import { stopVoice } from '@/src/lib/voice-player';
import { takeChatPhoto } from '@/components/chat/files/camera';
import { PendingFilesBubble } from '@/components/chat/files/FilesMessage';
import { alertStorageFull, alertTurnedOff, quoteLine, tell } from '@/components/chat/files/files-words';
import { handOffPicked } from '@/components/chat/files/picked';
import { showChatPhoto } from '@/components/chat/files/viewer-handoff';
import { LoadFailed } from '@/components/LoadFailed';
import { Composer, useKeyboardUp, type ComposerHandle } from '@/components/chat/Composer';
import { ChatAvatar, isTeamChat } from '@/components/chat/ChatAvatar';
import { ChatSearchCount, ChatSearchFooter, ChatSearchHeader } from '@/components/chat/ChatSearch';
import { chatError, editMinutesLeft, firstNameOf } from '@/components/chat/chat-words';
import { useChatToast } from '@/components/chat/ChatToast';
import { ForwardSheet } from '@/components/chat/ForwardSheet';
import type { HeldRect, HoldMenuEntry } from '@/components/chat/HoldOverlay';
import { MessageHold, type HeldMessage } from '@/components/chat/MessageHold';
import { ReactionsSheet } from '@/components/chat/ReactionsSheet';
import { SavedRepliesSheet } from '@/components/chat/SavedRepliesSheet';
import { SeenBySheet } from '@/components/chat/SeenBySheet';
import { SharePlusSheet, type ShareChoice } from '@/components/chat/SharePlusSheet';
import { ShareListSheet, type ShareListKind } from '@/components/chat/ShareListSheet';
import { cardSendError, type ChatPeople } from '@/components/chat/cards/card-words';
import { PayPickSheet } from '@/components/money/PayPickSheet';
import { PinnedStrip, PinReplaceSheet, PinsSheet } from '@/components/chat/PinsSheet';
import { takeThreadRequest } from '@/components/chat/thread-requests';
import {
  buildThreadRows,
  DaySeparator,
  MessageBubble,
  OutgoingBubble,
  UnreadDivider,
  useMentionMatcher,
  type Delivery,
  type ThreadRow,
} from '@/components/chat/ThreadRows';

for (const Icon of [
  ArrowDownIcon, ArrowLeftIcon, UsersIcon, ReplyIcon, ForwardIcon, CopyIcon, PencilIcon,
  Trash2Icon, InfoIcon, BellOffIcon, WifiOffIcon, PinIcon, PinOffIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** How far up the thread, in points, before the jump-to-latest button shows. */
const AWAY_FROM_LATEST = 320;

/** Whether the app is in the foreground. */
function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  return active;
}

/**
 * One conversation.
 *
 * The list is inverted rather than scrolled to the end: an inverted FlatList
 * keeps the newest message pinned as items arrive, without a scroll call that
 * fights the user when they are reading history.
 */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const { isOffline } = useOffline();
  const queryClient = useQueryClient();
  const focused = useIsFocused();
  const appActive = useAppActive();
  const keyboardUp = useKeyboardUp();

  /*
   * The composer sat above the keyboard. The avoiding view measures itself
   * inside this SafeAreaView, which already starts below the status bar, so
   * what keyboardVerticalOffset has to be is where this screen starts in the
   * window: 0, or the verify-email banner's height when that pushes
   * everything down. Android was given the top inset instead and sat a
   * status bar higher than it should.
   */
  const rootRef = useRef<View>(null);
  const [screenTop, setScreenTop] = useState(0);

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
  } = useThread(id);
  /*
   * Nothing is said, and nothing can be sent, until the thread has arrived.
   *
   * `canSend` is true when the server does not say — so a thread that failed
   * to load, or one you are no longer in, showed "No messages yet. Say hello."
   * over a composer that failed every send.
   */
  const threadReady = threadData !== undefined;
  const canSend = threadReady && threadAllowsSending;
  const threadGone =
    !threadReady &&
    threadError instanceof ApiError &&
    (threadError.status === 404 || threadError.status === 403);

  const { participants } = useParticipants(id);
  const { conversation } = useConversation(id);
  const outbox = useOutbox(id);
  /** Photos and files of yours on their way out of this phone. */
  const uploads = useChatUploads(id);
  /** Each send by the message it became, and by its client id until then. */
  const uploadFor = useMemo(() => {
    const map = new Map<string, UploadJob>();
    for (const u of uploads) {
      map.set(u.clientId, u);
      if (u.messageId) map.set(u.messageId, u);
    }
    return map;
  }, [uploads]);
  const remove = useDeleteMessage(id);
  const markRead = useMarkThreadRead();
  const unblock = useUnblock();

  const { mutate: reactTo } = useReactToMessage(id, user?.id);
  const { mutate: editMessage } = useEditMessage(id);
  /** Changes still on this phone, drawn as "Waiting for a connection". */
  const pendingEdits = usePendingEdits(id);
  // Link pictures load by themselves only on a good line, or as set.
  const { autoLoad } = useMediaAutoLoad();

  const [replyTo, setReplyTo] = useState<ConversationMessage | null>(null);
  /** The message held, lifted with its reactions and menu. */
  const [held, setHeld] = useState<HeldMessage | null>(null);
  /** What to do once the hold has gone: a sheet or an alert cannot open over it. */
  const afterHold = useRef<(() => void) | null>(null);
  const [editing, setEditing] = useState<ConversationMessage | null>(null);
  const [reactionsFor, setReactionsFor] = useState<string | null>(null);
  const [seenByFor, setSeenByFor] = useState<string | null>(null);
  const [forwarding, setForwarding] = useState<ConversationMessage | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  /** Set when a saved reply was picked, so the box takes focus once the sheet has gone. */
  const pickedReply = useRef(false);
  /** The composer's +: what can be shared here, and the list or picker it leads to. */
  const [shareOpen, setShareOpen] = useState(false);
  const [listing, setListing] = useState<ShareListKind | null>(null);
  const [payPicking, setPayPicking] = useState(false);
  /** What to open once the + sheet (or the pay picker) has gone: iOS will not present over a leaving one. */
  const afterShare = useRef<(() => void) | null>(null);
  const composerRef = useRef<ComposerHandle>(null);
  // Just above the composer, inside the thread.
  const toast = useChatToast(12);
  const showToast = toast.show;

  // The alert watchers' "this one is on screen" — while it has focus, not
  // merely while it is mounted under another screen.
  useOpenConversation(id);

  /*
   * Read when it is actually being looked at.
   *
   * Keyed on the newest message rather than on how many are loaded: in a
   * thread of a hundred or more the count stopped changing, so new messages
   * were never marked read and the badge never cleared. And only while this
   * screen has focus with the app in front — a thread left open under Info,
   * a profile or another thread kept marking messages read that nobody saw.
   */
  const newest = messages[0];
  const lastMarked = useRef<string | null>(null);
  useEffect(() => {
    if (!id || !newest || !focused || !appActive) return;
    if (lastMarked.current === newest.id) return;
    lastMarked.current = newest.id;
    markRead.mutate(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, newest?.id, focused, appActive]);

  /**
   * Buzz when someone else's message arrives while you are reading.
   *
   * Only for something newer than what was newest before. Keyed on the id
   * alone, deleting your own newest message buzzed whenever the one before it
   * was somebody else's. The first load is seeded silently — opening a thread
   * should not buzz at you.
   */
  const newestSeenAt = useRef<number | null>(null);
  useEffect(() => {
    if (!newest) return;
    const at = new Date(newest.created_at).getTime();
    const previous = newestSeenAt.current;
    if (previous !== null && at <= previous) return;
    newestSeenAt.current = at;
    if (previous === null) return;
    if (newest.sender_id === user?.id) return;
    if (!focused || !appActive) return;
    void buzzForMessage();
  }, [newest, user?.id, focused, appActive]);

  /*
   * A group is a group because the server says so, not by head count: one
   * with two members left rendered as a direct chat — the other person's name
   * and presence where the group should be. And the group's own name was
   * never shown; the header said "3 people".
   */
  const isGroup = conversation?.isGroup ?? participants.length > 2;
  const others = useMemo(
    () => participants.filter((p) => p.id !== user?.id),
    [participants, user?.id],
  );
  const title = isGroup
    ? conversation?.title?.trim() || `${participants.length} people`
    : (others[0]?.name ?? conversation?.title ?? 'Conversation');
  /** Who the frozen-thread notice names. */
  const noticeName = (!isGroup ? others[0]?.name : undefined) ?? conversation?.title ?? title;

  /** Who is here, as the shared cards say it: "Ana can save them", "Bea can't". */
  const people = useMemo<ChatPeople>(
    () => ({
      isGroup,
      otherFirst: !isGroup && others[0] ? firstNameOf(others[0].name) : null,
      byId: new Map(participants.map((p) => [p.id, p])),
    }),
    [isGroup, others, participants],
  );

  const unblockFromNotice = () => {
    if (!blockId) return;
    askToUnblock(noticeName, () =>
      unblock.mutate(blockId, {
        onError: (err) => Alert.alert('Could not unblock', safetyError(err)),
      }),
    );
  };

  /*
   * A refusal only holds while the thread is frozen. Once it thaws — you
   * unblocked them from the notice, or from another device — the same send
   * would go through, so what was refused becomes an ordinary failure with
   * "tap to retry" again.
   */
  const couldSend = useRef(canSend);
  useEffect(() => {
    const thawed = !couldSend.current && canSend;
    couldSend.current = canSend;
    if (thawed && id) thawOutbox(id);
  }, [canSend, id]);

  /**
   * How far a message of yours has got.
   *
   * Read beats delivered beats sent, and each is a comparison against one
   * timestamp per person rather than a per-message receipt row. In a group the
   * weakest link decides: it is only *delivered* once it has reached everyone.
   */
  const receipts = useMemo(
    () =>
      others.map((p) => ({
        read: p.last_read_at ? new Date(p.last_read_at).getTime() : -1,
        delivered: p.last_delivered_at ? new Date(p.last_delivered_at).getTime() : -1,
      })),
    [others],
  );
  const deliveryOf = useCallback(
    (sentAt: string): { state: Delivery; seenBy: number } => {
      if (receipts.length === 0) return { state: 'sent', seenBy: 0 };
      const sent = new Date(sentAt).getTime();
      const seenBy = receipts.filter((r) => r.read >= sent).length;
      if (seenBy === receipts.length) return { state: 'read', seenBy };
      if (receipts.every((r) => r.delivered >= sent)) return { state: 'delivered', seenBy };
      return { state: 'sent', seenBy };
    },
    [receipts],
  );

  const mentionNames = useMemo(() => participants.map((p) => p.name), [participants]);
  const matcher = useMentionMatcher(mentionNames);

  // ── Opening at one message: a search match or a pin ───────────────────────

  /** The message the thread is opened around. Null is the live thread. */
  const [windowAt, setWindowAt] = useState<string | null>(null);
  /** The message ringed: the match you are on, or the pin you jumped to. */
  const [focusId, setFocusId] = useState<string | null>(null);
  const around = useThreadAround(id, windowAt);
  /*
   * The window on screen. The last one stays while the next loads, so
   * stepping to a match further back does not blank the thread.
   */
  const [shownWindow, setShownWindow] = useState<Thread | null>(null);
  const aroundData = windowAt ? around.data : undefined;
  if (aroundData && shownWindow !== aroundData) setShownWindow(aroundData);
  if (!windowAt && shownWindow) setShownWindow(null);

  const liveById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  /** The window's messages, as the live thread has them where it has them: a reaction lands in both. */
  const windowMessages = useMemo(
    () => (shownWindow ? shownWindow.data.map((m) => liveById.get(m.id) ?? m) : null),
    [shownWindow, liveById],
  );
  const inWindow = windowMessages !== null;
  const shownMessages = windowMessages ?? messages;

  const rows = useMemo(
    () =>
      buildThreadRows({
        messages: shownMessages,
        // The window is history: nothing waiting to send, and no divider.
        outbox: inWindow ? [] : outbox,
        uploads: inWindow ? [] : uploads,
        lastReadAt: inWindow ? null : lastReadAt,
        meId: user?.id,
        isGroup,
      }),
    [shownMessages, inWindow, outbox, uploads, lastReadAt, user?.id, isGroup],
  );

  // ── Scrolling ─────────────────────────────────────────────────────────────

  const listRef = useRef<FlatList<ThreadRow>>(null);
  /** Where scrollToIndex puts a row: the unread divider low down, a jump mid-screen. */
  const indexPosition = useRef(0.85);
  const [away, setAway] = useState(false);
  const awayRef = useRef(false);
  const [newWhileAway, setNewWhileAway] = useState(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Inverted: an offset of 0 is the newest message.
    const isAway = e.nativeEvent.contentOffset.y > AWAY_FROM_LATEST;
    if (isAway === awayRef.current) return;
    awayRef.current = isAway;
    setAway(isAway);
    if (!isAway) setNewWhileAway(0);
  }, []);

  // Counts what arrives from others while you are reading further up.
  const countedNewest = useRef<string | null>(null);
  useEffect(() => {
    if (!newest) return;
    const previous = countedNewest.current;
    countedNewest.current = newest.id;
    if (previous === null || previous === newest.id) return;
    if (awayRef.current && newest.sender_id !== user?.id) setNewWhileAway((n) => n + 1);
  }, [newest, user?.id]);

  const jumpToLatest = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  /*
   * Opens at the first unread message when there is more than a screenful of
   * them, rather than at the bottom with the divider out of sight.
   */
  const openedAt = useRef<string | null>(null);
  useEffect(() => {
    if (!threadReady || !id || openedAt.current === id) return;
    openedAt.current = id;
    const index = rows.findIndex((r) => r.kind === 'divider');
    if (index < 12) return;
    const timer = setTimeout(() => {
      indexPosition.current = 0.85;
      listRef.current?.scrollToIndex({ index, viewPosition: 0.85, animated: false });
    }, 60);
    return () => clearTimeout(timer);
  }, [threadReady, id, rows]);

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      listRef.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: false,
      });
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: info.index,
          viewPosition: indexPosition.current,
          animated: false,
        });
      }, 120);
    },
    [],
  );

  /** Where the list goes next: to this message, once it is drawn. `n` makes a second jump to it count. */
  const [scrollTarget, setScrollTarget] = useState<{ id: string; n: number } | null>(null);
  const scrolledFor = useRef(0);
  useEffect(() => {
    if (!scrollTarget || scrolledFor.current === scrollTarget.n) return undefined;
    const index = rows.findIndex((r) => r.kind === 'message' && r.message.id === scrollTarget.id);
    // Not drawn yet: its window is on the way, and this runs again when it lands.
    if (index < 0) return undefined;
    const timer = setTimeout(() => {
      scrolledFor.current = scrollTarget.n;
      indexPosition.current = 0.5;
      listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [scrollTarget, rows]);

  /**
   * Goes to one message. Already drawn — in the window, or the live thread —
   * it only scrolls there; otherwise the twenty either side of it load.
   */
  const jumpTo = useCallback(
    (messageId: string) => {
      setFocusId(messageId);
      const drawn = (windowMessages ?? messages).some((m) => m.id === messageId);
      if (!drawn) setWindowAt(messageId);
      setScrollTarget((prev) => ({ id: messageId, n: (prev?.n ?? 0) + 1 }));
    },
    [windowMessages, messages],
  );

  // ── Searching this chat ───────────────────────────────────────────────────

  const [searching, setSearching] = useState(false);
  /** Whether the box takes the keyboard: from info's tile it does, from the list it does not. */
  const [searchFocus, setSearchFocus] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  // Debounced: every keystroke would be a search on the server.
  useEffect(() => {
    if (!searching) return undefined;
    const timer = setTimeout(() => setSearchTerm(searchDraft.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchDraft, searching]);
  const found = useChatSearch(id, searching ? searchTerm : '');
  const matches = found.matches;
  /** Which match is showing, from 0, the newest. */
  const [matchAt, setMatchAt] = useState(0);
  /** From the list's search: the match to start on once the matches arrive. */
  const startMatch = useRef<string | null>(null);
  /** The term whose first answer has been jumped to, so a refetch does not jump again. */
  const answeredFor = useRef<string | null>(null);

  // A new term's matches: go to the newest, or to the one the list found.
  useEffect(() => {
    if (!searching || !searchTerm) {
      answeredFor.current = null;
      return;
    }
    if (!found.data || answeredFor.current === searchTerm) return;
    answeredFor.current = searchTerm;
    if (matches.length === 0) {
      setFocusId(null);
      return;
    }
    let start = 0;
    if (startMatch.current) {
      const at = matches.findIndex((m) => m.id === startMatch.current);
      if (at >= 0) start = at;
      startMatch.current = null;
    }
    setMatchAt(start);
    jumpTo(matches[start].id);
  }, [searching, searchTerm, found.data, matches, jumpTo]);

  const stepMatch = useCallback(
    (by: 1 | -1) => {
      const next = matchAt + by;
      if (next < 0 || next >= matches.length) return;
      setMatchAt(next);
      jumpTo(matches[next].id);
    },
    [matchAt, matches, jumpTo],
  );

  const openSearch = useCallback(
    (q?: string, matchId?: string | null) => {
      const term = (q ?? '').trim();
      setSearching(true);
      setSearchFocus(!term);
      setSearchDraft(q ?? '');
      setSearchTerm(term);
      setMatchAt(0);
      answeredFor.current = null;
      startMatch.current = matchId ?? null;
      // Straight there: the matches only say which number it is.
      if (matchId) jumpTo(matchId);
    },
    [jumpTo],
  );

  /** Done, or Back to the latest: the live thread again, at the bottom. */
  const backToLatest = useCallback(() => {
    setSearching(false);
    setSearchDraft('');
    setSearchTerm('');
    setMatchAt(0);
    answeredFor.current = null;
    startMatch.current = null;
    setWindowAt(null);
    setFocusId(null);
    setScrollTarget(null);
    Keyboard.dismiss();
    setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }), 0);
  }, []);

  // Android's back button closes the search, or leaves the pin you jumped to,
  // before it leaves the chat. Only while this screen has focus: under group
  // info it would swallow info's own back.
  useEffect(() => {
    if (!focused || (!searching && !windowAt && !focusId)) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      backToLatest();
      return true;
    });
    return () => subscription.remove();
  }, [focused, searching, windowAt, focusId, backToLatest]);

  /** After sending: what you sent is what you want to see, wherever you were. */
  const toLatest = useCallback(() => {
    if (windowAt || focusId) backToLatest();
    else listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [windowAt, focusId, backToLatest]);

  // A window that could not load leaves you where you were, saying so.
  const aroundFailed = !!windowAt && around.loadFailed && !around.data;
  useEffect(() => {
    if (!aroundFailed) return;
    setWindowAt(null);
    showToast("Couldn't open that message. Check your connection and try again.");
  }, [aroundFailed, showToast]);

  // ── Sending ───────────────────────────────────────────────────────────────

  /**
   * Sends, keeping the text on screen until the server has it.
   *
   * Through the outbox, which outlives this screen: a message that cannot go
   * now goes when the connection comes back, whether or not this thread is
   * still open, and a retry carries the same id so it is never stored twice.
   */
  const send = useCallback(
    ({ body, mentionIds }: { body: string; mentionIds: string[] }) => {
      if (!id) return;
      addToOutbox({
        clientId: newClientId(),
        conversationId: id,
        body,
        replyToId: replyTo?.id,
        // Photos and a file quote as what they are, not as "Sent 4 photos".
        replyToBody: replyTo ? quoteLine(replyTo) : null,
        replyToSender: replyTo?.sender_name ?? null,
        mentionIds,
        status: 'sending',
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
      setReplyTo(null);
      void flushOutbox(queryClient);
      // What you just sent is what you want to see, wherever you had scrolled.
      toLatest();
    },
    [id, replyTo, queryClient, toLatest],
  );

  const retry = useCallback(
    (item: OutboxItem) => retryOutboxItem(queryClient, item.clientId),
    [queryClient],
  );

  const unsentActions = useCallback(
    (item: OutboxItem) => {
      const discard = () => removeFromOutbox(item.clientId);
      if (item.status === 'refused') {
        // No retry: it would be refused again. Copy keeps the words for
        // somewhere they can go.
        Alert.alert('Not sent', item.body, [
          { text: 'Close', style: 'cancel' },
          { text: 'Copy', onPress: () => void Clipboard.setStringAsync(item.body) },
          { text: 'Discard', style: 'destructive', onPress: discard },
        ]);
        return;
      }
      Alert.alert('Unsent message', item.body, [
        { text: 'Close', style: 'cancel' },
        { text: 'Try again', onPress: () => retry(item) },
        { text: 'Discard', style: 'destructive', onPress: discard },
      ]);
    },
    [retry],
  );

  const cancelReply = useCallback(() => setReplyTo(null), []);

  /** A voice note went in from the composer: the reply is answered, and the new one is the one to see. */
  const voiceSent = useCallback(() => {
    setReplyTo(null);
    toLatest();
  }, [toLatest]);

  // Leaving the chat stops the voice note playing in it, and forgets where it was.
  useEffect(() => () => stopVoice(), []);

  // ── Photos and files from this phone ──────────────────────────────────────

  /** A photo tapped in the thread: full screen, at that photo. */
  const openPhoto = useCallback(
    (message: ConversationMessage, index: number) => {
      if (!id) return;
      Keyboard.dismiss();
      showChatPhoto(message);
      router.push({
        pathname: '/chat/[id]/photo',
        params: { id, messageId: message.id, index: String(index) },
      });
    },
    [id],
  );

  /**
   * A PDF tapped: an hour's link, asked for now (never ahead: it is a
   * download), opened where the phone opens PDFs, as support files are.
   */
  const openFile = useCallback(
    (message: ConversationMessage, attachment: ChatAttachment) => {
      if (!id) return;
      attachmentLink(id, message.id, attachment.id)
        .then(({ url }) => WebBrowser.openBrowserAsync(url))
        .catch((err: unknown) => showToast(chatError(err)));
    },
    [id, showToast],
  );

  /** A tap on a send of yours that is waiting, or that the server turned down. */
  const onSendingPress = useCallback(
    (upload: UploadJob) => {
      const again = () => retryUpload(queryClient, upload.clientId);
      const discard = () => discardUpload(upload.clientId);
      if (upload.status === 'failed' && upload.failure === 'storage-full') {
        alertStorageFull([
          { text: 'Discard', onPress: discard, destructive: true },
          { text: 'Try again', onPress: again },
        ]);
        return;
      }
      if (upload.status === 'failed') {
        Alert.alert("Didn't send", upload.failureText ?? 'Something went wrong. Please try again.', [
          { text: 'Close', style: 'cancel' },
          { text: 'Try again', onPress: again },
          { text: 'Discard', style: 'destructive', onPress: discard },
        ]);
        return;
      }
      // Waiting for a connection: once more, now.
      again();
    },
    [queryClient],
  );

  // A send refused before it went: out of storage, or another no. Said once,
  // here; the bubble keeps saying it until it is retried or discarded.
  useEffect(() => {
    if (!id) return undefined;
    return onUploadFailure((failure) => {
      if (failure.conversationId !== id) return;
      if (failure.failure === 'storage-full') alertStorageFull();
      else tell("Didn't send", failure.text ?? 'Something went wrong. Please try again.');
    });
  }, [id]);

  /** Photos from the phone's library, then the check screen (board 141). */
  const pickPhotosForChat = useCallback(async () => {
    if (!id) return;
    try {
      const assets = await pickChatPhotos(MAX_CHAT_PHOTOS);
      if (!assets) return;
      handOffPicked(id, { kind: 'photos', assets, replyTo });
      router.push(`/chat/${id}/send-files`);
    } catch {
      showToast("Couldn't open your photos. Try again.");
    }
  }, [id, replyTo, showToast]);

  /** A PDF from the phone's files, refused before any upload when it's too big. */
  const pickFileForChat = useCallback(async () => {
    if (!id) return;
    try {
      const picked = await pickChatPdf();
      if (!picked) return;
      if (picked.kind !== 'file') {
        tell(picked.kind === 'too-big' ? 'That file is too big' : "That can't be sent", picked.words);
        return;
      }
      handOffPicked(id, { kind: 'file', file: picked.file, replyTo });
      router.push(`/chat/${id}/send-files`);
    } catch {
      showToast("Couldn't open your files. Try again.");
    }
  }, [id, replyTo, showToast]);

  /**
   * A photo from the camera, on a build that has it: to the same check
   * screen as picked photos, shrunk and turned into a JPEG the same way.
   */
  const takePhotoForChat = useCallback(async () => {
    if (!id) return;
    try {
      const taken = await takeChatPhoto();
      if (!taken) return;
      if (taken === 'denied') {
        alertTurnedOff('camera');
        return;
      }
      handOffPicked(id, { kind: 'photos', assets: [taken], replyTo });
      router.push(`/chat/${id}/send-files`);
    } catch {
      showToast("Couldn't open the camera. Try again.");
    }
  }, [id, replyTo, showToast]);

  // ── Holding a message ─────────────────────────────────────────────────────

  /** Every loaded message by id, so a sheet reads the latest of the one it is about. */
  const byId = useMemo(
    () => new Map([...(windowMessages ?? []), ...messages].map((m) => [m.id, m])),
    [windowMessages, messages],
  );

  const onHold = useCallback(
    (message: ConversationMessage, rect: HeldRect) => {
      // The keyboard would sit over the menu: the hold is a modal, and the
      // keyboard draws above every window.
      Keyboard.dismiss();
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      setHeld({ message, rect, mine: message.sender_id === user?.id });
    },
    [user?.id],
  );
  const closeHold = useCallback(() => setHeld(null), []);
  const closeHoldThen = useCallback((action: () => void) => {
    afterHold.current = action;
    setHeld(null);
  }, []);
  const onHoldClosed = useCallback(() => {
    const action = afterHold.current;
    afterHold.current = null;
    action?.();
  }, []);

  /** Your reaction of this kind: taken back if it is yours, given if not. */
  const toggleReaction = useCallback(
    (message: ConversationMessage, reaction: ReactionKey) => {
      const current = myReaction(message.reactions, user?.id);
      reactTo(
        { messageId: message.id, reaction: current === reaction ? null : reaction },
        { onError: (err) => Alert.alert("Couldn't react", chatError(err)) },
      );
    },
    [reactTo, user?.id],
  );
  const showReactions = useCallback((message: ConversationMessage) => {
    setReactionsFor(message.id);
  }, []);
  const showSeenByFor = useCallback((message: ConversationMessage) => {
    setSeenByFor(message.id);
  }, []);

  // ── Pins ──────────────────────────────────────────────────────────────────

  const pinsQuery = usePins(id);
  const pins = pinsQuery.pins;
  const { mutate: pinMessage } = usePinMessage(id ?? '');
  const { mutate: unpinMessage } = useUnpinMessage(id ?? '');
  const [pinsOpen, setPinsOpen] = useState(false);
  /** What to do once the Pinned sheet has gone: jump to the pin picked. */
  const afterPins = useRef<(() => void) | null>(null);
  /** Waiting to go up while the chat's three pins are offered to take one down. */
  const [pinWaiting, setPinWaiting] = useState<ConversationMessage | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [unpinning, setUnpinning] = useState<string | null>(null);
  const pinnedIds = useMemo(() => new Set(pins.map((p) => p.id)), [pins]);
  const pinsKnown = pinsQuery.data !== undefined;
  /** By the pins once they have loaded — they move under a message's feet — and by the message till then. */
  const isPinned = useCallback(
    (m: ConversationMessage) => (pinsKnown ? pinnedIds.has(m.id) : !!m.pinned_at),
    [pinsKnown, pinnedIds],
  );

  const togglePin = useCallback(
    (m: ConversationMessage) => {
      if (isPinned(m)) {
        unpinMessage(m.id, {
          onSuccess: () => showToast('Unpinned for everyone'),
          onError: (err) => showToast(chatError(err)),
        });
        return;
      }
      // Three already: ask which comes down, without a refusal first.
      if (pinsKnown && pins.length >= MAX_PINNED_MESSAGES) {
        setPinWaiting(m);
        return;
      }
      pinMessage(
        { messageId: m.id },
        {
          onSuccess: () => showToast('Pinned for everyone here'),
          onError: (err) => {
            if (isPinsFull(err)) {
              // Somebody else filled it meanwhile: the pins as they are now.
              void pinsQuery.refetch();
              setPinWaiting(m);
              return;
            }
            showToast(chatError(err));
          },
        },
      );
    },
    [isPinned, pinsKnown, pins.length, pinMessage, unpinMessage, showToast, pinsQuery],
  );

  const replacePin = useCallback(
    (old: ConversationMessage) => {
      const m = pinWaiting;
      if (!m) return;
      setReplacing(old.id);
      pinMessage(
        { messageId: m.id, replace: old.id },
        {
          onSuccess: () => {
            setPinWaiting(null);
            showToast('Pinned for everyone here');
          },
          onError: (err) => {
            setPinWaiting(null);
            showToast(chatError(err));
          },
          onSettled: () => setReplacing(null),
        },
      );
    },
    [pinWaiting, pinMessage, showToast],
  );

  const unpinFromSheet = useCallback(
    (m: ConversationMessage) => {
      setUnpinning(m.id);
      unpinMessage(m.id, {
        onError: (err) => {
          setPinsOpen(false);
          showToast(chatError(err));
        },
        onSettled: () => setUnpinning(null),
      });
    },
    [unpinMessage, showToast],
  );

  /** A pin tapped in the sheet: the chat opens around it once the sheet has gone. */
  const jumpToPin = useCallback(
    (m: ConversationMessage) => {
      afterPins.current = () => {
        setSearching(false);
        jumpTo(m.id);
      };
      setPinsOpen(false);
    },
    [jumpTo],
  );
  const pinsClosed = useCallback(() => {
    const next = afterPins.current;
    afterPins.current = null;
    next?.();
  }, []);

  // Asked for from group info (Search, Pinned) or the list's search.
  useEffect(() => {
    if (!id || !focused) return;
    const request = takeThreadRequest(id);
    if (!request) return;
    if (request.kind === 'pins') setPinsOpen(true);
    else if (request.kind === 'reply') {
      // From a photo's viewer: answer it, as Reply in the hold menu does.
      const m = byId.get(request.messageId);
      if (m && canSend) {
        setReplyTo(m);
        setTimeout(() => composerRef.current?.focus(), 250);
      }
    } else if (request.kind === 'files-sent') {
      // Sent from the check screen: the reply is answered, and the new one is the one to see.
      setReplyTo(null);
      toLatest();
    } else openSearch(request.q, request.matchId);
  }, [id, focused, openSearch, byId, canSend, toLatest]);

  // ── Editing ───────────────────────────────────────────────────────────────

  const editNote = isGroup
    ? 'Everyone here will see it marked Edited'
    : `${firstNameOf(others[0]?.name ?? title)} will see it marked Edited`;

  const cancelEdit = useCallback(() => setEditing(null), []);
  const editExpired = useCallback(() => {
    setEditing(null);
    showToast('Time is up for editing that one. Your words are still in the box to send as new.');
  }, [showToast]);
  const saveEdit = useCallback(
    ({ message, body, mentionIds }: { message: ConversationMessage; body: string; mentionIds: string[] }) => {
      setEditing(null);
      editMessage(
        { messageId: message.id, body, mentionIds: isGroup ? mentionIds : undefined },
        {
          onError: (err) => {
            // Put back where they were typed, so nothing written is lost.
            composerRef.current?.insert(body);
            Alert.alert("Couldn't save the change", `${chatError(err)} Your words are back in the box.`);
          },
        },
      );
    },
    [editMessage, isGroup],
  );

  // A change made offline that the server turned down once it could be sent
  // — the fifteen minutes ran out meanwhile. The words are offered back.
  useEditFailures(id, ({ body, error }) => {
    Alert.alert("Your change wasn't saved", chatError(error), [
      { text: 'OK', style: 'cancel' },
      { text: 'Put it in the box', onPress: () => composerRef.current?.insert(body) },
    ]);
  });

  // The message being changed went — deleted here or for everyone — or the
  // thread froze. The words stay in the box.
  useEffect(() => {
    if (!editing) return;
    const now = byId.get(editing.id);
    if (!canSend) {
      setEditing(null);
      return;
    }
    if (threadReady && (!now || now.deleted_at)) {
      setEditing(null);
      showToast('That message was deleted. Your words are still in the box.');
    }
  }, [editing, byId, canSend, threadReady, showToast]);

  const confirmDelete = (message: ConversationMessage) => {
    const mine = message.sender_id === user?.id;
    const onError = (err: unknown) => Alert.alert('Could not delete', chatError(err));
    const options: Parameters<typeof Alert.alert>[2] = [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete for me',
        onPress: () => remove.mutate({ messageId: message.id, scope: 'me' }, { onError }),
      },
    ];

    // Only your own text can be taken back from everyone else.
    if (mine && !message.deleted_at) {
      options.push({
        text: 'Delete for everyone',
        style: 'destructive',
        onPress: () => remove.mutate({ messageId: message.id, scope: 'everyone' }, { onError }),
      });
    }

    const what =
      message.kind === 'photos'
        ? 'the photos'
        : message.kind === 'file'
          ? 'the file'
          : message.kind === 'voice'
            ? 'the voice note'
            : null;
    Alert.alert(
      'Delete message',
      mine
        ? what
          ? `Deleting for everyone takes ${what} back from everyone here and frees the storage ${message.kind === 'photos' ? 'they' : 'it'} used.`
          : 'Deleting for everyone removes the text from this conversation for all participants.'
        : 'This removes the message from your view only. Everyone else still sees it.',
      options,
    );
  };

  const border = isDark ? '#2A2522' : '#F0E8E2';
  const showSeenBy = isGroup && others.length > 1;

  /*
   * What holding this message offers. A deleted one can only be deleted (for
   * you). A frozen thread keeps Copy and Delete. A card can be replied to and
   * reacted to, not forwarded or edited, and only your own typed message,
   * within the window, can be edited.
   */
  const heldMessage = held ? (byId.get(held.message.id) ?? held.message) : null;
  const heldDeleted = !!heldMessage?.deleted_at;
  const canReactHeld = canSend && !heldDeleted;
  const holdEntries: HoldMenuEntry[] = [];
  if (heldMessage) {
    const m = heldMessage;
    // Every card: the app's own, a pay card, and the Virgo things shared
    // here. Forward and Edit are for typed words only, on the server too.
    const card = (m.kind ?? 'text') !== 'text';
    // Photos and a file go on as the forwarder's own copies, once every one is in.
    const files = isFilesMessage(m);
    const allIn = (m.attachments ?? []).length > 0 && (m.attachments ?? []).every((a) => a.status === 'ready');
    const forwardable = !card || (files && allIn);
    // A caption is what there is to copy on photos; with none there is nothing.
    const copyText = files ? filesCaption(m) : m.body;
    if (!heldDeleted && canSend) {
      holdEntries.push({
        key: 'reply',
        label: 'Reply',
        Icon: ReplyIcon,
        onPress: () => {
          setReplyTo(m);
          closeHold();
        },
      });
    }
    if (!heldDeleted && canSend && forwardable) {
      holdEntries.push({
        key: 'forward',
        label: 'Forward',
        Icon: ForwardIcon,
        onPress: () => closeHoldThen(() => setForwarding(m)),
      });
    }
    if (!heldDeleted && copyText) {
      holdEntries.push({
        key: 'copy',
        label: 'Copy',
        Icon: CopyIcon,
        onPress: () => {
          closeHold();
          void Clipboard.setStringAsync(copyText).then(() => showToast('Copied'));
        },
      });
    }
    if (!heldDeleted && canSend && canEditMessage(m, user?.id)) {
      const minutes = editMinutesLeft(m.created_at, EDIT_WINDOW_MINUTES);
      holdEntries.push({
        key: 'edit',
        label: 'Edit',
        hint: `For ${minutes} more minute${minutes === 1 ? '' : 's'}`,
        Icon: PencilIcon,
        onPress: () => {
          closeHold();
          setEditing(m);
        },
      });
    }
    // For everyone in the chat, words and cards alike. Never a notice, which
    // has no hold at all, and never one that was unsent.
    if (!heldDeleted && canSend && !isNotice(m)) {
      const pinned = isPinned(m);
      holdEntries.push({
        key: 'pin',
        label: pinned ? 'Unpin' : 'Pin',
        Icon: pinned ? PinOffIcon : PinIcon,
        onPress: () => closeHoldThen(() => togglePin(m)),
      });
    }
    holdEntries.push({
      key: 'delete',
      label: 'Delete',
      Icon: Trash2Icon,
      destructive: true,
      onPress: () => closeHoldThen(() => confirmDelete(m)),
    });
  }
  const heldReaction = heldMessage ? myReaction(heldMessage.reactions, user?.id) : null;
  const reactFromHold = (reaction: ReactionKey) => {
    const m = heldMessage;
    closeHold();
    if (m) toggleReaction(m, reaction);
  };

  // ── Saved replies ─────────────────────────────────────────────────────────

  // Opened from the + sheet, once it has gone (see pickShare).
  const pickSaved = useCallback((body: string) => {
    pickedReply.current = true;
    composerRef.current?.insert(body);
    setSavedOpen(false);
  }, []);
  const savedClosed = useCallback(() => {
    if (!pickedReply.current) return;
    pickedReply.current = false;
    composerRef.current?.focus();
  }, []);

  // ── Sharing from Virgo ────────────────────────────────────────────────────

  // Fetched while the + sheet is up, so "How to pay" knows at once whether
  // there is anything to send.
  const {
    payMethods,
    isLoading: payMethodsLoading,
    loadFailed: payMethodsFailed,
  } = useMoneyPayMethods({ enabled: shareOpen || payPicking });
  const { mutate: sendPayCard } = useSendPayCard();

  const openShare = useCallback(() => {
    Keyboard.dismiss();
    setShareOpen(true);
  }, []);

  /** What a choice on the + sheet opens, once the sheet has gone. */
  const pickShare = useCallback(
    (choice: ShareChoice) => {
      if (!id) return;
      afterShare.current = () => {
        switch (choice) {
          case 'album-photos':
            router.push(`/chat/${id}/share-album`);
            return;
          case 'date-plan':
            router.push(`/chat/${id}/plan-date`);
            return;
          case 'saved-replies':
            setSavedOpen(true);
            return;
          case 'photos':
            void pickPhotosForChat();
            return;
          case 'file':
            void pickFileForChat();
            return;
          case 'camera':
            void takePhotoForChat();
            return;
          case 'pay-card':
            if (payMethods.length > 0 || payMethodsLoading) setPayPicking(true);
            else if (payMethodsFailed) showToast("Couldn't load your ways to pay. Check your connection and try again.");
            // Nothing saved yet: adding one is the way to send one.
            else router.push('/money/pay-methods/edit');
            return;
          default:
            setListing(choice);
        }
      };
      setShareOpen(false);
    },
    [
      id, payMethods.length, payMethodsLoading, payMethodsFailed, showToast, pickPhotosForChat, pickFileForChat,
      takePhotoForChat,
    ],
  );
  const runAfterShare = useCallback(() => {
    const next = afterShare.current;
    afterShare.current = null;
    next?.();
  }, []);

  const cardSent = useCallback(() => {
    setListing(null);
    // What you just shared is what you want to see, wherever you had scrolled.
    toLatest();
  }, [toLatest]);

  const editingId = editing?.id ?? null;
  /** Searching: the term, picked out in every bubble on screen. */
  const highlight = searching && searchTerm ? searchTerm : null;
  /** Jumped to a pin (or opened around one): the way back to the newest. */
  const showBackToLatest = !searching && (inWindow || focusId !== null);
  const subtitle = isGroup
    ? (conversation ? groupSubtitle(conversation) : null) ??
      `${participants.length} ${participants.length === 1 ? 'person' : 'people'}`
    : null;
  const headerPhoto = isGroup ? conversation?.avatarUrl : (others[0]?.avatar_url ?? conversation?.avatarUrl);

  const renderItem = useCallback(
    ({ item }: { item: ThreadRow }) => {
      switch (item.kind) {
        case 'day':
          return <DaySeparator label={item.label} />;
        case 'divider':
          return <UnreadDivider />;
        case 'uploading':
          return <PendingFilesBubble upload={item.upload} isOffline={isOffline} onPress={onSendingPress} />;
        case 'outgoing':
          return (
            <OutgoingBubble
              item={item.item}
              isOffline={isOffline}
              onPress={retry}
              onLongPress={unsentActions}
            />
          );
        case 'message': {
          const mine = item.message.sender_id === user?.id;
          const { state, seenBy } = mine
            ? deliveryOf(item.message.created_at)
            : { state: 'sent' as Delivery, seenBy: 0 };
          return (
            <MessageBubble
              message={item.message}
              mine={mine}
              showName={item.showName}
              state={state}
              seenBy={seenBy}
              showSeenBy={showSeenBy}
              matcher={matcher}
              isDark={isDark}
              onLongPress={onHold}
              myId={user?.id}
              canReact={canSend}
              onToggleReaction={toggleReaction}
              onShowReactions={showReactions}
              onShowSeenBy={showSeenByFor}
              beingEdited={item.message.id === editingId}
              waiting={pendingEdits.has(item.message.id)}
              autoLoadMedia={autoLoad}
              people={people}
              notify={showToast}
              highlight={highlight}
              lit={item.message.id === focusId}
              upload={
                mine
                  ? (uploadFor.get(item.message.id) ??
                    (item.message.client_id ? uploadFor.get(item.message.client_id) : undefined) ??
                    null)
                  : null
              }
              isOffline={isOffline}
              quoted={item.message.reply_to_id ? (byId.get(item.message.reply_to_id) ?? null) : null}
              onOpenPhoto={openPhoto}
              onOpenFile={openFile}
              onSendingPress={onSendingPress}
            />
          );
        }
      }
    },
    [
      user?.id, deliveryOf, showSeenBy, matcher, isDark, isOffline, retry, unsentActions,
      onHold, canSend, toggleReaction, showReactions, showSeenByFor, editingId, pendingEdits,
      autoLoad, people, showToast, highlight, focusId, uploadFor, byId, openPhoto, openFile,
      onSendingPress,
    ],
  );

  return (
    <SafeAreaView
      ref={rootRef}
      edges={['top']}
      className="flex-1 bg-background"
      onLayout={() =>
        rootRef.current?.measureInWindow((_x, y) => setScreenTop(Math.max(0, Math.round(y))))
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={screenTop}
      >
        {/* Header, or the search box while searching this chat */}
        {searching ? (
          <>
            <ChatSearchHeader
              value={searchDraft}
              onChangeText={setSearchDraft}
              onDone={backToLatest}
              autoFocus={searchFocus}
            />
            <ChatSearchCount
              where={title}
              term={searchTerm}
              total={matches.length}
              at={matchAt}
              loading={found.isFetching || (!!windowAt && around.isFetching && !around.data)}
              failed={found.loadFailed}
              onOlder={() => stepMatch(1)}
              onNewer={() => stepMatch(-1)}
            />
          </>
        ) : (
          <View
            className="px-3 pt-1 pb-2 flex-row items-center gap-2 border-b border-border/50"
            style={{ borderBottomColor: border }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => router.back()}
              className="w-11 h-11 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            >
              <ArrowLeftIcon size={22} className="text-foreground" />
            </Pressable>
            {/* The whole title opens info, the way a chat header usually does. */}
            <Pressable
              onPress={() => router.push(`/chat/${id}/info`)}
              accessibilityRole="button"
              accessibilityLabel={`${title}${conversation?.muted ? ', muted' : ''}`}
              accessibilityHint="Opens the conversation details"
              className="flex-1 min-w-0 min-h-[44px] flex-row items-center gap-2.5 active:opacity-70"
            >
              <ChatAvatar
                name={title}
                url={headerPhoto}
                size={36}
                group={isGroup}
                square={isGroup && isTeamChat(conversation)}
              />
              <View className="flex-1 min-w-0 justify-center">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-foreground text-[16px] leading-5 font-bold" numberOfLines={1}>
                    {title}
                  </Text>
                  {conversation?.muted && <BellOffIcon size={12} className="text-muted-foreground" />}
                </View>
                {isGroup ? (
                  // "Team chat · 6 people", "5 people · From the Santos Wedding job".
                  <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : canSend ? (
                  <View className="mt-0.5">
                    {/* Online / last seen, kept current by the socket. Not in a
                        frozen thread, where the server has stopped sending it and
                        whatever the store last held would be stale. */}
                    <PresenceLine userId={others[0]?.id} />
                  </View>
                ) : null}
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Conversation details"
              onPress={() => router.push(`/chat/${id}/info`)}
              className="w-11 h-11 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            >
              <InfoIcon size={20} className="text-foreground" />
            </Pressable>
          </View>
        )}

        {/* What is pinned here, under the header. Words only. */}
        {!searching ? <PinnedStrip pins={pins} onPress={() => setPinsOpen(true)} /> : null}

        {isOffline && (
          <View
            className="px-5 py-2 flex-row items-center justify-center gap-2 bg-warning/10"
            accessibilityRole="alert"
          >
            <WifiOffIcon size={13} className="text-warning" />
            <Text className="text-warning text-xs font-semibold text-center">
              No connection. Messages will send when you're back online.
            </Text>
          </View>
        )}

        {isLoading && messages.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="small" color="#A85D35" />
          </View>
        ) : threadGone ? (
          <View className="flex-1 items-center justify-center px-10">
            <Text className="text-foreground text-[15px] font-bold text-center">
              This conversation isn't available
            </Text>
            <Text className="text-muted-foreground text-[13px] text-center mt-1.5 leading-5">
              It was deleted, or you are no longer in it.
            </Text>
          </View>
        ) : !threadReady && threadFailed ? (
          <LoadFailed what="this conversation" onRetry={() => void refetchThread()} />
        ) : (
          <View className="flex-1">
            <FlatList
              ref={listRef}
              data={rows}
              keyExtractor={(row) => row.key}
              renderItem={renderItem}
              inverted
              // A message arriving while you read further up no longer shifts
              // what you are reading. Within a few points of the newest, the
              // list follows it as before.
              maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 40 }}
              onScroll={onScroll}
              scrollEventThrottle={64}
              onScrollToIndexFailed={onScrollToIndexFailed}
              // The list is inverted, so its *header* renders at the visual
              // bottom — which is where a typing bubble belongs, under the
              // newest message.
              ListHeaderComponent={
                // Typing is now, not then: not under a window of history.
                inWindow ? null : <TypingIndicator conversationId={id} meId={user?.id} />
              }
              // Inverted, so the end is the top: the oldest message loaded.
              // A window is the forty around one message, and pages no further.
              onEndReached={() => {
                if (!inWindow && hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
                  void fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                isFetchingNextPage ? (
                  <View className="py-3 items-center">
                    <ActivityIndicator size="small" color="#A85D35" />
                  </View>
                ) : isFetchNextPageError ? (
                  // A failed page used to be dropped silently, and scrolling
                  // up never tried again.
                  <Pressable
                    onPress={() => void fetchNextPage()}
                    accessibilityRole="button"
                    className="py-3 min-h-[44px] items-center justify-center active:opacity-60"
                  >
                    <Text className="text-primary text-sm font-semibold">
                      Couldn't load older messages. Tap to try again.
                    </Text>
                  </Pressable>
                ) : null
              }
              contentContainerStyle={{ padding: 16, gap: 6 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              ListEmptyComponent={
                <View className="items-center pt-16" style={{ transform: [{ scaleY: -1 }] }}>
                  <UsersIcon size={26} className="text-muted-foreground" />
                  <Text className="text-muted-foreground text-sm mt-3">
                    No messages yet. Say hello.
                  </Text>
                </View>
              }
            />

            {/* Opened at a pin: the way back to the newest, always in reach. */}
            {showBackToLatest ? (
              <Pressable
                onPress={backToLatest}
                accessibilityRole="button"
                className="absolute self-center bottom-3 min-h-[44px] px-4 rounded-full bg-card flex-row items-center justify-center gap-1.5 active:scale-[0.96]"
                style={{
                  shadowColor: '#000',
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 4,
                }}
              >
                <ArrowDownIcon size={16} className="text-foreground" />
                <Text className="text-foreground text-[14px] font-semibold">Back to the latest</Text>
              </Pressable>
            ) : null}

            {/* A window loading over the thread still on screen. */}
            {windowAt && !around.data && around.isFetching ? (
              <View className="absolute self-center top-3 px-3 py-2 rounded-full bg-card" pointerEvents="none">
                <ActivityIndicator size="small" color="#A85D35" />
              </View>
            ) : null}

            {/* Back to the newest, once you have scrolled away from it. */}
            {away && !showBackToLatest && !searching && (
              <Pressable
                onPress={jumpToLatest}
                accessibilityRole="button"
                accessibilityLabel={
                  newWhileAway > 0
                    ? `${newWhileAway} new message${newWhileAway === 1 ? '' : 's'}. Jump to latest`
                    : 'Jump to latest message'
                }
                className="absolute right-4 bottom-3 min-h-[44px] min-w-[44px] px-3 rounded-full bg-card flex-row items-center justify-center gap-1.5 active:scale-[0.96]"
                style={{
                  shadowColor: '#000',
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 4,
                }}
              >
                {newWhileAway > 0 && (
                  <Text className="text-primary text-xs font-bold">
                    {newWhileAway > 99 ? '99+' : newWhileAway} new
                  </Text>
                )}
                <ArrowDownIcon size={18} className="text-foreground" />
              </Pressable>
            )}
            {toast.element}
          </View>
        )}

        {/* Composer, or why there is none. A frozen thread keeps its
            history but takes no new messages, and a composer that fails every
            send is worse than a plain line saying so. */}
        {searching ? (
          <ChatSearchFooter bottomInset={keyboardUp ? 0 : insets.bottom} />
        ) : canSend && id ? (
          <Composer
            ref={composerRef}
            conversationId={id}
            isGroup={isGroup}
            others={others}
            replyTo={replyTo}
            onCancelReply={cancelReply}
            onSend={send}
            editing={editing}
            editNote={editNote}
            onCancelEdit={cancelEdit}
            onSaveEdit={saveEdit}
            onEditExpired={editExpired}
            onPlus={openShare}
            onVoiceSent={voiceSent}
          />
        ) : !threadReady ? null : (
          <View
            className="bg-muted px-5 py-4 border-t border-border"
            style={{ paddingBottom: (keyboardUp ? 0 : insets.bottom) + 16 }}
          >
            {blockedByMe ? (
              <View className="flex-row items-center gap-3">
                <View className="flex-1 min-w-0">
                  <Text className="text-foreground font-semibold" numberOfLines={1}>
                    You blocked {noticeName}.
                  </Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    Unblock them to send messages.
                  </Text>
                </View>
                {blockId ? (
                  <Pressable
                    onPress={unblockFromNotice}
                    disabled={unblock.isPending}
                    accessibilityRole="button"
                    className="min-h-[44px] px-2 justify-center active:opacity-60"
                  >
                    <Text className="text-primary font-bold">
                      {unblock.isPending ? 'Unblocking…' : 'Unblock'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              // Worded to say nothing about why. Being blocked must look like
              // the other person simply not being reachable here.
              <Text className="text-muted-foreground text-center">
                {"You can't reply to this conversation."}
              </Text>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Holding a message: reactions above it, what can be done below. */}
      <MessageHold
        // The latest of it: a reaction can land while it is held.
        held={held && heldMessage ? { ...held, message: heldMessage } : null}
        canReact={canReactHeld}
        myReaction={heldReaction}
        entries={holdEntries}
        matcher={matcher}
        onReact={reactFromHold}
        onClose={closeHold}
        onClosed={onHoldClosed}
      />

      <PinsSheet
        visible={pinsOpen}
        pins={pins}
        loading={pinsQuery.isLoading}
        failed={pinsQuery.loadFailed}
        onRetry={() => void pinsQuery.refetch()}
        myId={user?.id}
        unpinning={unpinning}
        onJump={jumpToPin}
        onUnpin={unpinFromSheet}
        onClose={() => setPinsOpen(false)}
        onClosed={pinsClosed}
      />

      <PinReplaceSheet
        visible={!!pinWaiting}
        pins={pins}
        myId={user?.id}
        replacing={replacing}
        onPick={replacePin}
        onClose={() => setPinWaiting(null)}
      />

      <ReactionsSheet
        message={reactionsFor ? (byId.get(reactionsFor) ?? null) : null}
        participants={participants}
        myId={user?.id}
        onClose={() => setReactionsFor(null)}
      />

      <SeenBySheet
        message={seenByFor ? (byId.get(seenByFor) ?? null) : null}
        others={others}
        onClose={() => setSeenByFor(null)}
      />

      {id ? (
        <ForwardSheet
          message={forwarding}
          conversationId={id}
          onClose={() => setForwarding(null)}
          onSent={(sent, skipped) => {
            setForwarding(null);
            showToast(
              skipped > 0
                ? `Forwarded to ${sent} of ${sent + skipped} chats. The others can't take messages right now.`
                : `Forwarded to ${sent} chat${sent === 1 ? '' : 's'}`,
            );
          }}
        />
      ) : null}

      <SavedRepliesSheet
        visible={savedOpen}
        onClose={() => setSavedOpen(false)}
        onClosed={savedClosed}
        onPick={pickSaved}
      />

      <SharePlusSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        onClosed={runAfterShare}
        onPick={pickShare}
      />

      {id ? (
        <ShareListSheet
          conversationId={id}
          kind={listing}
          onClose={() => setListing(null)}
          onSent={cardSent}
        />
      ) : null}

      <PayPickSheet
        visible={payPicking}
        payMethods={payMethods}
        loading={payMethodsLoading}
        title="Send how to pay"
        hint="Tap one to send it"
        footnote="It goes as a card they can open full size."
        onClose={() => setPayPicking(false)}
        onClosed={runAfterShare}
        onPick={(method) => {
          setPayPicking(false);
          if (!id) return;
          sendPayCard(
            { conversationId: id, payMethodId: method.id },
            {
              onSuccess: toLatest,
              onError: (err) => showToast(cardSendError(err, 'pay-card')),
            },
          );
        }}
        onEdit={() => {
          afterShare.current = () => router.push('/money/pay-methods');
          setPayPicking(false);
        }}
      />
    </SafeAreaView>
  );
}
