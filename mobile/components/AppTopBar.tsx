import { Pressable, Text, View } from 'react-native';
// expo-image rather than RN Image, as everywhere else in this app.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { NotificationBell } from '@/components/NotificationBell';
import { MessageCircleIcon, SettingsIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useIncomingFriendRequests,
  usePromoOffers,
  useUnreadCount,
} from '@/src/hooks';

for (const Icon of [MessageCircleIcon, SettingsIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * The mark itself, transparent — not assets/icon.png, which is the store
 * tile with a cream ground baked into it. Cropped to 28px that ground was the
 * logo and the mark a speck inside it. The welcome screen shows this same
 * asset bare for the same reason: the mark carries its own colour, and a
 * container behind it only competes with it.
 */
const LOGO = require('@/assets/splash-icon.png');

/**
 * The bar every tab screen wears.
 *
 * Identity on the left — the mark and wordmark — and the three things you dip
 * into on the right: connections, notifications, settings.
 *
 * It appears on all six tab screens rather than on Dashboard alone: without
 * a bar that travels, Workspaces would be a screen with no way back to it.
 *
 * It has no motion of its own. TabScreen draws it and slides it away and back
 * by transform; it used to collapse its own height, which the native driver
 * cannot animate, so it faded out and then the screen jumped up under it.
 */
export function AppTopBar() {
  const unread = useUnreadCount();
  const { count: friendRequests } = useIncomingFriendRequests();
  const { offers: rewards } = usePromoOffers();
  // One dot for both: a message and a request are each somebody waiting on
  // you, and two badges on one icon would be a puzzle rather than a count.
  const connectAlerts = unread + friendRequests;

  return (
    <View className="min-h-11 flex-row items-center justify-between bg-background pl-4 pr-1">
      <Pressable
        onPress={() => router.navigate('/')}
        accessibilityRole="button"
        accessibilityLabel="Virgo, go to Dashboard"
        hitSlop={8}
        className="min-h-11 flex-row items-center gap-2 active:opacity-70"
      >
        <Image source={LOGO} style={{ width: 28, height: 28 }} contentFit="contain" />
        <Text className="text-foreground text-[20px] font-bold tracking-tight">Virgo</Text>
      </Pressable>

      <View className="flex-row items-center">
        <Pressable
          onPress={() => router.navigate('/connect')}
          accessibilityRole="button"
          accessibilityLabel={
            connectAlerts > 0 ? `Connections, ${connectAlerts} waiting` : 'Connections'
          }
          className="w-11 h-11 items-center justify-center active:opacity-70"
        >
          <MessageCircleIcon size={22} className="text-foreground" />
          {connectAlerts > 0 && <Dot count={connectAlerts} />}
        </Pressable>

        <NotificationBell />

        <Pressable
          onPress={() => router.navigate('/settings')}
          accessibilityRole="button"
          accessibilityLabel={rewards.length > 0 ? 'Settings, an offer is waiting' : 'Settings'}
          className="w-11 h-11 items-center justify-center active:opacity-70"
        >
          <SettingsIcon size={22} className="text-foreground" />
          {rewards.length > 0 && <Dot count={rewards.length} />}
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The count on an icon in the bar.
 *
 * A small disc rather than a wide pill: these sit on 44 pt targets a few
 * pixels apart, and a pill long enough for "99+" on one would touch its
 * neighbour. Ringed in the background colour so it reads as sitting above
 * the icon rather than punched into it.
 */
function Dot({ count }: { count: number }) {
  return (
    <View className="absolute right-1.5 top-1.5 min-w-[17px] h-[17px] items-center justify-center rounded-full bg-action border-2 border-background px-1">
      <Text className="text-action-foreground text-[9px] font-bold" allowFontScaling={false}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}
