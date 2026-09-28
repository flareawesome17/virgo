import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FolderIcon,
  CalendarIcon,
  HomeIcon,
  LayoutGridIcon,
  BriefcaseIcon,
} from 'lucide-react-native';
import { cssInterop, useColorScheme } from 'nativewind';
import {
  useCollaboratorInvitations,
  useEventInvitations,
  useUnseenJobs,
} from '@/src/hooks';
import { AppTabBar } from '@/components/AppTabBar';
import { PALETTES } from '@/theme';

for (const Icon of [FolderIcon, CalendarIcon, HomeIcon, LayoutGridIcon, BriefcaseIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** Icon area, excluding padding. Shorter since the labels came off. */
const TAB_CONTENT_HEIGHT = 44;
const TAB_PADDING_TOP = 8;

const badgeCount = (n: number) => (n > 0 ? (n > 99 ? '99+' : n) : undefined);

export default function TabsLayout() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  // An invitation is invisible until answered — the workspace does not
  // show up anywhere else — so the count has to live on the tab itself.
  const { invitations } = useCollaboratorInvitations();
  // Invitations to somebody else's shoot, waiting on an answer.
  const { invitations: eventInvites } = useEventInvitations();
  // Jobs posted since the board was last opened. It moved down here with the
  // tab; the top bar no longer carries it.
  const { count: unseenJobs } = useUnseenJobs();
  // Unread messages, friend requests and waiting rewards all badge the top
  // bar now rather than a tab, so this layout no longer counts them.
  const palette = isDark ? PALETTES.dark : PALETTES.light;

  // Used by the stock bar only; the iOS capsule draws its own.
  const tabBarBadgeStyle = {
    backgroundColor: palette.action,
    color: palette.actionForeground,
    fontSize: 11,
    fontWeight: '700' as const,
    minWidth: 17,
    height: 17,
    lineHeight: 13,
  };

  // The bar was a fixed height:88 / paddingBottom:28. On an iPhone with a home
  // indicator the bottom inset is 34pt, so 28 put the labels *underneath* it;
  // on a device with no indicator the same 28 was dead space. Deriving both
  // from the real inset fixes each case, with a floor so the bar never hugs
  // the very bottom edge on hardware-button devices.
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tabs
      // iOS gets the floating capsule. Android — and the web preview, which
      // reports its own platform — keep the stock bar with the options below,
      // exactly as before.
      tabBar={(props) =>
        Platform.OS === 'ios' ? <AppTabBar {...props} /> : <BottomTabBar {...props} />
      }
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: palette.card,
          borderTopColor: palette.border,
          borderTopWidth: 1,
          height: TAB_CONTENT_HEIGHT + TAB_PADDING_TOP + bottomInset,
          paddingTop: TAB_PADDING_TOP,
          paddingBottom: bottomInset,
        },
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.mutedForeground,
        // Icons alone, at five destinations. "Dashboard" and "Workspaces" do
        // not fit a fifth of a phone at a legible size, and shrinking the type
        // until they did would have made them unreadable rather than helpful.
        // The title still names each tab to a screen reader.
        tabBarShowLabel: false,
      }}
    >
      {/* The five places the work happens, in the order a day runs through
          them: what is on today, what other people are making, what is going,
          what you are delivering, and when. Connect and Settings are in the
          top bar instead — they are things you dip into, not places you live. */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused, color }) => (
            <HomeIcon color={color} size={25} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ focused, color }) => (
            <LayoutGridIcon color={color} size={25} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ focused, color }) => (
            <BriefcaseIcon color={color} size={25} strokeWidth={focused ? 2.5 : 2} />
          ),
          tabBarBadge: badgeCount(unseenJobs),
          tabBarBadgeStyle,
        }}
      />
      <Tabs.Screen
        name="workspaces"
        options={{
          title: 'Work',
          tabBarIcon: ({ focused, color }) => (
            <FolderIcon
              color={color}
              size={25}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
          tabBarBadge: badgeCount(invitations.length),
          tabBarBadgeStyle,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarBadge: badgeCount(eventInvites.length),
          tabBarBadgeStyle,
          tabBarIcon: ({ focused, color }) => (
            <CalendarIcon
              color={color}
              size={25}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      {/* Reached from the top bar. Tab routes rather than pushed screens, so
          the bar stays put and going back lands where you were. */}
      <Tabs.Screen name="connect" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      {/* Kept for deep links and existing calls. Connect owns their UI. */}
      <Tabs.Screen name="network" options={{ href: null }} />
      <Tabs.Screen name="chat" options={{ href: null }} />
    </Tabs>
  );
}
