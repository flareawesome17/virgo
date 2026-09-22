import { View, Text, FlatList, RefreshControl, Pressable } from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useFriends, useRespondToFriendRequest, useTheme } from '@/src/hooks';
import { useState } from 'react';
import { router } from 'expo-router';
import { ArrowLeftIcon, CheckIcon, XIcon, ClockIcon, UserPlusIcon, EllipsisIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import { PersonSafetySheet } from '@/components/PersonSafetySheet';
import type { Friend } from '@/src/api';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(XIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EllipsisIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

export default function FriendRequestsScreen() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  /** The received request whose More menu is open. */
  const [safetyFor, setSafetyFor] = useState<Friend | null>(null);

  // Filtering by status is a query parameter now rather than a chained .eq().
  const { friends, refetch } = useFriends(
    { status: 'pending', orderBy: 'created_at', direction: 'desc', limit: 100 },
    { enabled: !!user?.id },
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // POST /accept and /decline, not a PATCH of the status field.
  //
  // The PATCH this used to send updated only *this* user's row, leaving the
  // sender's copy pending — so the person who asked still could not message
  // the person who had just accepted them. respond() writes both sides in one
  // transaction and refuses a request you sent yourself.
  const respond = useRespondToFriendRequest();

  // On success, show the existing confirmation screen. It was already built
  // but nothing navigated to it, so it was unreachable.
  const acceptRequest = (id: string, name: string, avatar: string | null) =>
    respond.mutate(
      { id, accept: true },
      {
        onSuccess: () =>
          router.push(
            `/friends/accepted?name=${encodeURIComponent(name)}` +
              (avatar ? `&avatar=${encodeURIComponent(avatar)}` : ''),
          ),
      },
    );
  const declineRequest = (id: string) =>
    respond.mutate({ id, accept: false });

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
                <Text className="text-foreground text-[22px] font-bold tracking-tight">Connection requests</Text>
                <Text className="text-muted-foreground text-sm mt-0.5">{received.length} received · {sent.length} sent</Text>
              </View>
            </View>

            {received.length > 0 && (
              <View className="px-5 mb-4">
                <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">Received ({received.length})</Text>
                {received.map((f, i) => (
                  <View key={f.id} className="bg-card rounded-2xl p-4 flex-row items-center gap-4 mb-2"
                    style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                    <RemoteImage source={{ uri: f.friend_avatar_url || PLACEHOLDER_IMAGE }}
                      style={{ width: 46, height: 46, borderRadius: 23 }} />
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-bold">{f.friend_name}</Text>
                      {f.friend_email ? <Text className="text-muted-foreground text-xs mt-0.5">{f.friend_email}</Text> : null}
                    </View>
                    <Pressable onPress={() => acceptRequest(f.id, f.friend_name, f.friend_avatar_url)} className="w-10 h-10 rounded-full bg-[#6B8E4E18] items-center justify-center active:scale-[0.92]">
                      <CheckIcon size={18} color="#6B8E4E" />
                    </Pressable>
                    <Pressable onPress={() => declineRequest(f.id)} className="w-10 h-10 rounded-full bg-muted items-center justify-center active:scale-[0.92]">
                      <XIcon size={16} className="text-muted-foreground" />
                    </Pressable>
                    {/* Declining stops them asking again but tells nobody, and
                        a stranger's request may be the only trace of them
                        you have: no profile if theirs is unpublished, no chat
                        until you accept. Negative margins keep the full 44pt
                        target without taking its width from the name. */}
                    {f.friend_user_id ? (
                      <Pressable
                        onPress={() => setSafetyFor(f)}
                        accessibilityRole="button"
                        accessibilityLabel={`More options for ${f.friend_name}`}
                        accessibilityHint="Opens report and block options"
                        className="w-11 h-11 -mx-2 items-center justify-center active:opacity-60"
                      >
                        <EllipsisIcon size={16} className="text-muted-foreground" />
                      </Pressable>
                    ) : null}
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
                    <RemoteImage source={{ uri: f.friend_avatar_url || PLACEHOLDER_IMAGE }}
                      style={{ width: 46, height: 46, borderRadius: 23 }} />
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-bold">{f.friend_name}</Text>
                      {f.friend_email ? <Text className="text-muted-foreground text-xs mt-0.5">{f.friend_email}</Text> : null}
                    </View>
                    <View className="bg-[#C1774520] rounded-lg px-3 py-1.5 flex-row items-center gap-1.5">
                      <ClockIcon size={10} color="#C17745" />
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
                  <Text className="text-muted-foreground text-sm text-center px-8">Send connection requests to work with other creatives</Text>
                </View>
                <Pressable onPress={() => router.push('/(app)/(tabs)/connect?view=people')} className="bg-action rounded-2xl px-6 py-3.5 flex-row items-center gap-2 active:scale-[0.96]">
                  <UserPlusIcon size={18} className="text-white" /><Text className="text-white text-sm font-semibold">Find people</Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        renderItem={() => null}
      />

      {/* By account id; a legacy free-text request has none and gets no
          button. A block deletes the request, and the refreshed list drops it. */}
      <PersonSafetySheet
        visible={!!safetyFor}
        onClose={() => setSafetyFor(null)}
        name={safetyFor?.friend_name ?? ''}
        target={safetyFor?.friend_user_id ? { userId: safetyFor.friend_user_id } : null}
        source="requests"
      />
    </SafeAreaView>
  );
}
