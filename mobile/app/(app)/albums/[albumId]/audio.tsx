import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { RemoteImage } from '@/components/RemoteImage';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  Repeat1Icon,
  RepeatIcon,
  RotateCcwIcon,
  RotateCwIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  UploadIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useAlbum, useAlbumFiles } from '@/src/hooks';
import { useAlbumAudio } from '@/src/providers/AlbumAudioProvider';
import { LoadFailed } from '@/components/LoadFailed';
import { MediaScrubber } from '@/components/MediaScrubber';
import { clock } from '@/src/lib/media-grid';
import { type StoredFile } from '@/src/api';

for (const Icon of [
  ArrowLeftIcon, ChevronDownIcon, MusicIcon, PauseIcon, PlayIcon, Repeat1Icon,
  RepeatIcon, RotateCcwIcon, RotateCwIcon, ShuffleIcon, SkipBackIcon,
  SkipForwardIcon, UploadIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const ACCENT = '#C17745';
const ACCENT_LIGHT = '#D89566';
const GROUND = '#0E0C0B';

/**
 * Created once, at module scope: `createAnimatedComponent` inside a render
 * would hand React a new component type on every pass and remount the list.
 */
const TrackList = Animated.createAnimatedComponent(FlatList<StoredFile>);

/** Playback speeds, cycled by the pill in the full player. */
const RATES = [0.5, 1, 1.25, 1.5, 2];

/** Scroll distance over which the artwork gives way to the compact title. */
const COLLAPSE = 190;

/** One bar of the equaliser, scaled from its base so it grows upward. */
function Bar({
  playing,
  from,
  duration,
}: {
  playing: boolean;
  from: number;
  duration: number;
}) {
  const height = useSharedValue(from);

  useEffect(() => {
    cancelAnimation(height);
    height.value = playing
      ? withRepeat(withTiming(1, { duration }), -1, true)
      : withTiming(0.28, { duration: 160 });
    return () => cancelAnimation(height);
  }, [playing, duration, height]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: height.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 2.5,
          height: 14,
          borderRadius: 2,
          backgroundColor: ACCENT_LIGHT,
          transformOrigin: 'bottom',
        },
        style,
      ]}
    />
  );
}

/**
 * The three bars every music app shows beside the track that is playing.
 *
 * They stop when playback stops, which is the whole point of them — a row that
 * is merely selected should not look like a row that is making sound. The old
 * list drew the same filled circle for both and left you to guess.
 */
function PlayingBars({ playing }: { playing: boolean }) {
  return (
    <View className="flex-row items-end gap-[2px] h-3.5">
      <Bar playing={playing} from={0.45} duration={460} />
      <Bar playing={playing} from={1} duration={330} />
      <Bar playing={playing} from={0.7} duration={570} />
    </View>
  );
}

/** Album art, or a tinted note when the album has no cover. */
function Artwork({
  uri,
  size,
  radius = 12,
}: {
  uri?: string | null;
  size: number;
  radius?: number;
}) {
  if (uri) {
    return (
      <RemoteImage
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
        transition={160}
      />
    );
  }
  return (
    <View
      style={{ width: size, height: size, borderRadius: radius }}
      className="bg-[#2A2320] items-center justify-center"
    >
      {/* Outlined rather than filled: Lucide draws the stems and beam as one
          open path, and filling it paints a solid block between the stems. */}
      <MusicIcon
        size={Math.max(16, size * 0.32)}
        color={ACCENT_LIGHT}
      />
    </View>
  );
}

export default function AudioScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { data: album, refetch: refetchAlbum } = useAlbum(albumId);
  const filesQuery = useAlbumFiles(albumId);
  const files = filesQuery.audio;
  const audio = useAlbumAudio();
  const scrollY = useSharedValue(0);

  const cover = album?.cover_url ?? null;
  const art = Math.min(width - 112, 250);
  const activeKey =
    audio.current?.albumId === albumId ? audio.current.key : null;
  const docked = !!activeKey && !!audio.current;

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

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAlbum(), filesQuery.refetch()]);
    setRefreshing(false);
  }, [refetchAlbum, filesQuery]);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  /** Artwork fades and settles as it leaves; it does not simply clip away. */
  const artStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [0, COLLAPSE],
      [1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(
          scrollY.value,
          [0, COLLAPSE],
          [1, 0.86],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  /** The colour wash behind the art, which goes with it. */
  const washStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [0, COLLAPSE],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  /** The compact title, which arrives only once the big one has gone. */
  const compactStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [COLLAPSE * 0.7, COLLAPSE],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const renderTrack = useCallback(
    ({ item, index }: { item: StoredFile; index: number }) => {
      const active = activeKey === item.key;
      return (
        <Pressable
          onPress={() => select(item, index)}
          className="flex-row items-center gap-3.5 py-2.5 active:opacity-60"
        >
          <View className="w-7 items-center">
            {active && audio.loading ? (
              <ActivityIndicator size="small" color={ACCENT_LIGHT} />
            ) : active ? (
              <PlayingBars playing={audio.playing} />
            ) : (
              <Text className="text-white/30 text-[13px] font-mono">
                {index + 1}
              </Text>
            )}
          </View>
          <View className="flex-1 min-w-0">
            <Text
              className={`text-[15px] ${active ? 'text-[#D89566] font-semibold' : 'text-white font-medium'}`}
              numberOfLines={1}
            >
              {item.mediaTitle || item.originalName}
            </Text>
            <Text className="text-white/40 text-[12.5px] mt-0.5" numberOfLines={1}>
              {item.mediaArtist || album?.name || 'Unknown artist'}
            </Text>
          </View>
          <Text className="text-white/35 text-[12px] font-mono">
            {item.durationMs
              ? clock(item.durationMs / 1000)
              : item.processingStatus === 'pending'
                ? '· · ·'
                : '--:--'}
          </Text>
        </Pressable>
      );
    },
    [activeKey, album?.name, audio.loading, audio.playing, select],
  );

  return (
    <View className="flex-1" style={{ backgroundColor: GROUND }}>
      {/* A wash instead of a flat panel. Music apps put the record's colour
          behind the record; without a native colour extractor the album accent
          is the honest approximation, and it does the same job of making the
          top of the screen feel like it belongs to this album. */}
      <Animated.View
        style={washStyle}
        pointerEvents="none"
        className="absolute top-0 left-0 right-0"
      >
        <LinearGradient
          colors={['rgba(193,119,69,0.34)', 'rgba(193,119,69,0.08)', GROUND]}
          style={{ height: 420 }}
        />
      </Animated.View>

      <TrackList
        data={files}
        keyExtractor={(item) => item.key}
        renderItem={renderTrack}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingTop: 104,
          paddingBottom: docked ? 150 : 60,
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
            tintColor={ACCENT}
            progressViewOffset={104}
          />
        }
        ListHeaderComponent={
          <View className="pb-3">
            <Animated.View style={artStyle} className="items-center">
              <View
                style={{
                  shadowColor: '#000',
                  shadowOpacity: 0.55,
                  shadowRadius: 26,
                  shadowOffset: { width: 0, height: 14 },
                  elevation: 14,
                }}
              >
                <Artwork uri={cover} size={art} radius={10} />
              </View>
            </Animated.View>

            <Text
              className="text-white text-[28px] font-bold tracking-[-0.8px] mt-7"
              numberOfLines={2}
            >
              {album?.name || 'Audio'}
            </Text>
            <Text className="text-white/45 text-[13px] mt-1.5">
              Virgo · {filesQuery.counts.audio}{' '}
              {filesQuery.counts.audio === 1 ? 'track' : 'tracks'}
              {minutes > 0 ? ` · ${minutes} min` : ''}
            </Text>

            {files.length > 0 && (
              <View className="flex-row items-center mt-5 mb-2">
                <Pressable
                  onPress={() => {
                    audio.setShuffle(!audio.shuffle);
                    void Haptics.selectionAsync();
                  }}
                  hitSlop={10}
                  accessibilityLabel="Shuffle"
                  className="mr-5 active:opacity-60"
                >
                  {/* Heavier when on, as the tab bar marks its focused tab.
                      Shuffle is open strokes, so there is no filled form. */}
                  <ShuffleIcon
                    size={22}
                    color={audio.shuffle ? ACCENT_LIGHT : 'rgba(255,255,255,.5)'}
                    strokeWidth={audio.shuffle ? 2.5 : 2}
                  />
                </Pressable>
                <Pressable
                  onPress={() => {
                    audio.cycleRepeat();
                    void Haptics.selectionAsync();
                  }}
                  hitSlop={10}
                  accessibilityLabel="Repeat"
                  className="active:opacity-60"
                >
                  {audio.repeat === 'one' ? (
                    <Repeat1Icon size={22} color={ACCENT_LIGHT} />
                  ) : (
                    <RepeatIcon
                      size={22}
                      color={
                        audio.repeat === 'all'
                          ? ACCENT_LIGHT
                          : 'rgba(255,255,255,.5)'
                      }
                    />
                  )}
                </Pressable>
                <View className="flex-1" />
                {/* One large, unmissable play control, the way a playlist
                    screen should open: press it and the album starts. */}
                <Pressable
                  onPress={() => {
                    if (activeKey) audio.toggle();
                    else play(0);
                  }}
                  accessibilityLabel={audio.playing ? 'Pause' : 'Play album'}
                  style={{ backgroundColor: ACCENT }}
                  className="w-14 h-14 rounded-full items-center justify-center active:scale-[0.94]"
                >
                  {/* `fill` repeats the colour rather than saying
                      currentColor: lucide-react-native gives `color` to the
                      stroke alone, so on a device currentColor resolves to
                      nothing and the glyph comes out hollow. */}
                  {activeKey && audio.loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : activeKey && audio.playing ? (
                    <PauseIcon size={25} color="#fff" fill="#fff" />
                  ) : (
                    <PlayIcon size={26} color="#fff" fill="#fff" />
                  )}
                </Pressable>
              </View>
            )}
          </View>
        }
        ListFooterComponent={
          filesQuery.isFetchingNextPage ? (
            <View className="py-8">
              <ActivityIndicator size="small" color={ACCENT} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          filesQuery.isLoading ? null : filesQuery.loadFailed ? (
            <View className="pt-10">
              <LoadFailed
                what="these tracks"
                onRetry={() => filesQuery.refetch()}
              />
            </View>
          ) : (
            <Empty albumId={albumId} />
          )
        }
      />

      {/* Compact header. Back is always here; the title arrives on scroll,
          and brings its own opaque ground with it so the tracks passing
          underneath do not read through the title. */}
      <SafeAreaView edges={['top']} className="absolute top-0 left-0 right-0">
        <Animated.View
          style={[compactStyle, { backgroundColor: GROUND }]}
          pointerEvents="none"
          className="absolute inset-0"
        />
        <View className="px-4 pt-2 pb-3 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            className="w-10 h-10 rounded-full bg-black/35 items-center justify-center active:opacity-70"
          >
            <ArrowLeftIcon size={19} color="#fff" />
          </Pressable>
          <Animated.View style={compactStyle} className="flex-1 min-w-0">
            <Text
              className="text-white text-[16px] font-semibold tracking-[-0.3px]"
              numberOfLines={1}
            >
              {album?.name || 'Audio'}
            </Text>
          </Animated.View>
        </View>
      </SafeAreaView>

      {docked && audio.current && (
        <MiniBar
          file={audio.current}
          cover={cover}
          albumName={album?.name}
          playing={audio.playing}
          loading={audio.loading}
          progress={
            audio.duration > 0
              ? Math.min(audio.position / audio.duration, 1)
              : 0
          }
          onToggle={audio.toggle}
          onNext={audio.next}
          onExpand={() => setExpanded(true)}
        />
      )}

      <Modal
        visible={expanded && docked}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setExpanded(false)}
      >
        {audio.current && (
          <NowPlaying
            file={audio.current}
            cover={cover}
            albumName={album?.name}
            onClose={() => setExpanded(false)}
          />
        )}
      </Modal>
    </View>
  );
}

/**
 * The strip that stays put while you browse the rest of the album.
 *
 * It is deliberately thin and carries only what you need at a glance: what is
 * playing, a play/pause, a skip, and a hairline of progress. Everything else
 * lives one tap away in the full player, which is the arrangement every music
 * app has converged on because the list is what you are actually looking at.
 */
function MiniBar({
  file,
  cover,
  albumName,
  playing,
  loading,
  progress,
  onToggle,
  onNext,
  onExpand,
}: {
  file: StoredFile;
  cover: string | null;
  albumName?: string;
  playing: boolean;
  loading: boolean;
  progress: number;
  onToggle: () => void;
  onNext: () => void;
  onExpand: () => void;
}) {
  return (
    <SafeAreaView
      edges={['bottom']}
      className="absolute bottom-0 left-0 right-0"
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onExpand}
        className="mx-3 mb-2 rounded-2xl overflow-hidden bg-[#241E1A] active:opacity-90"
      >
        <View className="flex-row items-center gap-3 px-2.5 py-2.5">
          <Artwork uri={cover} size={42} radius={7} />
          <View className="flex-1 min-w-0">
            <Text className="text-white text-[13.5px] font-semibold" numberOfLines={1}>
              {file.mediaTitle || file.originalName}
            </Text>
            <Text className="text-white/40 text-[12px] mt-0.5" numberOfLines={1}>
              {file.mediaArtist || albumName || 'Virgo'}
            </Text>
          </View>
          <Pressable
            onPress={onToggle}
            hitSlop={10}
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            className="w-9 h-9 items-center justify-center active:opacity-60"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : playing ? (
              <PauseIcon size={21} color="#fff" fill="#fff" />
            ) : (
              <PlayIcon size={21} color="#fff" fill="#fff" />
            )}
          </Pressable>
          <Pressable
            onPress={onNext}
            hitSlop={10}
            accessibilityLabel="Next track"
            className="w-9 h-9 items-center justify-center active:opacity-60"
          >
            <SkipForwardIcon size={19} color="#fff" fill="#fff" />
          </Pressable>
        </View>
        <View className="h-[2px] bg-white/10">
          <View
            style={{
              width: `${progress * 100}%`,
              backgroundColor: ACCENT_LIGHT,
            }}
            className="h-full"
          />
        </View>
      </Pressable>
    </SafeAreaView>
  );
}

/**
 * The full player.
 *
 * Everything the docked bar leaves out, laid out in rows rather than crowded
 * into one: a scrubber you can drag, transport under it, and the secondary
 * controls — skip back, speed, skip forward — on their own line. The speed pill
 * used to be positioned over the progress bar and covered it.
 */
function NowPlaying({
  file,
  cover,
  albumName,
  onClose,
}: {
  file: StoredFile;
  cover: string | null;
  albumName?: string;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const audio = useAlbumAudio();
  const art = Math.min(width - 88, 330);

  const nextRate = () =>
    audio.setRate(RATES[(RATES.indexOf(audio.rate) + 1) % RATES.length]);

  return (
    <View className="flex-1" style={{ backgroundColor: GROUND }}>
      <LinearGradient
        colors={['rgba(193,119,69,0.30)', GROUND]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 520 }}
        pointerEvents="none"
      />
      <SafeAreaView edges={['top', 'bottom']} className="flex-1">
        <View className="px-5 pt-2 flex-row items-center">
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityLabel="Close player"
            className="w-10 h-10 -ml-2 items-center justify-center active:opacity-60"
          >
            <ChevronDownIcon size={22} color="#fff" />
          </Pressable>
          <Text className="flex-1 text-center text-white/50 text-[11px] uppercase tracking-[1.6px]">
            {albumName || 'Now playing'}
          </Text>
          <View className="w-10" />
        </View>

        <View className="flex-1 items-center justify-center px-6">
          <View
            style={{
              shadowColor: '#000',
              shadowOpacity: 0.6,
              shadowRadius: 34,
              shadowOffset: { width: 0, height: 18 },
              elevation: 18,
            }}
          >
            <Artwork uri={cover} size={art} radius={12} />
          </View>
        </View>

        <View className="px-7 pb-4">
          <Text
            className="text-white text-[23px] font-bold tracking-[-0.5px]"
            numberOfLines={1}
          >
            {file.mediaTitle || file.originalName}
          </Text>
          <Text className="text-white/45 text-[15px] mt-1" numberOfLines={1}>
            {file.mediaArtist || albumName || 'Virgo'}
          </Text>

          <View className="mt-6">
            <MediaScrubber
              position={audio.position}
              duration={audio.duration}
              onSeek={audio.seekTo}
              accent={ACCENT_LIGHT}
            />
          </View>

          <View className="flex-row items-center justify-between mt-5">
            <Pressable
              onPress={() => {
                audio.setShuffle(!audio.shuffle);
                void Haptics.selectionAsync();
              }}
              hitSlop={10}
              accessibilityLabel="Shuffle"
              className="w-11 h-11 items-center justify-center active:opacity-60"
            >
              <ShuffleIcon
                size={20}
                color={audio.shuffle ? ACCENT_LIGHT : 'rgba(255,255,255,.42)'}
                strokeWidth={audio.shuffle ? 2.5 : 2}
              />
            </Pressable>
            <Pressable
              onPress={audio.previous}
              hitSlop={10}
              accessibilityLabel="Previous track"
              className="w-12 h-12 items-center justify-center active:opacity-60"
            >
              <SkipBackIcon size={28} color="#fff" fill="#fff" />
            </Pressable>
            <Pressable
              onPress={audio.toggle}
              accessibilityLabel={audio.playing ? 'Pause' : 'Play'}
              style={{ backgroundColor: ACCENT }}
              className="w-[68px] h-[68px] rounded-full items-center justify-center active:scale-[0.94]"
            >
              {audio.loading ? (
                <ActivityIndicator color="#fff" />
              ) : audio.playing ? (
                <PauseIcon size={28} color="#fff" fill="#fff" />
              ) : (
                <PlayIcon size={30} color="#fff" fill="#fff" />
              )}
            </Pressable>
            <Pressable
              onPress={audio.next}
              hitSlop={10}
              accessibilityLabel="Next track"
              className="w-12 h-12 items-center justify-center active:opacity-60"
            >
              <SkipForwardIcon size={28} color="#fff" fill="#fff" />
            </Pressable>
            {/* Distinct glyphs for repeat and for skipping forward. The old
                player drew the same arrow for both, so the two controls beside
                each other did entirely different things. */}
            <Pressable
              onPress={() => {
                audio.cycleRepeat();
                void Haptics.selectionAsync();
              }}
              hitSlop={10}
              accessibilityLabel="Repeat"
              className="w-11 h-11 items-center justify-center active:opacity-60"
            >
              {audio.repeat === 'one' ? (
                <Repeat1Icon size={20} color={ACCENT_LIGHT} />
              ) : (
                <RepeatIcon
                  size={20}
                  color={
                    audio.repeat === 'all'
                      ? ACCENT_LIGHT
                      : 'rgba(255,255,255,.42)'
                  }
                />
              )}
            </Pressable>
          </View>

          <View className="flex-row items-center justify-center gap-9 mt-5">
            <Pressable
              onPress={() => audio.seekBy(-15)}
              hitSlop={10}
              accessibilityLabel="Back 15 seconds"
              className="flex-row items-center gap-1.5 active:opacity-60"
            >
              <RotateCcwIcon
                size={18}
                color="rgba(255,255,255,.55)"
              />
              <Text className="text-white/45 text-[12px] font-mono">15</Text>
            </Pressable>
            <Pressable
              onPress={nextRate}
              hitSlop={10}
              accessibilityLabel="Playback speed"
              className="bg-white/[0.08] rounded-full px-3 py-1.5 active:opacity-60"
            >
              <Text className="text-white/70 text-[12px] font-mono">
                {audio.rate}×
              </Text>
            </Pressable>
            <Pressable
              onPress={() => audio.seekBy(15)}
              hitSlop={10}
              accessibilityLabel="Forward 15 seconds"
              className="flex-row items-center gap-1.5 active:opacity-60"
            >
              <Text className="text-white/45 text-[12px] font-mono">15</Text>
              <RotateCwIcon
                size={18}
                color="rgba(255,255,255,.55)"
              />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Empty({ albumId }: { albumId: string }) {
  return (
    <View className="items-center px-4 pt-16">
      <MusicIcon size={40} color="rgba(255,255,255,.22)" strokeWidth={1.5} />
      <Text className="text-white text-lg font-semibold mt-5">No audio yet</Text>
      <Text className="text-white/40 text-sm text-center mt-2 leading-5">
        Upload a recording or a finished track and it will queue up here.
      </Text>
      <Pressable
        onPress={() =>
          router.push(`/albums/upload?albumId=${albumId}&kind=audio`)
        }
        style={{ backgroundColor: ACCENT }}
        className="mt-7 rounded-full px-6 py-3 flex-row items-center gap-2 active:opacity-85"
      >
        <UploadIcon size={17} color="#fff" />
        <Text className="text-white font-semibold">Upload audio</Text>
      </Pressable>
    </View>
  );
}
