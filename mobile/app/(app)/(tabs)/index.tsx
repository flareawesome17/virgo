import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { eventColor, eventTypeLabel, isEventUpcoming } from '@/src/lib/calendar';
// expo-image rather than RN Image: it decodes AVIF (and HEIC) on OS
// versions where the RN one silently renders nothing.
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useAlbums,
  useAuth,
  useBookings,
  useFriends,
  useMyJobs,
  useScheduleEvents,
  useTheme,
  useUsage,
  useWorkspaces,
  usePlanLimits,
  useUnseenJobs,
  useMarkJobsSeen,
} from '@/src/hooks';
import { formatBytes } from '@/src/api';
import { useState } from 'react';
import { router } from 'expo-router';
import {
  CalendarIcon,
  PlusIcon,
  UserPlusIcon,
  FolderPlusIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_COVER } from '@/src/lib/placeholder';
import { AppTopBar, StorageRing } from '@/components';
import { LoadFailed } from '@/components/LoadFailed';
import { CHART_COLORS, PALETTES } from '@/theme';

cssInterop(CalendarIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(FolderPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ArrowUpRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const QUICK_ACTIONS = [
  { key: 'workspace', label: 'Workspace', icon: FolderPlusIcon },
  { key: 'album', label: 'Album', icon: PlusIcon },
  { key: 'invite', label: 'Invite', icon: UserPlusIcon },
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export default function FeedScreen() {
  const { count: unseenJobs } = useUnseenJobs();
  const markSeen = useMarkJobsSeen();

  const { guardWorkspaceCreate, guardAlbumCreate } = usePlanLimits();
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

  // Fetches a window rather than 4: sorted ascending, the first few rows are
  // the *oldest* events, so a small limit could return nothing but past ones
  // and leave Upcoming permanently empty once they were filtered out.
  const {
    events,
    loadFailed: eventsFailed,
    refetch: refetchEvents,
  } = useScheduleEvents(
    { orderBy: 'event_date', direction: 'asc', limit: 50 },
    enabled,
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchWorkspaces(),
      refetchAlbums(),
      refetchEvents(),
    ]);
    setRefreshing(false);
  };

  // Real cloud usage from the API — recorded from what B2 reports when an
  // upload is confirmed. Was hardcoded 128.4 / 512 GB.
  const {
    storageUsedBytes,
    storageLimitBytes,
    storageFraction,
  } = useUsage({ enabled: !!user?.id });

  /*
   * Accepted friendships only. A pending request is not a connection, and
   * counting it would make the number fall when somebody declines. `limit: 1`
   * because only the server's total is wanted here — the rows themselves are
   * the Connect screen's business.
   */
  const { total: connections } = useFriends(
    { status: 'accepted', limit: 1 },
    enabled,
  );

  /** Posts this account has put up, whatever became of them. */
  const { jobs: myJobs } = useMyJobs();

  /*
   * Work finished, counted from bookings rather than from posts, and from both
   * sides: a job somebody hired you for counts the same as one you posted and
   * filled. Finished means it was confirmed, was never cancelled, and its date
   * has passed — bookings carry no status field of their own.
   */
  const { bookings } = useBookings(!!user?.id);
  const finishedJobs = bookings.filter(
    (b) =>
      b.confirmed &&
      !b.cancelledAt &&
      b.eventDate != null &&
      new Date(b.eventDate) < new Date(),
  ).length;

  // Both of these had no time filter at all — `events[0]` and `slice(0, 3)`
  // over an ascending list meant the oldest events, past ones included.
  const upcomingEvents = events
    .filter((e) => isEventUpcoming(e.event_date, e.event_time))
    .slice(0, 4);

  const nextEvent = upcomingEvents[0] ?? null;
  const laterEvents = upcomingEvents.slice(1);

  const workspaceNameById = Object.fromEntries(workspaces.map((w) => [w.id, w.name]));

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {/* Brand, bell, and the Feed/Jobs pair — the same bar on every tab
          screen. Jobs used to be half of this screen, behind a segmented
          control; it has its own address now. */}
      <AppTopBar />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.primary}
          />
        }
      >
        {/* ── Header ── */}
        <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <View>
            <Text className="text-muted-foreground text-sm font-medium">Good morning</Text>
            <Text className="text-foreground text-[28px] font-bold tracking-tight leading-[34px]">
              {profile?.displayName?.split(' ')[0] ?? 'there'}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            className="active:scale-[0.96]"
          >
            {profile?.avatarUrl ? (
              <Image
                source={{ uri: profile.avatarUrl }}
                style={{ width: 44, height: 44, borderRadius: 22 }}
              />
            ) : (
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${palette.primary}18`, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: palette.primary, fontSize: 17, fontWeight: '700' }}>
                  {(profile?.displayName || user?.email || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: '#6B8E4E',
                borderWidth: 2,
                borderColor: palette.background,
              }}
            />
          </Pressable>
        </View>

        {/* ── Where the account stands ── */}
        <View className="px-5 pt-5">
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
              <Text className="text-foreground text-base font-bold">
                {formatBytes(storageUsedBytes)}{' '}
                <Text className="text-muted-foreground text-xs font-medium">used</Text>
              </Text>
              <Text className="text-foreground text-base font-bold">
                {storageLimitBytes
                  ? formatBytes(Math.max(storageLimitBytes - storageUsedBytes, 0))
                  : 'Unlimited'}{' '}
                <Text className="text-muted-foreground text-xs font-medium">left</Text>
              </Text>
              {storageFraction >= 0.9 && (
                <Pressable
                  onPress={() => router.push('/settings/storage/plans')}
                  accessibilityRole="button"
                  className="active:opacity-70"
                >
                  <Text className="text-primary text-xs font-semibold">Get more storage</Text>
                </Pressable>
              )}
            </View>
          </View>

          <View className="flex-row gap-2.5 mt-3">
            <StatTile
              value={connections}
              label="Connections"
              tint={palette.primary}
              onPress={() => router.push('/(app)/(tabs)/connect')}
            />
            <StatTile
              value={myJobs.length}
              label="Jobs posted"
              tint={palette.accent}
              onPress={() => router.push('/jobs/mine')}
            />
            {/* Nothing lists finished work yet, so this one only reports. */}
            <StatTile
              value={finishedJobs}
              label="Jobs finished"
              tint={CHART_COLORS.green}
            />
          </View>
        </View>

        {/* ── Next up ── */}
        <View className="px-5 pt-4">
          <Text className="text-muted-foreground text-[13px] font-semibold mb-2">Next up</Text>
          {eventsFailed && events.length === 0 ? (
            <View className="bg-card rounded-2xl border border-border/40">
              <LoadFailed what="your schedule" onRetry={() => refetchEvents()} compact />
            </View>
          ) : nextEvent ? (
            <Pressable
              onPress={() => router.push(`/schedule/${nextEvent.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${nextEvent.title}`}
              className="bg-card rounded-3xl border border-border/40 p-5 active:scale-[0.99]"
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
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push('/schedule/create')}
              accessibilityRole="button"
              className="bg-card rounded-3xl border border-border/40 p-5 flex-row items-center gap-4 active:scale-[0.99]"
            >
              <View className="w-11 h-11 rounded-2xl bg-primary/10 items-center justify-center">
                <CalendarIcon size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-base font-semibold">Your schedule is clear</Text>
                <Text className="text-muted-foreground text-sm mt-0.5">Add a shoot, review, or deadline</Text>
              </View>
              <ChevronRightIcon size={18} className="text-muted-foreground" />
            </Pressable>
          )}
        </View>

        {/* ── Quick create ── */}
        <View className="px-5 py-4">
          <View className="flex-row bg-secondary rounded-2xl p-1.5 gap-1">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Pressable
                  key={action.key}
                  onPress={() => {
                    if (action.key === 'workspace') guardWorkspaceCreate(() => router.push('/workspaces/create'))();
                    else if (action.key === 'album') guardAlbumCreate(() => router.push('/albums/create'))();
                    else if (action.key === 'invite') router.push('/(app)/(tabs)/connect?view=people');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Create ${action.label.toLowerCase()}`}
                  className="flex-1 min-h-12 rounded-xl items-center justify-center gap-1 active:bg-card"
                >
                  <Icon size={17} className="text-primary" />
                  <Text className="text-foreground text-xs font-semibold">{action.label}</Text>
                </Pressable>
              );
            })}
          </View>
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
              <Pressable onPress={() => router.push('/schedule')} className="flex-row items-center gap-1 active:opacity-60">
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
            <Pressable onPress={() => router.push('/workspaces')} className="flex-row items-center gap-1 active:opacity-60">
              <Text className="text-primary text-sm font-semibold">Workspaces</Text>
              <ChevronRightIcon size={14} className="text-primary" />
            </Pressable>
          </View>

          {albums.length > 0 && (
            <Pressable
              onPress={() => router.push(`/albums/${albums[0].id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Open album ${albums[0].name}`}
              className="bg-card rounded-3xl overflow-hidden border border-border/30 mb-3 active:scale-[0.99]"
            >
              <Image
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
            </Pressable>
          )}

          {wsLoading ? (
            <View className="gap-3">
              {[1, 2].map((i) => (
                <View key={i} className="bg-secondary rounded-2xl p-4 h-[72px]" style={{ opacity: 0.55 }} />
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
                <Pressable
                  key={ws.id}
                  onPress={() => router.push(`/workspaces/${ws.id}`)}
                  className="bg-card rounded-2xl p-4 flex-row items-center gap-4 border border-border/30 active:scale-[0.98]"
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
                </Pressable>
              ))}
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
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
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${value} ${label.toLowerCase()}`}
      className="flex-1 bg-card rounded-2xl border border-border/40 px-3 py-3 gap-1.5 active:opacity-80"
    >
      <Text className="text-foreground text-[22px] font-bold tracking-tight">
        {value > 999 ? '999+' : value}
      </Text>
      <Text className="text-muted-foreground text-[11px] leading-[14px] font-medium">
        {label}
      </Text>
      <View className="h-[3px] rounded-full" style={{ backgroundColor: tint }} />
    </Pressable>
  );
}


