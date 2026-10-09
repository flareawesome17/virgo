import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { router, usePathname } from 'expo-router';
import { AlertCircleIcon, CheckIcon } from 'lucide-react-native';
import { useUploadQueue } from '@/src/providers/UploadProvider';
import { useVideoPlayback } from '@/src/providers/VideoPlayerProvider';
import { useTheme } from '@/src/providers/ThemeProvider';
import { PALETTES, type Palette } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Big enough to hit with a thumb, small enough to forget about. */
const SIZE = 52;
const STROKE = 4;
/** The arc sits this far inside the disc's rim, clear of its border. */
const INSET = 4;
const RADIUS = SIZE / 2 - INSET - STROKE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Kept clear of every edge of the screen, past the safe area. */
const EDGE = 12;
/**
 * Where it starts: on the right, above both bottom bars (the iOS capsule is
 * 54 high and floats 21 off the bottom; Android's stock bar is 56) and above
 * the Save bars that forms pin to the bottom.
 */
const START_ABOVE_BOTTOM = 96;
/** How long a finished batch shows its tick before the ring goes. */
const DONE_HOLD_MS = 1200;

/** Settling against a side: eased, no overshoot. A spring reads as a wobble. */
const SETTLE = { duration: 220, easing: Easing.out(Easing.cubic) };

type RingState = 'uploading' | 'failed' | 'done';

interface Limits {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  startY: number;
}

/**
 * What an upload looks like from anywhere in the app: a small ring that floats
 * over the screen, fills as the batch goes, and can be dragged out of the way.
 *
 * It was a strip across the top that took the notch and pushed every screen
 * down for as long as an upload ran: the navigator lost height, and the top
 * bar shifted under the finger the moment a batch started. Floating, it takes
 * no space at all, so nothing underneath moves when it comes and goes.
 *
 * Wraps the navigator, which is why it sees every screen. Every route into an
 * upload is an album or a workspace, and `router.back()` after handing the
 * files over returns to one of those. AppTopBar renders on the tab screens
 * only, so an indicator placed there was never on screen while it ran.
 *
 * Let go, it settles against whichever side it is nearer, the way a floating
 * control does on the phone itself, and it stays where it was put for the
 * rest of the session, through the next batch too. Tapping it opens the queue.
 * It is hidden on the queue's own screen, which already shows everything it
 * would say, and while a film fills the screen.
 *
 * Failures stay after the queue drains, because a file that did not upload is
 * the one thing here worth interrupting someone for. Successes show a tick
 * briefly and go on their own.
 *
 * Off screen, the notification drawer carries the same progress
 * (UploadProvider writes it while the app is in the background).
 */
export function UploadRing({ children }: { children: ReactNode }) {
  const { tasks, active, overall, remaining } = useUploadQueue();
  const { current: film, mode: filmMode } = useVideoPlayback();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;

  const failed = tasks.filter((task) => task.status === 'failed').length;

  // The tick after a clean batch. Its own timer effect, so nothing else
  // changing in the meantime can cancel the timer and leave the tick up.
  const [justFinished, setJustFinished] = useState(false);
  const wasActive = useRef(active);
  useEffect(() => {
    if (active) {
      wasActive.current = true;
      setJustFinished(false);
      return;
    }
    if (!wasActive.current) return;
    wasActive.current = false;
    if (failed === 0) setJustFinished(true);
  }, [active, failed]);
  useEffect(() => {
    if (!justFinished) return;
    const timer = setTimeout(() => setJustFinished(false), DONE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [justFinished]);

  const state: RingState | null = active
    ? 'uploading'
    : failed > 0
      ? 'failed'
      : justFinished
        ? 'done'
        : null;
  const hidden =
    pathname === '/albums/upload' || (Boolean(film) && filmMode === 'full');
  const showing = state !== null && !hidden;

  // Where the ring may go, from the size of the area it floats over. Measured
  // rather than taken from the window: the email banner above can take part
  // of the screen.
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArea((prev) =>
      prev && prev.width === width && prev.height === height ? prev : { width, height },
    );
  }, []);

  const limits = useMemo<Limits | null>(() => {
    if (!area) return null;
    const minX = insets.left + EDGE;
    const maxX = Math.max(minX, area.width - insets.right - EDGE - SIZE);
    const minY = insets.top + EDGE;
    const maxY = Math.max(minY, area.height - insets.bottom - EDGE - SIZE);
    const startY = Math.min(
      maxY,
      Math.max(minY, area.height - insets.bottom - START_ABOVE_BOTTOM - SIZE),
    );
    return { minX, maxX, minY, maxY, startY };
  }, [area, insets.left, insets.right, insets.top, insets.bottom]);

  // Kept here, above the ring, so the spot it was dragged to outlives the
  // ring disappearing between batches.
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const onLeft = useSharedValue(false);
  const placed = useRef(false);
  const from = useSharedValue({ x: 0, y: 0 });

  // First placement, and keeping it on screen when the area changes size
  // (rotation, the email banner going). It keeps its side.
  useEffect(() => {
    if (!limits) return;
    x.value = onLeft.value ? limits.minX : limits.maxX;
    y.value = placed.current
      ? Math.min(Math.max(y.value, limits.minY), limits.maxY)
      : limits.startY;
    placed.current = true;
  }, [limits, x, y, onLeft]);

  const openUploads = useCallback(() => {
    router.push('/albums/upload');
  }, []);

  // Built once per size, not per render: this renders on every percent of an
  // upload, and a new gesture mid-drag would drop the finger.
  const gesture = useMemo(() => {
    if (!limits) return null;
    const { minX, maxX, minY, maxY } = limits;
    const pan = Gesture.Pan()
      .enabled(showing)
      .minDistance(6)
      .onStart(() => {
        from.value = { x: x.value, y: y.value };
      })
      .onUpdate((event) => {
        x.value = Math.min(Math.max(from.value.x + event.translationX, minX), maxX);
        y.value = Math.min(Math.max(from.value.y + event.translationY, minY), maxY);
      })
      .onEnd((event) => {
        // A flick counts: where it was heading, not only where it was let go.
        const heading = x.value + SIZE / 2 + event.velocityX * 0.15;
        const left = heading < (minX + maxX + SIZE) / 2;
        onLeft.value = left;
        x.value = withTiming(left ? minX : maxX, SETTLE);
      });
    const tap = Gesture.Tap()
      .enabled(showing)
      .maxDistance(8)
      .onEnd((_event, success) => {
        if (success) runOnJS(openUploads)();
      });
    return Gesture.Race(pan, tap);
  }, [limits, showing, openUploads, from, x, y, onLeft]);

  const place = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }] as const,
  }));

  const percent = Math.round(overall * 100);
  const label =
    state === 'uploading'
      ? `Uploading, ${percent} percent, ${remaining} remaining`
      : state === 'failed'
        ? `${failed} ${failed === 1 ? 'upload' : 'uploads'} did not finish`
        : 'Upload complete';

  return (
    <View className="flex-1">
      {children}

      {/* Over everything, catching nothing but the ring itself. */}
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
        {limits && gesture && (
          <GestureDetector gesture={gesture}>
            <Animated.View
              // Not in the way of the screen while there is nothing to show.
              pointerEvents={showing ? 'auto' : 'none'}
              style={[styles.slot, place]}
            >
              {showing && state && (
                <Animated.View
                  entering={FadeIn.duration(180)}
                  exiting={FadeOut.duration(160)}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityHint="Opens your uploads. Drag to move it."
                  accessibilityActions={[{ name: 'activate' }]}
                  onAccessibilityAction={(event) => {
                    if (event.nativeEvent.actionName === 'activate') openUploads();
                  }}
                >
                  <RingFace
                    state={state}
                    overall={overall}
                    percent={percent}
                    count={state === 'failed' ? failed : state === 'uploading' ? remaining : 0}
                    palette={palette}
                    isDark={isDark}
                  />
                </Animated.View>
              )}
            </Animated.View>
          </GestureDetector>
        )}
      </View>
    </View>
  );
}

function RingFace({
  state,
  overall,
  percent,
  count,
  palette,
  isDark,
}: {
  state: RingState;
  overall: number;
  percent: number;
  count: number;
  palette: Palette;
  isDark: boolean;
}) {
  // Eased between reports, so the arc runs rather than ticking. Starts where
  // the batch already is, so coming back to a screen mid-upload does not
  // sweep it up from nothing.
  const progress = useSharedValue(state === 'uploading' ? overall : 1);
  useEffect(() => {
    progress.value = withTiming(state === 'uploading' ? overall : 1, {
      duration: 250,
      easing: Easing.out(Easing.quad),
    });
  }, [state, overall, progress]);

  const arc = useAnimatedProps(() => ({
    strokeDashoffset:
      CIRCUMFERENCE * (1 - Math.min(Math.max(progress.value, 0), 1)),
  }));

  const color = state === 'failed' ? palette.destructive : palette.primary;

  return (
    <View
      className="bg-card border-border items-center justify-center rounded-full"
      style={{
        width: SIZE,
        height: SIZE,
        borderWidth: StyleSheet.hairlineWidth,
        shadowColor: '#000',
        shadowOpacity: isDark ? 0.4 : 0.16,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}
    >
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={palette.muted}
          strokeWidth={STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={color}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          animatedProps={arc}
          // From twelve o'clock rather than three.
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>

      {state === 'uploading' ? (
        <Text className="text-foreground text-[12px] font-bold tabular-nums">
          {percent}%
        </Text>
      ) : state === 'failed' ? (
        <AlertCircleIcon size={20} color={palette.destructive} />
      ) : (
        <CheckIcon size={20} color={palette.primary} strokeWidth={2.5} />
      )}

      {count > 0 && (
        // Files left, or files that failed: the number the percentage hides.
        <View
          className="border-background absolute items-center justify-center rounded-full border-2 px-1"
          style={{
            top: -4,
            right: -4,
            minWidth: 20,
            height: 20,
            backgroundColor: color,
          }}
        >
          <Text className="text-[10px] font-bold text-white tabular-nums">
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
  },
});
