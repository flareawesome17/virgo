import { Platform, Pressable, Text, View } from 'react-native';
// expo-image rather than RN Image, as everywhere else in this app.
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import { NotificationBell } from '@/components/NotificationBell';
import { UpdateBanner } from '@/components/UpdateBanner';
import { useMarkJobsSeen, useUnseenJobs } from '@/src/hooks';

/**
 * The mark itself, transparent — not assets/icon.png, which is the store
 * tile with a cream ground baked into it. Cropped to 28px that ground was the
 * logo and the mark a speck inside it. The welcome screen shows this same
 * asset bare for the same reason: the mark carries its own colour, and a
 * container behind it only competes with it.
 */
const LOGO = require('@/assets/splash-icon.png');

/**
 * The bar every tab screen wears, in two tiers.
 *
 * The first tier is identity and the one action: the mark and wordmark on the
 * left, the bell alone on the right. The second is where you are: Dashboard
 * and Jobs as equal-width tabs. They used to share one row — logo, then bell,
 * then the tabs — and the bell sat between an empty left half and the text
 * tabs, where it read as a stray fourth tab. Giving it a row of its own is
 * what fixes that; spacing alone did not.
 *
 * The Feed joins the second tier when it ships. Listing it before there is
 * anything in it would be a tab that leads to an empty screen.
 *
 * It appears on all six tab screens rather than on Dashboard alone: without
 * a bar that travels, Workspaces would be a screen with no way back to it.
 */
export function AppTopBar() {
  const pathname = usePathname();
  const { count: unseenJobs } = useUnseenJobs();
  const markSeen = useMarkJobsSeen();

  // `/` is the Dashboard. Jobs owns its detail routes too, so a post opened
  // from the board keeps the tab it was opened from underlined. On the four
  // bottom-bar screens neither matches, and no tab is underlined.
  const onDashboard = pathname === '/';
  const onJobs = pathname.startsWith('/jobs');

  return (
    <>
      <View className="bg-background">
        <View className="min-h-11 flex-row items-center justify-between pl-4 pr-1">
          <Pressable
            onPress={() => router.navigate('/')}
            accessibilityRole="button"
            accessibilityLabel="Virgo, go to Dashboard"
            hitSlop={8}
            className="min-h-11 flex-row items-center gap-2 active:opacity-70"
          >
            <Image
              source={LOGO}
              style={{ width: 28, height: 28 }}
              contentFit="contain"
            />
            <Text className="text-foreground text-[20px] font-bold tracking-tight">
              Virgo
            </Text>
          </Pressable>

          <NotificationBell />
        </View>

        <View accessibilityRole="tablist" className="min-h-11 flex-row">
          <TopTab
            label="Dashboard"
            active={onDashboard}
            onPress={() => router.navigate('/')}
          />
          <TopTab
            label="Jobs"
            active={onJobs}
            badge={unseenJobs}
            onPress={() => {
              router.navigate('/jobs');
              // Opening the tab is what "seen" means. The hook zeroes the cached
              // count so the badge does not flash back mid-request.
              if (unseenJobs > 0) markSeen.mutate();
            }}
          />
        </View>
      </View>
      {/* Under the bar, not in it: the rows above are a fixed set of
          destinations, and this is news. Here rather than wrapping the
          navigator — unlike an upload, which starts from an album, a new
          build is something you are told about on landing, and the app
          opens on a tab. Renders nothing the rest of the time. */}
      <UpdateBanner />
    </>
  );
}

/**
 * One of the second-tier tabs.
 *
 * Equal widths, so each is a large target and a "99+" badge fits without
 * pushing its neighbour. The underline is as wide as the label rather than
 * the cell: a full-width bar under half the screen reads as a divider, not
 * as "you are here". Same weight in both states, so switching tabs does not
 * make the labels jump.
 */
function TopTab({
  label,
  active,
  badge = 0,
  onPress,
}: {
  label: string;
  active: boolean;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      // 'tab' carries no trait on iOS; VoiceOver would read the name alone.
      accessibilityRole={Platform.OS === 'ios' ? 'button' : 'tab'}
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}${badge > 0 ? `, ${badge} new` : ''}${Platform.OS === 'ios' ? ', tab' : ''}`}
      className="flex-1 items-center active:opacity-70"
    >
      <View
        className={`flex-1 min-h-11 flex-row items-center gap-1.5 border-b-[3px] ${
          active ? 'border-primary' : 'border-transparent'
        }`}
      >
        <Text
          className={`text-[15px] font-semibold ${
            active ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {label}
        </Text>
        {badge > 0 && (
          <View className="min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-action px-1.5">
            <Text className="text-action-foreground text-[11px] font-bold">
              {badge > 99 ? '99+' : badge}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
