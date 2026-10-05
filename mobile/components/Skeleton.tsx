import { useEffect } from 'react';
import { useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/**
 * The shape of what is coming, while it comes.
 *
 * Tab screens used to show a lone spinner on first load — or, on Workspaces,
 * nothing at all under the bar — and then the whole screen appeared at once.
 * A placeholder in the layout's own shape says what is loading, and the real
 * thing lands where the eye already is.
 *
 * It breathes, slowly, on the UI thread. With Reduce Motion on it holds still.
 */
export function Skeleton({
  className = 'rounded-lg',
  style,
}: {
  /** Shape and radius. The colour is the muted fill, always. */
  className?: string;
  /** Size, by plain style: width and height. */
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);

  const breathe = useAnimatedStyle(() => ({ opacity: 1 - pulse.value * 0.45 }));

  // The fill is on a plain View inside: NativeWind does not reach
  // Reanimated's components.
  return (
    <Animated.View style={[style, breathe]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View className={`flex-1 bg-muted ${className}`} />
    </Animated.View>
  );
}

/** Rows of cards — workspaces, jobs, posts, bookings — while a list loads. */
export function CardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View
      className="px-5 pt-3 gap-3"
      accessible
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
    >
      {Array.from({ length: count }, (_, i) => (
        <View key={i} className="flex-row gap-3 rounded-2xl bg-card border border-border/40 p-3.5">
          <Skeleton className="rounded-xl" style={{ width: 48, height: 48 }} />
          <View className="flex-1 justify-center gap-2">
            <Skeleton style={{ width: '62%', height: 14 }} />
            <Skeleton style={{ width: '38%', height: 11 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** The Feed's placards, while the first page loads. */
export function FeedSkeleton() {
  const { width } = useWindowDimensions();
  const height = Math.round(width * 1.15);
  return (
    <View accessible accessibilityLabel="Loading the feed" accessibilityRole="progressbar">
      {[0, 1].map((i) => (
        <View key={i} className="mb-5">
          <Skeleton className="rounded-none" style={{ width, height }} />
          <View className="-mt-8 mx-2.5 rounded-2xl bg-card p-4 gap-2.5">
            <View className="flex-row items-center gap-2.5">
              <Skeleton className="rounded-full" style={{ width: 36, height: 36 }} />
              <View className="flex-1 gap-1.5">
                <Skeleton style={{ width: '45%', height: 13 }} />
                <Skeleton style={{ width: '30%', height: 10 }} />
              </View>
            </View>
            <Skeleton style={{ width: '70%', height: 16 }} />
            <Skeleton style={{ width: '92%', height: 12 }} />
          </View>
        </View>
      ))}
    </View>
  );
}
