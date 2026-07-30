import { View, Text, ScrollView, RefreshControl, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp, useAuth, useTheme } from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon,
  ImageIcon,
  VideoIcon,
  MusicIcon,
  ShieldIcon,
  LayersIcon,
  UploadIcon,
  ShareIcon,
  MoreHorizontalIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(VideoIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MusicIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShieldIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LayersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UploadIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShareIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MoreHorizontalIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const TABS = ['Photos', 'Videos', 'Audio'];

const TAB_ICONS = [ImageIcon, VideoIcon, MusicIcon];

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: '#A8948920', text: '#8B7355', label: 'Draft' },
  review: { bg: '#C1774520', text: '#C17745', label: 'In Review' },
  delivered: { bg: '#6B8E4E20', text: '#4A6B3A', label: 'Delivered' },
};

function retentionLabel(days: number | null): string {
  if (days === null || days === undefined) return 'No expiration';
  if (days === 7) return 'Expires in 7 days';
  if (days === 30) return 'Expires in 30 days';
  return `Expires in ${days} days`;
}

function retentionUrgency(days: number | null): { color: string; bg: string } {
  if (!days) return { color: '#6B8E4E', bg: '#6B8E4E18' };
  if (days <= 7) return { color: '#C76B4A', bg: '#C76B4A18' };
  return { color: '#C17745', bg: '#C1774518' };
}

// Placeholder media items per tab
const PLACEHOLDER_PHOTOS = Array.from({ length: 12 }, (_, i) => ({
  id: `photo-${i}`,
  uri: `https://picsum.photos/seed/album-photo-${i}/400/400`,
}));

export default function AlbumDetailScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const { client } = useApp();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);


  const { data: album } = useQuery({
    queryKey: ['album', albumId],
    queryFn: async () => {
      const { data, error } = await client
        .from('albums')
        .select('*')
        .eq('id', albumId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!albumId,
  });

  const { data: workspace } = useQuery({
    queryKey: ['workspace', album?.workspace_id],
    queryFn: async () => {
      const { data, error } = await client
        .from('workspaces')
        .select('id, name, accent_color')
        .eq('id', album!.workspace_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!album?.workspace_id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['album', albumId] });
    setRefreshing(false);
  };

  if (!album) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted-foreground text-sm">Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const badge = STATUS_BADGES[album.status] || STATUS_BADGES.draft;
  const retention = retentionUrgency(album.retention_days);
  const wsAccent = workspace?.accent_color || '#B66A40';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? '#C17745' : '#B66A40'}
          />
        }
      >
        {/* ── Hero Cover ── */}
        <View className="relative">
          <Image
            source={{
              uri:
                album.cover_url ||
                `https://picsum.photos/seed/${album.id}/800/450`,
            }}
            style={{ width: '100%', height: 220 }}
          />
          {/* Back + More */}
          <View className="absolute top-4 left-5 right-5 flex-row items-center justify-between">
            <Pressable
              onPress={() => router.back()}
              className="w-10 h-10 rounded-2xl bg-black/30 items-center justify-center active:scale-[0.94]"
            >
              <ArrowLeftIcon size={18} className="text-white" />
            </Pressable>
            <Pressable className="w-10 h-10 rounded-2xl bg-black/30 items-center justify-center active:scale-[0.94]">
              <MoreHorizontalIcon size={18} className="text-white" />
            </Pressable>
          </View>
        </View>

        {/* ── Info card ── */}
        <View className="mx-5 -mt-6 bg-card rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 min-w-0 mr-3">
              <Text className="text-foreground text-xl font-bold">{album.name}</Text>
              {album.description ? (
                <Text className="text-muted-foreground text-sm mt-1" numberOfLines={2}>
                  {album.description}
                </Text>
              ) : null}
              {workspace ? (
                <Text className="text-muted-foreground text-xs mt-2">
                  {workspace.name}
                </Text>
              ) : null}
            </View>
            <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: badge.bg }}>
              <Text style={{ color: badge.text, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {badge.label}
              </Text>
            </View>
          </View>

          {/* Stats + Retention */}
          <View className="flex-row items-center gap-4 mt-4">
            <View className="flex-row items-center gap-1.5">
              <LayersIcon size={12} style={{ color: wsAccent }} />
              <Text className="text-foreground text-sm font-bold">{album.item_count}</Text>
              <Text className="text-muted-foreground text-xs">items</Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 8,
                backgroundColor: retention.bg,
              }}
            >
              <ShieldIcon size={11} style={{ color: retention.color }} />
              <Text style={{ color: retention.color, fontSize: 10, fontWeight: '600' }}>
                {retentionLabel(album.retention_days)}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View className="flex-row items-center gap-3 mt-4 pt-4 border-t border-border">
            <Pressable
              onPress={() => router.push('/albums/upload')}
              className="flex-1 bg-primary rounded-xl py-2.5 flex-row items-center justify-center gap-2 active:scale-[0.96]"
            >
              <UploadIcon size={15} className="text-white" />
              <Text className="text-white text-sm font-bold">Upload</Text>
            </Pressable>
            <Pressable className="w-10 h-10 rounded-xl bg-muted items-center justify-center active:scale-[0.92]">
              <ShareIcon size={16} className="text-muted-foreground" />
            </Pressable>
          </View>
        </View>

        {/* ── Tabs ── */}
        <View className="px-5 mt-6">
          <View className="flex-row bg-muted rounded-2xl p-1">
            {TABS.map((tab, i) => {
              const Icon = TAB_ICONS[i];
              const tabRoutes: Record<string, string> = {
                Photos: `/albums/${albumId}/gallery`,
                Videos: `/albums/${albumId}/videos`,
                Audio: `/albums/${albumId}/audio`,
              };
              return (
                <Pressable
                  key={tab}
                  onPress={() => router.push(tabRoutes[tab])}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl active:scale-[0.96]"
                >
                  <Icon size={14} className="text-primary" />
                  <Text className="text-foreground text-sm font-semibold">
                    {tab}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Quick Preview ── */}
        <View className="px-5 mt-4">
          <Pressable
            onPress={() => router.push(`/albums/${albumId}/gallery`)}
            className="bg-card rounded-2xl overflow-hidden active:scale-[0.98]"
            style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}
          >
            <View className="flex-row">
              {PLACEHOLDER_PHOTOS.slice(0, 4).map((photo, i) => (
                <Image
                  key={photo.id}
                  source={{ uri: photo.uri }}
                  style={{
                    width: '25%',
                    aspectRatio: 1,
                    opacity: i === 3 ? 0.4 : 1,
                  }}
                />
              ))}
            </View>
            <View className="px-4 py-3 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <ImageIcon size={14} className="text-primary" />
                <Text className="text-foreground text-sm font-semibold">
                  View {album.item_count} photos
                </Text>
              </View>
              <View className="bg-primary/10 rounded-lg px-2.5 py-1">
                <Text className="text-primary text-[11px] font-bold">Open Gallery</Text>
              </View>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
