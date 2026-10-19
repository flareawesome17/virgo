import {
  View,
  Text,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  AppState,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '@/components/BottomSheet';
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
  CopyIcon,
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
  useOffline,
  useParticipants,
  useTheme,
  useThread,
  useUnblock,
} from '@/src/hooks';
import { flushOutbox, retryOutboxItem, useOpenConversation } from '@/src/hooks/useChat';
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
import { ApiError, type ConversationMessage } from '@/src/api';
import { LoadFailed } from '@/components/LoadFailed';
import { Composer, useKeyboardUp } from '@/components/chat/Composer';
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
  ArrowDownIcon, ArrowLeftIcon, UsersIcon, ReplyIcon, CopyIcon, Trash2Icon,
  InfoIcon, BellOffIcon, WifiOffIcon,
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

  const [replyTo, setReplyTo] = useState<ConversationMessage | null>(null);
  const [acting, setActing] = useState<ConversationMessage | null>(null);

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

  const confirmDelete = (message: ConversationMessage) => {
    const mine = message.sender_id === user?.id;
    const onError = (err: unknown) =>
      Alert.alert('Could not delete', err instanceof Error ? err.message : 'Please try again.');
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
              onLongPress={setActing}
            />
          );
        }
      }
    },
    [user?.id, deliveryOf, showSeenBy, matcher, isDark, isOffline, retry, unsentActions],
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
          className="px-5 pt-2 pb-3 flex-row items-center gap-3 border-b"
          style={{ borderBottomColor: border }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            className="w-11 h-11 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
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
              <Text className="text-foreground text-base font-bold" numberOfLines={1}>
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
            <InfoIcon size={17} className="text-foreground" />
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
          </View>
        )}

        {/* Composer, or why there is none. A frozen thread keeps its
            history but takes no new messages, and a composer that fails every
            send is worse than a plain line saying so. */}
        {canSend && id ? (
          <Composer
            conversationId={id}
            isGroup={isGroup}
            others={others}
            replyTo={replyTo}
            onCancelReply={cancelReply}
            onSend={send}
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

      {/* Long-press actions */}
      <BottomSheet visible={!!acting} onClose={() => setActing(null)}>
        <View className="px-5 pt-2 pb-5">
          <Text className="text-muted-foreground text-xs mb-3" numberOfLines={2}>
            {acting?.deleted_at ? 'Deleted message' : acting?.body}
          </Text>

          {/* A reply needs somewhere to be sent, and something to quote. */}
          {canSend && !acting?.deleted_at && (
            <Pressable
              onPress={() => {
                setReplyTo(acting);
                setActing(null);
              }}
              accessibilityRole="button"
              className="py-3.5 min-h-[48px] flex-row items-center gap-3 active:opacity-60"
              style={{ borderTopWidth: 1, borderTopColor: border }}
            >
              <ReplyIcon size={17} className="text-foreground" />
              <Text className="text-foreground text-base">Reply</Text>
            </Pressable>
          )}

          {!acting?.deleted_at && (
            <Pressable
              onPress={async () => {
                if (acting) await Clipboard.setStringAsync(acting.body);
                setActing(null);
              }}
              accessibilityRole="button"
              className="py-3.5 min-h-[48px] flex-row items-center gap-3 active:opacity-60"
              style={{ borderTopWidth: 1, borderTopColor: border }}
            >
              <CopyIcon size={17} className="text-foreground" />
              <Text className="text-foreground text-base">Copy</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => {
              const target = acting;
              setActing(null);
              if (target) confirmDelete(target);
            }}
            accessibilityRole="button"
            className="py-3.5 min-h-[48px] flex-row items-center gap-3 active:opacity-60"
            style={{ borderTopWidth: 1, borderTopColor: border }}
          >
            <Trash2Icon size={17} className="text-destructive" />
            <Text className="text-destructive text-base">Delete</Text>
          </Pressable>

          <Pressable
            onPress={() => setActing(null)}
            accessibilityRole="button"
            className="mt-3 bg-muted rounded-2xl py-3.5 items-center active:scale-[0.97]"
          >
            <Text className="text-foreground text-base font-semibold">Cancel</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}
