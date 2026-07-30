import { View, Text, ScrollView, RefreshControl, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp, useAuth, useTheme } from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useMemo } from 'react';
import {
  ArrowLeftIcon, UserPlusIcon, UsersIcon, SearchIcon, ChevronRightIcon,
  UserCheckIcon, ClockIcon, LayersIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SearchIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserCheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LayersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

export default function AlbumInviteScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const { client } = useApp();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: album } = useQuery({
    queryKey: ['album', albumId],
    queryFn: async () => {
      const { data, error } = await client.from('albums').select('id, name, item_count, cover_url').eq('id', albumId).single();
      if (error) throw error; return data;
    },
    enabled: !!albumId,
  });

  const { data: friends = [] } = useQuery({
    queryKey: ['friends', user?.id],
    queryFn: async () => {
      const { data, error } = await client.from('friends').select('*').eq('user_id', user?.id).order('created_at', { ascending: false });
      if (error) throw error; return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: collaborators = [] } = useQuery({
    queryKey: ['collaborators', user?.id],
    queryFn: async () => {
      const { data, error } = await client.from('collaborators').select('*').eq('user_id', user?.id);
      if (error) throw error; return data ?? [];
    },
    enabled: !!user?.id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['friends'] });
    await queryClient.invalidateQueries({ queryKey: ['collaborators'] });
    setRefreshing(false);
  };

  const confirmedFriends = friends.filter(f => f.status === 'accepted');
  const pendingCount = friends.filter(f => f.status === 'pending').length;

  // Friends already in ANY collaborators (avoid re-inviting)
  const existingCollabNames = new Set(collaborators.map(c => c.name.toLowerCase()));
  const availableFriends = confirmedFriends.filter(f => !existingCollabNames.has(f.friend_name.toLowerCase()));

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#C17745' : '#B66A40'} />}>
        
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View>
            <Text className="text-foreground text-[22px] font-bold tracking-tight">Invite Friends</Text>
            <Text className="text-muted-foreground text-sm mt-0.5">{album?.name || 'Album'}</Text>
          </View>
        </View>

        {/* Album info card */}
        {album && (
          <View className="mx-5 mt-3 bg-card rounded-2xl p-4 flex-row items-center gap-4" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
            <Image source={{ uri: album.cover_url || `https://picsum.photos/seed/${album.id}/120/120` }}
              style={{ width: 52, height: 52, borderRadius: 14 }} />
            <View className="flex-1">
              <Text className="text-foreground text-base font-bold">{album.name}</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">{album.item_count} items</Text>
            </View>
            <ChevronRightIcon size={15} className="text-muted-foreground" />
          </View>
        )}

        {/* Friends summary bar */}
        <View className="mx-5 mt-5 flex-row gap-3">
          <Pressable onPress={() => router.push('/friends')}
            className="flex-1 bg-card rounded-2xl p-4 flex-row items-center gap-3 active:scale-[0.98]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center">
              <UserCheckIcon size={20} className="text-primary" />
            </View>
            <View>
              <Text className="text-foreground text-lg font-bold">{confirmedFriends.length}</Text>
              <Text className="text-muted-foreground text-xs">Confirmed</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => router.push('/friends/requests')}
            className="flex-1 bg-card rounded-2xl p-4 flex-row items-center gap-3 active:scale-[0.98]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <View className="w-11 h-11 rounded-xl bg-[#C1774520] items-center justify-center">
              <ClockIcon size={20} className="text-[#C17745]" />
            </View>
            <View>
              <Text className="text-foreground text-lg font-bold">{pendingCount}</Text>
              <Text className="text-muted-foreground text-xs">Pending</Text>
            </View>
          </Pressable>
        </View>

        {/* Available friends to invite */}
        <View className="px-5 mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground text-base font-bold tracking-tight">
              Available Friends ({availableFriends.length})
            </Text>
            {availableFriends.length > 0 && (
              <Pressable onPress={() => router.push(`/albums/${albumId}/invite/select`)}
                className="flex-row items-center gap-1 active:opacity-60">
                <Text className="text-primary text-sm font-semibold">Select</Text>
                <ChevronRightIcon size={14} className="text-primary" />
              </Pressable>
            )}
          </View>

          {availableFriends.length === 0 ? (
            <View className="bg-card rounded-2xl p-8 items-center gap-4" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <View className="w-16 h-16 rounded-full bg-muted items-center justify-center">
                <UsersIcon size={28} className="text-muted-foreground" />
              </View>
              <View className="items-center gap-1">
                <Text className="text-foreground text-lg font-bold">No friends available</Text>
                <Text className="text-muted-foreground text-sm text-center px-6">
                  You need confirmed friends in your network before inviting them to albums
                </Text>
              </View>
              <Pressable onPress={() => router.push('/friends/send-request')}
                className="bg-primary rounded-2xl px-6 py-3.5 flex-row items-center gap-2 active:scale-[0.96]">
                <UserPlusIcon size={18} className="text-white" />
                <Text className="text-white text-sm font-semibold">Add Friends First</Text>
              </Pressable>
            </View>
          ) : (
            <View className="bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              {availableFriends.slice(0, 5).map((f, i) => (
                <Pressable key={f.id}
                  onPress={() => router.push(`/albums/${albumId}/invite/select`)}
                  className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted/30"
                  style={i < Math.min(availableFriends.length, 5) - 1 ? { borderBottomWidth: 1, borderBottomColor: '#F0E8E2' } : undefined}>
                  <Image source={{ uri: f.friend_avatar_url || `https://picsum.photos/seed/${f.id}/80/80` }}
                    style={{ width: 40, height: 40, borderRadius: 20 }} />
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>{f.friend_name}</Text>
                    {f.friend_email ? <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>{f.friend_email}</Text> : null}
                  </View>
                  <View className="bg-primary/10 rounded-lg px-3 py-1.5">
                    <Text className="text-primary text-[11px] font-bold">Invite</Text>
                  </View>
                </Pressable>
              ))}
              {availableFriends.length > 5 && (
                <Pressable onPress={() => router.push(`/albums/${albumId}/invite/select`)}
                  className="px-4 py-3 items-center active:bg-muted/30">
                  <Text className="text-primary text-sm font-semibold">+{availableFriends.length - 5} more friends</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* Existing collaborators */}
        {collaborators.length > 0 && (
          <View className="px-5 mt-6">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-foreground text-base font-bold tracking-tight">
                Album Collaborators ({collaborators.length})
              </Text>
              <Pressable onPress={() => router.push(`/albums/${albumId}/invite/list`)}
                className="flex-row items-center gap-1 active:opacity-60">
                <Text className="text-primary text-sm font-semibold">View all</Text>
                <ChevronRightIcon size={14} className="text-primary" />
              </Pressable>
            </View>
            <View className="flex-row -space-x-2">
              {collaborators.slice(0, 5).map((c, i) => (
                <Image key={c.id} source={{ uri: c.avatar_url || `https://picsum.photos/seed/${c.id}/60/60` }}
                  style={{ width: 36, height: 36, borderRadius: 18, marginLeft: i > 0 ? -10 : 0, borderWidth: 2, borderColor: '#FFF8F4' }} />
              ))}
              {collaborators.length > 5 && (
                <View style={{ width: 36, height: 36, borderRadius: 18, marginLeft: -10, backgroundColor: '#FAF2EC', borderWidth: 2, borderColor: '#FFF8F4', alignItems: 'center', justifyContent: 'center' }}>
                  <Text className="text-muted-foreground text-[10px] font-bold">+{collaborators.length - 5}</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
