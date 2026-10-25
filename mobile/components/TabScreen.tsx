import { useContext, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { AppTopBar } from '@/components/AppTopBar';
import type { CreateKind } from '@/components/CreateSheet';
import { UpdateBanner } from '@/components/UpdateBanner';
import { useBarHeight, useChrome } from '@/src/providers/ChromeProvider';

/** Breathing room between the last row of a list and the tab bar. */
const CLEARANCE = 24;

/** What a list keeps clear at its foot when there is no tab bar to ask. */
const FALLBACK_BOTTOM = 120;

/**
 * The frame of every tab screen: the status bar, the top bar, and the screen
 * under them, which move together.
 *
 * When the bars go away the whole frame slides up by the bar's height and the
 * bar passes under the status bar. It is one transform, run on the UI thread
 * from the shared `hidden` value — nothing is laid out again while it moves.
 * The top bar used to collapse its own height instead, which the native
 * driver cannot animate: it faded, then the screen jumped.
 *
 * The frame is taller than the screen by the bar's height, so that once it
 * has slid up its foot still reaches the bottom edge. While the bar shows,
 * that extra strip sits below the edge, out of sight; useTabBottomInset adds
 * it to what lists keep clear, so nothing is ever left under the tab bar.
 */
export function TabScreen({
  title,
  create,
  leading,
  children,
}: {
  /** The screen's name, in the bar. Without one the bar shows the mark. */
  title?: string;
  /** What this screen makes, marked when + is pressed. */
  create?: CreateKind;
  /** In place of the mark, when there is no title. */
  leading?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { hidden } = useChrome();

  // Measured rather than assumed: the row is min-h-11 but grows with the
  // system font size, and sliding by a guess would leave a band or clip it.
  const { barHeight, setBarHeight } = useBarHeight();
  const onBarLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.height;
    if (measured > 0 && measured !== barHeight) setBarHeight(measured);
  };

  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: -barHeight * hidden.value }],
  }));
  // Fading as well as sliding, so it does not read as a hard edge being
  // dragged under the status bar.
  const fade = useAnimatedStyle(() => ({ opacity: 1 - hidden.value }));

  return (
    // Clips the frame where the screen ends. Above it there may be the
    // verify-email banner, which zeroes the top inset for screens under it.
    <View className="flex-1 bg-background overflow-hidden">
      <Animated.View
        style={[
          { position: 'absolute', left: 0, right: 0, top: insets.top, bottom: -barHeight },
          slide,
        ]}
      >
        <Animated.View onLayout={onBarLayout} style={fade}>
          <AppTopBar title={title} create={create} leading={leading} />
        </Animated.View>
        {/* Under the bar, not in it: the bar is a fixed set of destinations,
            and this is news. It stays when the bar goes — it slides up into
            the bar's place. Renders nothing the rest of the time. */}
        <UpdateBanner />
        <View className="flex-1">{children}</View>
      </Animated.View>

      {/* The status bar's own strip, drawn over the frame so the bar slides
          under it rather than through the clock. */}
      <View
        pointerEvents="none"
        className="bg-background absolute left-0 right-0 top-0"
        style={{ height: insets.top }}
      />
    </View>
  );
}

/**
 * How much of the foot of a tab screen's content area is out of sight or
 * under the tab bar: the frame's strip below the edge plus the tab bar. A
 * state centred in the content area pads its foot by this, so it is centred
 * in what you can see. Without it, empty and error states sat half a bar low
 * and their buttons crowded the tab bar. Zero off the tabs.
 */
export function useTabObstruction(): number {
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const { barHeight } = useBarHeight();
  if (tabBarHeight == null) return 0;
  return tabBarHeight + barHeight;
}

/**
 * How much a scrolling list on a tab screen should keep clear at its foot:
 * the tab bar, the strip of TabScreen's frame below the edge, and some room
 * to breathe. Off the tabs it is the old fixed allowance.
 */
export function useTabBottomInset(): number {
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const { barHeight } = useBarHeight();
  if (tabBarHeight == null) return FALLBACK_BOTTOM;
  return tabBarHeight + barHeight + CLEARANCE;
}
