import { View, Text, FlatList, RefreshControl, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useFriends, useTheme } from '@/src/hooks';
import { useState, useMemo } from 'react';
import { router } from 'expo-router';
import {
  ArrowLeftIcon, UserPlusIcon, SearchIcon, UsersIcon, UserCheckIcon,
  ClockIcon, MessageCircleIcon, MailIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import { LoadFailed } from '@/components/LoadFailed';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SearchIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserCheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MessageCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MailIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

export default function FriendsScreen() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const { friends, refetch, loadFailed } = useFriends(
    { orderBy: 'friend_name', direction: 'asc', limit: 100 },
    { enabled: !!user?.id },
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const confirmed = friends.filter(f => f.status === 'accepted');
  const pending = friends.filter(f => f.status === 'pending');

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <FlatList
        data={confirmed}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#C17745' : '#B66A40'} />}
        ListHeaderComponent={
          <View>
            <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
                  style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                  <ArrowLeftIcon size={18} className="text-foreground" />
                </Pressable>
                <View>
                  <Text className="text-foreground text-[28px] font-bold tracking-tight">Friends</Text>
                  <Text className="text-muted-foreground text-sm mt-1">{confirmed.length} confirmed · {pending.length} pending</Text>
                </View>
              </View>
              <Pressable onPress={() => router.push('/(app)/(tabs)/connect?view=people')}
                className="w-11 h-11 rounded-2xl bg-action items-center justify-center active:scale-[0.94]"
                style={{ shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
                <UserPlusIcon size={20} className="text-white" />
              </Pressable>
            </View>

            {/* Search */}
            <View className="px-5 pt-2 pb-3">
              <View className="flex-row items-center bg-card rounded-2xl px-4 h-11 gap-3"
                style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                <SearchIcon size={16} className="text-muted-foreground" />
                <Text className="text-muted-foreground text-sm flex-1">Search friends</Text>
              </View>
            </View>

            {/* Pending requests banner */}
            {pending.length > 0 && (
              <Pressable onPress={() => router.push('/friends/requests')}
                className="mx-5 mb-4 bg-card rounded-2xl p-4 flex-row items-center gap-4 active:scale-[0.98]"
                style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                <View className="w-11 h-11 rounded-xl bg-[#C1774520] items-center justify-center">
                  <ClockIcon size={20} color="#C17745" />
                </View>
                <View className="flex-1">
                  <Text className="text-foreground text-sm font-bold">{pending.length} Pending Request{pending.length > 1 ? 's' : ''}</Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">{pending.filter(p => p.requested_by === 'them').length} received · {pending.filter(p => p.requested_by === 'me').length} sent</Text>
                </View>
                <View className="bg-[#C1774520] rounded-full w-7 h-7 items-center justify-center">
                  <Text className="text-[#C17745] text-xs font-bold">{pending.length}</Text>
                </View>
              </Pressable>
            )}

            {/* Section */}
            <View className="px-5 mb-3 flex-row items-center justify-between">
              <Text className="text-foreground text-base font-bold tracking-tight">
                Confirmed Friends ({confirmed.length})
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          loadFailed && confirmed.length === 0 ? (
            <View className="pt-8">
              <LoadFailed what="your friends" onRetry={() => refetch()} compact />
            </View>
          ) : confirmed.length === 0 ? (
            <View className="px-5 pt-8 items-center gap-4">
              <View className="w-16 h-16 rounded-full bg-muted items-center justify-center"><UsersIcon size={28} className="text-muted-foreground" /></View>
              <View className="items-center gap-1">
                <Text className="text-foreground text-lg font-bold">No friends yet</Text>
                <Text className="text-muted-foreground text-sm text-center px-8">Add creative collaborators to your network to invite them to albums and workspaces</Text>
              </View>
              <Pressable onPress={() => router.push('/(app)/(tabs)/connect?view=people')} className="bg-action rounded-2xl px-6 py-3.5 flex-row items-center gap-2 active:scale-[0.96]">
                <UserPlusIcon size={18} className="text-white" /><Text className="text-white text-sm font-semibold">Add Friend</Text>
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View className="mx-5 mb-2 bg-card rounded-2xl p-4 flex-row items-center gap-4"
            style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <Image source={{ uri: item.friend_avatar_url || PLACEHOLDER_IMAGE }}
              style={{ width: 46, height: 46, borderRadius: 23 }} />
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-sm font-bold" numberOfLines={1}>{item.friend_name}</Text>
              {item.friend_email ? <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>{item.friend_email}</Text> : null}
              <View className="flex-row items-center gap-1.5 mt-1.5">
                <View className="bg-[#6B8E4E18] rounded px-1.5 py-0.5"><Text className="text-[#6B8E4E] text-[9px] font-bold">CONFIRMED</Text></View>
              </View>
            </View>
            <View className="flex-row gap-2">
              <Pressable className="w-9 h-9 rounded-full bg-muted items-center justify-center active:scale-[0.92]">
                <MessageCircleIcon size={14} className="text-muted-foreground" />
              </Pressable>
              <Pressable className="w-9 h-9 rounded-full bg-muted items-center justify-center active:scale-[0.92]">
                <MailIcon size={14} className="text-muted-foreground" />
              </Pressable>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
