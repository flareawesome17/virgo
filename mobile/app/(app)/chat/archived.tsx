import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArchiveIcon, ArrowLeftIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useTheme } from '@/src/hooks';
import { useArchivedConversations } from '@/src/hooks/useChat';
import type { Conversation } from '@/src/api';
import { LoadFailed } from '@/components/LoadFailed';
import { CardListSkeleton } from '@/components/Skeleton';
import { useChatRowMenu } from '@/components/chat/ChatRowMenu';
import { useChatToast } from '@/components/chat/ChatToast';
import { ConversationRow } from '@/components/chat/ConversationRow';
import { PALETTES } from '@/theme';

for (const Icon of [ArchiveIcon, ArrowLeftIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Chats you put away. Each opens as it was, and comes back to your list by
 * itself when somebody writes in it — or now, from its menu.
 */
export default function ArchivedChatsScreen() {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const {
    conversations,
    loadingFirst,
    loadFailed,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useArchivedConversations();

  const toast = useChatToast(insets.bottom + 16);
  const rowMenu = useChatRowMenu({ archivedList: true, pinnedCount: 0, onNotice: toast.show });
  const hold = rowMenu.hold;

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => <ConversationRow item={item} onHold={hold} />,
    [hold],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="px-3 pt-2 pb-1 flex-row items-center gap-1">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="w-11 h-11 items-center justify-center active:opacity-60"
        >
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="text-foreground text-[17px] font-semibold" accessibilityRole="header">
          Archived
        </Text>
      </View>
      <Text className="px-5 pb-2 text-muted-foreground text-[13px] leading-[18px]">
        Archived chats come back to your list when someone writes in them. Hold one for more.
      </Text>

      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="py-4 items-center">
              <ActivityIndicator size="small" color={palette.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          loadingFirst ? (
            <CardListSkeleton />
          ) : loadFailed ? (
            <View className="mt-16">
              <LoadFailed what="your archived chats" onRetry={() => refetch()} compact />
            </View>
          ) : (
            <View className="px-8 pt-12 items-center gap-2">
              <ArchiveIcon size={26} className="text-muted-foreground" />
              <Text className="text-foreground text-base font-bold">Nothing archived</Text>
              <Text className="text-muted-foreground text-sm text-center">
                Hold a chat in your list and choose Archive to put it away here.
              </Text>
            </View>
          )
        }
      />
      {rowMenu.element}
      {toast.element}
    </SafeAreaView>
  );
}
