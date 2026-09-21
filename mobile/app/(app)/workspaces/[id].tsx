import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { eventColor, eventTypeLabel, isEventUpcoming } from '@/src/lib/calendar';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useAlbums,
  useCollaborators,
  useScheduleEvents,
  useTheme,
  useWorkspace,
  usePlanLimits,
} from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon,
  PlusIcon,
  UploadIcon,
  UserPlusIcon,
  CalendarPlusIcon,
  ImageIcon,
  UsersIcon,
  ClockIcon,
  ChevronRightIcon,
  MessageCircleIcon,
  MailIcon,
  LayersIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_COVER, PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import { LoadFailed } from '@/components/LoadFailed';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UploadIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MessageCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MailIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LayersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: '#A8948920', text: '#8B7355', label: 'Draft' },
  review: { bg: '#C1774520', text: '#C17745', label: 'In Review' },
  delivered: { bg: '#6B8E4E20', text: '#4A6B3A', label: 'Delivered' },
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  photographer: 'Photographer',
  editor: 'Editor',
  reviewer: 'Reviewer',
  client: 'Client',
};

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

const QUICK_ACTIONS = [
  { key: 'album', label: 'Create Album', icon: PlusIcon },
  { key: 'upload', label: 'Upload', icon: UploadIcon },
  { key: 'invite', label: 'Invite', icon: UserPlusIcon },
  { key: 'schedule', label: 'Schedule', icon: CalendarPlusIcon },
];

export default function WorkspaceDetailScreen() {
  const { guardAlbumCreate } = usePlanLimits();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isDark } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const enabled = { enabled: !!id };

  const {
    data: workspace,
    isLoading: wsLoading,
    refetch: refetchWorkspace,
  } = useWorkspace(id);

  const {
    albums,
    loadFailed: albumsFailed,
    refetch: refetchAlbums,
  } = useAlbums(
    {
      workspace_id: id,
      orderBy: 'created_at',
      direction: 'desc',
      limit: 100,
    },
    enabled,
  );

  const { collaborators, refetch: refetchCollaborators } = useCollaborators(
    { workspace_id: id, limit: 100 },
    enabled,
  );

  // A window, not 3: ascending order puts the *oldest* events first, so a
  // small limit returns only past ones and leaves Upcoming empty once they are
  // filtered out.
  const { events, refetch: refetchEvents } = useScheduleEvents(
    {
      workspace_id: id,
      orderBy: 'event_date',
      direction: 'asc',
      limit: 50,
    },
    enabled,
  );

  // Compared against the moment, not the date — a 9am event was still listed
  // as upcoming that same evening.
  const upcomingEvents = events
    .filter((e) => isEventUpcoming(e.event_date, e.event_time))
    .slice(0, 3);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchWorkspace(),
      refetchAlbums(),
      refetchCollaborators(),
      refetchEvents(),
    ]);
    setRefreshing(false);
  };

  if (wsLoading || !workspace) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center gap-3">
          <Text className="text-muted-foreground text-sm">Loading workspace...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const accent = workspace.accent_color || '#B66A40';
  const albumCount = albums.length;
  const totalItems = albums.reduce((s, a) => s + (a.item_count || 0), 0);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? '#C17745' : '#B66A40'}
          />
        }
      >
        {/* ── Hero Header ── */}
        <View className="relative">
          {/* Color block */}
          <View
            style={{
              backgroundColor: `${accent}12`,
              paddingTop: 4,
              paddingBottom: 28,
              paddingHorizontal: 20,
            }}
          >
            {/* Back button */}
            <Pressable
              onPress={() => router.back()}
              className="w-10 h-10 rounded-2xl bg-white items-center justify-center mb-4 active:scale-[0.94]"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.06,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
              }}
            >
              <ArrowLeftIcon size={18} color="#1E1B18" />
            </Pressable>

            {/* Icon + title */}
            <View className="flex-row items-center gap-4">
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 20,
                  backgroundColor: `${accent}22`,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 26, fontWeight: '700', color: accent }}>
                  {workspace.name.charAt(0)}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-[22px] font-bold tracking-tight">
                  {workspace.name}
                </Text>
                {workspace.description ? (
                  <Text className="text-muted-foreground text-sm mt-0.5" numberOfLines={2}>
                    {workspace.description}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Stats row */}
            <View className="flex-row items-center gap-5 mt-5">
              <View className="flex-row items-center gap-1.5">
                <ImageIcon size={13} color={accent} />
                <Text className="text-foreground text-sm font-bold">
                  {totalItems.toLocaleString()}
                </Text>
                <Text className="text-muted-foreground text-xs">items</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <LayersIcon size={13} color={accent} />
                <Text className="text-foreground text-sm font-bold">{albumCount}</Text>
                <Text className="text-muted-foreground text-xs">albums</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <UsersIcon size={13} color={accent} />
                <Text className="text-foreground text-sm font-bold">
                  {workspace.collaborator_count}
                </Text>
                <Text className="text-muted-foreground text-xs">members</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Quick Actions ── */}
        <View className="-mt-5 mx-5">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10 }}
          >
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              const isInvite = action.key === 'invite';
              return (
                <Pressable
                  key={action.key}
                  // These branches were empty stubs, so three of the four
                  // quick actions did nothing when tapped.
                  onPress={() => {
                    if (action.key === 'invite') {
                      router.push(`/workspaces/${id}/invite`);
                    } else if (action.key === 'album') {
                      guardAlbumCreate(() => router.push(`/albums/create?workspaceId=${id}`))();
                    } else if (action.key === 'upload') {
                      router.push('/albums/upload');
                    } else if (action.key === 'schedule') {
                      router.push(`/schedule/create?workspaceId=${id}`);
                    }
                  }}
                  className="bg-card rounded-2xl px-5 py-3.5 flex-row items-center gap-2.5 active:scale-[0.96]"
                  style={{
                    shadowColor: '#000',
                    shadowOpacity: 0.05,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 3 },
                    elevation: 3,
                  }}
                >
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 10,
                      backgroundColor: `${accent}18`,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={15} color={accent} />
                  </View>
                  <Text className="text-foreground text-sm font-semibold">{action.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Collaborators ── */}
        <View className="px-5 mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground text-base font-bold tracking-tight">Members</Text>
            <Pressable
              onPress={() => router.push(`/workspaces/${id}/invite`)}
              className="flex-row items-center gap-1 active:opacity-60"
            >
              <UserPlusIcon size={13} className="text-primary" />
              <Text className="text-primary text-sm font-semibold">Invite</Text>
            </Pressable>
          </View>

          {collaborators.length === 0 ? (
            <View className="bg-card rounded-2xl p-6 items-center gap-2">
              <UsersIcon size={20} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-sm">No members yet</Text>
            </View>
          ) : (
            <View
              className="bg-card rounded-2xl overflow-hidden"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.04,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 3 },
                elevation: 3,
              }}
            >
              {collaborators.map((collab, i) => (
                <Pressable
                  key={collab.id}
                  className="flex-row items-center gap-3 px-4 py-3 active:bg-muted/30"
                  style={
                    i < collaborators.length - 1
                      ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' }
                      : undefined
                  }
                >
                  <RemoteImage
                    source={{
                      uri:
                        collab.avatar_url ||
                        PLACEHOLDER_IMAGE,
                    }}
                    style={{ width: 36, height: 36, borderRadius: 18 }}
                  />
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                      {collab.name}
                    </Text>
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-muted-foreground text-xs">
                        {ROLE_LABELS[collab.role] || collab.role}
                      </Text>
                      {/* Web has said this since invitations shipped; the phone
                          did not, so an invitation nobody had answered looked
                          exactly like a collaborator who had joined. */}
                      {collab.status === 'pending' && (
                        <View
                          className="rounded-full px-1.5 py-0.5"
                          style={{ backgroundColor: '#B66A4018' }}
                        >
                          <Text className="text-[9px] font-bold" style={{ color: '#B66A40' }}>
                            INVITED
                          </Text>
                        </View>
                      )}
                      {collab.status === 'declined' && (
                        <View className="rounded-full px-1.5 py-0.5 bg-muted">
                          <Text className="text-muted-foreground text-[9px] font-bold">
                            DECLINED
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View className="flex-row gap-1.5">
                    <Pressable className="w-8 h-8 rounded-full bg-muted items-center justify-center active:scale-[0.92]">
                      <MessageCircleIcon size={13} className="text-muted-foreground" />
                    </Pressable>
                    <Pressable className="w-8 h-8 rounded-full bg-muted items-center justify-center active:scale-[0.92]">
                      <MailIcon size={13} className="text-muted-foreground" />
                    </Pressable>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* ── Albums ── */}
        <View className="px-5 mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground text-base font-bold tracking-tight">Albums</Text>
            <Pressable
              onPress={() => router.push(`/albums?workspaceId=${id}`)}
              className="flex-row items-center gap-1 active:opacity-60"
            >
              <Text className="text-primary text-sm font-semibold">See all</Text>
              <ChevronRightIcon size={14} className="text-primary" />
            </Pressable>
          </View>

          {albumsFailed && albums.length === 0 ? (
            <View className="bg-card rounded-2xl">
              <LoadFailed what="these albums" onRetry={() => refetchAlbums()} compact />
            </View>
          ) : albums.length === 0 ? (
            <View className="bg-card rounded-2xl p-6 items-center gap-2">
              <LayersIcon size={20} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-sm">No albums created yet</Text>
              <Pressable
                onPress={guardAlbumCreate(() => router.push(`/albums/create?workspaceId=${id}`))}
                className="bg-action rounded-xl px-4 py-2 active:scale-[0.96] mt-1"
              >
                <Text className="text-white text-sm font-semibold">Create first album</Text>
              </Pressable>
            </View>
          ) : (
            <View className="gap-3">
              {albums.map((album) => {
                const badge = STATUS_BADGES[album.status] || STATUS_BADGES.draft;
                return (
                  <Pressable
                    key={album.id}
                    // Had no onPress at all, so album cards were inert.
                    onPress={() => router.push(`/albums/${album.id}`)}
                    className="bg-card rounded-2xl overflow-hidden flex-row active:scale-[0.98]"
                    style={{
                      shadowColor: '#000',
                      shadowOpacity: 0.04,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 3 },
                      elevation: 3,
                    }}
                  >
                    <RemoteImage
                      source={{
                        uri:
                          album.cover_url ||
                          PLACEHOLDER_COVER,
                      }}
                      style={{ width: 80, height: 80 }}
                    />
                    <View className="flex-1 p-3 justify-center min-w-0">
                      <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                        {album.name}
                      </Text>
                      {album.description ? (
                        <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                          {album.description}
                        </Text>
                      ) : null}
                      <View className="flex-row items-center gap-3 mt-2">
                        <Text className="text-muted-foreground text-[11px] font-medium">
                          {album.item_count} items
                        </Text>
                        <View
                          style={{
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 5,
                            backgroundColor: badge.bg,
                          }}
                        >
                          <Text
                            style={{
                              color: badge.text,
                              fontSize: 9,
                              fontWeight: '600',
                              textTransform: 'uppercase',
                            }}
                          >
                            {badge.label}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* ── Upcoming Schedule ── */}
        <View className="px-5 mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground text-base font-bold tracking-tight">
              Upcoming Schedule
            </Text>
            <Pressable onPress={() => router.push(`/schedule/create?workspaceId=${id}`)} className="flex-row items-center gap-1 active:opacity-60">
              <PlusIcon size={13} className="text-primary" />
              <Text className="text-primary text-sm font-semibold">Add</Text>
            </Pressable>
          </View>

          {upcomingEvents.length === 0 ? (
            <View className="bg-card rounded-2xl p-6 items-center gap-2">
              <CalendarPlusIcon size={20} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-sm">No upcoming events</Text>
            </View>
          ) : (
            <View
              className="bg-card rounded-2xl overflow-hidden"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.04,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 3 },
                elevation: 3,
              }}
            >
              {upcomingEvents.map((event, i) => {
                const dotColor = eventColor(event.event_type);
                return (
                  <Pressable
                    key={event.id}
                    onPress={() => router.push(`/schedule/${event.id}`)}
                    className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted/30"
                    style={
                      i < upcomingEvents.length - 1
                        ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' }
                        : undefined
                    }
                  >
                    <View
                      style={{
                        width: 3,
                        height: 34,
                        borderRadius: 2,
                        backgroundColor: dotColor,
                      }}
                    />
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                        {event.title}
                      </Text>
                      <Text className="text-muted-foreground text-xs mt-0.5">
                        {eventTypeLabel(event)}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-foreground text-xs font-bold">
                        {formatDate(event.event_date)}
                      </Text>
                      {event.event_time ? (
                        <Text className="text-muted-foreground text-xs mt-0.5">
                          {formatTime(event.event_time)}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
