import { memo, useMemo } from 'react';
import { View, Text, Pressable, type AccessibilityActionEvent } from 'react-native';
import {
  AlertCircleIcon,
  CheckCheckIcon,
  CheckIcon,
  ClockIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import type { ConversationMessage } from '@/src/api';
import type { OutboxItem } from '@/src/lib/outbox';
import { JobAcceptedCard } from '@/components/JobAcceptedCard';

for (const Icon of [AlertCircleIcon, CheckCheckIcon, CheckIcon, ClockIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * How far one of your own messages has got.
 *
 * `failed` and `sending` live only on the device; the rest are derived from
 * what the other participants' clients have reported back.
 */
export type Delivery = 'sending' | 'failed' | 'sent' | 'delivered' | 'read';

/**
 * What the thread's list holds, newest first.
 *
 * Day separators sit after the oldest message of their day in this order,
 * which an inverted list draws above it.
 */
export type ThreadRow =
  | { kind: 'message'; key: string; message: ConversationMessage; showName: boolean }
  | { kind: 'outgoing'; key: string; item: OutboxItem }
  | { kind: 'divider'; key: string }
  | { kind: 'day'; key: string; label: string };

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today", "Yesterday", "Monday", or "Mon, Aug 3" — and the year once it is not this one. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
  });
}

/** A local calendar day, as a key. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Messages, pending sends, the unread divider and a separator per day.
 *
 * Every bubble showed only a time, so a message from last month read as one
 * from this morning.
 */
export function buildThreadRows({
  messages,
  outbox,
  lastReadAt,
  meId,
  isGroup,
}: {
  messages: readonly ConversationMessage[];
  outbox: readonly OutboxItem[];
  lastReadAt: string | null;
  meId: string | undefined;
  isGroup: boolean;
}): ThreadRow[] {
  type Entry =
    | { kind: 'message'; at: string; message: ConversationMessage }
    | { kind: 'outgoing'; at: string; item: OutboxItem };

  // The queue is oldest first and always newer than anything stored.
  const entries: Entry[] = [
    ...outbox
      .slice()
      .reverse()
      .map((item): Entry => ({ kind: 'outgoing', at: item.createdAt, item })),
    ...messages.map((message): Entry => ({ kind: 'message', at: message.created_at, message })),
  ];

  // The oldest message from someone else since you last read: the divider
  // goes above it.
  let firstUnread = -1;
  if (lastReadAt) {
    const boundary = new Date(lastReadAt).getTime();
    entries.forEach((e, i) => {
      if (
        e.kind === 'message' &&
        e.message.sender_id !== meId &&
        new Date(e.message.created_at).getTime() > boundary
      ) {
        firstUnread = i;
      }
    });
  }

  const now = new Date();
  const rows: ThreadRow[] = [];
  entries.forEach((entry, i) => {
    const older = entries[i + 1];
    const day = dayKey(entry.at);
    const dayEnds = !older || dayKey(older.at) !== day;

    if (entry.kind === 'outgoing') {
      rows.push({ kind: 'outgoing', key: entry.item.clientId, item: entry.item });
    } else {
      const m = entry.message;
      // A name over the first of a run from one person, in a group. The
      // unread divider and a new day both start a fresh run.
      const continues =
        !dayEnds &&
        i !== firstUnread &&
        older?.kind === 'message' &&
        older.message.sender_id === m.sender_id &&
        older.message.kind !== 'job-accepted';
      rows.push({
        kind: 'message',
        key: m.id,
        message: m,
        showName: isGroup && m.sender_id !== meId && !continues,
      });
    }
    if (i === firstUnread) rows.push({ kind: 'divider', key: 'divider' });
    if (dayEnds) rows.push({ kind: 'day', key: `day-${day}`, label: dayLabel(entry.at, now) });
  });
  return rows;
}

export const DaySeparator = memo(function DaySeparator({ label }: { label: string }) {
  return (
    <View className="items-center py-2" accessibilityRole="header">
      <View className="px-3 py-1">
        <Text className="text-muted-foreground text-[12px] font-semibold">{label}</Text>
      </View>
    </View>
  );
});

export const UnreadDivider = memo(function UnreadDivider() {
  return (
    <View className="flex-row items-center gap-3 py-1" accessibilityRole="header">
      <View className="flex-1 h-px bg-primary/40" />
      <Text className="text-primary text-[11px] font-bold uppercase tracking-[1.5px]">
        New messages
      </Text>
      <View className="flex-1 h-px bg-primary/40" />
    </View>
  );
});

/** The tick, clock or warning next to your own message. */
export function DeliveryMark({ state }: { state: Delivery }) {
  if (state === 'failed') return <AlertCircleIcon size={13} color="#FFFFFF" />;
  if (state === 'sending') return <ClockIcon size={12} color="#FFFFFFCC" />;
  if (state === 'sent') return <CheckIcon size={13} color="#FFFFFFCC" />;
  // Delivered and read differ by weight, not by shape — two ticks that go
  // solid, which is the convention people already read without a legend.
  return <CheckCheckIcon size={13} color={state === 'read' ? '#FFFFFF' : '#FFFFFFCC'} />;
}

const DELIVERY_WORDS: Record<Delivery, string> = {
  sending: 'Sending',
  failed: 'Not sent',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
};

/** Escapes a display name so it can go inside a RegExp. */
function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds mentions in a body.
 *
 * Matched on the participants' names rather than on stored offsets: names are
 * what is actually in the text, and offsets would rot the moment anything
 * about the body changed. Built once per member list, not once per bubble per
 * render — it was the second.
 */
export function useMentionMatcher(names: readonly string[]) {
  return useMemo(() => {
    const sorted = names.filter(Boolean).slice().sort((a, b) => b.length - a.length);
    if (sorted.length === 0) return null;
    // Longest name first, so "@Ana Cruz" is not cut short by a member "@Ana".
    return {
      pattern: new RegExp(`(@(?:${sorted.map(escapeForRegex).join('|')}))`, 'g'),
      // Membership, not a second regex test: the pattern carries /g, and
      // `.test` on a global regex advances lastIndex.
      names: new Set(sorted.map((n) => `@${n}`)),
    };
  }, [names]);
}

export type MentionMatcher = ReturnType<typeof useMentionMatcher>;

function Body({ body, mine, matcher }: { body: string; mine: boolean; matcher: MentionMatcher }) {
  const colour = mine ? 'text-action-foreground' : 'text-foreground';
  if (!matcher || !body.includes('@')) {
    return <Text className={`text-[15px] leading-5 ${colour}`}>{body}</Text>;
  }
  const parts = body.split(matcher.pattern);
  return (
    <Text className={`text-[15px] leading-5 ${colour}`}>
      {parts.map((part, i) =>
        matcher.names.has(part) ? (
          // Underlined on your own bubble: a lighter tint of the text did not
          // reach a readable contrast on the bubble colour.
          <Text
            key={i}
            className={mine ? 'font-bold' : 'font-bold text-primary'}
            style={mine ? { textDecorationLine: 'underline' } : undefined}
          >
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        ),
      )}
    </Text>
  );
}

interface MessageBubbleProps {
  message: ConversationMessage;
  mine: boolean;
  showName: boolean;
  /** Only for your own messages. */
  state: Delivery;
  /** In a group, how many have read it. */
  seenBy: number;
  showSeenBy: boolean;
  matcher: MentionMatcher;
  isDark: boolean;
  onLongPress: (message: ConversationMessage) => void;
}

/**
 * One message.
 *
 * Memoised, with the composer's draft held elsewhere: every keystroke used to
 * re-render every visible bubble, and its mention regex with it, which is
 * what made typing lag in a long thread.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  mine,
  showName,
  state,
  seenBy,
  showSeenBy,
  matcher,
  isDark,
  onLongPress,
}: MessageBubbleProps) {
  /*
   * Not a bubble, and not anyone's side of the conversation.
   *
   * The app wrote this one, so it sits full width rather than left or right —
   * attaching it to the poster would read as something they typed, and the
   * applicant would have no more reason to act on it than on any other line
   * they sent.
   */
  if (message.kind === 'job-accepted' && message.context) {
    return <JobAcceptedCard context={message.context} />;
  }

  const time = timeLabel(message.created_at);
  const actions = [{ name: 'longpress', label: 'Message actions' }];
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'longpress') onLongPress(message);
  };

  if (message.deleted_at) {
    const words = mine ? 'You deleted this message' : 'This message was deleted';
    return (
      <View className={mine ? 'items-end' : 'items-start'}>
        <Pressable
          onLongPress={() => onLongPress(message)}
          delayLongPress={300}
          accessibilityLabel={`${words}, ${time}`}
          accessibilityActions={actions}
          onAccessibilityAction={onAction}
          className="rounded-[20px] px-3.5 py-2.5 bg-muted active:opacity-80"
          style={{ maxWidth: '80%' }}
        >
          <Text className="text-muted-foreground text-sm italic">{words}</Text>
        </Pressable>
      </View>
    );
  }

  const who = mine ? 'You' : (message.sender_name ?? 'Someone');
  const label = [
    `${who}: ${message.body}`,
    message.reply_to_id
      ? `replying to ${message.reply_to_sender ?? 'a message'}`
      : null,
    time,
    mine ? DELIVERY_WORDS[state] : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View className={mine ? 'items-end' : 'items-start'}>
      {/* Only groups need the sender's name; in a direct chat the side of the
          bubble already says who sent it. */}
      {showName && (
        <Text className="text-muted-foreground text-xs mb-0.5 ml-1" numberOfLines={1}>
          {message.sender_name}
        </Text>
      )}
      <Pressable
        onLongPress={() => onLongPress(message)}
        delayLongPress={300}
        accessibilityLabel={label}
        accessibilityHint="Long press for reply, copy and delete"
        accessibilityActions={actions}
        onAccessibilityAction={onAction}
        className={`rounded-[20px] px-3.5 py-2.5 active:opacity-80 ${mine ? 'bg-action' : 'bg-card border border-border/40'}`}
        style={{ maxWidth: '80%' }}
      >
        {/* What this message answers. Shown even when the original was
            deleted, so a reply never reads as a non-sequitur. */}
        {message.reply_to_id ? (
          <View
            className="rounded-lg px-2 py-1.5 mb-1.5"
            style={{
              backgroundColor: mine ? '#00000026' : isDark ? '#00000033' : '#0000000A',
              borderLeftWidth: 2,
              borderLeftColor: mine ? '#FFFFFF' : '#A85D35',
            }}
          >
            <Text
              className={`text-[11px] font-bold ${mine ? 'text-action-foreground' : 'text-primary'}`}
              numberOfLines={1}
            >
              {message.reply_to_sender ?? 'Message'}
            </Text>
            <Text
              className={`text-xs ${mine ? 'text-action-foreground' : 'text-muted-foreground'}`}
              numberOfLines={1}
            >
              {message.reply_to_deleted
                ? 'Message deleted'
                : (message.reply_to_body ?? 'Message unavailable')}
            </Text>
          </View>
        ) : null}

        <Body body={message.body} mine={mine} matcher={matcher} />

        <View className="flex-row items-center gap-1 mt-1 self-end">
          <Text className={`text-[11px] ${mine ? 'text-action-foreground' : 'text-muted-foreground'}`}>
            {time}
          </Text>
          {mine && <DeliveryMark state={state} />}
          {mine && showSeenBy && seenBy > 0 && (
            <Text className="text-action-foreground text-[11px]">{seenBy}</Text>
          )}
        </View>
      </Pressable>
    </View>
  );
});

interface OutgoingBubbleProps {
  item: OutboxItem;
  isOffline: boolean;
  onPress: (item: OutboxItem) => void;
  onLongPress: (item: OutboxItem) => void;
}

/** A message still on its way out, or one that has not made it yet. */
export const OutgoingBubble = memo(function OutgoingBubble({
  item,
  isOffline,
  onPress,
  onLongPress,
}: OutgoingBubbleProps) {
  const failed = item.status === 'failed';
  const refused = item.status === 'refused';
  const waiting = item.status === 'waiting';
  const status = refused
    ? 'Not sent'
    : failed
      ? 'Not sent — tap to retry'
      : waiting
        ? isOffline
          ? 'Waiting for connection'
          : 'Not sent yet — tap to retry'
        : 'Sending…';
  const tappable = failed || waiting;

  return (
    <View className="items-end">
      <Pressable
        onPress={tappable ? () => onPress(item) : undefined}
        onLongPress={failed || refused || waiting ? () => onLongPress(item) : undefined}
        accessibilityRole={tappable ? 'button' : undefined}
        accessibilityLabel={`You: ${item.body}, ${status}`}
        className="rounded-[20px] px-3.5 py-2.5 bg-action active:opacity-80"
        style={{ maxWidth: '80%' }}
      >
        {item.replyToBody != null && (
          <View
            className="rounded-lg px-2 py-1.5 mb-1.5"
            style={{ backgroundColor: '#00000026', borderLeftWidth: 2, borderLeftColor: '#FFFFFF' }}
          >
            <Text className="text-action-foreground text-[11px] font-bold" numberOfLines={1}>
              {item.replyToSender}
            </Text>
            <Text className="text-action-foreground text-xs" numberOfLines={1}>
              {item.replyToBody}
            </Text>
          </View>
        )}
        <Text className="text-[15px] leading-5 text-action-foreground">{item.body}</Text>
        <View className="flex-row items-center gap-1 mt-1 self-end">
          <Text className="text-[11px] text-action-foreground">{status}</Text>
          <DeliveryMark state={failed || refused ? 'failed' : 'sending'} />
        </View>
      </Pressable>
    </View>
  );
});
