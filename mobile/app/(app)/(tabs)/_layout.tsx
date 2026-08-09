import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HomeIcon,
  FolderIcon,
  UsersIcon,
  CalendarIcon,
  UserIcon,
  MessageCircleIcon,
} from 'lucide-react-native';
import { cssInterop, useColorScheme } from 'nativewind';
import {
  useCollaboratorInvitations,
  useEventInvitations,
  useIncomingFriendRequests,
  useUnreadCount,
  useUnseenJobs,
} from '@/src/hooks';

cssInterop(HomeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(FolderIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MessageCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** Icon + label area, excluding padding. */
const TAB_CONTENT_HEIGHT = 52;
const TAB_PADDING_TOP = 8;

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
  // Open postings not yet looked at. The Jobs board lives inside the Home
  // screen rather than having a tab of its own, so this is the only place a
  // new posting can announce itself without the screen being open.
  const { count: newJobs } = useUnseenJobs();

  // The bar was a fixed height:88 / paddingBottom:28. On an iPhone with a home
  // indicator the bottom inset is 34pt, so 28 put the labels *underneath* it;
  // on a device with no indicator the same 28 was dead space. Deriving both
  // from the real inset fixes each case, with a floor so the bar never hugs
  // the very bottom edge on hardware-button devices.
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? '#1E1B18' : '#FFFFFF',
          borderTopColor: isDark ? '#2A2522' : '#D9C2B7',
          borderTopWidth: 1,
          height: TAB_CONTENT_HEIGHT + TAB_PADDING_TOP + bottomInset,
          paddingTop: TAB_PADDING_TOP,
          paddingBottom: bottomInset,
        },
        tabBarActiveTintColor: isDark ? '#C17745' : '#B66A40',
        tabBarInactiveTintColor: isDark ? '#54433C' : '#A89489',
        // 10pt, not 11: with Chat there are six tabs, and at 11 "Workspaces"
        // ellipsizes on a 360pt-wide screen.
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarBadge:
            newJobs > 0 ? (newJobs > 99 ? '99+' : newJobs) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#B66A40',
            fontSize: 10,
            fontWeight: '700',
            minWidth: 17,
            height: 17,
            lineHeight: 13,
          },
          tabBarIcon: ({ focused }) => (
            <HomeIcon
              className={focused ? 'text-[#B66A40]' : 'text-[#A89489]'}
              size={22}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="workspaces"
        options={{
          title: 'Workspaces',
          tabBarIcon: ({ focused }) => (
            <FolderIcon
              className={focused ? 'text-[#B66A40]' : 'text-[#A89489]'}
              size={22}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
          tabBarBadge:
            invitations.length > 0
              ? invitations.length > 99
                ? '99+'
                : invitations.length
              : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#B66A40',
            fontSize: 10,
            fontWeight: '700',
            minWidth: 17,
            height: 17,
            lineHeight: 13,
          },
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          title: 'Network',
          tabBarIcon: ({ focused }) => (
            <UsersIcon
              className={focused ? 'text-[#B66A40]' : 'text-[#A89489]'}
              size={22}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
          tabBarBadge:
            friendRequests > 0
              ? friendRequests > 99
                ? '99+'
                : friendRequests
              : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#B66A40',
            fontSize: 10,
            fontWeight: '700',
            minWidth: 17,
            height: 17,
            lineHeight: 13,
          },
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarBadge:
            eventInvites.length > 0
              ? eventInvites.length > 99
                ? '99+'
                : eventInvites.length
              : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#B66A40',
            fontSize: 10,
            fontWeight: '700',
            minWidth: 17,
            height: 17,
            lineHeight: 13,
          },
          tabBarIcon: ({ focused }) => (
            <CalendarIcon
              className={focused ? 'text-[#B66A40]' : 'text-[#A89489]'}
              size={22}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ focused }) => (
            <MessageCircleIcon
              className={focused ? 'text-[#B66A40]' : 'text-[#A89489]'}
              size={22}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#B66A40',
            fontSize: 10,
            fontWeight: '700',
            minWidth: 17,
            height: 17,
            lineHeight: 13,
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => (
            <UserIcon
              className={focused ? 'text-[#B66A40]' : 'text-[#A89489]'}
              size={22}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
    </Tabs>
  );
}
