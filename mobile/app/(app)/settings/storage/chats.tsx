import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatBytes } from '@/src/api';
import { useTheme } from '@/src/hooks';
import { useChatFilesUsage } from '@/src/hooks/useChatFiles';
import { LoadFailed } from '@/components/LoadFailed';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ChatStorageNote, ChatUsageRow } from '@/components/chat/files/ChatStorageSection';
import { PALETTES } from '@/theme';

/**
 * Sent in chats: every chat holding photos or files you sent from your
 * phone, largest first (the twenty largest). Each opens what you sent there.
 */
export default function SentInChatsScreen() {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { usage, isLoading, loadFailed, refetch } = useChatFilesUsage();
  const files = usage?.files ?? 0;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScreenHeader
        title="Sent in chats"
        subtitle={usage ? `${formatBytes(usage.bytes)} · ${files} ${files === 1 ? 'file' : 'files'} from your phone` : undefined}
      />
      {!usage && isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : !usage && loadFailed ? (
        <LoadFailed what="what you sent in chats" onRetry={() => void refetch()} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 60 }}>
          <View className="bg-card rounded-2xl overflow-hidden">
            {(usage?.chats.length ?? 0) === 0 ? (
              <Text className="text-muted-foreground text-sm text-center py-5 px-4">
                Nothing sent from your phone yet.
              </Text>
            ) : (
              usage!.chats.map((chat, i) => (
                <ChatUsageRow key={chat.conversationId} chat={chat} last={i === usage!.chats.length - 1} />
              ))
            )}
          </View>
          <ChatStorageNote />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
