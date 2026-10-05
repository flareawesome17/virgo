import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
 */
export function InsetFrame({
  edges = ['top'],
  className = 'flex-1 bg-background',
  style,
  children,
}: {
  edges?: ('top' | 'bottom')[];
  className?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
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
