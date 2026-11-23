import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronRightIcon, PinIcon, PinOffIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { LoadFailed } from '@/components/LoadFailed';
import { pinLine, type ConversationMessage } from '@/src/api';
import { CARD_ICON } from './cards/card-icons';

for (const Icon of [ChevronRightIcon, PinIcon, PinOffIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** "Ana Lim · Dec 2", or "You · Nov 28". */
function pinByline(m: ConversationMessage, myId: string | undefined): string {
  const who = m.sender_id === myId ? 'You' : (m.sender_name ?? 'Someone');
  const day = new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${who} · ${day}`;
}

/** A card's icon on a tile; a typed message has none. Never a picture: pins load no images. */
function PinTile({ message }: { message: ConversationMessage }) {
  const kind = message.kind ?? 'text';
  if (kind === 'text' || kind === 'notice') return null;
  const Icon = CARD_ICON[kind];
  return (
    <View className="w-11 h-11 rounded-xl bg-muted items-center justify-center">
      <Icon size={20} className="text-foreground" />
    </View>
  );
}

/**
 * Under the thread's header, only while something is pinned: how many, and
 * the newest pin's line. Words only, so it costs nothing on a weak signal.
 */
export function PinnedStrip({
  pins,
  onPress,
}: {
  pins: readonly ConversationMessage[];
  onPress: () => void;
}) {
  const newest = pins[0];
  if (!newest) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Pinned, ${pins.length}. ${pinLine(newest)}`}
      accessibilityHint="Shows the pinned messages"
      className="min-h-[52px] flex-row items-center gap-3 pl-4 pr-3 py-1.5 bg-card border-b border-border/50 active:bg-muted/40"
    >
      <PinIcon size={18} className="text-primary" />
      <View className="flex-1 min-w-0">
        <Text className="text-primary text-[12px] leading-4 font-bold">Pinned · {pins.length}</Text>
        <Text className="text-foreground text-[14px] leading-5" numberOfLines={1}>
          {pinLine(newest)}
        </Text>
      </View>
      <ChevronRightIcon size={18} className="text-muted-foreground" />
    </Pressable>
  );
}

/**
 * The Pinned sheet: every pin, newest first. A tap jumps to it in the chat;
 * Unpin takes it down for everyone.
 */
export function PinsSheet({
  visible,
  pins,
  loading,
  failed,
  onRetry,
  myId,
  unpinning,
  onJump,
  onUnpin,
  onClose,
  onClosed,
}: {
  visible: boolean;
  pins: readonly ConversationMessage[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  myId: string | undefined;
  /** The pin coming down, so only its row shows the spinner. */
  unpinning: string | null;
  onJump: (message: ConversationMessage) => void;
  onUnpin: (message: ConversationMessage) => void;
  onClose: () => void;
  onClosed?: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed}>
      <View className="pt-1 pb-3" style={{ flexShrink: 1 }}>
        <Text className="text-foreground text-[18px] leading-[26px] font-bold px-5" accessibilityRole="header">
          Pinned
        </Text>
        <Text className="text-muted-foreground text-[13px] leading-[18px] px-5 mt-0.5 mb-3.5">
          {pins.length > 0 ? 'Tap one to jump to it in the chat' : 'Nothing is pinned in this chat yet'}
        </Text>

        {pins.length === 0 && loading ? (
          <View className="py-6 items-center">
            <ActivityIndicator size="small" />
          </View>
        ) : pins.length === 0 && failed ? (
          <View className="px-5">
            <LoadFailed what="the pins" onRetry={onRetry} compact />
          </View>
        ) : pins.length > 0 ? (
          <ScrollView style={{ flexShrink: 1 }}>
            <View className="mx-5 rounded-[20px] border border-border/40 overflow-hidden">
              {pins.map((m, i) => (
                <View
                  key={m.id}
                  className={`flex-row items-center gap-3 pl-3.5 pr-1 py-3 ${i > 0 ? 'border-t border-border/30' : ''}`}
                >
                  <PinTile message={m} />
                  <Pressable
                    onPress={() => onJump(m)}
                    accessibilityRole="button"
                    accessibilityLabel={`${pinLine(m)}, ${pinByline(m, myId)}`}
                    accessibilityHint="Jumps to it in the chat"
                    className="flex-1 min-w-0 gap-0.5 active:opacity-60"
                  >
                    <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={2}>
                      {pinLine(m)}
                    </Text>
                    <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
                      {pinByline(m, myId)}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onUnpin(m)}
                    disabled={unpinning !== null}
                    accessibilityRole="button"
                    accessibilityLabel="Unpin"
                    accessibilityHint="Takes it off the pins for everyone"
                    className="w-11 h-11 items-center justify-center active:opacity-60"
                  >
                    {unpinning === m.id ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <PinOffIcon size={18} className="text-muted-foreground" />
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : null}

        <Text className="text-muted-foreground text-[13px] leading-[18px] px-5 pt-3.5">
          Anyone here can pin, three at most. Pinning a fourth asks which one to take down. Everyone
          sees the same pins.
        </Text>
      </View>
    </BottomSheet>
  );
}

/**
 * The chat already holds three: which one comes down to make room. Opened
 * from the 409 a fourth pin gets; the pin goes up with `replace`.
 */
export function PinReplaceSheet({
  visible,
  pins,
  myId,
  replacing,
  onPick,
  onClose,
}: {
  visible: boolean;
  pins: readonly ConversationMessage[];
  myId: string | undefined;
  /** The pin being swapped out, while it is. */
  replacing: string | null;
  onPick: (message: ConversationMessage) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View className="px-5 pt-1 pb-3">
        <Text className="text-foreground text-[18px] leading-[26px] font-bold" accessibilityRole="header">
          Which one should come down?
        </Text>
        <Text className="text-muted-foreground text-[13px] leading-[18px] mt-0.5 mb-3.5">
          This chat has three pinned, the most it can hold. The one you tap comes down for everyone, and
          yours goes up.
        </Text>
        <View className="rounded-[20px] border border-border/40 overflow-hidden">
          {pins.map((m, i) => (
            <Pressable
              key={m.id}
              onPress={() => onPick(m)}
              disabled={replacing !== null}
              accessibilityRole="button"
              accessibilityLabel={`Take down ${pinLine(m)}, ${pinByline(m, myId)}`}
              className={`flex-row items-center gap-3 px-3.5 py-3 min-h-[60px] active:bg-muted/40 ${
                i > 0 ? 'border-t border-border/30' : ''
              }`}
            >
              <PinTile message={m} />
              <View className="flex-1 min-w-0 gap-0.5">
                <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={2}>
                  {pinLine(m)}
                </Text>
                <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
                  {pinByline(m, myId)}
                </Text>
              </View>
              {replacing === m.id ? (
                <ActivityIndicator size="small" />
              ) : (
                <PinOffIcon size={18} className="text-muted-foreground" />
              )}
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          className="mt-3 h-11 rounded-[14px] bg-muted items-center justify-center active:opacity-70"
        >
          <Text className="text-foreground text-[15px] font-semibold">Cancel</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
