import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
// expo-image rather than RN Image, as everywhere else in this app.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MessageCircleIcon, PlusIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { CreateSheet, type CreateKind } from '@/components/CreateSheet';
import { NotificationBell } from '@/components/NotificationBell';
import { RemoteImage } from '@/components/RemoteImage';
import {
  useAuth,
  usePeopleUnseen,
  usePromoOffers,
  useUnreadCount,
} from '@/src/hooks';

for (const Icon of [MessageCircleIcon, PlusIcon]) {
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

const AVATAR = 32;

/**
 * The bar every tab screen wears, and the only header a tab has.
 *
 * Left, who and where: your photo, which opens your profile and settings, and
 * the screen's name — or, on the Dashboard, the mark. Right, the things you
 * reach for from anywhere: + to make something, your messages, and what is
 * new. Each tab used to put its own big title under this bar, so every
 * screen started with two headers; and four of them had their own + in four
 * different places and shapes.
 *
 * Settings moved behind the photo. Three icons is as many as a bar this size
 * holds before they start to read as a row of tabs.
 *
 * It has no motion of its own. TabScreen draws it and slides it away and back
 * by transform; it used to collapse its own height, which the native driver
 * cannot animate, so it faded out and then the screen jumped up under it.
 */
export function AppTopBar({
  title,
  create,
}: {
  /** The screen's name. Without one the bar shows the mark, as on the Dashboard. */
  title?: string;
  /** What this screen makes, marked in the Create sheet. */
  create?: CreateKind;
}) {
  const unread = useUnreadCount();
  // Requests and hire enquiries that arrived since People was last opened.
  // Enquiries are paid work and counted nowhere before; requests counted
  // until answered, so an ignored one kept the dot lit for good.
  const { count: people } = usePeopleUnseen();
  const { offers: rewards } = usePromoOffers();
  // One dot for both: a message and a request are each somebody waiting on
  // you, and two badges on one icon would be a puzzle rather than a count.
  const connectAlerts = unread + people;
  // The half the dot is about: People when only people are waiting.
  const connectHref = unread === 0 && people > 0 ? '/connect?view=people' : '/connect?view=messages';
  const [creating, setCreating] = useState(false);

  const openCreate = () => {
    // A light tap to say the sheet is this button's doing. Only here: the
    // sheet's own rows navigate, and the screen they open says enough.
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setCreating(true);
  };

  return (
    <View className="min-h-12 flex-row items-center bg-background pl-3 pr-1">
      <Avatar rewards={rewards.length} />

      {title ? (
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="flex-1 ml-3 text-foreground text-[20px] font-bold tracking-tight"
        >
          {title}
        </Text>
      ) : (
        <View className="flex-1 ml-2.5 flex-row">
          <Pressable
            onPress={() => router.navigate('/')}
            accessibilityRole="button"
            accessibilityLabel="Virgo, go to Dashboard"
            hitSlop={8}
            className="min-h-11 flex-row items-center gap-2 active:opacity-70"
          >
            <Image source={LOGO} style={{ width: 26, height: 26 }} contentFit="contain" />
            <Text className="text-foreground text-[20px] font-bold tracking-tight">Virgo</Text>
          </Pressable>
        </View>
      )}

      <View className="flex-row items-center">
        <Pressable
          onPress={openCreate}
          accessibilityRole="button"
          accessibilityLabel="Create"
          accessibilityHint="Post a showcase or a job, or make a workspace, album, event or reminder"
          className="w-11 h-11 items-center justify-center active:opacity-80"
        >
          <View className="w-[34px] h-[34px] rounded-xl bg-action items-center justify-center">
            <PlusIcon size={20} strokeWidth={2.5} className="text-action-foreground" />
          </View>
        </Pressable>

        <Pressable
          onPress={() => router.navigate(connectHref)}
          accessibilityRole="button"
          accessibilityLabel={
            connectAlerts > 0 ? `Messages and people, ${connectAlerts} waiting` : 'Messages and people'
          }
          className="w-11 h-11 items-center justify-center active:opacity-70"
        >
          <MessageCircleIcon size={22} className="text-foreground" />
          {connectAlerts > 0 && <Dot count={connectAlerts} />}
        </Pressable>

        <NotificationBell />
      </View>

      <CreateSheet visible={creating} onClose={() => setCreating(false)} current={create} />
    </View>
  );
}

/**
 * Your photo, or your initial: the way to your profile and settings.
 *
 * The waiting-offer count moved here from the Settings cog it used to sit on,
 * since this is now the way to the screen the offer is on.
 */
function Avatar({ rewards }: { rewards: number }) {
  const { user, profile } = useAuth();
  const initial = (profile?.displayName || user?.email || '?').charAt(0).toUpperCase();

  return (
    <Pressable
      onPress={() => router.navigate('/settings')}
      accessibilityRole="button"
      accessibilityLabel={
        rewards > 0 ? 'Your profile and settings, an offer is waiting' : 'Your profile and settings'
      }
      hitSlop={6}
      className="w-11 h-11 items-center justify-center active:opacity-70"
    >
      {profile?.avatarUrl ? (
        <RemoteImage
          source={{ uri: profile.avatarUrl }}
          style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }}
        />
      ) : (
        <View
          className="items-center justify-center rounded-full bg-primary/15"
          style={{ width: AVATAR, height: AVATAR }}
        >
          <Text className="text-primary text-[14px] font-bold">{initial}</Text>
        </View>
      )}
      {rewards > 0 && <Dot count={rewards} />}
    </Pressable>
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
    <View className="absolute right-1 top-1 min-w-[17px] h-[17px] items-center justify-center rounded-full bg-action border-2 border-background px-1">
      <Text className="text-action-foreground text-[9px] font-bold" allowFontScaling={false}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}
