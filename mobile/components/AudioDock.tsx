import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { MusicIcon, PauseIcon, PlayIcon, SkipForwardIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { NowPlaying } from '@/components/NowPlaying';
import { useTheme } from '@/src/hooks';
import { clock } from '@/src/lib/media-grid';
import { useAlbumAudio } from '@/src/providers/AlbumAudioProvider';
import { PALETTES } from '@/theme';

for (const Icon of [MusicIcon, PauseIcon, PlayIcon, SkipForwardIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const SPRING = { damping: 22, stiffness: 220 };

/**
 * What is playing, wherever you are: one dark bar above the bottom of the
 * screen, and the full player behind it.
 *
 * The app's one inverted card, as "Next up" is on the Dashboard: there is one
 * thing playing, and it is the one thing on the screen drawn this way. It was
 * a strip of the page's own colour with a hairline, which read as part of
 * whatever screen it sat under.
 *
 * It answers three gestures of its own. A tap, or a swipe up, opens the
 * player; a swipe sideways goes to the next recording or the one before,
 * without opening anything. It takes the home indicator's inset, and the
 * screens above stop padding for it.
 */
export function AudioDock({ children }: { children: ReactNode }) {
  const audio = useAlbumAudio();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [open, setOpen] = useState(false);

  const showing = !!audio.current;

  // The same object until it changes: the provider updates on every tick of
  // playback, and a new inset object each time re-rendered every screen.
  const below = useMemo(() => (showing ? { ...insets, bottom: 0 } : insets), [showing, insets]);

  const lean = useSharedValue(0);
  const expand = useCallback(() => setOpen(true), []);
  const turn = useCallback(
    (direction: 1 | -1) => {
      void Haptics.selectionAsync();
      if (direction === 1) audio.next();
      else audio.previous();
    },
    [audio],
  );

  const swipe = Gesture.Pan()
    .maxPointers(1)
    .minDistance(12)
    .onUpdate((event) => {
      // Sideways it follows the finger a little; upward it is on its way open.
      lean.value = Math.abs(event.translationX) > Math.abs(event.translationY) ? event.translationX * 0.4 : 0;
    })
    .onEnd((event) => {
      const sideways = Math.abs(event.translationX) > Math.abs(event.translationY);
      if (sideways && (Math.abs(event.translationX) > 56 || Math.abs(event.velocityX) > 700)) {
        runOnJS(turn)(event.translationX < 0 ? 1 : -1);
      } else if (!sideways && (event.translationY < -28 || event.velocityY < -600)) {
        runOnJS(expand)();
      }
      lean.value = withSpring(0, SPRING);
    });

  const leanStyle = useAnimatedStyle(() => ({ transform: [{ translateX: lean.value }] }));

  const file = audio.current;
  // On the dark card of the light theme the terracotta is too dark to read;
  // on the cream card of the dark theme it is right.
  const progress = isDark ? palette.primary : '#E79A6F';

  return (
    <View className="flex-1">
      <SafeAreaInsetsContext.Provider value={below}>
        <View className="flex-1">{children}</View>
      </SafeAreaInsetsContext.Provider>

      {file && (
        <View className="bg-background px-3 pt-1.5" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
          <View className="h-16 rounded-[20px] bg-foreground overflow-hidden flex-row items-center pr-1">
            {/* The swipes on the outside, the tap an ordinary press inside them:
                a press gives way to a drag by itself, and the row keeps the
                layout every other pressable row has. */}
            <GestureDetector gesture={swipe}>
              <Animated.View style={[{ flex: 1, minWidth: 0, height: '100%' }, leanStyle]}>
              <Pressable
                onPress={expand}
                className="flex-1 flex-row items-center gap-3 pl-3 active:opacity-80"
                accessibilityRole="button"
                accessibilityLabel={`${file.mediaTitle || file.originalName}. Open the player`}
                accessibilityHint="Swipe sideways for the next or the previous recording"
              >
                <View className="w-10 h-10 rounded-xl bg-background/15 items-center justify-center">
                  <MusicIcon size={18} color={palette.background} />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-background text-[15px] leading-5 font-semibold" numberOfLines={1}>
                    {file.mediaTitle || file.originalName}
                  </Text>
                  <Text
                    className="text-background/65 text-[12px] leading-4"
                    numberOfLines={1}
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {audio.unplayable
                      ? "Couldn't play this one"
                      : audio.loading
                        ? 'Loading…'
                        : audio.duration > 0
                          ? `${clock(audio.position)} of ${clock(audio.duration)}`
                          : audio.playing
                            ? 'Playing'
                            : 'Paused'}
                  </Text>
                </View>
              </Pressable>
              </Animated.View>
            </GestureDetector>
            <Pressable
              onPress={audio.toggle}
              disabled={audio.unplayable}
              accessibilityRole="button"
              accessibilityLabel={audio.playing ? 'Pause' : 'Play'}
              className="w-11 h-11 items-center justify-center active:opacity-60"
            >
              {audio.loading ? (
                <ActivityIndicator size="small" color={palette.background} />
              ) : audio.playing ? (
                <PauseIcon size={20} color={palette.background} fill={palette.background} />
              ) : (
                <PlayIcon size={20} color={palette.background} fill={palette.background} />
              )}
            </Pressable>
            <Pressable
              onPress={audio.next}
              accessibilityRole="button"
              accessibilityLabel="Next recording"
              className="w-11 h-11 items-center justify-center active:opacity-60"
            >
              <SkipForwardIcon size={20} color={palette.background} fill={palette.background} />
            </Pressable>
            <View pointerEvents="none" className="absolute left-0 right-0 bottom-0 h-[3px]">
              <View
                className="h-full"
                style={{
                  backgroundColor: progress,
                  width: `${audio.duration > 0 ? Math.min(100, (audio.position / audio.duration) * 100) : 0}%`,
                }}
              />
            </View>
          </View>
        </View>
      )}

      <Modal
        visible={open && showing}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setOpen(false)}
      >
        <NowPlaying onClose={() => setOpen(false)} />
      </Modal>
    </View>
  );
}
