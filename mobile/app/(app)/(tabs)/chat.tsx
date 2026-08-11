import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  Image,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  MessageCircleIcon,
  UsersIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
  CheckCheckIcon,
  BellOffIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useConversations, useTheme } from '@/src/hooks';
import { LoadFailed } from '@/components/LoadFailed';
import { PresenceDot } from '@/components';
import { typingLabel, useTypingIn } from '@/src/lib/presence-store';
import type { Conversation } from '@/src/api';

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
      <Text className="text-primary text-xs font-medium flex-1" numberOfLines={1}>
        {conversation.isGroup ? typingLabel(names) : 'typing…'}
      </Text>
    );
  }

  return (
    <Text
      className={`text-xs flex-1 ${
        conversation.unread > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'
      }`}
      numberOfLines={1}
    >
      {conversation.lastMessage
        ? // Naming the sender only matters in a group; in a direct chat the
          // other name is already the title.
          conversation.isGroup && conversation.lastSender
          ? `${conversation.lastSender}: ${conversation.lastMessage}`
          : conversation.lastMessage
        : 'No messages yet'}
    </Text>
  );
}

cssInterop(MessageCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SearchIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(XIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckCheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(BellOffIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** "now" / "14:05" / "Mon" / "3 Aug" — how recent decides the format. */
function whenLabel(iso: string | null): string {
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

/**
 * Conversations, direct and group.
 *
 * Polled rather than pushed: there is no websocket, so the list refreshes on an
 * interval and on pull. A new message still arrives immediately as a push
 * notification.
 */
export default function ChatScreen() {
  const { isDark } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');

  // Debounced: the search runs on the server and scans message bodies, so it
  // should not fire once per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const { conversations, refetch, isFetching, loadFailed } = useConversations(term);
  const searching = term.length > 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <View>
          <Text className="text-foreground text-[28px] font-bold tracking-tight">Chat</Text>
          <Text className="text-muted-foreground text-sm mt-1">
            {searching
              ? `${conversations.length} result${conversations.length === 1 ? '' : 's'}`
              : `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/chat/new')}
          className="w-11 h-11 rounded-2xl bg-primary items-center justify-center active:scale-[0.94]"
          style={{ shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}
        >
          <PlusIcon size={20} className="text-white" />
        </Pressable>
      </View>

      {/* Search */}
      <View className="px-5 pt-3 pb-2">
        <View
          className="flex-row items-center bg-card rounded-2xl px-4 h-11 gap-3"
          style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
        >
          <SearchIcon size={16} className="text-muted-foreground" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search names and messages"
            placeholderTextColor="#A89489"
            className="text-foreground text-sm flex-1"
            returnKeyType="search"
            autoCorrect={false}
          />
          {/* Spinner only while a new term is in flight; the 15s background
              poll should not make the box look busy. */}
          {searching && isFetching ? (
            <ActivityIndicator size="small" color="#B66A40" />
          ) : search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <XIcon size={15} className="text-muted-foreground" />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? '#C17745' : '#B66A40'}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/chat/${item.id}`)}
            className="px-5 py-3 flex-row items-center gap-3 active:bg-muted/30"
          >
            {item.isGroup ? (
              <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: '#5B7B9A18' }}>
                <UsersIcon size={20} color="#5B7B9A" />
              </View>
            ) : (
              // Wrapped so the presence dot has something to anchor to.
              <View style={{ position: 'relative' }}>
                {item.avatarUrl ? (
                  <Image
                    source={{ uri: item.avatarUrl }}
                    style={{ width: 48, height: 48, borderRadius: 24 }}
                  />
                ) : (
                  <View
                    className="w-12 h-12 rounded-full items-center justify-center"
                    style={{ backgroundColor: '#B66A4018' }}
                  >
                    <Text style={{ color: '#B66A40', fontWeight: '700', fontSize: 17 }}>
                      {item.title.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <PresenceDot userId={item.otherUserId} />
              </View>
            )}

            <View className="flex-1 min-w-0">
              <View className="flex-row items-center gap-2">
                <Text
                  className={`text-foreground text-sm ${item.unread > 0 ? 'font-bold' : 'font-semibold'}`}
                  numberOfLines={1}
                  style={{ flexShrink: 1 }}
                >
                  {item.title}
                </Text>
                {item.muted && <BellOffIcon size={11} className="text-muted-foreground" />}
                <View className="flex-1" />
                <Text className="text-muted-foreground text-[11px]">
                  {whenLabel(item.lastAt)}
                </Text>
              </View>
              <View className="flex-row items-center gap-2 mt-0.5">
                {/* One or the other, never both: two lines would make every
                    row taller the moment somebody touched a key. */}
                <TypingOrPreview conversation={item} />
                {item.unread > 0 ? (
                  <View className="rounded-full bg-primary px-2 py-0.5 min-w-[20px] items-center">
                    <Text className="text-white text-[10px] font-bold">{item.unread}</Text>
                  </View>
                ) : item.lastMessage ? (
                  // Nothing unread. The double tick says "caught up" without
                  // an empty gap where the badge sits on other rows.
                  <CheckCheckIcon size={14} className="text-muted-foreground" />
                ) : null}
              </View>

              {/* Why this row is a search result, when the hit was buried in
                  the thread rather than in its name. */}
              {item.matchSnippet && (
                <View className="flex-row items-center gap-1.5 mt-1">
                  <SearchIcon size={10} className="text-primary" />
                  <Text className="text-primary text-[11px] flex-1" numberOfLines={1}>
                    {item.matchSnippet}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          // An empty inbox and an unreachable server look identical otherwise.
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
                Start a chat with a friend, or create a group for a shoot.
              </Text>
              <Pressable
                onPress={() => router.push('/chat/new')}
                className="mt-7 bg-primary rounded-2xl px-7 py-3 active:scale-[0.96]"
              >
                <Text className="text-white text-sm font-bold">New chat</Text>
              </Pressable>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}
