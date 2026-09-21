import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import {
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeftIcon,
  FilmIcon,
  UploadIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useAlbum, useAlbumFiles } from '@/src/hooks';
import { LoadFailed } from '@/components/LoadFailed';
import { useVideoPlayback } from '@/src/providers/VideoPlayerProvider';
import {
  CHROME_HEIGHT,
  DEFAULT_DENSITY,
  DENSITIES,
  HAIRLINE,
  clock,
  toSections,
  type MediaRow,
} from '@/src/lib/media-grid';

for (const Icon of [ArrowLeftIcon, FilmIcon, UploadIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** How far the skip buttons jump. Ten is the iOS figure and the muscle memory. */

export default function VideosScreen() {
  const params = useLocalSearchParams<{
    albumId: string;
    /** A film to open straight away — the one tapped in the album grid. */
    key?: string;
    section?: string;
    order?: string;
    picked?: string;
  }>();
  const { albumId } = params;
  const { width } = useWindowDimensions();
  // Which film is playing belongs to the app now, not to this screen — that
  // is what lets it keep playing after you go back to the album.
  const { open: openFilm } = useVideoPlayback();
  const [refreshing, setRefreshing] = useState(false);
  const [density, setDensity] = useState(DEFAULT_DENSITY);
  const { data: album, refetch: refetchAlbum } = useAlbum(albumId);
  // Films only, filtered by the server. Taken from the whole mixed album
  // before, the Films room of a wedding stayed empty until enough pages of
  // photographs had loaded to reach the first film.
  const filesQuery = useAlbumFiles(albumId, {
    kind: 'video',
    section: params.section || undefined,
    order: params.order === 'oldest' ? 'oldest' : undefined,
    picked: params.picked === '1' ? true : undefined,
  });
  const files = filesQuery.videos;

  // A link to one film opens it, once. Through the shared player, the same
  // way a tap on a tile does — this screen no longer owns a player of its own,
  // so there is no local "selected" film to set.
  const openedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!params.key || openedKey.current === params.key) return;
    const film = files.find((file) => file.key === params.key);
    if (!film) return;
    openedKey.current = params.key;
    openFilm(film, files);
  }, [files, params.key, openFilm]);

  const columns = DENSITIES[density];
  const tile = (width - HAIRLINE * (columns - 1)) / columns;
  const sections = useMemo(() => toSections(files, columns), [files, columns]);

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
        {row.items.map((file) => (
          <Pressable
            key={file.key}
            onPress={() => openFilm(file, files)}
            style={{ width: tile, height: tile }}
            className="bg-white/[0.04] active:opacity-75"
            accessibilityRole="button"
            accessibilityLabel={`Play ${file.originalName}`}
          >
            {file.posterUrl ? (
              <RemoteImage
                source={{ uri: file.posterUrl }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={140}
                recyclingKey={file.key}
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <FilmIcon
                  size={24}
                  color="rgba(255,255,255,.22)"
                  strokeWidth={1.5}
                />
              </View>
            )}
            {/* Duration bottom-right over a scrim, which is where every video
                grid worth copying puts it, and the only metadata a thumbnail
                actually needs. */}
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 34,
              }}
              pointerEvents="none"
            />
            <Text className="absolute bottom-1 right-1.5 text-white text-[11px] font-medium">
              {file.durationMs
                ? clock(file.durationMs / 1000)
                : file.processingStatus === 'pending'
                  ? '...'
                  : ''}
            </Text>
          </Pressable>
        ))}
        {row.items.length < columns &&
          Array.from({ length: columns - row.items.length }).map((_, index) => (
            <View key={`gap-${index}`} style={{ width: tile, height: tile }} />
          ))}
      </View>
    ),
    [columns, tile, files, openFilm],
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
            contentContainerStyle={{
              paddingTop: CHROME_HEIGHT,
              paddingBottom: 40,
            }}
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
            ListEmptyComponent={
              filesQuery.isLoading ? null : filesQuery.loadFailed ? (
                <View className="px-6 pt-20">
                  <LoadFailed
                    what="these films"
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
              {album?.name || 'Films'}
            </Text>
            <Text className="text-white/45 text-[12px] mt-0.5">
              {filesQuery.counts.video}{' '}
              {filesQuery.counts.video === 1 ? 'film' : 'films'}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Empty({ albumId }: { albumId: string }) {
  return (
    <View className="items-center px-8 pt-24">
      <FilmIcon size={40} color="rgba(255,255,255,.22)" strokeWidth={1.5} />
      <Text className="text-white text-lg font-semibold mt-5">
        No films yet
      </Text>
      <Text className="text-white/40 text-sm text-center mt-2 leading-5">
        Upload a video and Virgo will prepare its poster and playback details.
      </Text>
      <Pressable
        onPress={() =>
          router.push(`/albums/upload?albumId=${albumId}&kind=media`)
        }
        className="mt-7 bg-[#C17745] rounded-full px-6 py-3 flex-row items-center gap-2 active:opacity-85"
      >
        <UploadIcon size={17} color="#fff" />
        <Text className="text-white font-semibold">Upload video</Text>
      </Pressable>
    </View>
  );
}
