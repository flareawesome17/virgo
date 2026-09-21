import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  DownloadIcon,
  FilmIcon,
  Maximize2Icon,
  PauseIcon,
  PictureInPicture2Icon,
  PlayIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { MediaScrubber } from '@/components/MediaScrubber';
import { type StoredFile } from '@/src/api';

for (const Icon of [
  ArrowLeftIcon, ArrowRightIcon, ChevronDownIcon, DownloadIcon, FilmIcon,
  Maximize2Icon, PauseIcon, PictureInPicture2Icon, PlayIcon, Volume2Icon,
  VolumeXIcon, XIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * The film player.
 *
 * Lifted out of the videos screen unchanged. It used to be defined inside that
 * file and rendered from a Modal there, which tied a playing video to one
 * screen being mounted — so navigating anywhere stopped it. It is a component
 * of its own now so VideoSurface can keep it alive above the navigator, which
 * is what lets playback survive going back to the album.
 *
 * Everything below this line is as it was: the HLS ladder preference, the
 * stall detector, saving the original, the guarded player calls.
 */

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
export function VideoPlayer({
  file,
  onClose,
  mode = 'full',
  onMinimise,
  onExpand,
}: {
  file: StoredFile;
  onClose: () => void;
  /**
   * How much of the screen this has. The player is never unmounted to shrink
   * it — that would stop playback — so the mode changes how it draws.
   */
  mode?: 'full' | 'mini';
  onMinimise?: () => void;
  onExpand?: () => void;
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

  /**
   * Whether the controls are up, as state rather than only as a ref.
   *
   * The ref is read synchronously by the tap handler and cannot drive a
   * render; this can, and `pointerEvents` has to follow visibility or the
   * overlay keeps swallowing taps while invisible. See the overlay below.
   */
  const [shown, setShown] = useState(true);

  const setControls = useCallback(
    (next: boolean) => {
      visible.current = next;
      setShown(next);
      controls.value = withTiming(next ? 1 : 0, { duration: 180 });
    },
    [controls],
  );

  const reveal = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playing) {
      hideTimer.current = setTimeout(() => setControls(false), 4500);
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

      // Guarded, because this runs as the player is going away and there is
      // no ordering guarantee between this cleanup and expo-video releasing
      // the native instance underneath it. Calling a method on a released
      // player raises from native, and an exception thrown in a cleanup
      // function is not caught by anything — it takes the app with it.
      //
      // Closing a video and opening another is exactly the sequence that hits
      // this, which is what "it crashed when I replay the video" describes.
      // A pause that does not happen because the player is already gone has
      // cost nothing; the player is gone.
      try {
        player.pause();
      } catch {
        // Already released.
      }
    };
  }, [player, setControls]);

  useEffect(() => {
    reveal();
  }, [reveal]);

  const skip = useCallback((seconds: number) => {
    player.currentTime = Math.max(
      0,
      Math.min(player.currentTime + seconds, duration || player.duration || 0),
    );
    void Haptics.selectionAsync();
    reveal();
  }, [duration, player, reveal]);

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

  /**
   * Swipe down to put the film in the corner.
   *
   * Only downward, and only past a distance a scroll would not travel, so it
   * cannot be triggered by the small vertical drift in a horizontal swipe.
   * `activeOffsetY` keeps the gesture from claiming the touch until it is
   * clearly a downward drag, which leaves taps to the recogniser above.
   */
  const swipeDown = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(18)
        .failOffsetY(-18)
        .onEnd((event) => {
          if (event.translationY > 90 && onMinimise) runOnJS(onMinimise)();
        }),
    [onMinimise],
  );

  /**
   * Double-tap a side to jump ten seconds, the way every player does now.
   *
   * Exclusive, so a double tap does not also fire the single tap that toggles
   * the controls — without that, jumping forward would hide the chrome at the
   * same moment somebody is looking at it.
   */
  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd((event) => {
          runOnJS(skip)(event.x < width / 2 ? -SKIP : SKIP);
        }),
    [skip, width],
  );

  const surfaceGesture = useMemo(
    () => Gesture.Race(swipeDown, Gesture.Exclusive(doubleTap, tap)),
    [swipeDown, doubleTap, tap],
  );

  const controlsStyle = useAnimatedStyle(() => ({ opacity: controls.value }));

  if (failed) {
    return (
      <SafeAreaView
        edges={['top', 'bottom']}
        className="flex-1 bg-black items-center justify-center px-8"
      >
        <FilmIcon size={44} color="rgba(255,255,255,.3)" strokeWidth={1.5} />
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
              // Same guard as the cleanup above: a source swap on a player
              // that has gone away should leave the error on screen, not
              // close the app.
              try {
                player.replace(playbackUrl);
                player.play();
              } catch {
                setFailed('stalled');
              }
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
              <DownloadIcon size={17} color="#fff" />
            )}
            <Text className="text-white font-semibold">Save the original</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onClose}
          className="absolute top-12 left-4 w-10 h-10 rounded-full bg-white/10 items-center justify-center active:opacity-70"
        >
          <XIcon size={19} color="#fff" />
        </Pressable>
      </SafeAreaView>
    );
  }

  /**
   * The docked strip.
   *
   * Rendered from the same component, and above all from the same `player`,
   * so minimising is a change of layout rather than a teardown — unmounting
   * to shrink would stop the film, which is the one thing this exists to
   * avoid.
   *
   * Deliberately sparse: a still of the video, what it is, play or pause, and
   * a way out. Everything else is a tap away in the full player, and a strip
   * this size cannot hold more without becoming a row of targets too small to
   * hit.
   */
  if (mode === 'mini') {
    return (
      <Pressable
        onPress={onExpand}
        accessibilityRole="button"
        accessibilityLabel={`${file.mediaTitle || file.originalName}, tap to expand`}
        className="flex-row items-center gap-3 border-t border-white/10 bg-[#221d1a] px-2.5 py-2 active:opacity-90"
      >
        <View className="h-[34px] w-[58px] overflow-hidden rounded-md bg-black">
          <VideoView
            ref={viewRef}
            player={player}
            style={{ width: 58, height: 34 }}
            contentFit="cover"
            nativeControls={false}
          />
        </View>

        <View className="min-w-0 flex-1">
          <Text className="text-[12px] font-semibold text-white" numberOfLines={1}>
            {file.mediaTitle || file.originalName}
          </Text>
          <Text className="text-[10px] text-white/45" numberOfLines={1}>
            {playing ? 'Playing' : 'Paused'}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            try {
              if (playing) player.pause();
              else player.play();
            } catch {
              // The player has gone; the strip is about to unmount with it.
            }
          }}
          hitSlop={10}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          className="active:opacity-70"
        >
          {/* `fill` repeats the colour: lucide-react-native gives `color` to
              the stroke alone, so currentColor would come out hollow. */}
          {playing ? (
            <PauseIcon size={18} color="#fff" fill="#fff" />
          ) : (
            <PlayIcon size={18} color="#fff" fill="#fff" />
          )}
        </Pressable>

        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityLabel="Stop playing"
          className="active:opacity-70"
        >
          <XIcon size={17} color="rgba(255,255,255,.55)" />
        </Pressable>

        {/* The only progress a strip this size has room for. */}
        <View className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/10">
          <View
            className="h-full bg-[#C17745]"
            style={{
              width: `${duration > 0 ? Math.min((position / duration) * 100, 100) : 0}%`,
            }}
          />
        </View>
      </Pressable>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <GestureDetector gesture={surfaceGesture}>
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

      {/*
        `none` while hidden, not `box-none`.

        box-none stops this container capturing taps but leaves its children
        capturing them, and opacity does not change that — so at opacity 0 the
        transport row, which is `flex-1` across the middle of the screen, went
        on swallowing every tap. Tapping the centre to bring the controls back
        hit an invisible skip button instead of the gesture below, the controls
        never returned, and the close button stayed unreachable behind them.
      */}
      <Animated.View
        style={controlsStyle}
        pointerEvents={shown ? 'box-none' : 'none'}
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
            {/* Down, not a cross. The gesture is a swipe down and the icon
                should say the same thing — this puts the film in the corner
                and leaves it playing, which a cross would promise to stop. */}
            <Pressable
              onPress={onMinimise ?? onClose}
              hitSlop={8}
              accessibilityLabel={onMinimise ? 'Minimise' : 'Close'}
              className="w-10 h-10 rounded-full bg-black/45 items-center justify-center active:opacity-70"
            >
              <ChevronDownIcon size={20} color="#fff" />
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
            <ArrowLeftIcon size={26} color="#fff" />
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
              <PauseIcon size={30} color="#fff" fill="#fff" />
            ) : (
              <PlayIcon size={30} color="#fff" fill="#fff" />
            )}
          </Pressable>
          <Pressable
            onPress={() => skip(SKIP)}
            hitSlop={10}
            accessibilityLabel={`Forward ${SKIP} seconds`}
            className="items-center active:opacity-70"
          >
            <ArrowRightIcon size={26} color="#fff" />
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
                  <VolumeXIcon size={19} color="#fff" />
                ) : (
                  <Volume2Icon size={19} color="#fff" />
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
                    <DownloadIcon size={19} color="#fff" />
                  )}
                </Pressable>
              )}
              <Pressable
                onPress={() => viewRef.current?.startPictureInPicture()}
                hitSlop={8}
                accessibilityLabel="Picture in picture"
                className="active:opacity-70"
              >
                <PictureInPicture2Icon size={19} color="#fff" />
              </Pressable>
              <Pressable
                onPress={() => viewRef.current?.enterFullscreen()}
                hitSlop={8}
                accessibilityLabel="Full screen"
                className="active:opacity-70"
              >
                <Maximize2Icon size={19} color="#fff" />
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}
