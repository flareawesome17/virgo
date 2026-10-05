import type { ReactNode } from 'react';
import {
  Pressable,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** In quickly, so the press is acknowledged under the finger. */
const PRESS_IN = { duration: 90 };
/** Out on a soft spring, which is what makes it feel like a thing pressed. */
const RELEASE = { damping: 16, stiffness: 320, mass: 0.6 };

type Props = Omit<PressableProps, 'style' | 'children'> & {
  /** The look: background, border, padding, radius. Drawn on the inner view. */
  className?: string;
  /**
   * Where it sits: flex, width, margins. On the outer view, the one that
   * scales — so it takes a plain style, never classes (see below).
   */
  style?: StyleProp<ViewStyle>;
  /** How far it gives under the finger. Cards barely; small buttons more. */
  scaleTo?: number;
  children?: ReactNode;
};

/**
 * A Pressable that gives under the finger, smoothly.
 *
 * Presses used to be NativeWind's `active:scale-[…]`, which swaps a style on
 * press-in and back on press-out: a snap, not a movement, at eleven different
 * sizes across the app, and no feedback at all on 157 controls. This eases in
 * and springs back, on the UI thread.
 *
 * Two layers, deliberately. The outer one is Reanimated's and carries only
 * the scale and a plain `style`; the inner one is a plain View with the
 * `className`. NativeWind does not reach Reanimated's components, and would
 * flatten an animated style into its own object if it did — so the classes
 * never meet the animation, and it behaves the same on a phone as on the web.
 *
 * Do not put `active:` classes in `className`: on a View they turn it into a
 * Pressable of its own, which would take the touch. The scale is the
 * feedback.
 */
export function PressableScale({
  className,
  style,
  scaleTo = 0.97,
  onPressIn,
  onPressOut,
  disabled,
  children,
  ...rest
}: Props) {
  const pressed = useSharedValue(0);
  const scale = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scaleTo) * pressed.value }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(event: GestureResponderEvent) => {
        pressed.value = withTiming(1, PRESS_IN);
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        pressed.value = withSpring(0, RELEASE);
        onPressOut?.(event);
      }}
      style={[style, scale]}
    >
      <View className={className}>{children}</View>
    </AnimatedPressable>
  );
}
