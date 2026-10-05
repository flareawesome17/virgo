import type { ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowInsets } from '@/src/lib/window-insets';

/**
 * SafeAreaView, for a screen that covers the whole display from a layer of
 * its own: the create forms (full-screen modals) and a full-screen <Modal>.
 *
 * SafeAreaView does not work there on iOS. A full-screen modal is its own
 * native layer, outside the app's SafeAreaProvider, so SafeAreaView measures
 * itself instead — once, as the form starts to slide up from below the
 * screen, where nothing overlaps it — and never again. It settled on no top
 * inset, which put a form's X and its Post under the clock and the Dynamic
 * Island, where a tap does not land.
 *
 * The window's insets, from context, are the right ones for anything that
 * covers the whole screen, and they are right on Android too.
 *
 * The window's, not the banners': while an upload runs the strip zeroes the
 * top inset for what is under it, and on iOS a full-screen modal is not under
 * it. On Android the same form opens in the navigator, below the strip, and
 * the zeroed inset is right. `modal` is for a <Modal>, which covers the
 * whole window on both.
 */
export function InsetFrame({
  edges = ['top'],
  className = 'flex-1 bg-background',
  style,
  modal = false,
  children,
}: {
  edges?: ('top' | 'bottom')[];
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** Inside a <Modal>: the window's insets on both platforms. */
  modal?: boolean;
  children: ReactNode;
}) {
  const local = useSafeAreaInsets();
  const window = useWindowInsets();
  const insets = modal || Platform.OS === 'ios' ? window : local;
  return (
    <View
      className={className}
      style={[
        {
          paddingTop: edges.includes('top') ? insets.top : 0,
          paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
