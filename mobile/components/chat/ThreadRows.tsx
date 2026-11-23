import { memo, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { View, Text, Pressable, type AccessibilityActionEvent } from 'react-native';
import {
  AlertCircleIcon,
  CheckCheckIcon,
  CheckIcon,
  ClockIcon,
  ForwardIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  firstVirgoLink,
  isCardKind,
  isNotice,
  splitLinks,
  type ConversationMessage,
  type JobAcceptedContext,
  type ReactionKey,
} from '@/src/api';
import type { OutboxItem } from '@/src/lib/outbox';
import { JobAcceptedCard } from '@/components/JobAcceptedCard';
import { PayChatCard } from '@/components/money/PayChatCard';
import { PALETTES } from '@/theme';
import { isCentredCard } from './cards/card-icons';
import type { ChatPeople } from './cards/card-words';
import { ChatCard } from './cards/ChatCard';
import type { HeldRect } from './HoldOverlay';
import { LinkPreviewCard } from './LinkPreviewCard';
import { openChatLink } from './links';
import { ReactionPills } from './ReactionPills';

for (const Icon of [AlertCircleIcon, CheckCheckIcon, CheckIcon, ClockIcon, ForwardIcon]) {
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
        // A notice is never unread: the divider never sits over one.
        !isNotice(e.message) &&
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
        !isCentredCard(older.message.kind) &&
        // After "Jo joined", Jo's first line still says who it is.
        !isNotice(older.message);
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

/**
 * The chat saying who joined, left, was added or removed: a small centred
 * line, never a bubble, with no sender and nothing to hold.
 */
export const NoticeLine = memo(function NoticeLine({ body }: { body: string }) {
  return (
    <View className="items-center py-1.5">
      <View className="rounded-full bg-muted px-3 py-1" style={{ maxWidth: '88%' }}>
        <Text className="text-secondary-foreground text-[12px] leading-4 text-center">{body}</Text>
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

/**
 * Every place a search term appears in a run of words, picked out. Matched
 * the way the server matches: the whole term, any case.
 */
function withHighlight(text: string, term: string | null | undefined, mine: boolean, key: string): ReactNode {
  if (!term) return text;
  const lower = text.toLowerCase();
  const wanted = term.toLowerCase();
  let at = lower.indexOf(wanted);
  if (at < 0) return text;
  const out: ReactNode[] = [];
  let from = 0;
  let n = 0;
  while (at >= 0) {
    if (at > from) out.push(text.slice(from, at));
    out.push(
      <Text
        key={`${key}-h${n++}`}
        // On your own bubble a pale chip with dark words: a tint of the bubble
        // colour would not read.
        className={mine ? 'bg-background text-foreground' : 'bg-warning/25 text-foreground'}
      >
        {text.slice(at, at + wanted.length)}
      </Text>,
    );
    from = at + wanted.length;
    at = lower.indexOf(wanted, from);
  }
  if (from < text.length) out.push(text.slice(from));
  return out;
}

/** The mentions in a run of words, bold — and on your own bubble, underlined. */
function withMentions(
  text: string,
  mine: boolean,
  matcher: MentionMatcher,
  key: string,
  highlight?: string | null,
) {
  if (!matcher || !text.includes('@')) {
    return <Text key={key}>{withHighlight(text, highlight, mine, key)}</Text>;
  }
  return text.split(matcher.pattern).map((part, i) =>
    matcher.names.has(part) ? (
      // Underlined on your own bubble: a lighter tint of the text did not
      // reach a readable contrast on the bubble colour.
      <Text
        key={`${key}-${i}`}
        className={mine ? 'font-bold' : 'font-bold text-primary'}
        style={mine ? { textDecorationLine: 'underline' } : undefined}
      >
        {withHighlight(part, highlight, mine, `${key}-${i}`)}
      </Text>
    ) : (
      <Text key={`${key}-${i}`}>{withHighlight(part, highlight, mine, `${key}-${i}`)}</Text>
    ),
  );
}

/**
 * A message's words: mentions in bold, links underlined and tappable.
 *
 * A Virgo link opens its own screen, anything else the in-app browser. A
 * long press on a link is a long press on the message, as anywhere else in
 * the bubble.
 */
export function MessageBody({
  body,
  mine,
  matcher,
  onLongPress,
  numberOfLines,
  inert = false,
  highlight = null,
}: {
  body: string;
  mine: boolean;
  matcher: MentionMatcher;
  onLongPress?: () => void;
  numberOfLines?: number;
  /** Drawn as links but not tappable: the copy lifted over a dimmed thread. */
  inert?: boolean;
  /** Searching this chat: every place the term appears is picked out. */
  highlight?: string | null;
}) {
  const colour = mine ? 'text-action-foreground' : 'text-foreground';
  const parts = useMemo(() => splitLinks(body), [body]);
  const hasLink = parts.some((p) => p.kind === 'link');
  if (!hasLink && (!matcher || !body.includes('@'))) {
    return (
      <Text className={`text-[15px] leading-5 ${colour}`} numberOfLines={numberOfLines}>
        {withHighlight(body, highlight, mine, 'b')}
      </Text>
    );
  }
  return (
    <Text className={`text-[15px] leading-5 ${colour}`} numberOfLines={numberOfLines}>
      {parts.map((part, i) =>
        part.kind === 'link' ? (
          <Text
            key={`l${i}`}
            onPress={inert ? undefined : () => openChatLink(part.href)}
            onLongPress={inert ? undefined : onLongPress}
            accessibilityRole={inert ? undefined : 'link'}
            className={mine ? '' : 'text-primary'}
            style={{ textDecorationLine: 'underline' }}
          >
            {withHighlight(part.text, highlight, mine, `l${i}`)}
          </Text>
        ) : (
          withMentions(part.text, mine, matcher, `t${i}`, highlight)
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
  /** With where the bubble sits on screen, so the hold can lift it in place. */
  onLongPress: (message: ConversationMessage, rect: HeldRect) => void;
  myId: string | undefined;
  /** False in a frozen thread: reactions show, and cannot be changed. */
  canReact: boolean;
  onToggleReaction: (message: ConversationMessage, reaction: ReactionKey) => void;
  onShowReactions: (message: ConversationMessage) => void;
  /** Your own message, in a group: who has seen it. */
  onShowSeenBy: (message: ConversationMessage) => void;
  /** The one the composer is changing. */
  beingEdited: boolean;
  /** Your change to it is waiting for a connection. */
  waiting: boolean;
  /** Whether pictures load by themselves on this connection and setting. */
  autoLoadMedia: boolean;
  /** Who is in the chat, for the words on shared cards. */
  people: ChatPeople;
  /** A short word over the foot of the thread, from a card: a failed answer. */
  notify: (words: string) => void;
  /** Searching this chat: the term, picked out wherever it appears. */
  highlight?: string | null;
  /** The search match you are on, or the pin you jumped to: ringed. */
  lit?: boolean;
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
  myId,
  canReact,
  onToggleReaction,
  onShowReactions,
  onShowSeenBy,
  beingEdited,
  waiting,
  autoLoadMedia,
  people,
  notify,
  highlight = null,
  lit = false,
}: MessageBubbleProps) {
  const bubbleRef = useRef<View>(null);
  const hold = useCallback(() => {
    const node = bubbleRef.current;
    if (!node) return;
    node.measureInWindow((x, y, width, height) => onLongPress(message, { x, y, width, height }));
  }, [message, onLongPress]);

  // Reacting on a deleted message is not offered, and neither is reacting in
  // a frozen thread, where the pills only say who.
  const reactable = canReact && !message.deleted_at;
  const pills = (
    <ReactionPills
      reactions={message.reactions}
      myId={myId}
      align={mine && !isCentredCard(message.kind) ? 'end' : 'start'}
      canReact={reactable}
      onToggle={(reaction) => onToggleReaction(message, reaction)}
      onShowWho={() => onShowReactions(message)}
    />
  );
  const link = useMemo(
    () => (message.deleted_at || (message.kind ?? 'text') !== 'text' ? null : firstVirgoLink(message.body)),
    [message.body, message.deleted_at, message.kind],
  );

  const time = timeLabel(message.created_at);
  const actions = [{ name: 'longpress', label: 'Message actions' }];
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'longpress') hold();
    if (e.nativeEvent.actionName === 'openLink') {
      const first = splitLinks(message.body).find((p) => p.kind === 'link');
      if (first?.kind === 'link') openChatLink(first.href);
    }
  };

  /*
   * Not a bubble, and not anyone's side of the conversation.
   *
   * The app wrote this one, so it sits full width rather than left or right —
   * attaching it to the poster would read as something they typed, and the
   * applicant would have no more reason to act on it than on any other line
   * they sent. It can be reacted to, so it can be held.
   */
  // Nobody's line: no name, no hold, no reactions.
  if (isNotice(message)) return <NoticeLine body={message.body} />;

  /*
   * What is not a bubble of words — a card, a deleted message — is lit by a
   * band behind it rather than a ring, which would hug the wrong shape.
   */
  const band = (node: ReactNode) =>
    lit ? <View className="rounded-[24px] bg-warning/15 -mx-2 px-2 py-1.5">{node}</View> : node;

  if (message.kind === 'job-accepted' && message.context) {
    return band(
      <View>
        <Pressable
          ref={bubbleRef}
          onLongPress={hold}
          delayLongPress={300}
          accessible={false}
          accessibilityActions={actions}
          onAccessibilityAction={onAction}
        >
          <JobAcceptedCard context={message.context as JobAcceptedContext} />
        </Pressable>
        {pills}
      </View>,
    );
  }

  if (message.deleted_at) {
    const words = mine ? 'You deleted this message' : 'This message was deleted';
    return band(
      <View className={mine ? 'items-end' : 'items-start'}>
        <Pressable
          ref={bubbleRef}
          onLongPress={hold}
          delayLongPress={300}
          accessibilityLabel={`${words}, ${time}`}
          accessibilityActions={actions}
          onAccessibilityAction={onAction}
          className="rounded-[20px] px-3.5 py-2.5 bg-muted active:opacity-80"
          style={{ maxWidth: '80%' }}
        >
          <Text className="text-muted-foreground text-sm italic">{words}</Text>
        </Pressable>
        {pills}
      </View>,
    );
  }

  // How to pay the sender: a card on their side, like their own line.
  if (message.kind === 'pay-card') {
    return band(
      <PayChatCard ref={bubbleRef} message={message} mine={mine} time={time} onLongPress={hold} pills={pills} />,
    );
  }

  // A Virgo thing shared here: album photos, a booking, a job post, a post,
  // a package or a date. Held and reacted to like any message.
  if (isCardKind(message.kind)) {
    const seen =
      state === 'read'
        ? 'Seen'
        : showSeenBy && seenBy > 0
          ? `Seen by ${seenBy}`
          : DELIVERY_WORDS[state];
    return band(
      <ChatCard
        kind={message.kind}
        message={message}
        mine={mine}
        senderName={showName ? (message.sender_name ?? null) : null}
        meta={mine ? `${time} · ${seen}` : time}
        cardRef={bubbleRef}
        onHold={hold}
        pills={pills}
        myId={myId}
        people={people}
        autoLoadMedia={autoLoadMedia}
        notify={notify}
      />,
    );
  }

  const who = mine ? 'You' : (message.sender_name ?? 'Someone');
  const edited = !!message.edited_at;
  const reactionCount = message.reactions?.length ?? 0;
  const label = [
    message.forwarded ? 'Forwarded' : null,
    `${who}: ${message.body}`,
    message.reply_to_id
      ? `replying to ${message.reply_to_sender ?? 'a message'}`
      : null,
    time,
    waiting ? 'change waiting for a connection' : edited ? 'edited' : null,
    mine ? DELIVERY_WORDS[state] : null,
    mine && showSeenBy && seenBy > 0 ? `seen by ${seenBy}` : null,
    reactionCount > 0 ? `${reactionCount} reaction${reactionCount === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const hasLink = splitLinks(message.body).some((p) => p.kind === 'link');
  const bubbleActions = hasLink ? [...actions, { name: 'openLink', label: 'Open link' }] : actions;
  const metaColour = mine ? 'text-action-foreground' : 'text-muted-foreground';
  const timeLine = (
    <>
      <Text className={`text-[11px] ${metaColour}`}>
        {time}
        {/* A change still on this phone is not a failure: it goes when the
            signal comes back, and says so quietly. */}
        {waiting ? ' · Waiting for a connection' : edited ? ' · Edited' : ''}
      </Text>
      {mine && <DeliveryMark state={state} />}
      {mine && showSeenBy && seenBy > 0 && (
        <Text className="text-action-foreground text-[11px]">Seen by {seenBy}</Text>
      )}
    </>
  );

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
        ref={bubbleRef}
        onLongPress={hold}
        delayLongPress={300}
        accessibilityLabel={label}
        accessibilityHint="Long press to react, reply, forward, copy, edit or delete"
        accessibilityActions={bubbleActions}
        onAccessibilityAction={onAction}
        className={`rounded-[20px] px-3.5 py-2.5 active:opacity-80 ${mine ? 'bg-action' : 'bg-card border border-border/40'}`}
        style={[
          { maxWidth: '80%' },
          // The match you are on, or the pin you jumped to: ringed, so it
          // stands out from the other matches on screen.
          lit && !beingEdited
            ? {
                outlineWidth: 2.5,
                outlineStyle: 'solid',
                outlineOffset: 3,
                outlineColor: (isDark ? PALETTES.dark : PALETTES.light).ring,
              }
            : null,
          // The one being changed, ringed and dimmed, so it is plain which
          // message the box below is editing.
          beingEdited
            ? {
                opacity: 0.55,
                outlineWidth: 2,
                outlineStyle: 'solid',
                outlineOffset: 3,
                outlineColor: (isDark ? PALETTES.dark : PALETTES.light).primary,
              }
            : null,
        ]}
      >
        {message.forwarded ? (
          <View className="flex-row items-center gap-1 mb-1">
            <ForwardIcon size={12} className={metaColour} />
            <Text className={`text-[12px] ${metaColour}`}>Forwarded</Text>
          </View>
        ) : null}
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

        <MessageBody
          body={message.body}
          mine={mine}
          matcher={matcher}
          onLongPress={hold}
          highlight={highlight}
        />

        {link ? (
          <LinkPreviewCard
            url={link}
            onBubble={mine ? 'mine' : 'theirs'}
            onLongPress={hold}
            autoLoad={autoLoadMedia}
          />
        ) : null}

        {/* In a group, your own message's line says who has seen it, and a
            tap on it names them. */}
        {mine && showSeenBy ? (
          <Pressable
            onPress={() => onShowSeenBy(message)}
            onLongPress={hold}
            delayLongPress={300}
            hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={seenBy > 0 ? `Seen by ${seenBy}` : 'Not seen yet'}
            accessibilityHint="Shows who has seen it"
            className="flex-row items-center gap-1 mt-1 self-end active:opacity-60"
          >
            {timeLine}
          </Pressable>
        ) : (
          <View className="flex-row items-center gap-1 mt-1 self-end">{timeLine}</View>
        )}
      </Pressable>
      {pills}
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
