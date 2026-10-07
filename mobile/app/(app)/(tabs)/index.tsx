import { View, Text, RefreshControl, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  dateToKey,
  eventColor,
  eventTypeLabel,
  formatTime,
  isEventUpcoming,
  parseDateKey,
  todayKey,
} from '@/src/lib/calendar';
// expo-image rather than RN Image: it decodes AVIF (and HEIC) on OS
// versions where the RN one silently renders nothing.
import { RemoteImage } from '@/components/RemoteImage';
import {
  useAlbums,
  useAuth,
  useBookings,
  useFriends,
  useMyJobs,
  useScheduleEventRange,
  useTheme,
  useUsage,
  useWorkspaces,
  usePlanLimits,
  useUnseenJobs,
  useMarkJobsSeen,
  useMoneySummary,
} from '@/src/hooks';
import { useChromeScroll } from '@/src/providers/ChromeProvider';
import { formatBytes, monthOf, monthRange, todayIso } from '@/src/api';
import { MoneyCard } from '@/components/money/MoneyCard';
import { useState } from 'react';
import { router } from 'expo-router';
import { goToTab } from '@/src/lib/navigation';
import {
  CalendarIcon,
  FolderPlusIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
  HardDriveIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_COVER } from '@/src/lib/placeholder';
import { PressableScale, Skeleton, StorageRing, TabScreen, useTabBottomInset } from '@/components';
import { LoadFailed } from '@/components/LoadFailed';
import { CHART_COLORS, PALETTES } from '@/theme';
import { SELLS_PLANS_HERE } from '@/src/lib/store-purchasing';

cssInterop(CalendarIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(FolderPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ArrowUpRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(HardDriveIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });


/**
 * "Today", "Tomorrow", a weekday this week, or a date.
 *
 * Counted in calendar days on the phone's clock. An event date is date-only,
 * and `new Date('2026-10-01')` is UTC midnight — 8 AM in Manila — so the old
 * sum of milliseconds, rounded up, called today's events "Tomorrow" until 8.
 */
function formatDate(dateStr: string): string {
  const d = parseDateKey(dateStr.slice(0, 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Rounded, not truncated: a day across a daylight-saving change is 23 or 25
  // hours long.
  const days = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1 && days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** It said "Good morning" at every hour. */
function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour >= 4 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardScreen() {
  const onScroll = useChromeScroll();
  const bottomInset = useTabBottomInset();
  const { count: unseenJobs } = useUnseenJobs();
  const markSeen = useMarkJobsSeen();

  const { guardWorkspaceCreate } = usePlanLimits();
  const { user, profile } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);

  const enabled = { enabled: !!user?.id };

  const {
    workspaces,
    isLoading: wsLoading,
    loadFailed: wsFailed,
    refetch: refetchWorkspaces,
  } = useWorkspaces(
    { orderBy: 'updated_at', direction: 'desc', limit: 3 },
    enabled,
  );

  const {
    albums,
    refetch: refetchAlbums,
  } = useAlbums(
    { orderBy: 'created_at', direction: 'desc', limit: 3 },
    enabled,
  );

  // The next 60 days, by date. It fetched the 50 earliest events: for an
  // account with 50 behind it, nothing ahead was ever among them, and Upcoming
  // stayed empty however full the calendar was.
  const [soonWindow] = useState(() => {
    const end = new Date();
    end.setDate(end.getDate() + 60);
    return { from: todayKey(), to: dateToKey(end) };
  });
  const {
    events,
    loadFailed: eventsFailed,
    refetch: refetchEvents,
  } = useScheduleEventRange(soonWindow.from, soonWindow.to);

  // Real cloud usage from the API — recorded from what B2 reports when an
  // upload is confirmed. Was hardcoded 128.4 / 512 GB.
  const {
    usage,
    storageUsedBytes,
    storageLimitBytes,
    storageFraction,
    refetch: refetchUsage,
  } = useUsage({ enabled: !!user?.id });

  /*
   * Accepted friendships only. A pending request is not a connection, and
   * counting it would make the number fall when somebody declines. `limit: 1`
   * because only the server's total is wanted here — the rows themselves are
   * the Connect screen's business.
   */
  const { total: connections, refetch: refetchConnections } = useFriends(
    { status: 'accepted', limit: 1 },
    enabled,
  );

  /** Posts this account has put up, whatever became of them. */
  const { jobs: myJobs, refetch: refetchMyJobs } = useMyJobs();

  /*
   * Work finished, counted from bookings rather than from posts, and from both
   * sides: a job somebody hired you for counts the same as one you posted and
   * filled. Finished means it was confirmed, was never cancelled, and its date
   * has passed — bookings carry no status field of their own.
   */
  const { bookings, refetch: refetchBookings } = useBookings(!!user?.id);
  // By the calendar day. new Date('2026-10-05') is midnight UTC, which is
  // 8 AM here, so today's booking counted as finished from breakfast on.
  const today = todayKey();
  const finishedJobs = bookings.filter(
    (b) => b.confirmed && !b.cancelledAt && b.eventDate != null && b.eventDate < today,
  ).length;

  // This month's money, for the card under Next up.
  const moneyMonth = monthOf(todayIso());
  const moneyRange = monthRange(moneyMonth);
  const { summary: money, refetch: refetchMoney } = useMoneySummary(moneyRange.from, moneyRange.to, {
    enabled: !!user?.id,
  });

  // Everything the screen shows. It left usage, connections, jobs and
  // bookings out, so a pull refreshed half the numbers.
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchWorkspaces(),
      refetchAlbums(),
      refetchEvents(),
      refetchUsage(),
      refetchConnections(),
      refetchMyJobs(),
      refetchBookings(),
      refetchMoney(),
    ]);
    setRefreshing(false);
  };

  // Both of these had no time filter at all — `events[0]` and `slice(0, 3)`
  // over an ascending list meant the oldest events, past ones included.
  const upcomingEvents = events
    .filter((e) => isEventUpcoming(e.event_date, e.event_time))
    .slice(0, 4);

  const nextEvent = upcomingEvents[0] ?? null;
  const laterEvents = upcomingEvents.slice(1);

  const workspaceNameById = Object.fromEntries(workspaces.map((w) => [w.id, w.name]));

  return (
    <TabScreen>
      {/* Brand, bell, and the Dashboard/Jobs tabs — the same bar on every tab
          screen. Jobs used to be half of this screen, behind a segmented
          control; it has its own address now. */}

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        // A style, not className: NativeWind does not reach Reanimated's
        // components.
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.primary}
          />
        }
      >
        {/* ── Header ── */}
        {/* The greeting alone. Your photo is at the start of the top bar now,
            as on every tab, so it was here twice. */}
        <View className="px-5 pt-4 pb-2">
          <Text className="text-muted-foreground text-sm font-medium">{greeting()}</Text>
          <Text className="text-foreground text-[28px] font-bold tracking-tight leading-[34px]">
            {profile?.displayName?.split(' ')[0] ?? 'there'}
          </Text>
        </View>

        {/* Storage moved to the foot of the screen, so when it is nearly full
            it says so up here instead — the one time it is worth the space. */}
        {storageLimitBytes ? storageFraction >= 0.9 && (
          <View className="px-5 pt-2">
            <PressableScale
              onPress={() =>
                router.push(SELLS_PLANS_HERE ? '/settings/storage/plans' : '/settings/storage')
              }
              accessibilityRole="button"
              scaleTo={0.98}
              className="min-h-12 flex-row items-center gap-3 rounded-2xl bg-destructive/10 px-4 py-3"
            >
              <HardDriveIcon size={18} className="text-destructive" />
              <View className="flex-1">
                <Text className="text-foreground text-sm font-semibold">
                  Storage {Math.round(storageFraction * 100)}% full
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  {SELLS_PLANS_HERE ? 'Get more room, or see what is taking it' : 'See what is taking the space'}
                </Text>
              </View>
              <ChevronRightIcon size={17} className="text-destructive" />
            </PressableScale>
          </View>
        ) : null}

        {/* ── Next up ── */}
        <View className="px-5 pt-4 pb-4">
          <Text className="text-muted-foreground text-[13px] font-semibold mb-2">Next up</Text>
          {eventsFailed && events.length === 0 ? (
            <View className="bg-card rounded-2xl border border-border/40">
              <LoadFailed what="your schedule" onRetry={() => refetchEvents()} compact />
            </View>
          ) : nextEvent ? (
            <PressableScale
              onPress={() => router.push(`/schedule/${nextEvent.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${nextEvent.title}`}
              scaleTo={0.98}
              className="bg-card rounded-3xl border border-border/40 p-5"
            >
              <View className="flex-row items-center justify-between">
                <View className="rounded-full bg-primary/10 px-3 py-1.5">
                  <Text className="text-primary text-xs font-bold">{formatDate(nextEvent.event_date)}</Text>
                </View>
                <ArrowUpRightIcon size={18} className="text-muted-foreground" />
              </View>
              <Text className="text-foreground text-[22px] leading-[28px] font-bold tracking-tight mt-4" numberOfLines={2}>
                {nextEvent.title}
              </Text>
              <Text className="text-muted-foreground text-sm leading-[20px] mt-2">
                {[formatTime(nextEvent.event_time), nextEvent.workspace_id ? workspaceNameById[nextEvent.workspace_id] : '', eventTypeLabel(nextEvent)]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </PressableScale>
          ) : (
            <PressableScale
              onPress={() => router.push('/schedule/create')}
              accessibilityRole="button"
              scaleTo={0.98}
              className="bg-card rounded-3xl border border-border/40 p-5 flex-row items-center gap-4"
            >
              <View className="w-11 h-11 rounded-2xl bg-primary/10 items-center justify-center">
                <CalendarIcon size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-base font-semibold">Your schedule is clear</Text>
                <Text className="text-muted-foreground text-sm mt-0.5">Add a shoot, review, or deadline</Text>
              </View>
              <ChevronRightIcon size={18} className="text-muted-foreground" />
            </PressableScale>
          )}
        </View>

        {/* ── Money ── */}
        <View className="px-5 pb-5">
          <MoneyCard month={moneyMonth} summary={money} />
        </View>

        {unseenJobs > 0 && (
          <View className="px-5 mb-5">
            <Pressable
              onPress={() => {
                router.push('/jobs');
                markSeen.mutate();
              }}
              accessibilityRole="button"
              className="min-h-14 rounded-2xl bg-primary/10 px-4 py-3 flex-row items-center gap-3 active:opacity-80"
            >
              <View className="min-w-8 h-8 rounded-full bg-action items-center justify-center px-2">
                <Text className="text-action-foreground text-xs font-bold">{unseenJobs > 99 ? '99+' : unseenJobs}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-sm font-semibold">New job activity</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">Review opportunities and application updates</Text>
              </View>
              <ChevronRightIcon size={17} className="text-primary" />
            </Pressable>
          </View>
        )}

        {/* ── Later schedule ── */}
        {laterEvents.length > 0 && (
          <View className="px-5 mb-1">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-foreground text-xl font-bold tracking-tight">Later</Text>
              <Pressable onPress={() => router.push('/schedule')} accessibilityRole="button" className="flex-row items-center gap-1 min-h-[44px] px-1 -mr-1 active:opacity-60">
                <Text className="text-primary text-sm font-semibold">See all</Text>
                <ChevronRightIcon size={14} className="text-primary" />
              </Pressable>
            </View>
            <View className="bg-card rounded-2xl overflow-hidden border border-border/30">
              {laterEvents.map((event, i) => (
                <Pressable
                  key={event.id}
                  onPress={() => router.push(`/schedule/${event.id}`)}
                  className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted/30"
                  style={i < laterEvents.length - 1 ? { borderBottomWidth: 1, borderBottomColor: palette.border } : undefined}
                >
                  <View style={{ width: 3, height: 36, borderRadius: 2, backgroundColor: eventColor(event.event_type) }} />
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>{event.title}</Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">{eventTypeLabel(event)}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-foreground text-xs font-bold">{formatDate(event.event_date)}</Text>
                    {event.event_time && <Text className="text-muted-foreground text-xs mt-0.5">{formatTime(event.event_time)}</Text>}
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ── Recent work ── */}
        <View className="px-5 mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground text-xl font-bold tracking-tight">Recent work</Text>
            <Pressable onPress={() => router.push('/workspaces')} accessibilityRole="button" className="flex-row items-center gap-1 min-h-[44px] px-1 -mr-1 active:opacity-60">
              <Text className="text-primary text-sm font-semibold">Workspaces</Text>
              <ChevronRightIcon size={14} className="text-primary" />
            </Pressable>
          </View>

          {albums.length > 0 && (
            <PressableScale
              onPress={() => router.push(`/albums/${albums[0].id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Open album ${albums[0].name}`}
              scaleTo={0.98}
              style={{ marginBottom: 12 }}
              className="bg-card rounded-3xl overflow-hidden border border-border/30"
            >
              <RemoteImage
                source={{ uri: albums[0].cover_url || PLACEHOLDER_COVER }}
                style={{ width: '100%', height: 148 }}
                contentFit="cover"
              />
              <View className="p-4 flex-row items-center gap-3">
                <View className="flex-1 min-w-0">
                  <Text className="text-foreground text-base font-semibold" numberOfLines={1}>{albums[0].name}</Text>
                  <Text className="text-muted-foreground text-xs mt-1">
                    {albums[0].item_count} items · {albums[0].status.charAt(0).toUpperCase() + albums[0].status.slice(1)}
                  </Text>
                </View>
                <ArrowUpRightIcon size={17} className="text-muted-foreground" />
              </View>
            </PressableScale>
          )}

          {wsLoading ? (
            <View className="gap-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="rounded-2xl" style={{ height: 72 }} />
              ))}
            </View>
          ) : wsFailed && workspaces.length === 0 ? (
            <View className="bg-card rounded-2xl">
              <LoadFailed what="your workspaces" onRetry={() => refetchWorkspaces()} compact />
            </View>
          ) : workspaces.length === 0 ? (
            <View className="bg-card rounded-2xl p-8 items-center gap-3">
              <View className="w-12 h-12 rounded-full bg-muted items-center justify-center">
                <FolderPlusIcon size={22} className="text-muted-foreground" />
              </View>
              <Text className="text-muted-foreground text-sm font-medium">No workspaces yet</Text>
              <Pressable
                onPress={guardWorkspaceCreate(() => router.push('/workspaces/create'))}
                className="min-h-11 bg-action rounded-xl px-4 py-2 items-center justify-center active:scale-[0.98]"
              >
                <Text className="text-action-foreground text-sm font-semibold">Create your first workspace</Text>
              </Pressable>
            </View>
          ) : (
            <View className="gap-3">
              {workspaces.slice(0, 2).map((ws) => (
                <PressableScale
                  key={ws.id}
                  onPress={() => router.push(`/workspaces/${ws.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${ws.name}`}
                  scaleTo={0.98}
                  className="bg-card rounded-2xl p-4 flex-row items-center gap-4 border border-border/30"
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      backgroundColor: `${ws.accent_color || palette.primary}18`,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '700', color: ws.accent_color || palette.primary }}>
                      {ws.name.charAt(0)}
                    </Text>
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-base font-semibold" numberOfLines={1}>
                      {ws.name}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      {ws.media_count.toLocaleString()} assets · {ws.collaborator_count} collaborators
                    </Text>
                  </View>
                  <ArrowUpRightIcon size={16} className="text-muted-foreground" />
                </PressableScale>
              ))}
            </View>
          )}
        </View>

        {/* ── Where the account stands ── */}
        {/* Last, under a name of its own. It opened the screen, above the
            next shoot, though storage and counts are what you look up now and
            then, and what is coming up is what you open the app for. */}
        <View className="px-5 mt-6">
          <Text className="text-foreground text-xl font-bold tracking-tight mb-3">Your account</Text>
          <View className="bg-card rounded-3xl border border-border/40 p-4 flex-row items-center gap-4">
            {/* An unlimited plan reports no limit, and a ring with no ceiling
                would draw a full one. It passes 0 and reads as empty. */}
            <StorageRing
              fraction={storageLimitBytes ? storageFraction : 0}
              color={storageFraction >= 0.9 ? palette.destructive : palette.primary}
              trackColor={palette.muted}
            />
            <View className="flex-1 gap-1.5">
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
                Storage
              </Text>
              {/* Nothing until it has loaded: "0 B used · Unlimited left" was
                  what a slow or offline start said, and both were wrong. */}
              <Text className="text-foreground text-base font-bold">
                {usage ? formatBytes(storageUsedBytes) : '—'}{' '}
                <Text className="text-muted-foreground text-xs font-medium">used</Text>
              </Text>
              <Text className="text-foreground text-base font-bold">
                {!usage
                  ? '—'
                  : storageLimitBytes
                    ? formatBytes(Math.max(storageLimitBytes - storageUsedBytes, 0))
                    : 'Unlimited'}{' '}
                <Text className="text-muted-foreground text-xs font-medium">left</Text>
              </Text>
              {storageFraction >= 0.9 && (
                // Where more cannot be bought (SELLS_PLANS_HERE), the useful
                // move is seeing what is taking the space.
                <Pressable
                  onPress={() =>
                    router.push(SELLS_PLANS_HERE ? '/settings/storage/plans' : '/settings/storage')
                  }
                  accessibilityRole="button"
                  className="active:opacity-70"
                >
                  <Text className="text-primary text-xs font-semibold">
                    {SELLS_PLANS_HERE ? 'Get more storage' : 'Manage storage'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          <View className="flex-row gap-2.5 mt-3">
            <StatTile
              value={connections}
              label="Connections"
              tint={palette.primary}
              // Your connections are on People. With no view, Connect opened
              // on Messages, so the tile counting connections showed chats.
              onPress={() => goToTab('/(app)/(tabs)/connect?view=people')}
            />
            <StatTile
              value={myJobs.length}
              label="Jobs posted"
              tint={palette.accent}
              onPress={() => goToTab('/(app)/(tabs)/jobs?tab=posted')}
            />
            {/* Nothing lists finished work yet, so this one only reports. */}
            <StatTile
              value={finishedJobs}
              label="Jobs finished"
              tint={CHART_COLORS.green}
            />
          </View>
        </View>

      </Animated.ScrollView>
    </TabScreen>
  );
}

/**
 * One of the three counts beside the storage ring.
 *
 * A tile each rather than a row of numbers: they measure three different
 * things, and the tint bar is what stops them reading as one figure split in
 * three. Two lead somewhere; the third has nowhere to go yet, and says so by
 * not responding to a press.
 */
function StatTile({
  value,
  label,
  tint,
  onPress,
}: {
  value: number;
  label: string;
  tint: string;
  onPress?: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${value} ${label.toLowerCase()}`}
      // The one that only reports does not give: nothing would happen.
      scaleTo={onPress ? 0.96 : 1}
      style={{ flex: 1 }}
      className="bg-card rounded-2xl border border-border/40 px-3 py-3 gap-1.5"
    >
      <Text className="text-foreground text-[22px] font-bold tracking-tight">
        {value > 999 ? '999+' : value}
      </Text>
      <Text className="text-muted-foreground text-[11px] leading-[14px] font-medium">
        {label}
      </Text>
      <View className="h-[3px] rounded-full" style={{ backgroundColor: tint }} />
    </PressableScale>
  );
}


