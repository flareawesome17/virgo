import { Pressable, Text, View } from 'react-native';
// expo-image rather than RN Image, as everywhere else in this app.
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import { NotificationBell } from '@/components/NotificationBell';
import { useMarkJobsSeen, useUnseenJobs } from '@/src/hooks';

/** The app's own icon, so the bar cannot drift from the installed artwork. */
const LOGO = require('@/assets/icon.png');

/**
 * The bar every tab screen wears.
 *
 * Brand on the left, everything you act on gathered at the right thumb. Feed
 * and Jobs are the two top tabs: Jobs used to live *inside* the Home screen
 * behind a segmented control, where half the screen's content sat behind a
 * button that looked like a filter.
 *
 * It appears on all five tab screens rather than on Feed alone, because Feed
 * is no longer in the bottom bar — without a bar that travels, Workspaces
 * would be a screen with no way back to the dashboard.
 */
export function AppTopBar() {
  const pathname = usePathname();
  const { count: unseenJobs } = useUnseenJobs();
  const markSeen = useMarkJobsSeen();

  // `/` is Feed. Jobs owns its detail routes too, so a post opened from the
  // board keeps the tab it was opened from underlined.
  const onFeed = pathname === '/';
  const onJobs = pathname.startsWith('/jobs');

  return (
    <View className="flex-row items-center justify-between border-b border-border/40 bg-background px-4 py-2">
      <Pressable
        onPress={() => router.navigate('/')}
        accessibilityRole="button"
        accessibilityLabel="Virgo, back to Feed"
        hitSlop={8}
        className="flex-row items-center gap-2 active:opacity-70"
      >
        <Image
          source={LOGO}
          style={{ width: 28, height: 28, borderRadius: 8 }}
          contentFit="cover"
        />
        <Text className="text-foreground text-[17px] font-bold tracking-tight">
          Virgo
        </Text>
      </Pressable>

      <View className="flex-row items-center">
        {/* Not a third tab: it opens a screen and comes back, so it keeps the
            icon shape rather than taking a label beside the two that switch. */}
        <NotificationBell />
        <TopTab label="Feed" active={onFeed} onPress={() => router.navigate('/')} />
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
  );
}

/**
 * One of the two top tabs.
 *
 * Underlined rather than filled: these sit beside the bell in a bar that is
 * mostly brand, and two filled pills up there read as buttons competing with
 * it. The underline says "you are here" without adding a third weight.
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
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={badge > 0 ? `${label}, ${badge} new` : label}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      className={`min-h-11 flex-row items-center gap-1.5 px-2.5 pb-1.5 pt-2 ${
        active ? 'border-b-2 border-primary' : 'border-b-2 border-transparent'
      } active:opacity-70`}
    >
      <Text
        className={`text-[14px] font-bold ${
          active ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        {label}
      </Text>
      {badge > 0 && (
        <View className="min-w-[18px] rounded-full bg-action px-1.5">
          <Text className="text-action-foreground text-center text-[11px] font-bold">
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
