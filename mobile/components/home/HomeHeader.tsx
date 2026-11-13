import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { useAuth } from '@/src/hooks';

const PHOTO = 44;

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** "Saturday, 14 November": day before month, as dates are written here. */
function longDate(now: Date): string {
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const month = now.toLocaleDateString('en-US', { month: 'long' });
  return `${weekday}, ${now.getDate()} ${month}`;
}

/**
 * The top of the Dashboard: the day, a greeting, and your photo, in one row.
 *
 * It was your whole profile — cover, a 96pt photo, your name and three
 * counts — which took the first two thirds of the screen before the day
 * began. Those say who you are to other people, so they moved to About; what
 * opens the app now is what you have on today.
 *
 * The same row sits above all four tabs, so the tabs under it never move
 * when you switch between them. It scrolls away; the tabs stay.
 */
export function HomeHeader({
  onLayout,
  onPressPhoto,
}: {
  onLayout?: (event: LayoutChangeEvent) => void;
  /** Your photo opens the tab your profile is on. */
  onPressPhoto: () => void;
}) {
  const { user, profile } = useAuth();
  const name = profile?.displayName?.trim() || user?.email.split('@')[0] || '';
  const first = name.split(/\s+/)[0] ?? '';
  const now = new Date();

  return (
    <View onLayout={onLayout} className="flex-row items-center gap-4 px-5 py-3">
      <View className="flex-1 min-w-0">
        <Text className="text-muted-foreground text-[13px] leading-[18px] font-semibold">
          {longDate(now)}
        </Text>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          className="text-foreground text-[26px] leading-[32px] font-bold tracking-tight mt-0.5"
        >
          {first ? `${greeting(now)}, ${first}` : greeting(now)}
        </Text>
      </View>

      <Pressable
        onPress={onPressPhoto}
        accessibilityRole="button"
        accessibilityLabel="Your profile"
        hitSlop={4}
        className="rounded-full border border-border/70 p-[2px] active:opacity-80"
      >
        {profile?.avatarUrl ? (
          <RemoteImage
            source={{ uri: profile.avatarUrl }}
            style={{ width: PHOTO, height: PHOTO, borderRadius: PHOTO / 2 }}
            contentFit="cover"
          />
        ) : (
          <View
            className="rounded-full bg-primary/15 items-center justify-center"
            style={{ width: PHOTO, height: PHOTO }}
          >
            <Text className="text-primary text-[16px] font-bold">
              {(name.charAt(0) || '?').toUpperCase()}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}
