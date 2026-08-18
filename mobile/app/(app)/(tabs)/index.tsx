import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { eventColor, eventTypeLabel, isEventUpcoming } from '@/src/lib/calendar';
// expo-image rather than RN Image: it decodes AVIF (and HEIC) on OS
// versions where the RN one silently renders nothing.
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useAlbums,
  useAuth,
  useScheduleEvents,
  useTheme,
  useUsage,
  useWorkspaces,
  usePlanLimits,
  useUnseenJobs,
  useMarkJobsSeen,
} from '@/src/hooks';
import { formatBytes, toGB } from '@/src/api';
import { useState } from 'react';
import { router } from 'expo-router';
import {
  HardDriveIcon,
  CalendarIcon,
  PlusIcon,
  UserPlusIcon,
  FolderPlusIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_COVER } from '@/src/lib/placeholder';
import { JobsTabs, NotificationBell } from '@/components';
import { LoadFailed } from '@/components/LoadFailed';
import { PALETTES } from '@/theme';

cssInterop(HardDriveIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
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

function StorageBar({ used, total }: { used: number; total: number }) {
  // total is 0 on an unlimited plan; dividing by it would render a full bar.
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  return (
    <View className="h-2 bg-muted rounded-full overflow-hidden">
      <View className="h-full rounded-full bg-action" style={{ width: `${pct}%` }} />
    </View>
  );
}

export default function HomeScreen() {
  const [tab, setTab] = useState<'home' | 'jobs'>('home');
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

  // Both of these had no time filter at all — `events[0]` and `slice(0, 3)`
  // over an ascending list meant the oldest events, past ones included.
  const upcomingEvents = events
    .filter((e) => isEventUpcoming(e.event_date, e.event_time))
    .slice(0, 4);

  const nextEvent = upcomingEvents[0] ?? null;
  const laterEvents = upcomingEvents.slice(1);
  const showStorageWarning = storageLimitBytes != null && storageFraction >= 0.8;

  const workspaceNameById = Object.fromEntries(workspaces.map((w) => [w.id, w.name]));

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {/*
        Two tabs, not two bottom-bar entries. The bar is already at six and a
        seventh truncates its labels on a 360pt screen — see the note in
        (tabs)/_layout.tsx.

        Home at the left edge, Jobs at the right, the row holding them apart.
        Sitting together on the left they read as a pair of buttons parked in a
        corner, with the rest of the row saying nothing was there — when in
        fact half this screen's content lives behind the second one.

        Two other arrangements were tried and dropped. A full-width segmented
        track sits directly above the Jobs panel's own underlined
        Browse/Posted/Applications row, which made the header top-heavy and
        blurred the two levels into one control. A smaller centred track was
        better but still read as a single lump in the middle rather than as
        the header belonging to both tabs.
      */}
      <View className="flex-row items-center justify-between px-5 pt-2 pb-1">
        <Segment
          label="Home"
          active={tab === 'home'}
          onPress={() => setTab('home')}
        />
        {/*
          The bell goes in the gap the two tabs already hold open, rather than
          beside one of them. It is not a third tab — it opens a screen and
          comes back — and putting it at either end would read as one, next to
          whichever label it sat against.
        */}
        <NotificationBell />
        <Segment
          label="Jobs"
          active={tab === 'jobs'}
          badge={unseenJobs}
          onPress={() => {
            setTab('jobs');
            // Opening the tab is what "seen" means. Fires once per switch, and
            // the hook zeroes the cached count so the badge does not flash
            // back while the request is in flight.
            if (unseenJobs > 0) markSeen.mutate();
          }}
        />
      </View>

      {tab === 'jobs' ? (
        <JobsTabs bottomPadding={120} />
      ) : (
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
                setTab('jobs');
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

        {showStorageWarning && (
          <View className="px-5 mb-5">
            <View className="rounded-2xl border border-border/50 p-4">
              <View className="flex-row items-center gap-3">
                <HardDriveIcon size={18} className="text-primary" />
                <View className="flex-1">
                  <Text className="text-foreground text-sm font-semibold">Storage is {Math.round(storageFraction * 100)}% full</Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    {formatBytes(storageUsedBytes)} of {Math.round(toGB(storageLimitBytes))} GB used
                  </Text>
                </View>
              </View>
              <View className="mt-3">
                <StorageBar used={storageUsedBytes} total={storageLimitBytes} />
              </View>
            </View>
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
      )}
    </SafeAreaView>
  );
}

/** One of the two home tabs, with an optional unread count. */
/**
 * One end of the Home/Jobs switch.
 *
 * Sized to its own label rather than stretched: a pill is a pill, and the two
 * are held apart by the row rather than by their own width.
 */
function Segment({
  label, active, badge = 0, onPress,
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
      // Generous hit area without a bigger pill: the tappable region reaches
      // past the border, which matters most for the one sitting on the edge.
      hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
      className={`min-h-11 flex-row items-center gap-1.5 rounded-full px-4 py-2 active:opacity-80 ${
        active ? 'bg-action' : 'border border-primary/30'
      }`}
    >
      <Text className={`text-[13px] font-bold ${active ? 'text-action-foreground' : 'text-primary'}`}>
        {label}
      </Text>
      {badge > 0 && (
        <View className={`min-w-[18px] rounded-full px-1.5 ${active ? 'bg-action-foreground' : 'bg-action'}`}>
          <Text className={`text-[11px] font-bold text-center ${active ? 'text-action' : 'text-action-foreground'}`}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}


