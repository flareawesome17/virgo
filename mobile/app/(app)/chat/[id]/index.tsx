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
  myReaction,
  type ConversationMessage,
  type ReactionKey,
} from '@/src/api';
import { LoadFailed } from '@/components/LoadFailed';
import { Composer, useKeyboardUp, type ComposerHandle } from '@/components/chat/Composer';
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
  Trash2Icon, InfoIcon, BellOffIcon, WifiOffIcon,
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

  const rows = useMemo(
    () => buildThreadRows({ messages, outbox, lastReadAt, meId: user?.id, isGroup }),
    [messages, outbox, lastReadAt, user?.id, isGroup],
  );

  // ── Scrolling ─────────────────────────────────────────────────────────────

  const listRef = useRef<FlatList<ThreadRow>>(null);
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
        listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.85, animated: false });
      }, 120);
    },
    [],
  );

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
        replyToBody: replyTo?.body ?? null,
        replyToSender: replyTo?.sender_name ?? null,
        mentionIds,
        status: 'sending',
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
      setReplyTo(null);
      void flushOutbox(queryClient);
      // What you just sent is what you want to see, wherever you had scrolled.
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    },
    [id, replyTo, queryClient],
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

  // ── Holding a message ─────────────────────────────────────────────────────

  /** Every loaded message by id, so a sheet reads the latest of the one it is about. */
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

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

    Alert.alert(
      'Delete message',
      mine
        ? 'Deleting for everyone removes the text from this conversation for all participants.'
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
    if (!heldDeleted && canSend && !card) {
      holdEntries.push({
        key: 'forward',
        label: 'Forward',
        Icon: ForwardIcon,
        onPress: () => closeHoldThen(() => setForwarding(m)),
      });
    }
    if (!heldDeleted) {
      holdEntries.push({
        key: 'copy',
        label: 'Copy',
        Icon: CopyIcon,
        onPress: () => {
          closeHold();
          void Clipboard.setStringAsync(m.body).then(() => showToast('Copied'));
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
    [id, payMethods.length, payMethodsLoading, payMethodsFailed, showToast],
  );
  const runAfterShare = useCallback(() => {
    const next = afterShare.current;
    afterShare.current = null;
    next?.();
  }, []);

  const cardSent = useCallback(() => {
    setListing(null);
    // What you just shared is what you want to see, wherever you had scrolled.
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const editingId = editing?.id ?? null;

  const renderItem = useCallback(
    ({ item }: { item: ThreadRow }) => {
      switch (item.kind) {
        case 'day':
          return <DaySeparator label={item.label} />;
        case 'divider':
          return <UnreadDivider />;
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
            />
          );
        }
      }
    },
    [
      user?.id, deliveryOf, showSeenBy, matcher, isDark, isOffline, retry, unsentActions,
      onHold, canSend, toggleReaction, showReactions, showSeenByFor, editingId, pendingEdits,
      autoLoad, people, showToast,
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
        {/* Header */}
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
            className="flex-1 min-w-0 min-h-[44px] justify-center active:opacity-70"
          >
            <View className="flex-row items-center gap-1.5">
              <Text className="text-foreground text-[16px] leading-5 font-bold" numberOfLines={1}>
                {title}
              </Text>
              {conversation?.muted && <BellOffIcon size={12} className="text-muted-foreground" />}
            </View>
            {isGroup ? (
              <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                {participants.map((p) => p.name).join(', ')}
              </Text>
            ) : canSend ? (
              <View className="mt-0.5">
                {/* Online / last seen, kept current by the socket. Not in a
                    frozen thread, where the server has stopped sending it and
                    whatever the store last held would be stale. */}
                <PresenceLine userId={others[0]?.id} />
              </View>
            ) : null}
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
              ListHeaderComponent={<TypingIndicator conversationId={id} meId={user?.id} />}
              // Inverted, so the end is the top: the oldest message loaded.
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
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

            {/* Back to the newest, once you have scrolled away from it. */}
            {away && (
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
        {canSend && id ? (
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
              onSuccess: () => listRef.current?.scrollToOffset({ offset: 0, animated: true }),
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
