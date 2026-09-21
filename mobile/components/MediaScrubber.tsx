import { useCallback, useState } from 'react';
import { View, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { clock } from '@/src/lib/media-grid';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

/**
 * A progress bar you can actually drag.
 *
 * The three players each had their own bar built as a Pressable reading
 * `locationX` on tap. That is a seek-by-guess: you get one shot at the position,
 * there is no thumb to aim with, and dragging does nothing. Every player worth
 * copying — iOS video, Spotify — lets you take hold of the position and move it,
 * with the number updating under your thumb before you commit.
 *
 * While dragging, the bar shows the dragged position rather than the player's,
 * so it does not fight the incoming time updates and jump backwards under your
 * finger. `onSeek` fires once, on release.
 *
 * The track grows on touch, which is both the iOS behaviour and a practical
 * necessity: a 3px line is under the 44pt minimum, so the hit area is padded
 * well beyond what is drawn.
 */
export function MediaScrubber({
  position,
  duration,
  onSeek,
  accent = '#D89566',
  showTimes = true,
}: {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
  accent?: string;
  showTimes?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [draggedAt, setDraggedAt] = useState(0);
  const held = useSharedValue(0);

  const shown = dragging ? draggedAt : position;
  const fraction = duration > 0 ? Math.min(Math.max(shown / duration, 0), 1) : 0;

  /**
   * Seconds under a touch at `x`.
   *
   * This runs on the JS thread and must keep doing so. A gesture callback is a
   * worklet — it executes on the UI thread — and calling an ordinary function
   * from inside one is fatal, not degraded: it throws where nothing can catch
   * it and takes the app down. That is what dragging this bar used to do.
   *
   * So the worklets below hand over the one thing they have, the raw x, and
   * every conversion happens over here where `width` and `duration` live.
   */
  const at = useCallback(
    (x: number) => {
      if (!width || !duration) return 0;
      return Math.min(Math.max(x / width, 0), 1) * duration;
    },
    [width, duration],
  );

  const beginAt = useCallback(
    (x: number) => {
      setDragging(true);
      setDraggedAt(at(x));
    },
    [at],
  );
  const moveTo = useCallback((x: number) => setDraggedAt(at(x)), [at]);
  const seekTo = useCallback((x: number) => onSeek(at(x)), [at, onSeek]);

  const drag = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      held.value = 1;
      runOnJS(beginAt)(event.x);
    })
    .onUpdate((event) => {
      runOnJS(moveTo)(event.x);
    })
    .onEnd((event) => {
      runOnJS(seekTo)(event.x);
    })
    .onFinalize(() => {
      held.value = 0;
      runOnJS(setDragging)(false);
    });

  const trackStyle = useAnimatedStyle(() => ({
    height: held.value ? 7 : 3,
  }));

  return (
    <View>
      <GestureDetector gesture={drag}>
        {/* 28px of touchable height around a 3px line. The bar is a target
            first and a graphic second. */}
        <View
          className="h-7 justify-center"
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        >
          <Animated.View
            style={trackStyle}
            className="rounded-full bg-white/20 overflow-hidden"
          >
            <View
              style={{ width: `${fraction * 100}%`, backgroundColor: accent }}
              className="h-full rounded-full"
            />
          </Animated.View>
          {/* Only while held: a permanent thumb on a 3px line looks like a bug,
              and iOS only shows one once you are touching it. */}
          {dragging && width > 0 && (
            <View
              pointerEvents="none"
              style={{ left: Math.max(0, fraction * width - 7) }}
              className="absolute w-3.5 h-3.5 rounded-full bg-white"
            />
          )}
        </View>
      </GestureDetector>
      {showTimes && (
        <View className="flex-row justify-between mt-1">
          <Text className="text-white/50 text-[11px] font-mono">
            {clock(shown)}
          </Text>
          <Text className="text-white/35 text-[11px] font-mono">
            {duration > 0 ? `-${clock(Math.max(duration - shown, 0))}` : '--:--'}
          </Text>
        </View>
      )}
    </View>
  );
}
