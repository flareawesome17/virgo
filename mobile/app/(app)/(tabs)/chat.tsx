import { View, Text, FlatList, RefreshControl, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  MessageCircleIcon,
  UsersIcon,
  PlusIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useConversations, useTheme } from '@/src/hooks';

cssInterop(MessageCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

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
  const { conversations, refetch } = useConversations();

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
            {conversations.length} conversation{conversations.length === 1 ? '' : 's'}
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

      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingBottom: 120 }}
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
                <UsersIcon size={20} style={{ color: '#5B7B9A' }} />
              </View>
            ) : item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} />
            ) : (
              <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: '#B66A4018' }}>
                <Text style={{ color: '#B66A40', fontWeight: '700', fontSize: 17 }}>
                  {item.title.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}

            <View className="flex-1 min-w-0">
              <View className="flex-row items-center gap-2">
                <Text
                  className={`text-foreground text-sm flex-1 ${item.unread > 0 ? 'font-bold' : 'font-semibold'}`}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <Text className="text-muted-foreground text-[11px]">
                  {whenLabel(item.lastAt)}
                </Text>
              </View>
              <View className="flex-row items-center gap-2 mt-0.5">
                <Text
                  className={`text-xs flex-1 ${item.unread > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
                  numberOfLines={1}
                >
                  {item.lastMessage
                    ? // Naming the sender only matters in a group; in a direct
                      // chat the other name is already the title.
                      item.isGroup && item.lastSender
                      ? `${item.lastSender}: ${item.lastMessage}`
                      : item.lastMessage
                    : 'No messages yet'}
                </Text>
                {item.unread > 0 && (
                  <View className="rounded-full bg-primary px-2 py-0.5 min-w-[20px] items-center">
                    <Text className="text-white text-[10px] font-bold">{item.unread}</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
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
        }
      />
    </SafeAreaView>
  );
}
