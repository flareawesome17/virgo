import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import {
  BellIcon,
  BriefcaseBusinessIcon,
  CalendarIcon,
  CheckCheckIcon,
  CreditCardIcon,
  FileTextIcon,
  LifeBuoyIcon,
  MessageCircleIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useMarkNotificationsRead,
  useNotifications,
} from '@/src/hooks';
import { LoadFailed } from '@/components/LoadFailed';
import type { AppNotification, NotificationTopic } from '@/src/api';

const interop = { className: { target: 'style', nativeStyleToProp: { color: true } } } as const;
cssInterop(BellIcon, interop);
cssInterop(BriefcaseBusinessIcon, interop);
cssInterop(CalendarIcon, interop);
cssInterop(CheckCheckIcon, interop);
cssInterop(CreditCardIcon, interop);
cssInterop(FileTextIcon, interop);
cssInterop(LifeBuoyIcon, interop);
cssInterop(MessageCircleIcon, interop);
cssInterop(Trash2Icon, interop);
cssInterop(UserPlusIcon, interop);
cssInterop(UsersIcon, interop);

type IconType = typeof BellIcon;

/**
 * An icon per topic, and where tapping one goes.
 *
 * Matches web's table and the notification routing in useNotificationRouting —
 * a notification opened from this list has to land where the push for the same
 * event would, or the two disagree about what happened.
 */
const TOPICS: Record<
  NotificationTopic,
  { icon: IconType; href: string | ((d: Record<string, unknown>) => string) }
> = {
  'friend-request': { icon: UserPlusIcon, href: '/friends' },
  'friend-accepted': { icon: UserPlusIcon, href: '/friends' },
  'collaborator-invite': { icon: UsersIcon, href: '/workspaces' },
  'collaborator-response': { icon: UsersIcon, href: '/workspaces' },
  'event-invite': { icon: CalendarIcon, href: '/schedule' },
  'event-response': { icon: CalendarIcon, href: '/schedule' },
  'hire-enquiry': { icon: MessageCircleIcon, href: '/friends/enquiries' },
  'hire-response': { icon: MessageCircleIcon, href: '/friends/enquiries' },
  'job-application': { icon: BriefcaseBusinessIcon, href: '/jobs/mine?tab=posted' },
  'job-response': {
    icon: BriefcaseBusinessIcon,
    href: (d) =>
      typeof d.conversationId === 'string'
        ? `/chat/${d.conversationId}`
        : '/jobs/mine?tab=applied',
  },
  booking: {
    icon: FileTextIcon,
    href: (d) =>
      typeof d.bookingId === 'string' ? `/bookings/${d.bookingId}` : '/bookings',
  },
  reminder: { icon: CalendarIcon, href: '/schedule' },
  billing: { icon: CreditCardIcon, href: '/settings/billing' },
  retention: { icon: Trash2Icon, href: '/albums' },
  support: { icon: LifeBuoyIcon, href: '/support' },
};

/** "4m", "3h", "2d" — a list this dense has no room for a sentence. */
function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Everything that happened while you were not looking.
 *
 * Until this existed a notification was a socket frame and a push and nothing
 * else — miss both and the app showed no sign anyone had applied to your job
 * or answered your application. A full screen rather than a popover: on a
 * phone there is nowhere to put one, and this is a list people scroll.
 */
export default function NotificationsScreen() {
  const { notifications, unread, isLoading, loadFailed, refetch } =
    useNotifications();
  const markRead = useMarkNotificationsRead();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const open = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    const topic = TOPICS[n.topic];
    if (!topic) return;
    const href = typeof topic.href === 'function' ? topic.href(n.data) : topic.href;
    router.push(href as never);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerBackTitle: 'Back',
          headerRight: () =>
            unread > 0 ? (
              <Pressable
                onPress={() => markRead.mutate(undefined)}
                disabled={markRead.isPending}
                className="flex-row items-center gap-1.5 px-1"
                style={{ opacity: markRead.isPending ? 0.5 : 1 }}
              >
                <CheckCheckIcon size={14} color="#B66A40" />
                <Text className="text-[12px] font-semibold" style={{ color: '#B66A40' }}>
                  Mark all read
                </Text>
              </Pressable>
            ) : null,
        }}
      />

      {isLoading && notifications.length === 0 ? (
        <ActivityIndicator color="#B66A40" className="mt-10" />
      ) : loadFailed && notifications.length === 0 ? (
        <LoadFailed what="your notifications" onRetry={() => refetch()} />
      ) : notifications.length === 0 ? (
        <View className="mt-16 items-center px-10">
          <BellIcon size={26} color="#9ca3af" />
          <Text className="text-foreground mt-3 text-[15px] font-semibold">
            Nothing yet
          </Text>
          <Text className="text-muted-foreground mt-1 text-center text-[12px] leading-5">
            Applications, answers and bookings will show up here.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#B66A40"
            />
          }
        >
          {notifications.map((n) => {
            const Icon = TOPICS[n.topic]?.icon ?? BellIcon;
            return (
              <Pressable
                key={n.id}
                onPress={() => open(n)}
                className="border-border flex-row items-start gap-3 border-b px-5 py-4"
                style={{ backgroundColor: n.readAt ? undefined : '#B66A400A' }}
              >
                <View
                  className="mt-0.5 h-8 w-8 items-center justify-center rounded-full"
                  style={{ backgroundColor: n.readAt ? '#8881' : '#B66A401F' }}
                >
                  <Icon size={15} color={n.readAt ? '#9ca3af' : '#B66A40'} />
                </View>

                <View className="min-w-0 flex-1">
                  <View className="flex-row items-baseline gap-2">
                    <Text
                      className="text-foreground min-w-0 flex-1 text-[14px] font-semibold"
                      numberOfLines={1}
                    >
                      {n.title}
                    </Text>
                    <Text className="text-muted-foreground text-[11px]">
                      {ago(n.createdAt)}
                    </Text>
                  </View>
                  <Text
                    className="text-muted-foreground mt-0.5 text-[12px] leading-5"
                    numberOfLines={2}
                  >
                    {n.body}
                  </Text>
                </View>

                {!n.readAt && (
                  <View
                    className="mt-2 rounded-full"
                    style={{ width: 6, height: 6, backgroundColor: '#B66A40' }}
                  />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
