import { memo, useCallback, useRef } from 'react';
import { Pressable, Text, View, type AccessibilityActionEvent } from 'react-native';
import { router } from 'expo-router';
import { BellOffIcon, PinIcon, SearchIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { RemoteImage } from '@/components/RemoteImage';
import { PresenceDot } from '@/components/Presence';
import { useTheme } from '@/src/hooks';
import { typingLabel, useTypingIn } from '@/src/lib/presence-store';
import type { Conversation } from '@/src/api';
import { PALETTES } from '@/theme';
import { ChatAvatar, isTeamChat } from './ChatAvatar';
import type { HeldRect } from './HoldOverlay';
import { requestInThread } from './thread-requests';

for (const Icon of [BellOffIcon, PinIcon, SearchIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** "now" / "14:05" / "Mon" / "3 Aug" — how recent decides the format. */
export function whenLabel(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso);
  const now = new Date();
  const mins = (now.getTime() - then.getTime()) / 60000;

  if (mins < 1) return 'now';
  if (then.toDateString() === now.toDateString()) {
    return then.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (mins < 60 * 24 * 7) {
    return then.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return then.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

/** Whether a row asks for attention: something unread, or marked to come back to. */
export function looksUnread(c: Conversation): boolean {
  return c.unread > 0 || c.markedUnread === true;
}

/** The last line, as the list shows it. */
export function previewLine(c: Conversation): string {
  return c.lastMessage
    ? // Naming the sender only matters in a group; in a direct chat the
      // other name is already the title.
      c.isGroup && c.lastSender
      ? `${c.lastSender}: ${c.lastMessage}`
      : c.lastMessage
    : 'No messages yet';
}

/**
 * A row's second line: who is typing, or the last message.
 *
 * Its own component so a keystroke re-renders one line rather than the list.
 *
 * No `meId` is needed: the server relays a typing frame to the *others* in a
 * conversation, never back to its sender, so you can never appear in your own
 * typing list.
 */
function TypingOrPreview({ conversation }: { conversation: Conversation }) {
  const names = useTypingIn(conversation.id);

  if (names.length > 0) {
    return (
      <Text className="text-primary text-[14px] leading-5 font-medium flex-1" numberOfLines={1}>
        {conversation.isGroup ? typingLabel(names) : 'typing…'}
      </Text>
    );
  }

  return (
    <Text
      className={`text-[14px] leading-5 flex-1 ${
        looksUnread(conversation) ? 'text-foreground font-medium' : 'text-muted-foreground'
      }`}
      numberOfLines={1}
    >
      {previewLine(conversation)}
    </Text>
  );
}

/**
 * The picture at the start of a row: the group's photo or its initial (a
 * team chat's in a rounded square), or the person.
 */
export function RowAvatar({ item }: { item: Conversation }) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  if (item.isGroup) {
    return <ChatAvatar name={item.title} url={item.avatarUrl} size={48} group square={isTeamChat(item)} />;
  }
  return (
    // Wrapped so the presence dot has something to anchor to.
    <View style={{ position: 'relative' }}>
      {item.avatarUrl ? (
        <RemoteImage source={{ uri: item.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} />
      ) : (
        <View
          className="w-12 h-12 rounded-full items-center justify-center"
          style={{ backgroundColor: `${palette.primary}18` }}
        >
          <Text style={{ color: palette.primary, fontWeight: '700', fontSize: 17 }}>
            {item.title.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <PresenceDot userId={item.otherUserId} />
    </View>
  );
}

/**
 * Where the row's count goes: the number of unread messages, a dot for one
 * you marked unread yourself (there is no number to give), or a pin for a
 * pinned chat with nothing waiting. A muted chat's is greyed: it waits for
 * you without calling for you.
 */
function RowMark({ item }: { item: Conversation }) {
  if (item.unread > 0) {
    return (
      <View
        className={`rounded-full px-1.5 h-5 min-w-[20px] items-center justify-center ${
          item.muted ? 'bg-muted' : 'bg-action'
        }`}
      >
        <Text
          allowFontScaling={false}
          className={`text-[12px] font-bold ${item.muted ? 'text-muted-foreground' : 'text-action-foreground'}`}
        >
          {item.unread > 99 ? '99+' : item.unread}
        </Text>
      </View>
    );
  }
  if (item.markedUnread) {
    return (
      <View
        accessible={false}
        className={`w-3 h-3 rounded-full ${item.muted ? 'bg-muted-foreground/50' : 'bg-action'}`}
      />
    );
  }
  if (item.pinned) return <PinIcon size={14} className="text-muted-foreground" />;
  return null;
}

/**
 * One conversation in the list.
 *
 * Its own memoised component. The row was drawn inline by the list, so every
 * keystroke in the search box, and every message arriving for any chat, drew
 * every row on screen again, each with its picture. Now a row draws when its
 * own conversation changes.
 *
 * Held, it lifts with its menu (pin, unread, mute, archive, delete). No swipe:
 * a pan inside the list stops it scrolling on an iPhone.
 */
export const ConversationRow = memo(function ConversationRow({
  item,
  onHold,
  dividerAfter = false,
  searchTerm,
}: {
  item: Conversation;
  onHold?: (item: Conversation, rect: HeldRect) => void;
  /** The last of the pinned chats: a rule under it before the rest. */
  dividerAfter?: boolean;
  /** The list's search: a row it found inside the thread opens there, searching. */
  searchTerm?: string;
}) {
  const rowRef = useRef<View>(null);
  const unread = looksUnread(item);

  const hold = useCallback(() => {
    if (!onHold) return;
    const node = rowRef.current;
    if (!node) return;
    node.measureInWindow((x, y, width, height) => onHold(item, { x, y, width, height }));
  }, [item, onHold]);

  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'longpress') hold();
  };

  return (
    <View>
      <Pressable
        ref={rowRef}
        onPress={() => {
          // Found in what was said: open at that message, with the term in
          // the chat's own search box to step through the rest.
          if (item.matchId && searchTerm) {
            requestInThread(item.id, { kind: 'search', q: searchTerm, matchId: item.matchId });
          }
          router.push(`/chat/${item.id}`);
        }}
        onLongPress={onHold ? hold : undefined}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={[
          item.title,
          item.isGroup ? 'group' : null,
          item.pinned ? 'pinned' : null,
          item.unread > 0 ? `${item.unread} unread` : item.markedUnread ? 'marked unread' : null,
          item.muted ? 'muted' : null,
          previewLine(item),
          whenLabel(item.lastAt) || null,
        ]
          .filter(Boolean)
          .join(', ')}
        accessibilityActions={onHold ? [{ name: 'longpress', label: 'Chat options' }] : undefined}
        onAccessibilityAction={onHold ? onAction : undefined}
        className="min-h-[72px] px-5 py-2.5 flex-row items-center gap-3 bg-background active:bg-muted/40"
      >
        <RowAvatar item={item} />

        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2">
            <Text
              // Unread is the only thing in the list that gets weight.
              className={`text-foreground text-[16px] leading-[22px] ${unread ? 'font-bold' : 'font-medium'}`}
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {item.title}
            </Text>
            {item.muted && <BellOffIcon size={13} className="text-muted-foreground" />}
            <View className="flex-1" />
            <Text
              className={`text-[12px] ${
                unread && !item.muted ? 'text-primary font-semibold' : 'text-muted-foreground'
              }`}
            >
              {whenLabel(item.lastAt)}
            </Text>
          </View>
          <View className="flex-row items-center gap-2 mt-0.5">
            {/* One or the other, never both: two lines would make every
                row taller the moment somebody touched a key. */}
            <TypingOrPreview conversation={item} />
            {/* Nothing when there is nothing to say. A double tick stood in
                for "caught up" here, and read as a read receipt on a
                message somebody else had sent. */}
            <RowMark item={item} />
          </View>

          {/* Why this row is a search result, when the hit was buried in
              the thread rather than in its name. */}
          {item.matchSnippet && (
            <View className="flex-row items-center gap-1.5 mt-1">
              <SearchIcon size={12} className="text-primary" />
              <Text className="text-primary text-[13px] flex-1" numberOfLines={1}>
                {item.matchSnippet}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
      {dividerAfter ? <View className="h-px bg-border/60 mx-5 my-1" /> : null}
    </View>
  );
});
