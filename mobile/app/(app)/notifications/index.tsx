import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  Text,
  View,
} from 'react-native';
import { useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import {
  BellIcon,
  CheckCheckIcon,
  CheckIcon,
  ChevronLeftIcon,
  MailIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from 'lucide-react-native';
import {
  useDeleteNotifications,
  useMarkNotificationsRead,
  useMarkNotificationsUnread,
  useNotificationFeed,
  useTheme,
} from '@/src/hooks';
import { LoadFailed } from '@/components/LoadFailed';
import { NotificationIcon } from '@/components/NotificationIcon';
import type { AppNotification, NotificationCategory } from '@/src/api';
import {
  CATEGORY_LABELS,
  FILTER_CATEGORIES,
  groupByDay,
  timeOfDay,
} from '@/src/lib/notification-categories';
import { PALETTES, type Palette } from '@/theme';

/** "4m", "3h" — for today's rows, where the day heading already says the date. */
function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return timeOfDay(iso);
}

/**
 * One notification in the list.
 *
 * The title is never cut — it is usually the whole point — and the body is
 * previewed in two lines; tapping opens all of it. Swiping left offers read
 * or unread and delete, which screen readers get as actions on the row.
 */
function Row({
  n,
  today,
  first,
  last,
  palette,
  onToggleRead,
  onDelete,
}: {
  n: AppNotification;
  today: boolean;
  first: boolean;
  last: boolean;
  palette: Palette;
  onToggleRead: (n: AppNotification) => void;
  onDelete: (n: AppNotification) => void;
}) {
  const unread = !n.readAt;
  const open = () => router.push(`/notifications/${n.id}` as never);

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={48}
      overshootRight={false}
      containerStyle={{
        marginHorizontal: 16,
        backgroundColor: palette.card,
        borderColor: palette.border,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderTopWidth: first ? 1 : 0,
        borderBottomWidth: last ? 1 : 0,
        borderTopLeftRadius: first ? 14 : 0,
        borderTopRightRadius: first ? 14 : 0,
        borderBottomLeftRadius: last ? 14 : 0,
        borderBottomRightRadius: last ? 14 : 0,
        overflow: 'hidden',
      }}
      renderRightActions={(_progress, _translation, swipeable) => (
        <View style={{ flexDirection: 'row' }}>
          <Pressable
            onPress={() => {
              swipeable.close();
              onToggleRead(n);
            }}
            accessibilityLabel={unread ? 'Mark as read' : 'Mark as unread'}
            style={{
              width: 78,
              backgroundColor: palette.info,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            {unread ? <CheckIcon size={18} color="#fff" /> : <MailIcon size={18} color="#fff" />}
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
              {unread ? 'Read' : 'Unread'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onDelete(n)}
            accessibilityLabel="Delete"
            style={{
              width: 78,
              backgroundColor: palette.destructive,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <Trash2Icon size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Delete</Text>
          </Pressable>
        </View>
      )}
    >
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityHint="Opens the whole notification"
        accessibilityActions={[
          { name: unread ? 'markRead' : 'markUnread', label: unread ? 'Mark as read' : 'Mark as unread' },
          { name: 'delete', label: 'Delete' },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') onDelete(n);
          else onToggleRead(n);
        }}
        className="flex-row items-start gap-3 px-3.5 py-3"
        style={{
          backgroundColor: unread ? `${palette.primary}0D` : palette.card,
          borderTopWidth: first ? 0 : 1,
          borderTopColor: `${palette.border}80`,
        }}
      >
        <NotificationIcon topic={n.topic} palette={palette} />
        <View className="min-w-0 flex-1" style={{ gap: 2 }}>
          <View className="flex-row items-baseline gap-2">
            <Text
              className="text-foreground min-w-0 flex-1 text-[15px] leading-5"
              style={{ fontWeight: unread ? '600' : '500' }}
            >
              {n.title}
            </Text>
            <Text className="text-muted-foreground text-[12px]">
              {today ? ago(n.createdAt) : timeOfDay(n.createdAt)}
            </Text>
          </View>
          <Text
            className={`text-[13px] leading-[18px] ${unread ? 'text-foreground/80' : 'text-muted-foreground'}`}
            numberOfLines={2}
          >
            {n.body}
          </Text>
        </View>
        {unread && (
          <View
            accessibilityLabel="Unread"
            className="mt-2 rounded-full"
            style={{ width: 8, height: 8, backgroundColor: palette.primary }}
          />
        )}
      </Pressable>
    </ReanimatedSwipeable>
  );
}

/**
 * Everything that happened while you were not looking.
 *
 * Grouped by day, filterable by kind, and paged back through everything the
 * server keeps (90 days) as you scroll. Each notification opens in full on
 * its own screen; before that screen existed, a notification longer than two
 * lines could not be read anywhere on the phone.
 */
export default function NotificationsScreen() {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState<NotificationCategory | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const {
    notifications,
    unread,
    isLoading,
    loadFailed,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useNotificationFeed({ unread: unreadOnly, category });
  const markRead = useMarkNotificationsRead();
  const markUnread = useMarkNotificationsUnread();
  const remove = useDeleteNotifications();

  const sections = useMemo(
    () => groupByDay(notifications).map((day) => ({ title: day.title, data: day.items })),
    [notifications],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const toggleRead = (n: AppNotification) =>
    n.readAt ? markUnread.mutate([n.id]) : markRead.mutate([n.id]);

  const chip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="h-[34px] justify-center rounded-full px-3.5"
      style={{
        backgroundColor: active ? palette.foreground : palette.card,
        borderWidth: active ? 0 : 1,
        borderColor: palette.border,
      }}
    >
      <Text
        className="text-[13px]"
        style={{ color: active ? palette.background : palette.foreground, fontWeight: active ? '600' : '500' }}
      >
        {label}
      </Text>
    </Pressable>
  );

  const emptyTitle = unreadOnly
    ? 'Nothing unread'
    : category
      ? `No ${CATEGORY_LABELS[category].toLowerCase()} notifications`
      : 'Nothing yet';

  return (
    // 'top' as well as 'bottom'. The stack runs headerShown:false, so nothing
    // above this reserves the status bar.
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-2 pt-1">
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Back"
          hitSlop={8}
          className="h-11 w-11 items-center justify-center"
        >
          <ChevronLeftIcon size={24} color={palette.secondaryForeground} />
        </Pressable>
        <Pressable
          onPress={() => router.push('/settings/notifications' as never)}
          accessibilityLabel="Notification settings"
          hitSlop={8}
          className="h-11 w-11 items-center justify-center"
        >
          <SlidersHorizontalIcon size={21} color={palette.secondaryForeground} />
        </Pressable>
      </View>

      <View className="flex-row items-end justify-between px-5 pb-3">
        <View>
          <Text className="text-foreground text-[28px] font-bold" style={{ letterSpacing: -0.5 }}>
            Notifications
          </Text>
          <Text className="text-muted-foreground mt-0.5 text-[13px]">
            {unread > 0 ? `${unread} unread` : 'All caught up'}
          </Text>
        </View>
        {unread > 0 && (
          <Pressable
            onPress={() => markRead.mutate(undefined)}
            disabled={markRead.isPending}
            className="h-9 flex-row items-center gap-1.5"
            style={{ opacity: markRead.isPending ? 0.5 : 1 }}
          >
            <CheckCheckIcon size={16} color={palette.primary} />
            <Text className="text-[13px] font-semibold" style={{ color: palette.primary }}>
              Mark all read
            </Text>
          </Pressable>
        )}
      </View>

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 12 }}
        >
          {chip('All', !unreadOnly && !category, () => {
            setUnreadOnly(false);
            setCategory(null);
          })}
          {chip(unread > 0 ? `Unread · ${unread}` : 'Unread', unreadOnly, () =>
            setUnreadOnly(!unreadOnly),
          )}
          {FILTER_CATEGORIES.map((key) =>
            chip(CATEGORY_LABELS[key], category === key, () =>
              setCategory(category === key ? null : key),
            ),
          )}
        </ScrollView>
      </View>

      {isLoading && notifications.length === 0 ? (
        <ActivityIndicator color={palette.primary} className="mt-10" />
      ) : loadFailed && notifications.length === 0 ? (
        <LoadFailed what="your notifications" onRetry={() => refetch()} />
      ) : notifications.length === 0 ? (
        <View className="mt-16 items-center px-10">
          <BellIcon size={26} color={palette.mutedForeground} />
          <Text className="text-foreground mt-3 text-[15px] font-semibold">{emptyTitle}</Text>
          <Text className="text-muted-foreground mt-1 text-center text-[12px] leading-5">
            Applications, answers, bookings and client picks will show up here.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderSectionHeader={({ section }) => (
            <Text
              className="text-muted-foreground px-5 pb-2 pt-4 text-[11px] font-bold uppercase"
              style={{ letterSpacing: 1.5 }}
            >
              {section.title}
            </Text>
          )}
          renderItem={({ item, index, section }) => (
            <Row
              n={item}
              today={section.title === 'Today'}
              first={index === 0}
              last={index === section.data.length - 1}
              palette={palette}
              onToggleRead={toggleRead}
              onDelete={(n) => remove.mutate([n.id])}
            />
          )}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator color={palette.primary} className="mt-5" />
            ) : !hasNextPage ? (
              <Text className="text-muted-foreground mt-6 text-center text-[12px]">
                That is everything from the last 90 days.
              </Text>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
