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
 */
export function NotificationBell() {
  const { count } = useUnreadNotifications();

  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      accessibilityLabel={
        count > 0 ? `Notifications, ${count} unread` : 'Notifications'
      }
      hitSlop={12}
      className="px-2 py-2"
    >
      <View>
        <BellIcon size={21} color="#6b7280" />
        {count > 0 && (
          <View
            className="absolute items-center justify-center rounded-full"
            style={{
              top: -4,
              right: -6,
              minWidth: 16,
              height: 16,
              paddingHorizontal: 4,
              backgroundColor: '#B66A40',
            }}
          >
            <Text
              className="font-bold text-white"
              style={{ fontSize: 9, lineHeight: 11 }}
            >
              {count > 99 ? '99+' : count}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
