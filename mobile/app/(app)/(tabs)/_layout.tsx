import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FolderIcon,
  UsersIcon,
  CalendarIcon,
  SettingsIcon,
} from 'lucide-react-native';
import { cssInterop, useColorScheme } from 'nativewind';
import {
  useCollaboratorInvitations,
  useEventInvitations,
  useIncomingFriendRequests,
  usePromoOffers,
  useUnreadCount,
} from '@/src/hooks';
import { AppTabBar } from '@/components/AppTabBar';
import { PALETTES } from '@/theme';

cssInterop(FolderIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SettingsIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** Icon + label area, excluding padding. */
const TAB_CONTENT_HEIGHT = 52;
const TAB_PADDING_TOP = 8;

const badgeCount = (n: number) => (n > 0 ? (n > 99 ? '99+' : n) : undefined);

export default function TabsLayout() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const unread = useUnreadCount();
  // An invitation is invisible until answered — the workspace does not
  // show up anywhere else — so the count has to live on the tab itself.
  const { invitations } = useCollaboratorInvitations();
  // Friend requests waiting on an answer, so the tab says so without
  // being opened — the socket keeps it current.
  const { count: friendRequests } = useIncomingFriendRequests();
  // Invitations to somebody else's shoot, waiting on an answer.
  const { invitations: eventInvites } = useEventInvitations();
  // Rewards waiting to be claimed. Almost always an empty list, and the only
  // thing that says an offer arrived while the app was closed.
  const { offers: rewards } = usePromoOffers();
  const connectAlerts = unread + friendRequests;
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
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.2,
        },
      }}
    >
      {/* Dashboard is still the app's first screen, but not a bottom-bar
          entry. The top bar carries Dashboard and Jobs, and listing either
          below as well would be the same destination twice — the logo
          returns to the Dashboard from wherever you are. Jobs is a tab route
          rather than a pushed screen so the bar stays put while you are on it. */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="jobs" options={{ href: null }} />
      <Tabs.Screen
        name="workspaces"
        options={{
          title: 'Workspaces',
          tabBarIcon: ({ focused, color }) => (
            <FolderIcon
              color={color}
              size={22}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
          tabBarBadge: badgeCount(invitations.length),
          tabBarBadgeStyle,
        }}
      />
      <Tabs.Screen
        name="connect"
        options={{
          title: 'Connect',
          tabBarIcon: ({ focused, color }) => (
            <UsersIcon
              color={color}
              size={22}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
          tabBarBadge: badgeCount(connectAlerts),
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
              size={22}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused, color }) => (
            <SettingsIcon
              color={color}
              size={22}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
          // Rewards are one row into this tab, and an offer expires. The badge
          // is carried on the tab and again on the Profile & account half, so
          // it is never the case that something is waiting and nothing on
          // screen says so.
          tabBarBadge: badgeCount(rewards.length),
          tabBarBadgeStyle,
        }}
      />
      {/* Keep the original routes available for deep links and existing calls,
          but remove them from primary navigation. Connect owns their UI. */}
      <Tabs.Screen name="network" options={{ href: null }} />
      <Tabs.Screen name="chat" options={{ href: null }} />
    </Tabs>
  );
}
