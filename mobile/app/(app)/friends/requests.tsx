import { View, Text, FlatList, RefreshControl, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp, useAuth, useTheme } from '@/src/hooks';
import { useState } from 'react';
import { router } from 'expo-router';
import { ArrowLeftIcon, CheckIcon, XIcon, ClockIcon, UserPlusIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(XIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

export default function FriendRequestsScreen() {
  const { client } = useApp();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: friends = [] } = useQuery({
    queryKey: ['friends', user?.id],
    queryFn: async () => {
      const { data, error } = await client.from('friends').select('*').eq('user_id', user?.id).eq('status', 'pending').order('created_at', { ascending: false });
      if (error) throw error; return data ?? [];
    },
    enabled: !!user?.id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['friends'] });
    setRefreshing(false);
  };

  const acceptRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.from('friends').update({ status: 'accepted' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends'] }),
  });

  const declineRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.from('friends').update({ status: 'declined' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends'] }),
  });

  const received = friends.filter(f => f.requested_by === 'them');
  const sent = friends.filter(f => f.requested_by === 'me');

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <FlatList
        data={[...received, ...sent]}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#C17745' : '#B66A40'} />}
        ListHeaderComponent={
          <View>
            <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
              <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
                style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                <ArrowLeftIcon size={18} className="text-foreground" />
              </Pressable>
              <View>
                <Text className="text-foreground text-[22px] font-bold tracking-tight">Friend Requests</Text>
                <Text className="text-muted-foreground text-sm mt-0.5">{received.length} received · {sent.length} sent</Text>
              </View>
            </View>

            {received.length > 0 && (
              <View className="px-5 mb-4">
                <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">Received ({received.length})</Text>
                {received.map((f, i) => (
                  <View key={f.id} className="bg-card rounded-2xl p-4 flex-row items-center gap-4 mb-2"
                    style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                    <Image source={{ uri: f.friend_avatar_url || `https://picsum.photos/seed/${f.id}/80/80` }}
                      style={{ width: 46, height: 46, borderRadius: 23 }} />
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-bold">{f.friend_name}</Text>
                      {f.friend_email ? <Text className="text-muted-foreground text-xs mt-0.5">{f.friend_email}</Text> : null}
                    </View>
                    <Pressable onPress={() => acceptRequest.mutate(f.id)} className="w-10 h-10 rounded-full bg-[#6B8E4E18] items-center justify-center active:scale-[0.92]">
                      <CheckIcon size={18} style={{ color: '#6B8E4E' }} />
                    </Pressable>
                    <Pressable onPress={() => declineRequest.mutate(f.id)} className="w-10 h-10 rounded-full bg-muted items-center justify-center active:scale-[0.92]">
                      <XIcon size={16} className="text-muted-foreground" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {sent.length > 0 && (
              <View className="px-5">
                <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">Sent ({sent.length})</Text>
                {sent.map((f, i) => (
                  <View key={f.id} className="bg-card rounded-2xl p-4 flex-row items-center gap-4 mb-2"
                    style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                    <Image source={{ uri: f.friend_avatar_url || `https://picsum.photos/seed/${f.id}/80/80` }}
                      style={{ width: 46, height: 46, borderRadius: 23 }} />
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-bold">{f.friend_name}</Text>
                      {f.friend_email ? <Text className="text-muted-foreground text-xs mt-0.5">{f.friend_email}</Text> : null}
                    </View>
                    <View className="bg-[#C1774520] rounded-lg px-3 py-1.5 flex-row items-center gap-1.5">
                      <ClockIcon size={10} style={{ color: '#C17745' }} />
                      <Text className="text-[#C17745] text-[11px] font-semibold">Pending</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {friends.length === 0 && (
              <View className="px-5 pt-10 items-center gap-4">
                <View className="w-16 h-16 rounded-full bg-muted items-center justify-center"><UserPlusIcon size={28} className="text-muted-foreground" /></View>
                <View className="items-center gap-1">
                  <Text className="text-foreground text-lg font-bold">No pending requests</Text>
                  <Text className="text-muted-foreground text-sm text-center px-8">Send friend requests to collaborate with other creatives</Text>
                </View>
                <Pressable onPress={() => router.push('/friends/send-request')} className="bg-primary rounded-2xl px-6 py-3.5 flex-row items-center gap-2 active:scale-[0.96]">
                  <UserPlusIcon size={18} className="text-white" /><Text className="text-white text-sm font-semibold">Add Friend</Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        renderItem={() => null}
      />
    </SafeAreaView>
  );
}
