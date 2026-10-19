import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ArrowLeftIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * Leaves the screen, even when there is nowhere to go back to.
 *
 * A screen opened from a notification on a cold start is the only entry in its
 * stack, and `router.back()` there does nothing — the button looks broken. It
 * goes home instead.
 */
export function goBackOr(fallback: Href = '/(app)/(tabs)') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/**
 * The header for a pushed screen: a back button, a title, and room on the right.
 *
 * The app's stacks hide the native header (`headerShown: false`), so a screen
 * that only set `<Stack.Screen options={{ title }} />` drew no title and no way
 * back at all — on iOS a dead end for anybody who does not know the edge swipe.
 * This is the header those screens were missing, and the one to use for new
 * ones.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  /** Instead of leaving the screen — for a screen with a step of its own to go back from. */
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View className="px-5 pt-3 pb-2 flex-row items-center gap-3">
      <Pressable
        onPress={onBack ?? (() => goBackOr())}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        className="w-11 h-11 rounded-xl bg-secondary items-center justify-center active:scale-[0.96]"
      >
        <ArrowLeftIcon size={18} className="text-foreground" />
      </Pressable>
      <View className="flex-1 min-w-0">
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="text-foreground text-[22px] font-bold tracking-tight"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-muted-foreground text-sm mt-0.5">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
