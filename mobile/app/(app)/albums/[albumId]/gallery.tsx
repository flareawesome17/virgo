import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { RemoteImage } from '@/components/RemoteImage';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ArrowLeftIcon, ImageIcon, UploadIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useAlbum, useAlbumFiles } from '@/src/hooks';
import { LoadFailed } from '@/components/LoadFailed';
import {
  CHROME_HEIGHT,
  DEFAULT_DENSITY,
  DENSITIES,
  HAIRLINE,
  toSections,
  type MediaRow,
} from '@/src/lib/media-grid';

for (const Icon of [ArrowLeftIcon, ImageIcon, UploadIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

export default function GalleryScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);
  const [density, setDensity] = useState(DEFAULT_DENSITY);
  const { data: album, refetch: refetchAlbum } = useAlbum(albumId);
  const filesQuery = useAlbumFiles(albumId);
  const photos = filesQuery.images;

  const columns = DENSITIES[density];
  const tile = (width - HAIRLINE * (columns - 1)) / columns;
  const sections = useMemo(() => toSections(photos, columns), [photos, columns]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAlbum(), filesQuery.refetch()]);
    setRefreshing(false);
  }, [refetchAlbum, filesQuery]);

  const changeDensity = useCallback((step: number) => {
    setDensity((current) => {
      const next = Math.min(Math.max(current + step, 0), DENSITIES.length - 1);
      if (next !== current) void Haptics.selectionAsync();
      return next;
    });
  }, []);

  /**
   * Pinch to change how much of the album you can see at once.
   *
   * One step per gesture, decided on release, rather than tracking scale
   * continuously: re-chunking a long list mid-pinch drops frames, and a grid
   * reflowing under fingers that are still moving reads as a glitch rather than
   * as direct manipulation.
   */
  const pinch = useMemo(
    () =>
      Gesture.Pinch().onEnd((event) => {
        const step = event.scale > 1.15 ? -1 : event.scale < 0.87 ? 1 : 0;
        if (step !== 0) runOnJS(changeDensity)(step);
      }),
    [changeDensity],
  );

  const renderRow = useCallback(
    ({ item: row }: { item: MediaRow }) => (
      <View
        className="flex-row"
        style={{ gap: HAIRLINE, marginBottom: HAIRLINE }}
      >
        {row.items.map((photo, column) => (
          <Pressable
            key={photo.key}
            onPress={() =>
              router.push(
                `/albums/${albumId}/viewer?index=${row.firstIndex + column}`,
              )
            }
            style={{ width: tile, height: tile }}
            className="bg-white/[0.04] active:opacity-75"
          >
            <RemoteImage
              source={{ uri: photo.thumbnailUrl ?? photo.url ?? undefined }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={140}
              recyclingKey={photo.key}
            />
            {photo.processingStatus === 'pending' && (
              <View className="absolute inset-0 items-center justify-center bg-black/35">
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
          </Pressable>
        ))}
        {/* Keeps a short last row left-aligned instead of stretching it. */}
        {row.items.length < columns &&
          Array.from({ length: columns - row.items.length }).map((_, index) => (
            <View
              key={`gap-${index}`}
              style={{ width: tile, height: tile }}
            />
          ))}
      </View>
    ),
    [albumId, columns, tile],
  );

  return (
    <View className="flex-1 bg-[#0E0C0B]">
      <GestureDetector gesture={pinch}>
        <View className="flex-1">
          <SectionList
            sections={sections}
            keyExtractor={(row) => `${columns}-${row.firstIndex}`}
            renderItem={renderRow}
            renderSectionHeader={({ section }) => (
              <View className="bg-[#0E0C0B] px-4 pt-5 pb-2">
                <Text className="text-white text-[15px] font-semibold tracking-[-0.2px]">
                  {section.title}
                </Text>
              </View>
            )}
            stickySectionHeadersEnabled
            contentContainerStyle={{ paddingTop: CHROME_HEIGHT, paddingBottom: 40 }}
            onEndReachedThreshold={0.6}
            onEndReached={() => {
              if (filesQuery.hasNextPage && !filesQuery.isFetchingNextPage) {
                filesQuery.fetchNextPage();
              }
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor="#C17745"
                progressViewOffset={CHROME_HEIGHT}
              />
            }
            ListFooterComponent={
              filesQuery.isFetchingNextPage ? (
                <View className="py-8">
                  <ActivityIndicator size="small" color="#C17745" />
                </View>
              ) : null
            }
            ListEmptyComponent={
              filesQuery.isLoading ? (
                <GridSkeleton tile={tile} columns={columns} />
              ) : filesQuery.loadFailed ? (
                <View className="px-6 pt-20">
                  <LoadFailed
                    what="these photos"
                    onRetry={() => filesQuery.refetch()}
                  />
                </View>
              ) : (
                <Empty albumId={albumId} />
              )
            }
          />
        </View>
      </GestureDetector>

      {/* Floats over the grid rather than pushing it down, so photographs run to
          the top of the screen and scroll under the controls. */}
      <SafeAreaView edges={['top']} className="absolute top-0 left-0 right-0">
        <LinearGradient
          colors={['rgba(14,12,11,0.94)', 'rgba(14,12,11,0)']}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 130,
          }}
          pointerEvents="none"
        />
        <View className="px-4 pt-2 pb-3 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            className="w-10 h-10 rounded-full bg-black/40 items-center justify-center active:opacity-70"
          >
            <ArrowLeftIcon size={19} color="#fff" />
          </Pressable>
          <View className="flex-1 min-w-0">
            <Text
              className="text-white text-[17px] font-semibold tracking-[-0.3px]"
              numberOfLines={1}
            >
              {album?.name || 'Photos'}
            </Text>
            <Text className="text-white/45 text-[12px] mt-0.5">
              {filesQuery.counts.image}{' '}
              {filesQuery.counts.image === 1 ? 'photo' : 'photos'}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function GridSkeleton({ tile, columns }: { tile: number; columns: number }) {
  return (
    <View className="flex-row flex-wrap" style={{ gap: HAIRLINE }}>
      {Array.from({ length: columns * 6 }).map((_, index) => (
        <View
          key={index}
          style={{ width: tile, height: tile }}
          className="bg-white/[0.05]"
        />
      ))}
    </View>
  );
}

function Empty({ albumId }: { albumId: string }) {
  return (
    <View className="items-center px-8 pt-24">
      <ImageIcon size={40} color="rgba(255,255,255,.22)" strokeWidth={1.5} />
      <Text className="text-white text-lg font-semibold mt-5">
        No photos yet
      </Text>
      <Text className="text-white/40 text-sm text-center mt-2 leading-5">
        Upload photographs and they will appear here, newest day first.
      </Text>
      <Pressable
        onPress={() =>
          router.push(`/albums/upload?albumId=${albumId}&kind=media`)
        }
        className="mt-7 bg-[#C17745] rounded-full px-6 py-3 flex-row items-center gap-2 active:opacity-85"
      >
        <UploadIcon size={17} color="#fff" />
        <Text className="text-white font-semibold">Upload photos</Text>
      </Pressable>
    </View>
  );
}
