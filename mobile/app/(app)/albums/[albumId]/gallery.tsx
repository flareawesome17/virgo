import { View, Text, FlatList, RefreshControl, Pressable, Image, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp, useAuth, useTheme } from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useCallback, useRef } from 'react';
import {
  ArrowLeftIcon,
  ImageIcon,
  Grid3X3Icon,
  ListIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Grid3X3Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ListIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const SCREEN_WIDTH = Dimensions.get('window').width;
const COLUMN_COUNT = 3;
const GAP = 2;
const ITEM_SIZE = (SCREEN_WIDTH - GAP * (COLUMN_COUNT + 1)) / COLUMN_COUNT;

// Generate consistent placeholder photos
const GENERATED_PHOTOS = Array.from({ length: 36 }, (_, i) => ({
  id: `photo-${i + 1}`,
  uri: `https://picsum.photos/seed/album-gallery-${i + 1}/600/600`,
  aspect: [1, 4/3, 3/4, 1, 16/9, 1, 4/3, 3/4][i % 8],
}));

function SkeletonGrid() {
  return (
    <View className="flex-row flex-wrap px-[1px]">
      {Array.from({ length: 15 }).map((_, i) => (
        <View
          key={i}
          style={{
            width: ITEM_SIZE,
            height: ITEM_SIZE,
            margin: GAP / 2,
            borderRadius: 2,
            backgroundColor: '#F0E8E2',
          }}
        />
      ))}
    </View>
  );
}

export default function GalleryScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const { client } = useApp();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'large'>('grid');

  const { data: album, isLoading } = useQuery({
    queryKey: ['album', albumId],
    queryFn: async () => {
      const { data, error } = await client
        .from('albums')
        .select('id, name, item_count')
        .eq('id', albumId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!albumId,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['album', albumId] });
    setRefreshing(false);
  };

  const photos = GENERATED_PHOTOS.slice(0, album?.item_count || 24);

  const openViewer = (index: number) => {
    router.push(`/albums/${albumId}/viewer?index=${index}`);
  };

  const colCount = viewMode === 'grid' ? 3 : 1;
  const itemW = viewMode === 'grid' ? ITEM_SIZE : SCREEN_WIDTH - 4;
  const itemH = viewMode === 'grid' ? ITEM_SIZE : undefined;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-[#1A1816]">
      {/* Header */}
      <View className="px-4 pt-3 pb-2 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-white/10 items-center justify-center active:scale-[0.94]"
          >
            <ArrowLeftIcon size={18} className="text-white" />
          </Pressable>
          <View>
            <Text className="text-white text-lg font-bold tracking-tight" numberOfLines={1}>
              {album?.name || 'Gallery'}
            </Text>
            <Text className="text-white/50 text-xs mt-0.5">
              {album?.item_count || photos.length} photos
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => setViewMode(viewMode === 'grid' ? 'large' : 'grid')}
          className="w-10 h-10 rounded-2xl bg-white/10 items-center justify-center active:scale-[0.94]"
        >
          {viewMode === 'grid' ? (
            <ListIcon size={18} className="text-white" />
          ) : (
            <Grid3X3Icon size={18} className="text-white" />
          )}
        </Pressable>
      </View>

      {/* Grid */}
      {isLoading ? (
        <SkeletonGrid />
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(item) => item.id}
          key={viewMode}
          numColumns={colCount}
          contentContainerStyle={{ paddingBottom: 120 }}
          columnWrapperStyle={
            viewMode === 'grid'
              ? { gap: GAP }
              : undefined
          }
          ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#C17745"
            />
          }
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => openViewer(index)}
              className="active:opacity-80"
              style={{
                width: itemW,
                height: viewMode === 'grid' ? itemH : itemW * (item.aspect || 1),
              }}
            >
              <Image
                source={{ uri: item.uri }}
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#2A2522',
                }}
                resizeMode="cover"
              />
            </Pressable>
          )}
          ListEmptyComponent={
            <View className="pt-20 items-center gap-3">
              <View className="w-16 h-16 rounded-full bg-white/10 items-center justify-center">
                <ImageIcon size={28} className="text-white/40" />
              </View>
              <Text className="text-white/40 text-sm">No photos yet</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
