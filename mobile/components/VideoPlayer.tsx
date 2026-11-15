import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
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

const SPRING = { damping: 24, stiffness: 240 };
/** The gap between the small player and the edges of the screen. */
const MINI_EDGE = 12;
/** What the small player clears at the bottom: the tab bar, and a bar above it. */
const MINI_LIFT = 96;
const MINI_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.3,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
} as const;

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

  /*
   * Where the picture is: 0 is the whole screen, 1 the card in the corner.
   * A drag moves it between the two under the finger, and the mode follows
   * once the finger lets go.
   */
  const dock = useSharedValue(mode === 'mini' ? 1 : 0);
  useEffect(() => {
    dock.value = withTiming(mode === 'mini' ? 1 : 0, { duration: 240 });
  }, [mode, dock]);

  // The film's own shape when it is known; widescreen until it is.
  const aspect = file.width && file.height ? file.width / file.height : 16 / 9;
  const miniW = Math.min(Math.round(width * 0.56), 240);
  // An upright phone clip would be a tower in the corner; a panorama, a slit.
  const miniH = Math.round(miniW / Math.min(Math.max(aspect, 0.8), 1.9));
  const miniTop = height - miniH - insets.bottom - MINI_LIFT;
  /** Which corner: 1 the right, 0 the left. */
  const side = useSharedValue(1);
  const miniX = useSharedValue(0);
  const miniY = useSharedValue(0);
  const miniOpacity = useSharedValue(1);

  /*
   * How far the picture is magnified to fill the screen: 1 fits it whole,
   * `cover` is where its short side meets the screen. A pinch moves it
   * between the two as the fingers move; it was a switch thrown when they
   * let go, so the picture jumped.
   */
  const cover = Math.max(aspect / (width / height), width / height / aspect);
  const zoom = useSharedValue(1);
  const zoomFrom = useSharedValue(1);

  const frameStyle = useAnimatedStyle(() => {
    const rest = side.value === 1 ? width - miniW - MINI_EDGE : MINI_EDGE;
    return {
      left: interpolate(dock.value, [0, 1], [0, rest]) + miniX.value,
      top: interpolate(dock.value, [0, 1], [0, miniTop]) + miniY.value,
      width: interpolate(dock.value, [0, 1], [width, miniW]),
      height: interpolate(dock.value, [0, 1], [height, miniH]),
      opacity: miniOpacity.value,
      shadowOpacity: 0.3 * dock.value,
      // Raised only once it is the card. On Android a raised view is drawn over
      // its later siblings, and the open film would have covered its own controls.
      elevation: dock.value > 0.95 ? 10 : 0,
    };
  });
  const roundStyle = useAnimatedStyle(() => ({ borderRadius: 14 * dock.value }));
  // The magnifying goes as the picture shrinks: a corner card is the whole frame.
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (zoom.value - 1) * (1 - dock.value) }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: 1 - dock.value }));
  const hudStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(dock.value * 5, 1) }));

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
          if (onRight.value) {
            runOnJS(dragVolume)(event.translationY);
          } else if (onMinimise) {
            // The picture comes down with the finger, shrinking as it goes.
            dock.value = Math.min(Math.max(event.translationY / (height * 0.55), 0), 1);
          }
        })
        .onEnd((event) => {
          if (onRight.value || !onMinimise) return;
          if (event.translationY > height * 0.18 || event.velocityY > 900) {
            dock.value = withTiming(1, { duration: 200 });
            runOnJS(onMinimise)();
          } else {
            dock.value = withSpring(0, SPRING);
          }
        })
        .onFinalize((_event, finished) => {
          if (onRight.value) runOnJS(endVolume)();
          // Taken over by another gesture part-way: back where it was.
          else if (!finished && onMinimise) dock.value = withSpring(0, SPRING);
        }),
    [beginVolume, dragVolume, endVolume, onMinimise, onRight, width, height, dock],
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

  /**
   * Pinched out, the picture grows to fill the screen; in, it fits again.
   * It follows the fingers and settles on whichever of the two they were
   * heading for.
   */
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          zoomFrom.value = zoom.value;
        })
        .onUpdate((event) => {
          // A little past each end, so the picture gives before it stops.
          zoom.value = Math.min(Math.max(zoomFrom.value * event.scale, 0.92), cover * 1.06);
        })
        .onEnd((event) => {
          const to = event.scale > 1.04 ? cover : event.scale < 0.96 ? 1 : zoomFrom.value > 1.01 ? cover : 1;
          zoom.value = withSpring(to, SPRING);
        }),
    [cover, zoom, zoomFrom],
  );

  /*
   * The small player: dragged down and it is gone, dragged across and it
   * settles in the other corner. A tap opens it (the press inside it).
   */
  const miniPan = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .minDistance(8)
        .onUpdate((event) => {
          miniX.value = event.translationX;
          // Up it only leans; there is nowhere up there for it to go.
          miniY.value = event.translationY < 0 ? event.translationY * 0.25 : event.translationY;
        })
        .onEnd((event) => {
          if (event.translationY > 64 || event.velocityY > 900) {
            miniY.value = withTiming(height, { duration: 200 });
            miniOpacity.value = withTiming(0, { duration: 200 }, () => runOnJS(onClose)());
            return;
          }
          const right = width - miniW - MINI_EDGE;
          const at = (side.value === 1 ? right : MINI_EDGE) + event.translationX;
          const next = at + miniW / 2 > width / 2 ? 1 : 0;
          // The corner changes under it without the card jumping, then it settles.
          side.value = next;
          miniX.value = at - (next === 1 ? right : MINI_EDGE);
          miniX.value = withSpring(0, SPRING);
          miniY.value = withSpring(0, SPRING);
        }),
    [height, width, miniW, miniX, miniY, miniOpacity, side, onClose],
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

  // A film that will not play has nothing to show in the corner.
  useEffect(() => {
    if (failed && mode === 'mini') onClose();
  }, [failed, mode, onClose]);

  if (failed && mode === 'mini') return null;

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

  const mini = mode === 'mini';

  /*
   * One frame, in one place in the tree, that is the whole screen when the
   * film is open and a small card in the corner when it is put away.
   *
   * It was two different pieces of JSX: the full player, and a strip along
   * the bottom with a thumbnail an inch wide beside the film's name, which is
   * the audio bar and no way to go on watching anything. Now the picture
   * itself shrinks to the corner under the finger that drags it there, and
   * stays a picture: tap it to open it again, drag it across to the other
   * corner, or down and away to stop.
   */
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, backdropStyle]}
        pointerEvents={mini ? 'none' : 'auto'}
      />

      <GestureDetector gesture={mini ? miniPan : surfaceGesture}>
        <Animated.View style={[{ position: 'absolute' }, MINI_SHADOW, frameStyle]}>
          <Animated.View style={[{ flex: 1, overflow: 'hidden', backgroundColor: '#000' }, roundStyle]}>
            <Animated.View style={[{ flex: 1 }, zoomStyle]}>
              <VideoView
                ref={viewRef}
                player={player}
                style={{ width: '100%', height: '100%' }}
                contentFit={mini ? 'cover' : 'contain'}
                nativeControls={false}
                allowsFullscreen
                allowsPictureInPicture
              />
            </Animated.View>

            {mini && (
              // A press, inside the drag: it gives way to the drag by itself,
              // and the two small buttons on it are ordinary buttons.
              <Pressable
                onPress={onExpand}
                accessibilityRole="button"
                accessibilityLabel={`${file.mediaTitle || file.originalName}. Open the player`}
                accessibilityHint="Drag down to stop, or across to the other corner"
                style={StyleSheet.absoluteFill}
              >
                <LinearGradient
                  colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <Pressable
                  onPress={onClose}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Stop playing"
                  className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-black/55 items-center justify-center active:opacity-70"
                >
                  <XIcon size={16} color="#fff" />
                </Pressable>
                <Pressable
                  onPress={() => {
                    try {
                      if (playing) player.pause();
                      else player.play();
                    } catch {
                      // The player has gone; the card is about to go with it.
                    }
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={playing ? 'Pause' : 'Play'}
                  className="absolute left-1.5 bottom-2.5 w-9 h-9 rounded-full bg-black/55 items-center justify-center active:opacity-70"
                >
                  {/* `fill` repeats the colour: lucide-react-native gives
                      `color` to the stroke alone, so currentColor would come
                      out hollow. */}
                  {playing ? (
                    <PauseIcon size={16} color="#fff" fill="#fff" />
                  ) : (
                    <PlayIcon size={16} color="#fff" fill="#fff" />
                  )}
                </Pressable>
                <View pointerEvents="none" className="absolute left-0 right-0 bottom-0 h-[3px] bg-white/25">
                  <View
                    className="h-full bg-white"
                    style={{ width: `${duration > 0 ? Math.min((position / duration) * 100, 100) : 0}%` }}
                  />
                </View>
              </Pressable>
            )}
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {/* Everything drawn over the open film. It goes as the film starts to
          shrink, so nothing is left hanging in the air above a small picture. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, hudStyle]}
        pointerEvents={mini ? 'none' : 'box-none'}
      >
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
        // Its place as a style, not a class: with an animated style beside it the
        // class is dropped on the web, and the controls piled up in a corner.
        style={[StyleSheet.absoluteFill, controlsStyle]}
        pointerEvents={shown && scrub === null && volume === null ? 'box-none' : 'none'}
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
