import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { canSaveToPhotos } from '@/src/lib/photo-permission';
import { pauseAlbumAudio } from '@/src/providers/AlbumAudioProvider';
import { registerDockedPause } from '@/src/providers/VideoPlayerProvider';
import {
  useVideoPlayer,
  VideoView,
  type VideoPlayerStatus,
  type VideoView as VideoViewType,
} from 'expo-video';
import {
  ChevronDownIcon,
  DownloadIcon,
  FilmIcon,
  HeartIcon,
  Maximize2Icon,
  PauseIcon,
  PictureInPicture2Icon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { MediaScrubber } from '@/components/MediaScrubber';
import { clock } from '@/src/lib/media-grid';
import { type StoredFile } from '@/src/api';

for (const Icon of [
  ChevronDownIcon, DownloadIcon, FilmIcon, HeartIcon, Maximize2Icon, PauseIcon,
  PictureInPicture2Icon, PlayIcon, RotateCcwIcon, RotateCwIcon, Volume2Icon,
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
/** A client's pick, on black: the brand terracotta is too dark there. */
const PICK = '#E79A6F';

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
  const insets = useSafeAreaInsets();
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

  // So a showcase film can pause this one (pauseDockedFilm).
  useEffect(() => {
    registerDockedPause(() => player.pause());
    return () => registerDockedPause(null);
  }, [player]);

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
      // Album audio would otherwise go on under the film.
      if (isPlaying) pauseAlbumAudio();
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
      if (!(await canSaveToPhotos('this video'))) return;
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

  // ── Gestures that belong to a film: all of them move through time or sound ──

  /** Where a sideways drag began, and where it has reached, in seconds. */
  const scrubFrom = useRef(0);
  const [scrub, setScrub] = useState<number | null>(null);
  // A full sweep of the screen is the whole film, or two minutes of a long
  // one: across a forty-minute ceremony the whole film would make a thumb's
  // width ten minutes, and nothing could be found.
  const sweep = Math.min(Math.max(duration, 1), 120);
  const scrubTo = useCallback(
    (dx: number) => Math.max(0, Math.min(scrubFrom.current + (dx / width) * sweep, duration || 0)),
    [duration, sweep, width],
  );
  const beginScrub = useCallback(() => {
    try {
      scrubFrom.current = player.currentTime;
    } catch {
      scrubFrom.current = 0;
    }
    setScrub(scrubFrom.current);
  }, [player]);
  const dragScrub = useCallback((dx: number) => setScrub(scrubTo(dx)), [scrubTo]);
  const endScrub = useCallback(
    (dx: number) => {
      const to = scrubTo(dx);
      try {
        player.currentTime = to;
      } catch {
        // Released: there is nothing to seek.
      }
      setPosition(to);
      setScrub(null);
      void Haptics.selectionAsync();
    },
    [player, scrubTo],
  );
  const scrubPan = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .activeOffsetX([-16, 16])
        .failOffsetY([-14, 14])
        .onStart(() => runOnJS(beginScrub)())
        .onUpdate((event) => runOnJS(dragScrub)(event.translationX))
        .onEnd((event) => runOnJS(endScrub)(event.translationX))
        .onFinalize((_event, finished) => {
          if (!finished) runOnJS(setScrub)(null);
        }),
    [beginScrub, dragScrub, endScrub],
  );

  /** The film's own loudness, 0 to 1, while the right edge is being dragged. */
  const volumeFrom = useRef(1);
  const [volume, setVolume] = useState<number | null>(null);
  const beginVolume = useCallback(() => {
    try {
      volumeFrom.current = player.muted ? 0 : player.volume;
    } catch {
      volumeFrom.current = 1;
    }
    setVolume(volumeFrom.current);
  }, [player]);
  const dragVolume = useCallback(
    (dy: number) => {
      const next = Math.max(0, Math.min(volumeFrom.current - dy / (height * 0.35), 1));
      try {
        player.volume = next;
        player.muted = next === 0;
      } catch {
        // Released.
      }
      setMuted(next === 0);
      setVolume(next);
    },
    [height, player],
  );
  const endVolume = useCallback(() => setVolume(null), []);

  /**
   * One vertical drag, and where it began decides what it is: the right third
   * is loudness, up and down; anywhere else, down puts the film in the corner.
   *
   * One recogniser rather than two racing: two vertical pans over the same
   * picture each waited on the other, and neither began.
   */
  const onRight = useSharedValue(false);
  const vertical = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .activeOffsetY([-16, 16])
        .failOffsetX([-18, 18])
        .onStart((event) => {
          onRight.value = event.x > width * 0.66;
          if (onRight.value) runOnJS(beginVolume)();
        })
        .onUpdate((event) => {
          if (onRight.value) runOnJS(dragVolume)(event.translationY);
        })
        .onEnd((event) => {
          if (!onRight.value && event.translationY > 90 && onMinimise) runOnJS(onMinimise)();
        })
        .onFinalize(() => {
          if (onRight.value) runOnJS(endVolume)();
        }),
    [beginVolume, dragVolume, endVolume, onMinimise, onRight, width],
  );

  /** Held: twice the speed, for as long as the finger stays. */
  const [fast, setFast] = useState(false);
  const isFast = useRef(false);
  const beginFast = useCallback(() => {
    try {
      player.playbackRate = 2;
    } catch {
      return;
    }
    isFast.current = true;
    setFast(true);
    void Haptics.selectionAsync();
  }, [player]);
  const endFast = useCallback(() => {
    if (!isFast.current) return;
    isFast.current = false;
    try {
      player.playbackRate = 1;
    } catch {
      // Released.
    }
    setFast(false);
  }, [player]);
  const hold = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(350)
        .maxDistance(12)
        .onStart(() => runOnJS(beginFast)())
        .onFinalize(() => runOnJS(endFast)()),
    [beginFast, endFast],
  );

  /** Pinched out, the picture fills the screen; in, it fits again. */
  const [fill, setFill] = useState(false);
  const pinch = useMemo(
    () =>
      Gesture.Pinch().onEnd((event) => {
        if (event.scale > 1.15) runOnJS(setFill)(true);
        else if (event.scale < 0.87) runOnJS(setFill)(false);
      }),
    [],
  );

  /**
   * Double-tap a side to jump ten seconds, the way every player does now.
   *
   * Exclusive, so a double tap does not also fire the single tap that toggles
   * the controls — without that, jumping forward would hide the chrome at the
   * same moment somebody is looking at it. The hold comes first for the same
   * reason: half a second of holding was a tap as well.
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
    () =>
      Gesture.Simultaneous(
        pinch,
        Gesture.Race(vertical, scrubPan, Gesture.Exclusive(hold, doubleTap, tap)),
      ),
    [pinch, vertical, scrubPan, hold, doubleTap, tap],
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
        <Pressable accessibilityRole="button" accessibilityLabel="Close"
          onPress={onClose}
          className="absolute top-12 left-4 w-11 h-11 rounded-full bg-white/10 items-center justify-center active:opacity-70"
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
        className="flex-row items-center gap-3 border-t border-white/10 bg-[#221d1a] px-2.5 pt-2 active:opacity-90"
        // The strip is the bottom of the screen when docked (VideoSurface),
        // and its controls sat under the iPhone's home indicator.
        style={{ paddingBottom: 8 + insets.bottom }}
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

        {/* The only progress a strip this size has room for. Along the top
            edge, where the home indicator cannot hide it. */}
        <View className="absolute top-0 left-0 right-0 h-[2px] bg-white/10">
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
            contentFit={fill ? 'cover' : 'contain'}
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

      {/* What a gesture is doing, said where the finger is not. Outside the
          fading chrome: these belong to the gesture, and go when it does. */}
      {fast && (
        <View pointerEvents="none" className="absolute left-0 right-0 items-center" style={{ top: insets.top + 60 }}>
          <View className="rounded-full bg-black/60 px-3.5 py-1.5">
            <Text className="text-white text-[13px] font-semibold">2× speed</Text>
          </View>
        </View>
      )}
      {scrub !== null && (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <View className="rounded-2xl bg-black/65 px-5 py-3 items-center">
            <Text className="text-white text-[22px] font-bold" style={{ fontVariant: ['tabular-nums'] }}>
              {clock(scrub)}
            </Text>
            <Text className="text-white/65 text-[12px]" style={{ fontVariant: ['tabular-nums'] }}>
              of {clock(duration)}
            </Text>
          </View>
        </View>
      )}
      {volume !== null && (
        <View
          pointerEvents="none"
          className="absolute right-5 items-center gap-2"
          style={{ top: height * 0.3, height: height * 0.35 }}
        >
          <View className="flex-1 w-1.5 rounded-full bg-white/25 overflow-hidden justify-end">
            <View className="w-full rounded-full bg-white" style={{ height: `${Math.round(volume * 100)}%` }} />
          </View>
          {volume === 0 ? <VolumeXIcon size={18} color="#fff" /> : <Volume2Icon size={18} color="#fff" />}
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
        pointerEvents={shown && scrub === null && volume === null ? 'box-none' : 'none'}
        className="absolute inset-0"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 150 }}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.82)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 230 }}
          pointerEvents="none"
        />

        <SafeAreaView edges={['top']} className="absolute top-0 left-0 right-0">
          <View className="px-2 pt-1 flex-row items-center">
            {/* Down, not a cross. The gesture is a swipe down and the icon
                should say the same thing — this puts the film in the corner
                and leaves it playing, which a cross would promise to stop. */}
            <Pressable
              onPress={onMinimise ?? onClose}
              accessibilityRole="button"
              accessibilityLabel={onMinimise ? 'Minimise' : 'Close'}
              className="w-11 h-11 items-center justify-center active:opacity-60"
            >
              <ChevronDownIcon size={26} color="#fff" />
            </Pressable>
            <View className="flex-1 min-w-0 items-center">
              <Text className="text-white text-[15px] leading-5 font-semibold" numberOfLines={1}>
                {file.mediaTitle || file.originalName}
              </Text>
              <View className="flex-row items-center gap-1.5">
                {file.picked ? <HeartIcon size={11} color={PICK} fill={PICK} /> : null}
                <Text className="text-white/60 text-[12px] leading-4" numberOfLines={1}>
                  {file.picked ? 'Picked by your client · ' : ''}
                  {dayLabel(file)}
                </Text>
              </View>
            </View>
            {/* And a way to stop it. There was only minimise, so the film went
                on playing in the corner whether you wanted it or not. */}
            {onMinimise ? (
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                className="w-11 h-11 items-center justify-center active:opacity-60"
              >
                <XIcon size={22} color="#fff" />
              </Pressable>
            ) : (
              <View className="w-11" />
            )}
          </View>
        </SafeAreaView>

        {/* Transport in the middle, where a thumb reaches without moving the
            phone, and where iOS puts it. It steps aside while the video is
            loading so the spinner has the centre to itself. */}
        <View
          className="flex-1 flex-row items-center justify-center gap-9"
          pointerEvents={status === 'loading' ? 'none' : 'box-none'}
          style={{ opacity: status === 'loading' ? 0 : 1 }}
        >
          <Pressable
            onPress={() => skip(-SKIP)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Back ${SKIP} seconds`}
            className="w-12 h-12 rounded-full bg-black/40 items-center justify-center active:opacity-70"
          >
            <RotateCcwIcon size={22} color="#fff" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'}
            onPress={() => {
              if (playing) player.pause();
              else player.play();
              reveal();
            }}
            className="w-[68px] h-[68px] rounded-full bg-black/50 items-center justify-center active:opacity-70"
          >
            {playing ? (
              <PauseIcon size={28} color="#fff" fill="#fff" />
            ) : (
              <PlayIcon size={28} color="#fff" fill="#fff" />
            )}
          </Pressable>
          <Pressable
            onPress={() => skip(SKIP)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Forward ${SKIP} seconds`}
            className="w-12 h-12 rounded-full bg-black/40 items-center justify-center active:opacity-70"
          >
            <RotateCwIcon size={22} color="#fff" />
          </Pressable>
        </View>

        <SafeAreaView
          edges={['bottom']}
          className="absolute bottom-0 left-0 right-0"
        >
          <View className="px-5">
            <MediaScrubber
              position={position}
              duration={duration}
              accent="#FFFFFF"
              onSeek={(seconds) => {
                player.currentTime = seconds;
                setPosition(seconds);
                reveal();
              }}
            />
          </View>
          {/* Each with its word, as on a photo. They were four bare glyphs in a
              row, two of them rectangles with arrows. */}
          <View className="flex-row px-2 pt-1 pb-1">
            <FilmAction
              label={muted ? 'Sound off' : 'Sound'}
              onPress={() => {
                const next = !muted;
                player.muted = next;
                if (!next && player.volume === 0) player.volume = 1;
                setMuted(next);
                reveal();
              }}
            >
              {muted ? <VolumeXIcon size={22} color="#fff" /> : <Volume2Icon size={22} color="#fff" />}
            </FilmAction>
            {file.capabilities.download && (
              <FilmAction label="Save" onPress={saveOriginal} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <DownloadIcon size={22} color="#fff" />}
              </FilmAction>
            )}
            <FilmAction label="Pop out" onPress={() => viewRef.current?.startPictureInPicture()}>
              <PictureInPicture2Icon size={22} color="#fff" />
            </FilmAction>
            <FilmAction label="Full screen" onPress={() => viewRef.current?.enterFullscreen()}>
              <Maximize2Icon size={22} color="#fff" />
            </FilmAction>
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

function FilmAction({
  children,
  label,
  onPress,
  disabled,
}: {
  children: ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 h-14 items-center justify-center gap-1 active:opacity-60"
    >
      {children}
      <Text className="text-white/75 text-[12px] leading-4 font-medium">{label}</Text>
    </Pressable>
  );
}

/** "21 December", from the camera when it wrote a date, else the upload day. */
function dayLabel(file: StoredFile): string {
  const [y, m, d] = (file.takenAt ?? file.createdAt).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}
