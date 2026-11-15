import { useCallback } from 'react';
import { ActivityIndicator, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
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
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { InsetFrame } from '@/components/InsetFrame';
import { MediaScrubber } from '@/components/MediaScrubber';
import { RemoteImage } from '@/components/RemoteImage';
import { recordedLabel } from '@/components/Recordings';
import { useAlbumAudio } from '@/src/providers/AlbumAudioProvider';

for (const Icon of [
  ChevronDownIcon, MusicIcon, PauseIcon, PlayIcon, Repeat1Icon, RepeatIcon,
  RotateCcwIcon, RotateCwIcon, ShuffleIcon, SkipBackIcon, SkipForwardIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * The player's own ground and ink, the same in both themes.
 *
 * It is the app's dark card (the one "Next up" is) grown to a whole screen,
 * and a player is dark in either theme: the scrubber and the cover are read
 * against it, in a room that is often dim.
 */
const GROUND = '#1E1B18';
const INK = '#FFF8F4';
const QUIET = 'rgba(255,248,244,0.62)';
const ON = '#E79A6F';

const SPRING = { damping: 22, stiffness: 220 };
/** Playback speeds, cycled by the pill. */
const RATES = [0.5, 1, 1.25, 1.5, 2];
const SEEK = 15;

/**
 * A recording, playing, with the whole screen to itself.
 *
 * The gestures here are a recording's and nobody else's, and all of them move
 * between recordings or through one: the cover swipes sideways to the next or
 * the last, a double tap on either half of it jumps fifteen seconds, and the
 * whole player drags down into the bar it came from.
 */
export function NowPlaying({ onClose }: { onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const audio = useAlbumAudio();
  const file = audio.current;
  // Room for the title, the scrubber and two rows of controls under it on a
  // short phone; the cover gives way first.
  const art = Math.min(width - 80, 330, Math.max(180, height - 500));

  const slide = useSharedValue(0);
  const sink = useSharedValue(0);

  const turn = useCallback(
    (direction: 1 | -1) => {
      void Haptics.selectionAsync();
      if (direction === 1) audio.next();
      else audio.previous();
    },
    [audio],
  );
  const jump = useCallback(
    (seconds: number) => {
      void Haptics.selectionAsync();
      audio.seekBy(seconds);
    },
    [audio],
  );

  /** Sideways on the cover: the next recording, or the one before. */
  const sideways = Gesture.Pan()
    .maxPointers(1)
    .activeOffsetX([-16, 16])
    .failOffsetY([-14, 14])
    .onUpdate((event) => {
      slide.value = event.translationX;
    })
    .onEnd((event) => {
      const far = Math.abs(event.translationX) > 64 || Math.abs(event.velocityX) > 700;
      if (far) {
        const direction = event.translationX < 0 ? 1 : -1;
        // Off the way it was thrown, and the next one in from the other side.
        slide.value = withTiming(-direction * width, { duration: 140 }, () => {
          slide.value = direction * width * 0.5;
          slide.value = withSpring(0, SPRING);
        });
        runOnJS(turn)(direction);
      } else {
        slide.value = withSpring(0, SPRING);
      }
    });

  /** Down, anywhere above the controls: back into the bar. */
  const down = () =>
    Gesture.Pan()
    .maxPointers(1)
    .activeOffsetY(16)
    .failOffsetX([-18, 18])
    .onUpdate((event) => {
      sink.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > 110 || event.velocityY > 900) runOnJS(onClose)();
      sink.value = withSpring(0, SPRING);
    });
  // One each: a gesture belongs to a single detector.
  const downward = down();
  const headerDown = down();

  const twice = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      runOnJS(jump)(event.x < art / 2 ? -SEEK : SEEK);
    });

  const coverGesture = Gesture.Race(sideways, downward, twice);

  const coverStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value }],
    opacity: 1 - Math.min(Math.abs(slide.value) / width, 0.6),
  }));
  const sinkStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sink.value * 0.6 }] }));

  if (!file) return null;

  const nextRate = () => audio.setRate(RATES[(RATES.indexOf(audio.rate) + 1) % RATES.length]);

  return (
    // A <Modal> is a root of its own on Android, and gestures inside one need
    // a root view of their own or none of them begin.
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: GROUND }}>
      <InsetFrame edges={['top', 'bottom']} className="flex-1" modal>
        <GestureDetector gesture={headerDown}>
          <View className="px-2 pt-1 flex-row items-center">
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close player"
              className="w-11 h-11 items-center justify-center active:opacity-60"
            >
              <ChevronDownIcon size={26} color={INK} />
            </Pressable>
            <View className="flex-1 min-w-0 items-center">
              <Text style={{ color: INK }} className="text-[15px] leading-5 font-semibold" numberOfLines={1}>
                {audio.albumName}
              </Text>
              <Text style={{ color: QUIET }} className="text-[12px] leading-4">
                {audio.currentIndex + 1} of {audio.queue.length}
              </Text>
            </View>
            {/* Stopping is here, in words. The bar had a cross for it, beside
                pause, where it was hit by mistake. */}
            <Pressable
              onPress={() => {
                onClose();
                audio.stop();
              }}
              accessibilityRole="button"
              accessibilityLabel="Stop and close"
              className="h-11 px-3 items-center justify-center active:opacity-60"
            >
              <Text style={{ color: QUIET }} className="text-[14px] font-semibold">
                Stop
              </Text>
            </Pressable>
          </View>
        </GestureDetector>

        <Animated.View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, sinkStyle]}>
          <GestureDetector gesture={coverGesture}>
            <Animated.View
              style={[{ width: art, height: art }, coverStyle]}
              accessible
              accessibilityLabel="Album cover. Swipe sideways for the next or the previous recording"
            >
              {audio.artworkUrl ? (
                <RemoteImage
                  source={{ uri: audio.artworkUrl }}
                  style={{ width: art, height: art, borderRadius: 24 }}
                  contentFit="cover"
                  transition={160}
                />
              ) : (
                <View
                  style={{ width: art, height: art, borderRadius: 24, backgroundColor: 'rgba(255,248,244,0.08)' }}
                  className="items-center justify-center"
                >
                  {/* Outlined: Lucide draws the stems and beam as one open
                      path, and filling it paints a block between the stems. */}
                  <MusicIcon size={Math.round(art * 0.3)} color={ON} />
                </View>
              )}
            </Animated.View>
          </GestureDetector>
        </Animated.View>

        <View className="px-7 pb-3">
          <Text
            style={{ color: INK }}
            className="text-[24px] leading-[30px] font-bold tracking-[-0.5px]"
            numberOfLines={1}
            accessibilityRole="header"
          >
            {file.mediaTitle || file.originalName}
          </Text>
          <Text style={{ color: audio.unplayable ? ON : QUIET }} className="text-[14px] leading-5 mt-0.5" numberOfLines={1}>
            {audio.unplayable ? "This file can't be played" : file.mediaArtist || recordedLabel(file)}
          </Text>

          <View className="mt-5">
            <MediaScrubber position={audio.position} duration={audio.duration} onSeek={audio.seekTo} accent={INK} />
          </View>

          <View className="flex-row items-center justify-between mt-3 -mx-2">
            <Pressable
              onPress={() => {
                audio.setShuffle(!audio.shuffle);
                void Haptics.selectionAsync();
              }}
              accessibilityRole="switch"
              accessibilityState={{ checked: audio.shuffle }}
              accessibilityLabel="Shuffle"
              className="w-11 h-11 items-center justify-center active:opacity-60"
            >
              <ShuffleIcon size={20} color={audio.shuffle ? ON : QUIET} strokeWidth={audio.shuffle ? 2.5 : 2} />
            </Pressable>
            <Pressable
              onPress={audio.previous}
              accessibilityRole="button"
              accessibilityLabel="Previous recording"
              className="w-12 h-12 items-center justify-center active:opacity-60"
            >
              <SkipBackIcon size={26} color={INK} fill={INK} />
            </Pressable>
            {/* Cream on the dark ground: the one filled control here, as the
                terracotta button is on a light screen. */}
            <Pressable
              onPress={audio.toggle}
              disabled={audio.unplayable}
              accessibilityRole="button"
              accessibilityLabel={audio.playing ? 'Pause' : 'Play'}
              style={{ backgroundColor: INK }}
              className="w-[68px] h-[68px] rounded-full items-center justify-center active:scale-[0.94]"
            >
              {audio.loading ? (
                <ActivityIndicator color={GROUND} />
              ) : audio.playing ? (
                <PauseIcon size={26} color={GROUND} fill={GROUND} />
              ) : (
                <PlayIcon size={28} color={GROUND} fill={GROUND} />
              )}
            </Pressable>
            <Pressable
              onPress={audio.next}
              accessibilityRole="button"
              accessibilityLabel="Next recording"
              className="w-12 h-12 items-center justify-center active:opacity-60"
            >
              <SkipForwardIcon size={26} color={INK} fill={INK} />
            </Pressable>
            <Pressable
              onPress={() => {
                audio.cycleRepeat();
                void Haptics.selectionAsync();
              }}
              accessibilityRole="button"
              accessibilityLabel={
                audio.repeat === 'one' ? 'Repeating this one' : audio.repeat === 'all' ? 'Repeating all' : 'Repeat is off'
              }
              className="w-11 h-11 items-center justify-center active:opacity-60"
            >
              {audio.repeat === 'one' ? (
                <Repeat1Icon size={20} color={ON} />
              ) : (
                <RepeatIcon size={20} color={audio.repeat === 'all' ? ON : QUIET} />
              )}
            </Pressable>
          </View>

          <View className="flex-row items-center justify-between mt-3">
            <Pressable
              onPress={() => audio.seekBy(-SEEK)}
              accessibilityRole="button"
              accessibilityLabel={`Back ${SEEK} seconds`}
              className="h-11 flex-row items-center gap-1.5 active:opacity-60"
            >
              <RotateCcwIcon size={18} color={QUIET} />
              <Text style={{ color: QUIET }} className="text-[14px] font-medium">
                {SEEK} s
              </Text>
            </Pressable>
            <Pressable
              onPress={nextRate}
              accessibilityRole="button"
              accessibilityLabel={`Playback speed, ${audio.rate} times`}
              style={{ backgroundColor: 'rgba(255,248,244,0.12)' }}
              className="h-9 px-3.5 rounded-full items-center justify-center active:opacity-60"
            >
              <Text style={{ color: INK }} className="text-[14px] font-semibold">
                {audio.rate}× speed
              </Text>
            </Pressable>
            <Pressable
              onPress={() => audio.seekBy(SEEK)}
              accessibilityRole="button"
              accessibilityLabel={`Forward ${SEEK} seconds`}
              className="h-11 flex-row items-center gap-1.5 active:opacity-60"
            >
              <Text style={{ color: QUIET }} className="text-[14px] font-medium">
                {SEEK} s
              </Text>
              <RotateCwIcon size={18} color={QUIET} />
            </Pressable>
          </View>
        </View>
      </InsetFrame>
    </GestureHandlerRootView>
  );
}
