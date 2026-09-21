import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  SectionList,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import {
  useVideoPlayer,
  VideoView,
  type VideoPlayerStatus,
  type VideoView as VideoViewType,
} from 'expo-video';
import {
  ArrowLeft,
  ArrowsOut,
  DownloadSimple,
  FilmSlate,
  Pause,
  PictureInPicture,
  Play,
  SpeakerHigh,
  SpeakerSlash,
  UploadSimple,
  X,
} from 'phosphor-react-native';
import { useAlbum, useAlbumFiles } from '@/src/hooks';
import { LoadFailed } from '@/components/LoadFailed';
import { MediaScrubber } from '@/components/MediaScrubber';
import {
  CHROME_HEIGHT,
  DEFAULT_DENSITY,
  DENSITIES,
  HAIRLINE,
  clock,
  toSections,
  type MediaRow,
} from '@/src/lib/media-grid';
import { type StoredFile } from '@/src/api';

/** How far the skip buttons jump. Ten is the iOS figure and the muscle memory. */
const SKIP = 10;

/**
 * How long a video may sit in `loading` before we call it.
 *
 * `statusChange` only reports `error` when playback actually fails. A file
 * behind a slow link, or one whose presigned URL has quietly expired, stays in
 * `loading` forever, and the screen sits black with working controls that do
 * nothing. Twenty-five seconds is long enough for a large file on a poor
 * connection and short enough that nobody is left guessing.
 */
const STALL_AFTER = 25_000;

/**
 * Full-screen playback.
 *
 * The video takes the whole screen and is fitted inside it, rather than being
 * poured into a fixed 16:9 box in the middle. A portrait clip shot on a phone
 * is the common case for this app, and the old player reduced one to a letterbox
 * strip with black above and below it.
 *
 * Controls fade rather than appearing and vanishing, and they sit over the
 * picture instead of below it, so nothing about the frame moves when they come
 * and go.
 */
function VideoPlayer({
  file,
  onClose,
}: {
  file: StoredFile;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const viewRef = useRef<VideoViewType>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(
    file.durationMs ? file.durationMs / 1000 : 0,
  );
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState<'error' | 'stalled' | null>(null);
  const [status, setStatus] = useState<VideoPlayerStatus>('loading');
  const [saving, setSaving] = useState(false);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controls = useSharedValue(1);
  const visible = useRef(true);

  /**
   * The ladder, then the proxy, then the original.
   *
   * HLS is native on both platforms — AVPlayer and ExoPlayer — so this needs
   * no player library, and it is the only one of the three that adapts to the
   * connection rather than committing to one bitrate. It exists only for
   * films in a shared album; the proxy covers everything else, and the
   * original covers a film that has not been through the worker at all.
   */
  const playbackUrl = file.hlsUrl ?? file.proxyUrl ?? file.url ?? '';

  const player = useVideoPlayer(
    // iOS needs to be told when a URI it cannot read an extension from is
    // HLS. Ours ends in .m3u8, but the contentType is what the platform
    // actually keys off and stating it costs nothing.
    file.hlsUrl
      ? { uri: playbackUrl, contentType: 'hls' as const }
      : playbackUrl,
    (instance) => {
      instance.timeUpdateEventInterval = 0.25;
      instance.play();
    },
  );

  const setControls = useCallback(
    (next: boolean) => {
      visible.current = next;
      controls.value = withTiming(next ? 1 : 0, { duration: 180 });
    },
    [controls],
  );

  const reveal = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playing) {
      hideTimer.current = setTimeout(() => setControls(false), 2800);
    }
  }, [playing, setControls]);

  useEffect(() => {
    const playingSub = player.addListener('playingChange', ({ isPlaying }) => {
      setPlaying(isPlaying);
      // A paused video is a video somebody is looking at deliberately. Leave
      // the controls up rather than timing them out from under them.
      if (!isPlaying) setControls(true);
    });
    const timeSub = player.addListener('timeUpdate', ({ currentTime }) => {
      setPosition(currentTime);
      // Read the player rather than closing over `duration`, which would be
      // whatever it was when this listener was created.
      if (player.duration > 0) setDuration(player.duration);
    });
    const statusSub = player.addListener('statusChange', ({ status: next }) => {
      setStatus(next);
      if (stallTimer.current) clearTimeout(stallTimer.current);
      if (next === 'error') {
        setFailed('error');
      } else if (next === 'loading') {
        stallTimer.current = setTimeout(
          () => setFailed('stalled'),
          STALL_AFTER,
        );
      }
    });
    return () => {
      playingSub.remove();
      timeSub.remove();
      statusSub.remove();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (stallTimer.current) clearTimeout(stallTimer.current);
      player.pause();
    };
  }, [player, setControls]);

  useEffect(() => {
    reveal();
  }, [reveal]);

  const skip = (seconds: number) => {
    player.currentTime = Math.max(
      0,
      Math.min(player.currentTime + seconds, duration || player.duration || 0),
    );
    void Haptics.selectionAsync();
    reveal();
  };

  const saveOriginal = async () => {
    const source = file.downloadUrl ?? file.url;
    if (!source || saving) return;
    setSaving(true);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow photo access to save videos.');
        return;
      }
      const safeName = file.originalName.replace(/[^a-z0-9._-]/gi, '_');
      const result = await FileSystem.downloadAsync(
        source,
        `${FileSystem.cacheDirectory}${safeName}`,
      );
      if (result.status < 200 || result.status >= 300) {
        throw new Error('The video could not be downloaded.');
      }
      await MediaLibrary.saveToLibraryAsync(result.uri);
      await FileSystem.deleteAsync(result.uri, { idempotent: true });
      Alert.alert('Saved', 'The video is in your library.');
    } catch (error) {
      Alert.alert(
        'Could not save',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleControls = useCallback(() => {
    if (visible.current) setControls(false);
    else reveal();
  }, [reveal, setControls]);

  const tap = useMemo(
    () => Gesture.Tap().onEnd(() => runOnJS(toggleControls)()),
    [toggleControls],
  );

  const controlsStyle = useAnimatedStyle(() => ({ opacity: controls.value }));

  if (failed) {
    return (
      <SafeAreaView
        edges={['top', 'bottom']}
        className="flex-1 bg-black items-center justify-center px-8"
      >
        <FilmSlate size={44} color="rgba(255,255,255,.3)" weight="light" />
        <Text className="text-white text-lg font-semibold text-center mt-5">
          {failed === 'stalled'
            ? 'This video is not loading'
            : 'This video cannot play on this device'}
        </Text>
        <Text className="text-white/45 text-sm text-center mt-2 leading-5">
          {failed === 'stalled'
            ? 'It has been waiting a while without starting. Check your connection and try again.'
            : 'The original codec may only be supported on the device that recorded it. You can still save the file and open it elsewhere.'}
        </Text>
        {failed === 'stalled' && (
          <Pressable
            onPress={() => {
              setFailed(null);
              player.replace(playbackUrl);
              player.play();
            }}
            className="mt-7 bg-[#C17745] rounded-full px-6 py-3 active:opacity-85"
          >
            <Text className="text-white font-semibold">Try again</Text>
          </Pressable>
        )}
        {/* Only for a codec failure. A file that never arrived over the network
            will not arrive for the downloader either, so offering to save it is
            offering a second way to fail. */}
        {failed === 'error' && file.capabilities.download && (
          <Pressable
            onPress={saveOriginal}
            disabled={saving}
            className="mt-7 bg-[#C17745] rounded-full px-6 py-3 flex-row items-center gap-2 active:opacity-85"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <DownloadSimple size={17} color="#fff" weight="regular" />
            )}
            <Text className="text-white font-semibold">Save the original</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onClose}
          className="absolute top-12 left-4 w-10 h-10 rounded-full bg-white/10 items-center justify-center active:opacity-70"
        >
          <X size={19} color="#fff" weight="regular" />
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <GestureDetector gesture={tap}>
        <View className="flex-1">
          <VideoView
            ref={viewRef}
            player={player}
            style={{ width, height }}
            contentFit="contain"
            nativeControls={false}
            allowsFullscreen
            allowsPictureInPicture
          />
        </View>
      </GestureDetector>

      {/* Sits outside the fading chrome: whether the video is loading is not
          something to hide after two seconds of inactivity. */}
      {status === 'loading' && (
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
        >
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      <Animated.View
        style={controlsStyle}
        pointerEvents="box-none"
        className="absolute inset-0"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.65)', 'rgba(0,0,0,0)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 150 }}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 200,
          }}
          pointerEvents="none"
        />

        <SafeAreaView edges={['top']} className="absolute top-0 left-0 right-0">
          <View className="px-4 pt-2 flex-row items-center gap-3">
            <Pressable
              onPress={onClose}
              hitSlop={8}
              className="w-10 h-10 rounded-full bg-black/45 items-center justify-center active:opacity-70"
            >
              <X size={19} color="#fff" weight="regular" />
            </Pressable>
            <Text
              className="text-white text-[15px] font-semibold flex-1"
              numberOfLines={1}
            >
              {file.mediaTitle || file.originalName}
            </Text>
          </View>
        </SafeAreaView>

        {/* Transport in the middle, where a thumb reaches without moving the
            phone, and where iOS puts it. It steps aside while the video is
            loading so the spinner has the centre to itself. */}
        <View
          className="flex-1 flex-row items-center justify-center gap-9"
          pointerEvents={status === 'loading' ? 'none' : 'auto'}
          style={{ opacity: status === 'loading' ? 0 : 1 }}
        >
          <Pressable
            onPress={() => skip(-SKIP)}
            hitSlop={10}
            accessibilityLabel={`Back ${SKIP} seconds`}
            className="items-center active:opacity-70"
          >
            <ArrowLeft size={26} color="#fff" weight="regular" />
            <Text className="text-white/70 text-[10px] font-mono mt-0.5">
              {SKIP}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (playing) player.pause();
              else player.play();
              reveal();
            }}
            className="w-[72px] h-[72px] rounded-full bg-black/50 items-center justify-center active:opacity-70"
          >
            {playing ? (
              <Pause size={30} color="#fff" weight="fill" />
            ) : (
              <Play size={30} color="#fff" weight="fill" />
            )}
          </Pressable>
          <Pressable
            onPress={() => skip(SKIP)}
            hitSlop={10}
            accessibilityLabel={`Forward ${SKIP} seconds`}
            className="items-center active:opacity-70"
          >
            <ArrowLeft
              size={26}
              color="#fff"
              weight="regular"
              style={{ transform: [{ scaleX: -1 }] }}
            />
            <Text className="text-white/70 text-[10px] font-mono mt-0.5">
              {SKIP}
            </Text>
          </Pressable>
        </View>

        <SafeAreaView
          edges={['bottom']}
          className="absolute bottom-0 left-0 right-0"
        >
          <View className="px-5 pb-2">
            <MediaScrubber
              position={position}
              duration={duration}
              onSeek={(seconds) => {
                player.currentTime = seconds;
                setPosition(seconds);
                reveal();
              }}
            />
            <View className="flex-row items-center gap-6 mt-2">
              <Pressable
                onPress={() => {
                  const next = !muted;
                  player.muted = next;
                  setMuted(next);
                  reveal();
                }}
                hitSlop={8}
                accessibilityLabel={muted ? 'Unmute' : 'Mute'}
                className="active:opacity-70"
              >
                {muted ? (
                  <SpeakerSlash size={19} color="#fff" weight="regular" />
                ) : (
                  <SpeakerHigh size={19} color="#fff" weight="regular" />
                )}
              </Pressable>
              <View className="flex-1" />
              {file.capabilities.download && (
                <Pressable
                  onPress={saveOriginal}
                  disabled={saving}
                  hitSlop={8}
                  accessibilityLabel="Save to library"
                  className="active:opacity-70"
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <DownloadSimple size={19} color="#fff" weight="regular" />
                  )}
                </Pressable>
              )}
              <Pressable
                onPress={() => viewRef.current?.startPictureInPicture()}
                hitSlop={8}
                accessibilityLabel="Picture in picture"
                className="active:opacity-70"
              >
                <PictureInPicture size={19} color="#fff" weight="regular" />
              </Pressable>
              <Pressable
                onPress={() => viewRef.current?.enterFullscreen()}
                hitSlop={8}
                accessibilityLabel="Full screen"
                className="active:opacity-70"
              >
                <ArrowsOut size={19} color="#fff" weight="regular" />
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

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
  const [selected, setSelected] = useState<StoredFile | null>(null);
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

  const openedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!params.key || openedKey.current === params.key) return;
    const film = files.find((file) => file.key === params.key);
    if (!film) return;
    openedKey.current = params.key;
    setSelected(film);
  }, [files, params.key]);

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
            onPress={() => setSelected(file)}
            style={{ width: tile, height: tile }}
            className="bg-white/[0.04] active:opacity-75"
            accessibilityRole="button"
            accessibilityLabel={`Play ${file.originalName}`}
          >
            {file.posterUrl ? (
              <Image
                source={{ uri: file.posterUrl }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={140}
                recyclingKey={file.key}
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <FilmSlate
                  size={24}
                  color="rgba(255,255,255,.22)"
                  weight="light"
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
    [columns, tile],
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
            <ArrowLeft size={19} color="#fff" weight="regular" />
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

      <Modal
        visible={!!selected}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelected(null)}
      >
        {selected && (
          <VideoPlayer file={selected} onClose={() => setSelected(null)} />
        )}
      </Modal>
    </View>
  );
}

function Empty({ albumId }: { albumId: string }) {
  return (
    <View className="items-center px-8 pt-24">
      <FilmSlate size={40} color="rgba(255,255,255,.22)" weight="light" />
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
        <UploadSimple size={17} color="#fff" weight="regular" />
        <Text className="text-white font-semibold">Upload video</Text>
      </Pressable>
    </View>
  );
}
