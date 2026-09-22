import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BellIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useUnreadNotifications } from '@/src/hooks';

cssInterop(BellIcon, {
  className: { target: 'style', nativeStyleToProp: { color: true } },
});

/**
 * The way into the notification list, and the badge that says to look.
 *
 * Only the count is fetched here. The list itself is a screen away and costs
 * a request when it opens — this renders on every home render, and paying for
 * thirty rows to draw a number would be paying for the wrong thing.
 *
 * It sits alone at the right end of the top bar's first tier. When it shared
 * a row with the Dashboard/Jobs tabs it read as a fourth tab, so it is now
 * the only thing up there and a full 44pt target of its own, rather than an
 * icon relying on hitSlop to be tappable.
 */
export function NotificationBell() {
  const { count } = useUnreadNotifications();

  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      accessibilityLabel={
        count > 0 ? `Notifications, ${count} unread` : 'Notifications'
      }
      className="h-11 w-11 items-center justify-center active:opacity-70"
    >
      <View>
        <BellIcon size={22} className="text-foreground" />
        {count > 0 && (
          // Ringed in the bar's own background so it reads as a separate
          // shape where it overlaps the glyph.
          <View
            className="absolute items-center justify-center rounded-full border-[1.5px] border-background bg-action"
            style={{ top: -4, right: -6, minWidth: 16, minHeight: 16, paddingHorizontal: 4 }}
          >
            <Text
              className="text-action-foreground font-bold"
              style={{ fontSize: 10, lineHeight: 13 }}
            >
              {count > 99 ? '99+' : count}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
