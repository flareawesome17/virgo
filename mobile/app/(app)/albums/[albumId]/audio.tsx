import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowLeftIcon, MusicIcon, UploadIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useAlbum, useAlbumFiles, useTheme } from '@/src/hooks';
import { useAlbumAudioControls } from '@/src/providers/AlbumAudioProvider';
import { LoadFailed } from '@/components/LoadFailed';
import { PlayAllBar, RecordingRow } from '@/components/Recordings';
import { PALETTES } from '@/theme';
import { type StoredFile } from '@/src/api';

for (const Icon of [ArrowLeftIcon, MusicIcon, UploadIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * An album's recordings, on their own: a link to one lands here, and so does
 * anything that still asks for "the audio room".
 *
 * It was a music app's screen inside this one — black, a record sleeve, a
 * green-room wash of the accent colour — with its own bar and its own player.
 * It is the album's list of recordings now, in the app's own card and rows;
 * what is playing sits in the bar every screen has (AudioDock), and the full
 * player opens from there.
 */
export default function AudioScreen() {
  const params = useLocalSearchParams<{
    albumId: string;
    /** A recording to start straight away. */
    key?: string;
    section?: string;
    order?: string;
    picked?: string;
  }>();
  const { albumId } = params;
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);
  const { data: album, refetch: refetchAlbum } = useAlbum(albumId);
  // Sound files only, filtered by the server rather than picked out of the
  // whole album after fetching all of it.
  const filesQuery = useAlbumFiles(albumId, {
    kind: 'audio',
    section: params.section || undefined,
    order: params.order === 'oldest' ? 'oldest' : undefined,
    picked: params.picked === '1' ? true : undefined,
  });
  const files = filesQuery.audio;
  const audio = useAlbumAudioControls();

  const cover = album?.cover_url ?? null;
  const activeKey = audio.current?.albumId === albumId ? audio.current.key : null;

  const minutes = useMemo(() => {
    const ms = files.reduce((sum, file) => sum + (file.durationMs ?? 0), 0);
    return ms > 0 ? Math.max(1, Math.round(ms / 60_000)) : 0;
  }, [files]);

  const play = useCallback(
    (index: number) => {
      audio.playQueue(files, index, album?.name ?? 'Virgo album', cover);
    },
    [audio, files, album?.name, cover],
  );

  const select = useCallback(
    (file: StoredFile, index: number) => {
      if (activeKey === file.key) audio.toggle();
      else play(index);
    },
    [activeKey, audio, play],
  );

  // Arriving from a tapped recording means "play this", once.
  const startedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!params.key || startedKey.current === params.key) return;
    const index = files.findIndex((file) => file.key === params.key);
    if (index < 0) return;
    startedKey.current = params.key;
    if (activeKey !== params.key) play(index);
  }, [files, params.key, activeKey, play]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAlbum(), filesQuery.refetch()]);
    setRefreshing(false);
  }, [refetchAlbum, filesQuery]);

  const count = filesQuery.counts.audio;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="px-2 pt-1 pb-1 flex-row items-center gap-1">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="w-10 h-10 items-center justify-center active:opacity-60"
        >
          <ArrowLeftIcon size={22} className="text-foreground" />
        </Pressable>
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[16px] leading-5 font-bold" numberOfLines={1} accessibilityRole="header">
            {album?.name || 'Recordings'}
          </Text>
          <Text className="text-muted-foreground text-[12px] leading-4">
            {count.toLocaleString()} {count === 1 ? 'recording' : 'recordings'}
            {minutes > 0 ? ` · ${minutes} min` : ''}
          </Text>
        </View>
      </View>

      <FlatList
        data={files}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}
        renderItem={({ item, index }) => (
          <RecordingRow
            file={item}
            number={index + 1}
            first={index === 0}
            last={index === files.length - 1}
            active={activeKey === item.key}
            playing={audio.playing}
            loading={audio.loading}
            onPress={() => select(item, index)}
          />
        )}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (filesQuery.hasNextPage && !filesQuery.isFetchingNextPage) void filesQuery.fetchNextPage();
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.primary} />}
        ListHeaderComponent={
          files.length > 0 ? (
            <View className="pb-5">
              <PlayAllBar
                playing={!!activeKey && audio.playing}
                loading={!!activeKey && audio.loading}
                shuffle={audio.shuffle}
                onPlay={() => {
                  if (activeKey) audio.toggle();
                  else play(0);
                }}
                onShuffle={() => {
                  audio.setShuffle(!audio.shuffle);
                  void Haptics.selectionAsync();
                }}
              />
            </View>
          ) : null
        }
        ListFooterComponent={
          filesQuery.isFetchingNextPage ? (
            <View className="py-8">
              <ActivityIndicator size="small" color={palette.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          filesQuery.isLoading ? (
            <View className="py-16">
              <ActivityIndicator color={palette.primary} />
            </View>
          ) : filesQuery.loadFailed ? (
            <View className="pt-10">
              <LoadFailed what="these recordings" onRetry={() => void filesQuery.refetch()} />
            </View>
          ) : (
            <View className="items-center px-4 pt-16">
              <View className="w-16 h-16 rounded-full bg-muted items-center justify-center">
                <MusicIcon size={26} className="text-muted-foreground" />
              </View>
              <Text className="text-foreground text-lg font-bold mt-4">No recordings yet</Text>
              <Text className="text-muted-foreground text-sm text-center mt-1 leading-5">
                Upload vows, a speech or a finished track and it plays from here.
              </Text>
              <Pressable
                onPress={() => router.push(`/albums/upload?albumId=${albumId}&kind=audio`)}
                accessibilityRole="button"
                className="mt-6 h-11 bg-action rounded-[14px] px-6 flex-row items-center gap-2 active:opacity-85"
              >
                <UploadIcon size={17} className="text-action-foreground" />
                <Text className="text-action-foreground text-[15px] font-semibold">Upload audio</Text>
              </Pressable>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}
