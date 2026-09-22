import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  ArrowLeftIcon,
  SendIcon,
  UsersIcon,
  CheckIcon,
  CheckCheckIcon,
  ClockIcon,
  AlertCircleIcon,
  ReplyIcon,
  CopyIcon,
  Trash2Icon,
  XIcon,
  AtSignIcon,
  InfoIcon,
  BellOffIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useAuth,
  useConversation,
  useDeleteMessage,
  useMarkThreadRead,
  useOffline,
  useParticipants,
  useSendMessage,
  useTheme,
  useThread,
  useUnblock,
  setOpenConversation,
} from '@/src/hooks';
import { JobAcceptedCard, PresenceLine, TypingIndicator } from '@/components';
import { askToUnblock, safetyError } from '@/components/PersonSafetySheet';
import { sendTyping } from '@/src/lib/presence-store';
import { buzzForMessage } from '@/src/lib/notifications';
import { chatRefusal, type ConversationMessage, type Participant } from '@/src/api';

for (const Icon of [
  ArrowLeftIcon, SendIcon, UsersIcon, CheckIcon, CheckCheckIcon, ClockIcon,
  AlertCircleIcon, ReplyIcon, CopyIcon, Trash2Icon, XIcon, AtSignIcon,
  InfoIcon, BellOffIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * How far one of your own messages has got.
 *
 * `failed` and `sending` live only on the device; the rest are derived from
 * what the other participants' clients have reported back. A refused message
 * is drawn as failed.
 */
type Delivery = 'sending' | 'failed' | 'sent' | 'delivered' | 'read';

/** A message still on its way out, or one that never made it. */
interface Outgoing {
  tempId: string;
  body: string;
  replyToId?: string;
  replyToBody?: string | null;
  replyToSender?: string | null;
  mentionIds: string[];
  /**
   * 'refused' is a failure that retrying cannot fix: a block froze the
   * conversation. Offering "tap to retry" there would only fail again — until
   * the thread thaws, when it goes back to being 'failed'.
   */
  status: 'sending' | 'failed' | 'refused';
  createdAt: string;
}

type Row =
  | { kind: 'message'; message: ConversationMessage }
  | { kind: 'outgoing'; outgoing: Outgoing }
  | { kind: 'divider' };

/** Escapes a display name so it can go inside a RegExp. */
function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  const { messages, lastReadAt, isLoading, canSend, blockedByMe, blockId } = useThread(id);
  const { participants } = useParticipants(id);
  const { conversation } = useConversation(id);
  const send = useSendMessage(id);
  const remove = useDeleteMessage(id);
  const markRead = useMarkThreadRead();
  const unblock = useUnblock();

  const [draft, setDraft] = useState('');
  const [outbox, setOutbox] = useState<Outgoing[]>([]);
  const [replyTo, setReplyTo] = useState<ConversationMessage | null>(null);
  const [acting, setActing] = useState<ConversationMessage | null>(null);
  const [mentioned, setMentioned] = useState<Participant[]>([]);

  // Tells the app-wide alert watcher not to buzz for this thread — it is on
  // screen, and this screen buzzes for itself on a shorter poll.
  useEffect(() => {
    setOpenConversation(id ?? null);
    return () => setOpenConversation(null);
  }, [id]);

  // Opening the thread is what marks it read, and again whenever new messages
  // land while it is on screen.
  useEffect(() => {
    if (id && messages.length > 0) markRead.mutate(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, messages.length]);

  /**
   * Buzz when someone else's message arrives while you are reading.
   *
   * Keyed on the newest message id rather than the count, so an edit or a
   * refetch that returns the same messages does not re-fire. The first load is
   * seeded silently — opening a thread should not buzz at you.
   */
  const lastSeenId = useRef<string | null>(null);
  useEffect(() => {
    const newest = messages[0];
    if (!newest) return;
    const previous = lastSeenId.current;
    lastSeenId.current = newest.id;
    if (previous === null || newest.id === previous) return;
    if (newest.sender_id === user?.id) return;
    void buzzForMessage();
  }, [messages, user?.id]);

  const isGroup = participants.length > 2;
  const others = useMemo(
    () => participants.filter((p) => p.id !== user?.id),
    [participants, user?.id],
  );
  const title = isGroup
    ? `${participants.length} people`
    : (others[0]?.name ?? 'Conversation');
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

  /**
   * How far a message of yours has got.
   *
   * Read beats delivered beats sent, and each is a comparison against one
   * timestamp per person rather than a per-message receipt row. In a group the
   * weakest link decides: it is only *delivered* once it has reached everyone.
   */
  const deliveryOf = (sentAt: string): Delivery => {
    if (others.length === 0) return 'sent';
    const sent = new Date(sentAt).getTime();
    const at = (value: string | null) => (value ? new Date(value).getTime() : -1);

    if (others.every((p) => at(p.last_read_at) >= sent)) return 'read';
    if (others.every((p) => at(p.last_delivered_at) >= sent)) return 'delivered';
    return 'sent';
  };

  /** In a group, how many have read it — "seen by 2" is worth more than a tick. */
  const readCount = (sentAt: string): number => {
    const sent = new Date(sentAt).getTime();
    return others.filter(
      (p) => p.last_read_at != null && new Date(p.last_read_at).getTime() >= sent,
    ).length;
  };

  /**
   * The partial `@word` being typed at the end of the draft, if any.
   *
   * Only the tail is considered: re-opening the picker for a mention typed
   * earlier in the line would fight the user as they carry on writing.
   */
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
    setMentioned((prev) =>
      prev.some((p) => p.id === person.id) ? prev : [...prev, person],
    );
  };

  /**
   * Renders a body with its mentions picked out.
   *
   * Highlighting is matched on the participants' names rather than on stored
   * offsets: names are what is actually in the text, and offsets would rot the
   * moment anything about the body changed.
   */
  const renderBody = (body: string, mine: boolean) => {
    const names = others
      .concat(participants.filter((p) => p.id === user?.id))
      .map((p) => p.name)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    if (names.length === 0 || !body.includes('@')) {
      return (
        <Text className={`text-sm ${mine ? 'text-white' : 'text-foreground'}`}>
          {body}
        </Text>
      );
    }

    // Longest name first, so "@Ana Cruz" is not cut short by a member "@Ana".
    const pattern = new RegExp(`(@(?:${names.map(escapeForRegex).join('|')}))`, 'g');
    const parts = body.split(pattern);
    // Membership, not a second regex test: `pattern` carries the /g flag, and
    // `.test` on a global regex advances lastIndex, so it would answer
    // differently on identical input from one call to the next.
    const isMention = new Set(names.map((n) => `@${n}`));

    return (
      <Text className={`text-sm ${mine ? 'text-white' : 'text-foreground'}`}>
        {parts.map((part, i) =>
          isMention.has(part) ? (
            <Text
              key={i}
              className={mine ? 'font-bold' : 'font-bold text-primary'}
              style={mine ? { color: '#FFE6D5' } : undefined}
            >
              {part}
            </Text>
          ) : (
            <Text key={i}>{part}</Text>
          ),
        )}
      </Text>
    );
  };

  /**
   * Messages, pending sends, and a divider above the first unread one.
   *
   * Built over the inverted (newest-first) list, so the divider goes *after*
   * the first unread message in array order to render above it on screen.
   */
  const rows = useMemo<Row[]>(() => {
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
  }, [messages, outbox, lastReadAt, user?.id]);

  /** Sends, keeping the text on screen until the server has it. */
  const dispatch = (item: Outgoing) => {
    setOutbox((prev) =>
      prev.map((o) => (o.tempId === item.tempId ? { ...o, status: 'sending' } : o)),
    );
    send.mutate(
      { body: item.body, replyToId: item.replyToId, mentionIds: item.mentionIds },
      {
        // The real message is written into the cache by the mutation, so the
        // placeholder can go without leaving a gap.
        onSuccess: () =>
          setOutbox((prev) => prev.filter((o) => o.tempId !== item.tempId)),
        // Kept, not discarded. A failed send with the text thrown away is how
        // people lose messages they thought they had sent.
        onError: (err) => {
          const status = chatRefusal(err) ? 'refused' : 'failed';
          setOutbox((prev) =>
            prev.map((o) => (o.tempId === item.tempId ? { ...o, status } : o)),
          );
        },
      },
    );
  };

  // Monotonic, so two identical messages sent back to back cannot share a key.
  const nextTempId = useRef(0);

  /**
   * One frame when they start, one when they stop.
   *
   * A keystroke must not become a socket frame — a fast typist would send
   * dozens a second.
   */
  const typingSent = useRef(false);
  const typingIdle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stopTyping = useCallback(() => {
    clearTimeout(typingIdle.current);
    if (!typingSent.current) return;
    typingSent.current = false;
    sendTyping(id, false);
  }, [id]);

  const noteTyping = useCallback(
    (value: string) => {
      // A frozen thread tells nobody you are typing into it.
      if (!canSend) return;
      // An emptied box is not typing.
      if (!value.trim()) {
        stopTyping();
        return;
      }
      if (!typingSent.current) {
        typingSent.current = true;
        sendTyping(id, true);
      }
      // Shorter than the receiver's 6s expiry, so the stop lands first.
      clearTimeout(typingIdle.current);
      typingIdle.current = setTimeout(stopTyping, 3000);
    },
    [id, stopTyping, canSend],
  );

  // Leaving the thread must not strand the indicator on the other screen.
  useEffect(() => stopTyping, [stopTyping]);
  // Nor must the thread freezing under someone who was mid-sentence.
  useEffect(() => {
    if (!canSend) stopTyping();
  }, [canSend, stopTyping]);

  /*
   * A refusal only holds while the thread is frozen. Once it thaws — you
   * unblocked them from the notice, or from another device — the same send
   * would go through, so what was refused becomes an ordinary failure with
   * "tap to retry" again. Otherwise each message had to be copied, discarded
   * and sent by hand, and the outbox lives only on this screen.
   */
  const couldSend = useRef(canSend);
  useEffect(() => {
    const thawed = !couldSend.current && canSend;
    couldSend.current = canSend;
    if (!thawed) return;
    setOutbox((prev) =>
      prev.some((o) => o.status === 'refused')
        ? prev.map((o) => (o.status === 'refused' ? { ...o, status: 'failed' } : o))
        : prev,
    );
  }, [canSend]);

  const submit = () => {
    const body = draft.trim();
    if (!body) return;

    const item: Outgoing = {
      tempId: `local-${(nextTempId.current += 1)}`,
      body,
      replyToId: replyTo?.id,
      replyToBody: replyTo?.body ?? null,
      replyToSender: replyTo?.sender_name ?? null,
      // Only the people actually still named in the text.
      mentionIds: mentioned.filter((p) => body.includes(`@${p.name}`)).map((p) => p.id),
      status: 'sending',
      createdAt: new Date().toISOString(),
    };

    setDraft('');

    // Sending is the clearest possible "stopped typing".

    stopTyping();
    setReplyTo(null);
    setMentioned([]);
    setOutbox((prev) => [...prev, item]);
    dispatch(item);
  };

  const confirmDelete = (message: ConversationMessage) => {
    const mine = message.sender_id === user?.id;
    const options: Parameters<typeof Alert.alert>[2] = [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete for me',
        onPress: () =>
          remove.mutate(
            { messageId: message.id, scope: 'me' },
            {
              onError: (err: any) =>
                Alert.alert('Could not delete', err?.message || 'Please try again.'),
            },
          ),
      },
    ];

    // Only your own text can be taken back from everyone else.
    if (mine && !message.deleted_at) {
      options.push({
        text: 'Delete for everyone',
        style: 'destructive',
        onPress: () =>
          remove.mutate(
            { messageId: message.id, scope: 'everyone' },
            {
              onError: (err: any) =>
                Alert.alert('Could not delete', err?.message || 'Please try again.'),
            },
          ),
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

  /** The tick, clock or warning next to your own message. */
  const DeliveryMark = ({ state }: { state: Delivery }) => {
    if (state === 'failed') {
      return <AlertCircleIcon size={12} color="#FFD4C4" />;
    }
    if (state === 'sending') {
      return <ClockIcon size={11} color="#FFFFFF88" />;
    }
    if (state === 'sent') {
      return <CheckIcon size={12} color="#FFFFFF88" />;
    }
    // Delivered and read differ by weight, not by shape — two ticks that go
    // solid, which is the convention people already read without a legend.
    return (
      <CheckCheckIcon
        size={12}
        color={state === 'read' ? '#FFFFFF' : '#FFFFFF88'}
      />
    );
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={insets.top}
      >
        {/* Header */}
        <View
          className="px-5 pt-2 pb-3 flex-row items-center gap-3 border-b"
          style={{ borderBottomColor: border }}
        >
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          {/* The whole title opens info, the way a chat header usually does —
              it replaces a Leave button that offered one action out of the
              several this conversation actually supports. */}
          <Pressable
            onPress={() => router.push(`/chat/${id}/info`)}
            className="flex-1 min-w-0 active:opacity-70"
          >
            <View className="flex-row items-center gap-1.5">
              <Text className="text-foreground text-base font-bold" numberOfLines={1}>
                {title}
              </Text>
              {conversation?.muted && (
                <BellOffIcon size={12} className="text-muted-foreground" />
              )}
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
            onPress={() => router.push(`/chat/${id}/info`)}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
          >
            <InfoIcon size={17} className="text-foreground" />
          </Pressable>
        </View>

        {isOffline && (
          <View className="px-5 py-2" style={{ backgroundColor: '#C76B4A18' }}>
            <Text className="text-[#C76B4A] text-xs font-semibold text-center">
              No connection — messages will send when you are back online
            </Text>
          </View>
        )}

        {isLoading && messages.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="small" color="#B66A40" />
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(row, i) =>
              row.kind === 'divider'
                ? `divider-${i}`
                : row.kind === 'outgoing'
                  ? row.outgoing.tempId
                  : row.message.id
            }
            inverted
            // The list is inverted, so its *header* renders at the visual
            // bottom — which is where a typing bubble belongs, under the
            // newest message.
            ListHeaderComponent={
              <TypingIndicator conversationId={id} meId={user?.id} />
            }
            contentContainerStyle={{ padding: 16, gap: 8 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              if (item.kind === 'divider') {
                return (
                  <View className="flex-row items-center gap-3 py-1">
                    <View className="flex-1 h-px" style={{ backgroundColor: '#B66A4055' }} />
                    <Text className="text-primary text-[11px] font-bold uppercase tracking-[1.5px]">
                      New messages
                    </Text>
                    <View className="flex-1 h-px" style={{ backgroundColor: '#B66A4055' }} />
                  </View>
                );
              }

              if (item.kind === 'outgoing') {
                const o = item.outgoing;
                const failed = o.status === 'failed';
                const refused = o.status === 'refused';
                const discard = () =>
                  setOutbox((prev) => prev.filter((x) => x.tempId !== o.tempId));
                return (
                  <View className="items-end">
                    <Pressable
                      onPress={failed ? () => dispatch(o) : undefined}
                      onLongPress={
                        failed
                          ? () =>
                              Alert.alert('Unsent message', o.body, [
                                { text: 'Close', style: 'cancel' },
                                { text: 'Try again', onPress: () => dispatch(o) },
                                { text: 'Discard', style: 'destructive', onPress: discard },
                              ])
                          : refused
                            ? () =>
                                // No retry: it would be refused again. Copy
                                // keeps the words for somewhere they can go.
                                Alert.alert('Not sent', o.body, [
                                  { text: 'Close', style: 'cancel' },
                                  {
                                    text: 'Copy',
                                    onPress: () => void Clipboard.setStringAsync(o.body),
                                  },
                                  { text: 'Discard', style: 'destructive', onPress: discard },
                                ])
                            : undefined
                      }
                      className="rounded-2xl px-3.5 py-2.5 bg-action"
                      style={{ maxWidth: '80%', opacity: failed || refused ? 0.75 : 0.85 }}
                    >
                      {o.replyToBody != null && (
                        <View
                          className="rounded-lg px-2 py-1.5 mb-1.5"
                          style={{ backgroundColor: '#00000022', borderLeftWidth: 2, borderLeftColor: '#FFFFFF99' }}
                        >
                          <Text className="text-white/80 text-[10px] font-bold">
                            {o.replyToSender}
                          </Text>
                          <Text className="text-white/70 text-[11px]" numberOfLines={1}>
                            {o.replyToBody}
                          </Text>
                        </View>
                      )}
                      <Text className="text-sm text-white">{o.body}</Text>
                      <View className="flex-row items-center gap-1 mt-1">
                        <Text className="text-[10px] text-white/60">
                          {refused
                            ? 'Not sent'
                            : failed
                              ? isOffline
                                ? 'Waiting for connection'
                                : 'Not sent — tap to retry'
                              : 'Sending…'}
                        </Text>
                        <DeliveryMark state={failed || refused ? 'failed' : 'sending'} />
                      </View>
                    </Pressable>
                  </View>
                );
              }

              const message = item.message;
              const mine = message.sender_id === user?.id;
              const deleted = !!message.deleted_at;

              /*
               * Not a bubble, and not anyone's side of the conversation.
               *
               * The app wrote this one, so it sits full width rather than left
               * or right — attaching it to the poster would read as something
               * they typed, and the applicant would have no more reason to act
               * on it than on any other line they sent.
               */
              if (message.kind === 'job-accepted' && message.context) {
                return <JobAcceptedCard context={message.context} />;
              }

              if (deleted) {
                return (
                  <View className={mine ? 'items-end' : 'items-start'}>
                    <Pressable
                      onLongPress={() => confirmDelete(message)}
                      className="rounded-2xl px-3.5 py-2.5 bg-muted"
                      style={{ maxWidth: '80%' }}
                    >
                      <Text className="text-muted-foreground text-sm italic">
                        {mine ? 'You deleted this message' : 'This message was deleted'}
                      </Text>
                    </Pressable>
                  </View>
                );
              }

              const state = mine ? deliveryOf(message.created_at) : 'sent';
              const seenBy = mine ? readCount(message.created_at) : 0;

              return (
                <View className={mine ? 'items-end' : 'items-start'}>
                  {/* Only groups need the sender's name; in a direct chat the
                      side of the bubble already says who sent it. */}
                  {isGroup && !mine && (
                    <Text className="text-muted-foreground text-[11px] mb-0.5 ml-1">
                      {message.sender_name}
                    </Text>
                  )}
                  <Pressable
                    onLongPress={() => setActing(message)}
                    delayLongPress={300}
                    className={`rounded-2xl px-3.5 py-2.5 ${mine ? 'bg-action' : 'bg-card'}`}
                    style={{ maxWidth: '80%' }}
                  >
                    {/* What this message answers. Shown even when the original
                        was deleted, so a reply never reads as a non-sequitur. */}
                    {message.reply_to_id && (
                      <View
                        className="rounded-lg px-2 py-1.5 mb-1.5"
                        style={{
                          backgroundColor: mine ? '#00000022' : isDark ? '#00000033' : '#00000008',
                          borderLeftWidth: 2,
                          borderLeftColor: mine ? '#FFFFFF99' : '#B66A40',
                        }}
                      >
                        <Text
                          className={`text-[10px] font-bold ${mine ? 'text-white/80' : 'text-primary'}`}
                        >
                          {message.reply_to_sender ?? 'Message'}
                        </Text>
                        <Text
                          className={`text-[11px] ${mine ? 'text-white/70' : 'text-muted-foreground'}`}
                          numberOfLines={1}
                        >
                          {message.reply_to_deleted
                            ? 'Message deleted'
                            : (message.reply_to_body ?? 'Message unavailable')}
                        </Text>
                      </View>
                    )}

                    {renderBody(message.body, mine)}

                    <View className="flex-row items-center gap-1 mt-1">
                      <Text
                        className={`text-[10px] ${mine ? 'text-white/60' : 'text-muted-foreground'}`}
                      >
                        {timeLabel(message.created_at)}
                      </Text>
                      {mine && <DeliveryMark state={state} />}
                      {mine && isGroup && seenBy > 0 && others.length > 1 && (
                        <Text className="text-white/70 text-[10px]">{seenBy}</Text>
                      )}
                    </View>
                  </Pressable>
                </View>
              );
            }}
            ListEmptyComponent={
              <View className="items-center pt-16" style={{ transform: [{ scaleY: -1 }] }}>
                <UsersIcon size={26} className="text-muted-foreground" />
                <Text className="text-muted-foreground text-sm mt-3">
                  No messages yet. Say hello.
                </Text>
              </View>
            }
          />
        )}

        {/* Mention picker — only while an @word is being typed. */}
        {canSend && mentionOptions.length > 0 && (
          <View
            className="mx-4 mb-2 bg-card rounded-2xl overflow-hidden"
            style={{ shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: -2 }, elevation: 6 }}
          >
            <View className="px-4 py-2 flex-row items-center gap-2" style={{ borderBottomWidth: 1, borderBottomColor: border }}>
              <AtSignIcon size={12} className="text-primary" />
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[1.5px]">
                Mention
              </Text>
            </View>
            <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
              {mentionOptions.map((p, i) => (
                <Pressable
                  key={p.id}
                  onPress={() => pickMention(p)}
                  className="px-4 py-2.5 flex-row items-center gap-3 active:bg-muted/40"
                  style={i < mentionOptions.length - 1 ? { borderBottomWidth: 1, borderBottomColor: border } : undefined}
                >
                  <View className="w-7 h-7 rounded-full items-center justify-center" style={{ backgroundColor: '#B66A4018' }}>
                    <Text style={{ color: '#B66A40', fontWeight: '700', fontSize: 12 }}>
                      {p.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text className="text-foreground text-sm font-semibold">{p.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* What you are replying to */}
        {canSend && replyTo && (
          <View
            className="mx-4 mb-2 bg-card rounded-2xl px-3 py-2.5 flex-row items-center gap-3"
            style={{ borderLeftWidth: 3, borderLeftColor: '#B66A40' }}
          >
            <ReplyIcon size={14} className="text-primary" />
            <View className="flex-1 min-w-0">
              <Text className="text-primary text-[11px] font-bold">
                Replying to {replyTo.sender_name}
              </Text>
              <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                {replyTo.body}
              </Text>
            </View>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
              <XIcon size={15} className="text-muted-foreground" />
            </Pressable>
          </View>
        )}

        {/* Composer, or why there is none. A frozen thread keeps its
            history but takes no new messages, and a composer that fails every
            send is worse than a plain line saying so. */}
        {canSend ? (
          <View
            className="px-4 pt-2 flex-row items-end gap-2 border-t bg-background"
            style={{ paddingBottom: insets.bottom + 8, borderTopColor: border }}
          >
            <View className="flex-1 bg-card rounded-2xl px-4 py-2.5">
              <TextInput
                value={draft}
                onChangeText={(value) => {
                  setDraft(value);
                  noteTyping(value);
                }}
                onBlur={stopTyping}
                placeholder={isGroup ? 'Message — use @ to mention' : 'Message'}
                placeholderTextColor="#A89489"
                multiline
                className="text-foreground text-sm"
                style={{ maxHeight: 100 }}
              />
            </View>
            <Pressable
              onPress={submit}
              disabled={!draft.trim()}
              className={`w-11 h-11 rounded-full items-center justify-center active:scale-[0.94] ${
                draft.trim() ? 'bg-action' : 'bg-muted'
              }`}
            >
              <SendIcon size={17} className={draft.trim() ? 'text-white' : 'text-muted-foreground'} />
            </Pressable>
          </View>
        ) : (
          <View
            className="bg-muted px-5 py-4 border-t border-border"
            style={{ paddingBottom: insets.bottom + 16 }}
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
                    hitSlop={8}
                    accessibilityRole="button"
                    className="active:opacity-60"
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
      <Modal
        visible={!!acting}
        transparent
        animationType="fade"
        onRequestClose={() => setActing(null)}
      >
        <Pressable
          className="flex-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={() => setActing(null)}
        />
        <View className="bg-card rounded-t-3xl px-5 pt-4" style={{ paddingBottom: insets.bottom + 20 }}>
          <Text className="text-muted-foreground text-xs mb-3" numberOfLines={2}>
            {acting?.body}
          </Text>

          {/* A reply needs somewhere to be sent. */}
          {canSend && (
            <Pressable
              onPress={() => {
                setReplyTo(acting);
                setActing(null);
              }}
              className="py-3.5 flex-row items-center gap-3 active:opacity-60"
              style={{ borderTopWidth: 1, borderTopColor: border }}
            >
              <ReplyIcon size={17} className="text-foreground" />
              <Text className="text-foreground text-base">Reply</Text>
            </Pressable>
          )}

          <Pressable
            onPress={async () => {
              if (acting) await Clipboard.setStringAsync(acting.body);
              setActing(null);
            }}
            className="py-3.5 flex-row items-center gap-3 active:opacity-60"
            style={{ borderTopWidth: 1, borderTopColor: border }}
          >
            <CopyIcon size={17} className="text-foreground" />
            <Text className="text-foreground text-base">Copy</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              const target = acting;
              setActing(null);
              if (target) confirmDelete(target);
            }}
            className="py-3.5 flex-row items-center gap-3 active:opacity-60"
            style={{ borderTopWidth: 1, borderTopColor: border }}
          >
            <Trash2Icon size={17} className="text-destructive" />
            <Text className="text-destructive text-base">Delete</Text>
          </Pressable>

          <Pressable
            onPress={() => setActing(null)}
            className="mt-3 bg-muted rounded-2xl py-3.5 items-center active:scale-[0.97]"
          >
            <Text className="text-foreground text-base font-semibold">Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
