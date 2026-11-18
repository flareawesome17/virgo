import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRightIcon, InfoIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { formatBytes, type ChatFilesUsage } from '@/src/api';
import { useChatFilesUsage } from '@/src/hooks/useChatFiles';
import { LoadFailed } from '@/components/LoadFailed';

for (const Icon of [ChevronRightIcon, InfoIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** The two shares of the bar, as on board 144. */
export const ALBUMS_COLOUR = '#B66A40';
export const CHATS_COLOUR = '#E3A27F';

/** How many chats show before "See all". */
const TOP = 3;

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.04,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

/** One chat's row: its name, what you sent there, and the way in. */
export function ChatUsageRow({
  chat,
  last,
}: {
  chat: ChatFilesUsage['chats'][number];
  last: boolean;
}) {
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/settings/storage/chat/[id]',
          params: { id: chat.conversationId, title: chat.title },
        })
      }
      accessibilityRole="button"
      accessibilityLabel={`${chat.title}, ${formatBytes(chat.bytes)}${chat.member ? '' : ', you left this chat'}`}
      accessibilityHint="Shows what you sent there"
      className={`min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:bg-muted/30 ${last ? '' : 'border-b border-border/60'}`}
    >
      <View className="flex-1 min-w-0">
        <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
          {chat.title}
        </Text>
        {!chat.member ? <Text className="text-muted-foreground text-xs mt-0.5">You left this chat</Text> : null}
      </View>
      <Text className="text-muted-foreground text-[13px]">{formatBytes(chat.bytes)}</Text>
      <ChevronRightIcon size={14} className="text-muted-foreground" />
    </Pressable>
  );
}

/** What everyone reads under the chats: who pays for what, and how to free it. */
export function ChatStorageNote() {
  return (
    <Text className="text-muted-foreground text-xs leading-[18px] mt-2.5 mx-1">
      Open one to see what you sent and delete it for everyone. Photos others send you count toward their
      storage, not yours.
    </Text>
  );
}

/**
 * Storage, with chat (board 144): how much of what you use went into albums
 * and how much you sent in chats from your phone, the chats using the most,
 * and what running out means. Only the figures the server gives: there is no
 * separate figure for posts, so there is no Posts row.
 */
export function ChatStorageSection({
  usedBytes,
  limitBytes,
}: {
  usedBytes: number;
  limitBytes: number | null;
}) {
  const { usage, isLoading, loadFailed, refetch } = useChatFilesUsage();

  if (!usage) {
    if (isLoading) return null;
    return loadFailed ? (
      <View className="mx-5 mt-4 bg-card rounded-2xl" style={CARD_SHADOW}>
        <LoadFailed what="what you sent in chats" onRetry={() => void refetch()} compact />
      </View>
    ) : null;
  }

  const chatBytes = usage.bytes;
  // What /me/usage counts, less the chats: albums, and anything not in one yet.
  const albumBytes = Math.max(usedBytes - chatBytes, 0);
  const scale = limitBytes && limitBytes > 0 ? limitBytes : Math.max(usedBytes, 1);
  const pct = (bytes: number) => `${Math.min(100, (bytes / scale) * 100)}%` as const;
  const top = usage.chats.slice(0, TOP);

  return (
    <View className="px-5 mt-6">
      <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">
        Where it goes
      </Text>
      <View className="h-2 bg-muted rounded-full overflow-hidden flex-row mb-3">
        <View style={{ width: pct(albumBytes), backgroundColor: ALBUMS_COLOUR }} />
        <View style={{ width: pct(chatBytes), backgroundColor: CHATS_COLOUR }} />
      </View>
      <View className="bg-card rounded-2xl overflow-hidden" style={CARD_SHADOW}>
        <View className="min-h-[48px] flex-row items-center gap-3 px-4 py-3 border-b border-border/60">
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: ALBUMS_COLOUR }} />
          <Text className="flex-1 text-foreground text-sm">Albums</Text>
          <Text className="text-foreground text-sm font-bold">{formatBytes(albumBytes)}</Text>
        </View>
        <Pressable
          onPress={() => router.push('/settings/storage/chats')}
          accessibilityRole="button"
          accessibilityLabel={`Sent in chats, photos and files from your phone, ${formatBytes(chatBytes)}`}
          className="min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:bg-muted/30"
        >
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: CHATS_COLOUR }} />
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-sm">Sent in chats</Text>
            <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
              Photos and files from your phone
            </Text>
          </View>
          <Text className="text-foreground text-sm font-bold">{formatBytes(chatBytes)}</Text>
          <ChevronRightIcon size={14} className="text-muted-foreground" />
        </Pressable>
      </View>

      <Text className="text-foreground text-[15px] font-bold mt-6 mb-2.5 ml-1" accessibilityRole="header">
        Chats using the most
      </Text>
      <View className="bg-card rounded-2xl overflow-hidden" style={CARD_SHADOW}>
        {top.length === 0 ? (
          <Text className="text-muted-foreground text-sm text-center py-5 px-4">
            Nothing sent from your phone yet.
          </Text>
        ) : (
          <>
            {top.map((chat, i) => (
              <ChatUsageRow key={chat.conversationId} chat={chat} last={i === top.length - 1 && usage.chats.length <= TOP} />
            ))}
            {usage.chats.length > TOP ? (
              <Pressable
                onPress={() => router.push('/settings/storage/chats')}
                accessibilityRole="button"
                className="min-h-[48px] px-4 items-center justify-center active:bg-muted/30"
              >
                <Text className="text-primary text-sm font-semibold">See all</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
      <ChatStorageNote />

      <View className="mt-4 bg-muted rounded-2xl px-4 py-3.5 flex-row items-start gap-2.5">
        <InfoIcon size={15} className="text-secondary-foreground" style={{ marginTop: 1 }} />
        <Text className="flex-1 text-secondary-foreground text-xs leading-[18px]">
          {"If you run out, photos and files from your phone won't send. Messages, album photos, cards and dates always will."}
        </Text>
      </View>
    </View>
  );
}
