import { useContext } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import { useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';

/**
 * iOS 26 geometry: a capsule floating 21pt in from the sides and up from the
 * bottom edge — inside the home-indicator zone, as the system bar sits. Tab
 * screens already end their scroll content 120pt up, which clears the 83pt
 * this takes, so none of them needed to change.
 */
const INSET = 21;
const HEIGHT = 62;
/** iPad (supportsTablet) — a capsule the width of the screen is a shelf. */
const MAX_WIDTH = 480;

/**
 * The bottom bar on iOS: a floating, rounded capsule rather than a strip.
 *
 * Android keeps the stock bar untouched — _layout.tsx only routes iOS here —
 * so this has to reproduce what BottomTabBar does for the routes it draws:
 * the same tabPress/tabLongPress events (a focused tab pops to its root
 * through them), the same navigate action, the options' icons and badges.
 *
 * It is opaque on purpose. Real Liquid Glass needs a native
 * module and so a store build; this ships as an update and the material can
 * change underneath it later without the layout moving.
 */
export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const setTabBarHeight = useContext(BottomTabBarHeightCallbackContext);
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;

  // expo-router turns `href: null` into a hidden item style. The stock bar
  // honours that itself; a custom one would otherwise draw Dashboard, Jobs,
  // network and chat as tabs.
  const routes = state.routes.filter(
    (route) =>
      StyleSheet.flatten(descriptors[route.key].options.tabBarItemStyle)?.display !== 'none',
  );
  // Dashboard and Jobs live in the top bar, so while one of them is showing
  // no bottom tab is selected — the same as the stock bar did.
  const focusedKey = state.routes[state.index]?.key;

  return (
    <View
      pointerEvents="box-none"
      // Reported so useBottomTabBarHeight() means the space to keep clear,
      // including the gap under the capsule, not the capsule alone.
      onLayout={(e) => setTabBarHeight?.(e.nativeEvent.layout.height + INSET)}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: INSET,
        paddingHorizontal: INSET,
        alignItems: 'center',
      }}
    >
      <View
        accessibilityRole="tablist"
        // Opaque until it can blur: at 95% with nothing blurring the content
        // behind it, rows scrolling underneath ghost through the labels.
        className="flex-row rounded-full border-border bg-card"
        style={{
          width: '100%',
          maxWidth: MAX_WIDTH,
          height: HEIGHT,
          padding: 4,
          borderWidth: StyleSheet.hairlineWidth,
          shadowColor: '#000',
          shadowOpacity: isDark ? 0.35 : 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        {routes.map((route, i) => {
          const { options } = descriptors[route.key];
          const focused = route.key === focusedKey;
          const color = focused ? palette.primary : palette.foreground;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name);
          const badge = options.tabBarBadge;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.dispatch({
                ...CommonActions.navigate(route),
                target: state.key,
              });
            }
          };
          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              // 'tab' carries no trait on iOS, so VoiceOver would read the
              // name alone. The stock bar uses button plus "tab, n of m" in
              // the label for the same reason.
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={
                options.tabBarAccessibilityLabel ??
                `${label}${badge != null ? `, ${badge} new` : ''}, tab, ${i + 1} of ${routes.length}`
              }
              // The labels do not grow with Dynamic Type (the capsule is a
              // fixed height); holding a tab shows the enlarged label instead,
              // as the system bar does.
              accessibilityShowsLargeContentViewer
              accessibilityLargeContentTitle={label}
              testID={options.tabBarButtonTestID}
              // The lozenge behind the selected tab is how iOS 26 marks it —
              // tint alone is easy to miss on a bar this light.
              className={`flex-1 items-center justify-center rounded-full active:opacity-70 ${
                focused ? 'bg-foreground/10' : ''
              }`}
            >
              <View>
                {options.tabBarIcon?.({ focused, color, size: 22 })}
                {badge != null && (
                  <View
                    className="absolute h-[18px] min-w-[18px] items-center justify-center rounded-full bg-action px-[5px]"
                    style={{ top: -5, left: 14 }}
                  >
                    <Text allowFontScaling={false} className="text-action-foreground text-[11px] font-bold">
                      {badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                numberOfLines={1}
                allowFontScaling={false}
                style={{ color, fontSize: 11, lineHeight: 13, fontWeight: '600', marginTop: 3 }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
