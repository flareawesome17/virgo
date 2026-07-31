import { View, Text, FlatList, RefreshControl, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAlbum, useAuth, useCollaborators, useTheme } from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { ArrowLeftIcon, UserPlusIcon, MessageCircleIcon, MailIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MessageCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MailIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const ROLE_COLORS: Record<string, string> = {
  photographer: '#B66A40', editor: '#C17745', reviewer: '#8B5E3C', client: '#5B7B9A', owner: '#6B8E4E',
};
const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', photographer: 'Photographer', editor: 'Editor', reviewer: 'Reviewer', client: 'Client',
};

export default function AlbumCollaboratorListScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const { data: album } = useAlbum(albumId);

  const { collaborators, refetch: refetchCollaborators } = useCollaborators(
    { orderBy: 'created_at', direction: 'desc', limit: 100 },
    { enabled: !!user?.id },
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchCollaborators();
    setRefreshing(false);
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <FlatList
        data={collaborators}
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
                <Text className="text-foreground text-[22px] font-bold tracking-tight">Collaborators</Text>
                <Text className="text-muted-foreground text-sm mt-0.5">{album?.name || 'Album'} · {collaborators.length} members</Text>
              </View>
            </View>
            <Pressable onPress={() => router.push(`/albums/${albumId}/invite`)}
              className="mx-5 mt-3 bg-primary/10 rounded-2xl p-4 flex-row items-center gap-3 active:scale-[0.98]">
              <View className="w-10 h-10 rounded-xl bg-primary items-center justify-center">
                <UserPlusIcon size={18} className="text-white" />
              </View>
              <View className="flex-1"><Text className="text-primary text-sm font-bold">Invite Friends</Text></View>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          <View className="pt-12 items-center gap-3">
            <Text className="text-muted-foreground text-sm">No collaborators yet</Text>
          </View>
        }
        renderItem={({ item }) => {
          const color = ROLE_COLORS[item.role] || '#B66A40';
          return (
            <Pressable className="mx-5 mb-1 bg-card rounded-2xl p-4 flex-row items-center gap-4 active:scale-[0.98]"
              style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <Image source={{ uri: item.avatar_url || PLACEHOLDER_IMAGE }}
                style={{ width: 44, height: 44, borderRadius: 22 }} />
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-sm font-bold" numberOfLines={1}>{item.name}</Text>
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: `${color}18`, alignSelf: 'flex-start', marginTop: 4 }}>
                  <Text style={{ color, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>{ROLE_LABELS[item.role] || item.role}</Text>
                </View>
              </View>
              <View className="flex-row gap-2">
                <Pressable className="w-8 h-8 rounded-full bg-muted items-center justify-center active:scale-[0.92]">
                  <MessageCircleIcon size={13} className="text-muted-foreground" />
                </Pressable>
                <Pressable className="w-8 h-8 rounded-full bg-muted items-center justify-center active:scale-[0.92]">
                  <MailIcon size={13} className="text-muted-foreground" />
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
