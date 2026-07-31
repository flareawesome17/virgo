import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeIcon, FolderIcon, UsersIcon, CalendarIcon, UserIcon } from 'lucide-react-native';
import { cssInterop, useColorScheme } from 'nativewind';

cssInterop(HomeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(FolderIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** Icon + label area, excluding padding. */
const TAB_CONTENT_HEIGHT = 52;
const TAB_PADDING_TOP = 8;

export default function TabsLayout() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

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
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
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
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
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
