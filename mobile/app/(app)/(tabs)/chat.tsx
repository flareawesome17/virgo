import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArchiveIcon,
  MessageCircleIcon,
  SquarePenIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useConversations, useTheme } from '@/src/hooks';
import { LoadFailed } from '@/components/LoadFailed';
import { CardListSkeleton } from '@/components/Skeleton';
import { useTabBottomInset } from '@/components/TabScreen';
import { useChatRowMenu } from '@/components/chat/ChatRowMenu';
import { useChatToast } from '@/components/chat/ChatToast';
import { ConversationRow } from '@/components/chat/ConversationRow';
import type { Conversation } from '@/src/api';
import { PALETTES } from '@/theme';

for (const Icon of [ArchiveIcon, MessageCircleIcon, SquarePenIcon, SearchIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Conversations, direct and group.
 *
 * Pinned chats come first, from the server, with a rule under them; archived
 * ones wait behind the Archived row at the top. Holding a row lifts it with
 * its menu — there are no swipe actions, which would stop the list scrolling
 * on an iPhone.
 */
export default function ChatScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const bottomInset = useTabBottomInset();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');

  // Debounced: the search runs on the server and scans message bodies, so it
  // should not fire once per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const {
    conversations,
    refetch,
    isFetching,
    loadFailed,
    loadingFirst,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    archivedCount,
  } = useConversations(term);
  const searching = term.length > 0;

  const toast = useChatToast(bottomInset + 12);
  const pinnedCount = useMemo(() => conversations.filter((c) => c.pinned).length, [conversations]);
  const rowMenu = useChatRowMenu({ pinnedCount, onNotice: toast.show });
  const hold = rowMenu.hold;

  // The rule goes under the last pinned chat, when anything follows it. Not
  // in search results, which are not the list's order.
  const lastPinnedId = useMemo(() => {
    if (searching) return null;
    let last = -1;
    for (const [i, c] of conversations.entries()) if (c.pinned) last = i;
    return last >= 0 && last < conversations.length - 1 ? conversations[last].id : null;
  }, [conversations, searching]);

  const renderConversation = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationRow item={item} onHold={hold} dividerAfter={item.id === lastPinnedId} />
    ),
    [hold, lastPinnedId],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <SafeAreaView edges={embedded ? [] : ['top']} className="flex-1 bg-background">
      {!embedded && <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <View>
          <Text className="text-foreground text-[28px] font-bold tracking-tight">Chat</Text>
          <Text className="text-muted-foreground text-sm mt-1">
            {searching
              ? `${conversations.length} result${conversations.length === 1 ? '' : 's'}`
              : `${conversations.length}${hasNextPage ? '+' : ''} conversation${conversations.length === 1 && !hasNextPage ? '' : 's'}`}
          </Text>
        </View>
      </View>}

      {/* Search, and the way to start a chat.
          The button lives beside the search box rather than in the header
          above, because that header is only drawn when this screen is a route
          of its own. Embedded under Connect it is suppressed to avoid a second
          title — and it used to take the only + with it, which left somebody
          with one conversation no way at all to start another. The empty state
          has its own button, so the gap opened the moment a first chat
          existed. */}
      <View className="px-5 pt-4 pb-2 flex-row items-center gap-2">
        <View
          className="flex-1 flex-row items-center bg-muted rounded-[14px] px-3.5 h-11 gap-2.5"
        >
          <SearchIcon size={18} className="text-muted-foreground" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search names and messages"
            placeholderTextColor={palette.mutedForeground}
            className="text-foreground text-[15px] flex-1"
            returnKeyType="search"
            autoCorrect={false}
          />
          {/* Spinner only while a new term is in flight; the 15s background
              poll should not make the box look busy. */}
          {searching && isFetching ? (
            <ActivityIndicator size="small" color={palette.primary} />
          ) : search.length > 0 ? (
            <Pressable
              onPress={() => setSearch('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={12}
            >
              <XIcon size={15} className="text-muted-foreground" />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => router.push('/chat/new')}
          accessibilityRole="button"
          accessibilityLabel="Start a new chat"
          // A pen, and quiet: the + in the bar above makes things, and two
          // terracotta pluses a thumb apart read as the same button twice.
          className="w-11 h-11 rounded-[14px] bg-muted items-center justify-center active:scale-[0.96]"
        >
          <SquarePenIcon size={19} className="text-foreground" />
        </Pressable>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        // Archived chats wait here, and come back when someone writes.
        ListHeaderComponent={
          !searching && archivedCount > 0 ? (
            <Pressable
              onPress={() => router.push('/chat/archived')}
              accessibilityRole="button"
              accessibilityLabel={`Archived, ${archivedCount} chat${archivedCount === 1 ? '' : 's'}`}
              className="h-[52px] px-5 flex-row items-center gap-3 active:bg-muted/40"
            >
              <View className="w-12 items-center">
                <ArchiveIcon size={20} className="text-secondary-foreground" />
              </View>
              <Text className="flex-1 text-foreground text-[15px] font-semibold">Archived</Text>
              <Text className="text-muted-foreground text-[13px]">{archivedCount}</Text>
            </Pressable>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: bottomInset }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.primary}
          />
        }
        // Past the first hundred, a page at a time. They could only be found
        // by searching before.
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
        renderItem={renderConversation}
        ListEmptyComponent={
          // Nothing is said about an inbox that has not arrived yet. It
          // showed "No conversations" while the first page loaded.
          loadingFirst ? (
            <CardListSkeleton />
          ) : // An empty inbox and an unreachable server look identical otherwise.
          loadFailed ? (
            <View className="mt-20">
              <LoadFailed what="your chats" onRetry={() => refetch()} compact />
            </View>
          ) : searching ? (
            <View className="items-center px-10 mt-20">
              <Text className="text-foreground text-base font-bold">No matches</Text>
              <Text className="text-muted-foreground text-sm text-center mt-2">
                Nothing found for “{term}”. Search a name, a group, or something
                that was said.
              </Text>
            </View>
          ) : (
            <View className="items-center px-10 mt-24">
              <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-5">
                <MessageCircleIcon size={32} className="text-primary" />
              </View>
              <Text className="text-foreground text-lg font-bold">No conversations</Text>
              <Text className="text-muted-foreground text-sm text-center mt-2">
                Start a chat with a connection, or create a group for a shoot.
              </Text>
              <Pressable
                onPress={() => router.push('/chat/new')}
                accessibilityRole="button"
                className="mt-7 min-h-11 bg-action rounded-[14px] px-7 py-3 items-center justify-center active:scale-[0.98]"
              >
                <Text className="text-action-foreground text-sm font-bold">New chat</Text>
              </Pressable>
            </View>
          )
        }
      />
      {rowMenu.element}
      {toast.element}
    </SafeAreaView>
  );
}
