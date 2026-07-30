import { View, Text, FlatList, ScrollView, RefreshControl, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp, useAuth, useTheme } from '@/src/hooks';
import { useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  SearchIcon,
  PlusIcon,
  LayersIcon,
  ImageIcon,
  VideoIcon,
  MusicIcon,
  ArrowLeftIcon,
  FilterIcon,
  ClockIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(SearchIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LayersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(VideoIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MusicIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(FilterIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const STATUS_CHIPS = ['All', 'Draft', 'Review', 'Delivered'];

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: '#A8948920', text: '#8B7355', label: 'Draft' },
  review: { bg: '#C1774520', text: '#C17745', label: 'In Review' },
  delivered: { bg: '#6B8E4E20', text: '#4A6B3A', label: 'Delivered' },
};

const RETENTION_LABELS: Record<number, string> = {
  7: '7 days',
  30: '30 days',
};

function retentionLabel(days: number | null): string {
  if (days === null || days === undefined) return 'No expiration';
  return RETENTION_LABELS[days] || `${days} days`;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function AlbumsListScreen() {
  const { client } = useApp();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [activeStatus, setActiveStatus] = useState('All');

  const { workspaceId } = useLocalSearchParams<{ workspaceId?: string }>();

  const { data: albums = [] } = useQuery({
    queryKey: ['albums', user?.id, workspaceId],
    queryFn: async () => {
      let query = client
        .from('albums')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces', user?.id],
    queryFn: async () => {
      const { data, error } = await client
        .from('workspaces')
        .select('id, name, accent_color')
        .eq('user_id', user?.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const workspaceMap = useMemo(
    () => Object.fromEntries(workspaces.map((w) => [w.id, w])),
    [workspaces]
  );

  const filtered =
    activeStatus === 'All'
      ? albums
      : albums.filter((a) => a.status === activeStatus.toLowerCase());

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['albums'] });
    await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    setRefreshing(false);
  };

  const totalItems = filtered.reduce((s, a) => s + (a.item_count || 0), 0);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 20 }}
        contentContainerStyle={{ gap: 12, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? '#C17745' : '#B66A40'}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Header */}
            <View className="px-5 pt-4 pb-1 flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                {workspaceId && (
                  <Pressable
                    onPress={() => router.back()}
                    className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
                    style={{
                      shadowColor: '#000',
                      shadowOpacity: 0.04,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 2,
                    }}
                  >
                    <ArrowLeftIcon size={18} className="text-foreground" />
                  </Pressable>
                )}
                <View>
                  <Text className="text-foreground text-[28px] font-bold tracking-tight">
                    Albums
                  </Text>
                  <Text className="text-muted-foreground text-sm mt-1">
                    {filtered.length} albums · {totalItems} items
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() =>
                  router.push(
                    `/albums/create${workspaceId ? `?workspaceId=${workspaceId}` : ''}`
                  )
                }
                className="w-11 h-11 rounded-2xl bg-primary items-center justify-center active:scale-[0.94]"
                style={{
                  shadowColor: '#B66A40',
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: 4,
                }}
              >
                <PlusIcon size={20} className="text-white" />
              </Pressable>
            </View>

            {/* Status filter chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                gap: 8,
                paddingHorizontal: 20,
                paddingVertical: 12,
              }}
            >
              {STATUS_CHIPS.map((chip) => (
                <Pressable
                  key={chip}
                  onPress={() => setActiveStatus(chip)}
                  className={`rounded-full px-4 py-2 active:scale-[0.96] ${
                    chip === activeStatus ? 'bg-primary' : 'bg-card'
                  }`}
                  style={
                    chip !== activeStatus
                      ? {
                          shadowColor: '#000',
                          shadowOpacity: 0.03,
                          shadowRadius: 4,
                          shadowOffset: { width: 0, height: 1 },
                          elevation: 1,
                        }
                      : undefined
                  }
                >
                  <Text
                    className={`text-sm font-semibold ${
                      chip === activeStatus ? 'text-white' : 'text-foreground'
                    }`}
                  >
                    {chip}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <View className="px-5 pt-12 items-center gap-4">
            <View className="w-16 h-16 rounded-full bg-muted items-center justify-center">
              <LayersIcon size={28} className="text-muted-foreground" />
            </View>
            <View className="items-center gap-1">
              <Text className="text-foreground text-lg font-bold">No albums yet</Text>
              <Text className="text-muted-foreground text-sm text-center px-8">
                Create your first album to organize and deliver your creative work
              </Text>
            </View>
            <Pressable
              onPress={() =>
                router.push(
                  `/albums/create${workspaceId ? `?workspaceId=${workspaceId}` : ''}`
                )
              }
              className="bg-primary rounded-2xl px-6 py-3.5 flex-row items-center gap-2 active:scale-[0.96]"
            >
              <PlusIcon size={18} className="text-white" />
              <Text className="text-white text-sm font-semibold">Create Album</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => {
          const badge = STATUS_BADGES[item.status] || STATUS_BADGES.draft;
          const ws = workspaceMap[item.workspace_id];
          return (
            <Pressable
              onPress={() => router.push(`/albums/${item.id}`)}
              className="flex-1 bg-card rounded-2xl overflow-hidden active:scale-[0.97]"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.05,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 3 },
                elevation: 3,
                maxWidth: '48%',
              }}
            >
              {/* Cover */}
              <Image
                source={{
                  uri:
                    item.cover_url ||
                    `https://picsum.photos/seed/${item.id}/400/300`,
                }}
                style={{ width: '100%', aspectRatio: 4 / 3 }}
              />
              {/* Info */}
              <View className="p-3 gap-1">
                <Text className="text-foreground text-sm font-bold" numberOfLines={1}>
                  {item.name}
                </Text>
                {ws ? (
                  <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                    {ws.name}
                  </Text>
                ) : null}
                <View className="flex-row items-center justify-between mt-2">
                  <View
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 5,
                      backgroundColor: badge.bg,
                    }}
                  >
                    <Text
                      style={{
                        color: badge.text,
                        fontSize: 9,
                        fontWeight: '600',
                      }}
                    >
                      {badge.label}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <ClockIcon size={9} className="text-muted-foreground" />
                    <Text className="text-muted-foreground text-[10px]">
                      {timeAgo(item.updated_at)}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center gap-2 mt-1">
                  <View className="flex-row items-center gap-1">
                    <ImageIcon size={9} className="text-muted-foreground" />
                    <Text className="text-muted-foreground text-[10px] font-medium">
                      {item.item_count}
                    </Text>
                  </View>
                  <Text className="text-muted-foreground text-[10px]">
                    · {retentionLabel(item.retention_days)}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
