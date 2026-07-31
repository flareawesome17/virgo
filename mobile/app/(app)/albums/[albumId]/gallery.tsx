import { View, Text, FlatList, RefreshControl, Pressable, Dimensions } from 'react-native';
// expo-image rather than RN Image: it decodes AVIF (and HEIC) on OS
// versions where the RN one silently renders nothing.
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAlbum, useAlbumFiles, useTheme } from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useCallback, useRef } from 'react';
import {
  ArrowLeftIcon,
  ImageIcon,
  Grid3X3Icon,
  ListIcon,
  UploadIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Grid3X3Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ListIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UploadIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const SCREEN_WIDTH = Dimensions.get('window').width;
const COLUMN_COUNT = 3;
const GAP = 2;
const ITEM_SIZE = (SCREEN_WIDTH - GAP * (COLUMN_COUNT + 1)) / COLUMN_COUNT;


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
            // This grid only ever renders on the gallery's fixed dark
            // backdrop, so it does not follow the app theme.
            backgroundColor: '#2A2522',
          }}
        />
      ))}
    </View>
  );
}

export default function GalleryScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const { isDark } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'large'>('grid');

  const { data: album, isLoading, refetch: refetchAlbum } = useAlbum(albumId);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchAlbum();
    setRefreshing(false);
  };

  // Real objects stored against this album. An empty album now renders empty
  // instead of showing generated stock photos.
  const { images: photos, isLoading: filesLoading } = useAlbumFiles(albumId);

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
              {photos.length} photo{photos.length === 1 ? '' : 's'}
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
      {isLoading || filesLoading ? (
        <SkeletonGrid />
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(item) => item.key}
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
                height: viewMode === 'grid' ? itemH : itemW,
              }}
            >
              <Image
                source={{ uri: item.url ?? undefined }}
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#2A2522',
                }}
                contentFit="cover"
              />
            </Pressable>
          )}
          ListEmptyComponent={
            <View className="pt-20 items-center gap-3">
              <View className="w-16 h-16 rounded-full bg-white/10 items-center justify-center">
                <ImageIcon size={28} className="text-white/40" />
              </View>
              <Text className="text-white/40 text-sm">No photos yet</Text>
              {/* The Videos and Audio tabs both offer an upload here; this one
                  was a dead end. kind=media opens the gallery, not the file
                  browser, since photos and videos live in the gallery. */}
              <Pressable
                onPress={() => router.push(`/albums/upload?albumId=${albumId}&kind=media`)}
                className="mt-4 bg-primary rounded-2xl px-7 py-3 flex-row items-center gap-2 active:scale-[0.96]"
              >
                <UploadIcon size={16} className="text-white" />
                <Text className="text-white text-sm font-bold">Upload photos</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
