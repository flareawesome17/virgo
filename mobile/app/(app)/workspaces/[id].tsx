import { View, Text, ScrollView, RefreshControl, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import {
  type LucideIcon,
  ArrowLeftIcon,
  CalendarPlusIcon,
  ChevronRightIcon,
  FolderXIcon,
  LockIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  UploadIcon,
  UserPlusIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useAlbums,
  useDeleteCollaborator,
  useDeleteWorkspace,
  useLeaveWorkspace,
  usePlanLimits,
  useResendInvitation,
  useScheduleEvents,
  useTheme,
  useUpdateWorkspace,
  useWorkspace,
  useWorkspaceMembers,
} from '@/src/hooks';
import { formatBytes, type Album, type ScheduleEvent, type Workspace, type WorkspaceMember } from '@/src/api';
import { isEventUpcoming } from '@/src/lib/calendar';
import {
  ACCESS_LABEL,
  ROLE_LABEL,
  accessPhrase,
  deleteConsequence,
  firstName,
  invitedWhen,
  plural,
  roleInSentence,
} from '@/src/lib/workspaces';
import { RemoteImage } from '@/components/RemoteImage';
import { LoadFailed } from '@/components/LoadFailed';
import { WorkspaceActivity } from '@/components/WorkspaceActivity';
import { ActionSheet, PersonAvatar, Pill, WorkspaceTile } from '@/components/WorkspaceBits';
import { ownerLine } from '@/components/WorkspaceCard';
import { PALETTES } from '@/theme';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(FolderXIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LogOutIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MoreHorizontalIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(RefreshCwIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UploadIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

type Segment = 'overview' | 'albums' | 'members';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'albums', label: 'Albums' },
  { key: 'members', label: 'Members' },
];

/** "Private", "Shared with 2", "Offered to 1": who can open an album. */
function sharingLabel(album: Album): string {
  if ((album.shared_with ?? 0) > 0) return `Shared with ${album.shared_with}`;
  if ((album.offered_to ?? 0) > 0) return `Offered to ${album.offered_to}`;
  return 'Private';
}

/** The back button on a header tinted with the workspace's colour. */
function BackButton() {
  return (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Back"
      className="w-11 h-11 items-center justify-center active:opacity-60"
    >
      <ArrowLeftIcon size={20} className="text-foreground" />
    </Pressable>
  );
}

function Chip({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="h-10 px-3.5 rounded-full bg-card border border-border flex-row items-center gap-1.5 active:scale-[0.96]"
    >
      <Icon size={16} className="text-foreground" />
      <Text className="text-foreground text-[13px] font-semibold">{label}</Text>
    </Pressable>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <View className={`bg-card rounded-2xl border border-border/40 ${className}`}>{children}</View>;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[1.5px] mx-1 mb-2">
      {children}
    </Text>
  );
}

function EventRow({ event }: { event: ScheduleEvent }) {
  const date = new Date(`${event.event_date}T00:00:00`);
  const when = [
    date.toLocaleDateString('en-US', { weekday: 'short' }),
    event.event_time ? formatClock(event.event_time) : 'All day',
    event.location,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={() => router.push(`/schedule/${event.id}`)}
      accessibilityRole="button"
      className="flex-row items-center gap-3 active:opacity-70"
    >
      <View className="w-12 h-[52px] rounded-xl bg-primary/10 items-center justify-center">
        <Text className="text-primary text-[11px] font-bold tracking-[1px]">
          {date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
        </Text>
        <Text className="text-primary text-xl font-bold">{date.getDate()}</Text>
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
          {event.title}
        </Text>
        <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
          {when}
        </Text>
      </View>
    </Pressable>
  );
}

/** `HH:MM[:SS]` to "7:00 AM". */
function formatClock(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function AlbumRow({ album, showSharing, divider }: { album: Album; showSharing: boolean; divider?: string }) {
  const label = sharingLabel(album);
  const isPrivate = showSharing && label === 'Private';
  return (
    <Pressable
      onPress={() => router.push(`/albums/${album.id}`)}
      accessibilityRole="button"
      className="flex-row items-center gap-3 px-3.5 py-3 active:opacity-70"
      style={divider ? { borderTopWidth: 1, borderTopColor: divider } : undefined}
    >
      <View className="w-14 h-14 rounded-xl overflow-hidden bg-muted">
        {album.cover_url ? (
          <RemoteImage source={{ uri: album.cover_url }} style={{ width: 56, height: 56 }} />
        ) : null}
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
          {album.name}
        </Text>
        <View className="flex-row items-center gap-1 mt-0.5">
          {isPrivate && <LockIcon size={11} className="text-warning" />}
          <Text className={`text-xs ${isPrivate ? 'text-warning' : 'text-muted-foreground'}`} numberOfLines={1}>
            {plural(album.item_count, 'file')}
            {showSharing ? ` · ${label}` : ''}
          </Text>
        </View>
      </View>
      <ChevronRightIcon size={16} className="text-muted-foreground" />
    </Pressable>
  );
}

/** The owner's workspace: what is in it, what needs doing, and who is here. */
function OwnerView({
  workspace,
  initialSegment,
}: {
  workspace: Workspace;
  initialSegment: Segment;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { guardAlbumCreate } = usePlanLimits();
  const [segment, setSegment] = useState<Segment>(initialSegment);
  const [refreshing, setRefreshing] = useState(false);
  const [options, setOptions] = useState(false);

  const id = workspace.id;
  const albumsQuery = useAlbums({ workspace_id: id, orderBy: 'created_at', direction: 'desc', limit: 100 });
  const membersQuery = useWorkspaceMembers(id);
  // Latest-dated first, so the future is what fits in the page. Oldest
  // first, a workspace with fifty past events showed nothing coming up.
  const { events, refetch: refetchEvents } = useScheduleEvents({
    workspace_id: id,
    orderBy: 'event_date',
    direction: 'desc',
    limit: 100,
  });
  const update = useUpdateWorkspace();
  const remove = useDeleteWorkspace();
  const resend = useResendInvitation();
  const cancelInvite = useDeleteCollaborator();

  const albums = albumsQuery.albums;
  const members = membersQuery.members;
  const present = members.filter((m) => m.status === 'owner' || m.status === 'accepted');
  const invites = members.filter((m) => m.status === 'pending' || m.status === 'declined');
  const waiting = members.filter((m) => m.status === 'pending');
  const waitingIds = useMemo(
    () =>
      new Set(members.flatMap((m) => (m.status === 'pending' && m.user_id ? [m.user_id] : []))),
    [members],
  );
  const hasPeople = workspace.collaborator_count + workspace.pending_count > 0;
  const unshared = hasPeople
    ? albums.filter((a) => (a.shared_with ?? 0) === 0 && (a.offered_to ?? 0) === 0)
    : [];
  // Compared against the moment, not the date — a 9am event is not upcoming
  // that evening.
  const upcoming = events
    .filter((e) => isEventUpcoming(e.event_date, e.event_time))
    .sort((a, b) => `${a.event_date} ${a.event_time ?? ''}`.localeCompare(`${b.event_date} ${b.event_time ?? ''}`))
    .slice(0, 2);
  const accent = workspace.accent_color;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([albumsQuery.refetch(), membersQuery.refetch(), refetchEvents()]);
    setRefreshing(false);
  };

  const newAlbum = guardAlbumCreate(() => router.push(`/albums/create?workspaceId=${id}`), workspace);

  const sendAgain = (member: WorkspaceMember) =>
    resend.mutate(member.id!, {
      onSuccess: () => Alert.alert('Sent again', `${firstName(member.name)} has the invitation again.`),
      onError: (err: Error) => Alert.alert('Not sent', err.message),
    });

  const confirmCancel = (member: WorkspaceMember) =>
    Alert.alert(
      `Cancel the invitation to ${firstName(member.name)}?`,
      'It disappears from their Workspaces. You can invite them again whenever you like.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel invitation',
          style: 'destructive',
          onPress: () =>
            cancelInvite.mutate(member.id!, {
              onError: (err: Error) => Alert.alert('Could not cancel it', err.message),
            }),
        },
      ],
    );

  const toggleArchive = () => {
    const archiving = !workspace.archived_at;
    update.mutate(
      { id, archived: archiving },
      {
        onSuccess: () => {
          if (archiving) {
            Alert.alert(
              `${workspace.name} is archived`,
              'Find it under Archived at the bottom of your workspaces. Albums and sharing are as they were.',
            );
            router.back();
          }
        },
        onError: (err: Error) => Alert.alert('Could not change that', err.message),
      },
    );
  };

  const confirmDelete = () =>
    Alert.alert(`Delete ${workspace.name}?`, `${deleteConsequence(workspace)} This cannot be undone.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove.mutate(id, {
            onSuccess: () => router.replace('/(app)/(tabs)/workspaces'),
            onError: (err: Error) => Alert.alert('Could not delete', err.message),
          }),
      },
    ]);

  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
    >
      <View style={{ backgroundColor: `${accent}1A` }} className="pb-4">
        <View className="px-2 pt-1 flex-row items-center justify-between">
          <BackButton />
          <Pressable
            onPress={() => setOptions(true)}
            accessibilityRole="button"
            accessibilityLabel="Workspace options"
            className="w-11 h-11 items-center justify-center active:opacity-60"
          >
            <MoreHorizontalIcon size={22} className="text-secondary-foreground" />
          </Pressable>
        </View>
        <View className="px-5 gap-3">
          <View className="flex-row items-center gap-3">
            <WorkspaceTile name={workspace.name} color={accent} size={52} />
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-[22px] font-bold tracking-tight" numberOfLines={2}>
                {workspace.name}
              </Text>
              <Text className="text-secondary-foreground text-xs mt-0.5">
                {workspace.archived_at ? 'Archived · ' : ''}
                {ownerLine(workspace)}
              </Text>
            </View>
          </View>
          {workspace.description ? (
            <Text className="text-secondary-foreground text-sm" numberOfLines={3}>
              {workspace.description}
            </Text>
          ) : null}
          <View className="flex-row gap-2">
            {[
              [workspace.album_count.toLocaleString(), workspace.album_count === 1 ? 'album' : 'albums'],
              [workspace.media_count.toLocaleString(), workspace.media_count === 1 ? 'file' : 'files'],
              [formatBytes(workspace.storage_bytes ?? 0), 'storage'],
            ].map(([value, label]) => (
              <View key={label} className="flex-1 px-3 py-2.5 rounded-xl bg-card">
                <Text className="text-foreground text-lg font-bold">{value}</Text>
                <Text className="text-muted-foreground text-[11px]">{label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View className="px-5 pt-3.5 gap-3.5">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip icon={PlusIcon} label="New album" onPress={newAlbum} />
          <Chip icon={UploadIcon} label="Upload" onPress={() => router.push('/albums/upload')} />
          <Chip icon={UserPlusIcon} label="Invite" onPress={() => router.push(`/workspaces/${id}/invite`)} />
          <Chip
            icon={CalendarPlusIcon}
            label="Schedule"
            onPress={() => router.push(`/schedule/create?workspaceId=${id}`)}
          />
        </ScrollView>

        <View className="flex-row gap-0.5 p-0.5 rounded-xl bg-muted" accessibilityRole="tablist">
          {SEGMENTS.map((s) => {
            const on = s.key === segment;
            return (
              <Pressable
                key={s.key}
                onPress={() => setSegment(s.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                className={`flex-1 h-9 rounded-[10px] items-center justify-center ${on ? 'bg-card' : ''}`}
              >
                <Text className={`text-[13px] ${on ? 'text-foreground font-bold' : 'text-secondary-foreground font-medium'}`}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {segment === 'overview' && (
          <>
            {unshared.length > 0 && (
              <View className="flex-row items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-warning/15">
                <LockIcon size={18} className="text-warning" />
                <View className="flex-1">
                  <Text className="text-foreground text-[13px] font-semibold">
                    {unshared.length === 1
                      ? `${unshared[0].name} isn’t shared yet`
                      : `${unshared.length} albums aren’t shared yet`}
                  </Text>
                  <Text className="text-secondary-foreground text-xs mt-0.5">New albums start private.</Text>
                </View>
                <Pressable onPress={() => setSegment('members')} accessibilityRole="button" hitSlop={8}>
                  <Text className="text-primary text-[13px] font-bold">Share</Text>
                </Pressable>
              </View>
            )}
            {waiting.length > 0 && (
              <View className="flex-row items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-secondary">
                <RefreshCwIcon size={16} className="text-secondary-foreground" />
                <View className="flex-1">
                  <Text className="text-foreground text-[13px] font-semibold">
                    {waiting.length === 1
                      ? `${firstName(waiting[0].name)} hasn’t answered yet`
                      : `${waiting.length} invitations waiting`}
                  </Text>
                  <Text className="text-secondary-foreground text-xs mt-0.5">
                    {waiting.length === 1
                      ? `Sent ${invitedWhen(waiting[0].invited_at)}, as ${roleInSentence(waiting[0].role)}.`
                      : 'Resend or cancel them from Members.'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => (waiting.length === 1 ? sendAgain(waiting[0]) : setSegment('members'))}
                  accessibilityRole="button"
                  hitSlop={8}
                  disabled={resend.isPending}
                >
                  <Text className="text-primary text-[13px] font-bold">{waiting.length === 1 ? 'Resend' : 'See'}</Text>
                </Pressable>
              </View>
            )}

            <Card className="px-3.5 pt-3">
              <Text className="text-foreground text-sm font-semibold">What’s been happening</Text>
              <WorkspaceActivity workspaceId={id} waiting={waitingIds} limit={6} divider={palette.border} />
            </Card>

            <Card className="p-3.5 gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-foreground text-sm font-semibold">Coming up</Text>
                <Pressable onPress={() => router.push(`/schedule/create?workspaceId=${id}`)} hitSlop={8}>
                  <Text className="text-primary text-[13px] font-bold">Add</Text>
                </Pressable>
              </View>
              {upcoming.length === 0 ? (
                <Text className="text-muted-foreground text-sm">Nothing scheduled for this workspace.</Text>
              ) : (
                upcoming.map((event) => <EventRow key={event.id} event={event} />)
              )}
            </Card>
          </>
        )}

        {segment === 'albums' &&
          (albumsQuery.isLoading ? (
            <ActivityIndicator className="py-8" />
          ) : albumsQuery.loadFailed && albums.length === 0 ? (
            <Card>
              <LoadFailed what="these albums" onRetry={() => albumsQuery.refetch()} compact />
            </Card>
          ) : albums.length === 0 ? (
            <Card className="p-6 items-center gap-2">
              <Text className="text-muted-foreground text-sm text-center">
                No albums yet. An album holds one shoot or one delivery.
              </Text>
              <Pressable onPress={newAlbum} className="bg-action rounded-xl px-4 py-2 mt-1 active:scale-[0.96]">
                <Text className="text-white text-sm font-semibold">Create the first album</Text>
              </Pressable>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {albums.map((album, i) => (
                <AlbumRow
                  key={album.id}
                  album={album}
                  showSharing={hasPeople}
                  divider={i > 0 ? palette.border : undefined}
                />
              ))}
            </Card>
          ))}

        {segment === 'members' && (
          <>
            <View className="flex-row items-center justify-between">
              <Text className="text-muted-foreground text-[13px] flex-1 mr-3">
                Everyone here can see who else is.
              </Text>
              <Pressable
                onPress={() => router.push(`/workspaces/${id}/invite`)}
                accessibilityRole="button"
                className="h-9 px-3.5 rounded-xl bg-action flex-row items-center gap-1.5 active:scale-[0.96]"
              >
                <UserPlusIcon size={15} className="text-action-foreground" />
                <Text className="text-action-foreground text-[13px] font-bold">Invite</Text>
              </Pressable>
            </View>
            {membersQuery.isLoading ? (
              <ActivityIndicator className="py-6" />
            ) : membersQuery.loadFailed && members.length === 0 ? (
              <Card>
                <LoadFailed what="who is here" onRetry={() => membersQuery.refetch()} compact />
              </Card>
            ) : (
              <>
                <Card className="overflow-hidden">
                  {present.map((member, i) => {
                    const line =
                      member.status === 'owner'
                        ? 'Owner · everything'
                        : `${ROLE_LABEL[member.role]} · ${accessPhrase(member, workspace.album_total)}`;
                    const row = (
                      <>
                        <PersonAvatar name={member.name} url={member.avatar_url} size={38} />
                        <View className="flex-1 min-w-0">
                          <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                            {member.name}
                            {member.is_you ? ' (you)' : ''}
                          </Text>
                          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                            {line}
                          </Text>
                        </View>
                      </>
                    );
                    const style = i > 0 ? { borderTopWidth: 1, borderTopColor: palette.border } : undefined;
                    return member.status === 'owner' ? (
                      <View key={`owner-${member.user_id}`} className="flex-row items-center gap-3 px-3.5 py-3" style={style}>
                        {row}
                      </View>
                    ) : (
                      <Pressable
                        key={member.id}
                        onPress={() => router.push(`/workspaces/${id}/member/${member.id}`)}
                        accessibilityRole="button"
                        accessibilityHint="Change their role and what they can do in each album"
                        className="flex-row items-center gap-3 px-3.5 py-3 active:opacity-70"
                        style={style}
                      >
                        {row}
                        <ChevronRightIcon size={18} className="text-muted-foreground" />
                      </Pressable>
                    );
                  })}
                </Card>

                {invites.length > 0 && (
                  <View>
                    <SectionLabel>Invites</SectionLabel>
                    <Card className="overflow-hidden">
                      {invites.map((member, i) => (
                        <View
                          key={member.id}
                          className="px-3.5 py-3 gap-2.5"
                          style={i > 0 ? { borderTopWidth: 1, borderTopColor: palette.border } : undefined}
                        >
                          <View className="flex-row items-center gap-3">
                            <PersonAvatar name={member.name} url={member.avatar_url} size={38} />
                            <View className="flex-1 min-w-0">
                              <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                                {member.name}
                              </Text>
                              <Text className="text-muted-foreground text-xs mt-0.5">
                                {ROLE_LABEL[member.role]} ·{' '}
                                {member.status === 'pending' ? `invited ${invitedWhen(member.invited_at)}` : 'declined'}
                              </Text>
                            </View>
                            {member.status === 'pending' ? (
                              <Pill tone="warning">Waiting</Pill>
                            ) : (
                              <Pressable
                                onPress={() =>
                                  router.push(`/workspaces/${id}/invite?person=${member.user_id ?? ''}`)
                                }
                                accessibilityRole="button"
                                hitSlop={8}
                              >
                                <Text className="text-primary text-[13px] font-bold">Invite again</Text>
                              </Pressable>
                            )}
                          </View>
                          {member.status === 'pending' && (
                            <View className="flex-row gap-2 pl-[50px]">
                              <Pressable
                                onPress={() => sendAgain(member)}
                                disabled={resend.isPending}
                                accessibilityRole="button"
                                className="h-9 px-3 rounded-xl border border-border flex-row items-center gap-1.5 active:scale-[0.96]"
                              >
                                <RefreshCwIcon size={14} className="text-foreground" />
                                <Text className="text-foreground text-[13px] font-semibold">Resend</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => confirmCancel(member)}
                                accessibilityRole="button"
                                className="h-9 px-3 rounded-xl items-center justify-center active:opacity-60"
                              >
                                <Text className="text-secondary-foreground text-[13px] font-semibold">
                                  Cancel invite
                                </Text>
                              </Pressable>
                            </View>
                          )}
                        </View>
                      ))}
                    </Card>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </View>

      <ActionSheet
        visible={options}
        title={workspace.name}
        onClose={() => setOptions(false)}
        actions={[
          { label: 'Edit details', onPress: () => router.push(`/workspaces/${id}/edit`) },
          { label: workspace.archived_at ? 'Bring back from archive' : 'Archive', onPress: toggleArchive },
          { label: 'Delete workspace…', destructive: true, onPress: confirmDelete },
        ]}
      />
    </ScrollView>
  );
}

/**
 * A workspace someone else owns: the albums shared with you and what you can
 * do in each, who else is here, what has been happening in your albums, and a
 * way out. Nothing that is the owner's to decide.
 */
function SharedView({ workspace }: { workspace: Workspace }) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);
  const id = workspace.id;
  const albumsQuery = useAlbums({ workspace_id: id, orderBy: 'created_at', direction: 'desc', limit: 100 });
  const membersQuery = useWorkspaceMembers(id);
  const leave = useLeaveWorkspace();

  const albums = albumsQuery.albums;
  const owner = firstName(workspace.owner.name);
  const hidden = Math.max(0, workspace.album_total - workspace.album_count);
  const uploadable = albums.filter((a) => a.my_access === 'upload' || a.my_access === 'manage');

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([albumsQuery.refetch(), membersQuery.refetch()]);
    setRefreshing(false);
  };

  const confirmLeave = () =>
    Alert.alert(
      `Leave ${workspace.name}?`,
      `You lose access to its albums straight away, and ${owner} is told. Anything you uploaded stays in ${owner}’s albums. ${owner} can invite you again.`,
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () =>
            leave.mutate(id, {
              onSuccess: () => router.replace('/(app)/(tabs)/workspaces'),
              onError: (err: Error) => Alert.alert('Could not leave', err.message),
            }),
        },
      ],
    );

  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
    >
      <View style={{ backgroundColor: `${workspace.accent_color}1A` }} className="pb-4">
        <View className="px-2 pt-1">
          <BackButton />
        </View>
        <View className="px-5 flex-row items-center gap-3">
          <WorkspaceTile name={workspace.name} color={workspace.accent_color} size={52} />
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-[22px] font-bold tracking-tight" numberOfLines={2}>
              {workspace.name}
            </Text>
            <Text className="text-secondary-foreground text-xs mt-0.5">
              Shared by {workspace.owner.name} · you’re {roleInSentence(workspace.my_role, true)}
            </Text>
          </View>
        </View>
      </View>

      <View className="px-4 pt-3.5 gap-4">
        <View className="flex-row gap-2">
          {uploadable.length > 0 && (
            <Chip
              icon={UploadIcon}
              label="Upload"
              onPress={() =>
                router.push(uploadable.length === 1 ? `/albums/upload?albumId=${uploadable[0].id}` : '/albums/upload')
              }
            />
          )}
          <Chip icon={CalendarPlusIcon} label="Schedule" onPress={() => router.push('/(app)/(tabs)/schedule')} />
        </View>

        <View>
          <SectionLabel>Albums shared with you</SectionLabel>
          {albumsQuery.isLoading ? (
            <ActivityIndicator className="py-6" />
          ) : albumsQuery.loadFailed && albums.length === 0 ? (
            <Card>
              <LoadFailed what="these albums" onRetry={() => albumsQuery.refetch()} compact />
            </Card>
          ) : albums.length === 0 ? (
            <Card className="p-4">
              <Text className="text-muted-foreground text-sm">
                {owner} hasn’t shared an album with you yet. They appear here as soon as one is.
              </Text>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {albums.map((album, i) => (
                <Pressable
                  key={album.id}
                  onPress={() => router.push(`/albums/${album.id}`)}
                  accessibilityRole="button"
                  className="flex-row items-center gap-3 px-3.5 py-3 active:opacity-70"
                  style={i > 0 ? { borderTopWidth: 1, borderTopColor: palette.border } : undefined}
                >
                  <View className="w-11 h-11 rounded-xl overflow-hidden bg-muted">
                    {album.cover_url ? (
                      <RemoteImage source={{ uri: album.cover_url }} style={{ width: 44, height: 44 }} />
                    ) : null}
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                      {album.name}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">{plural(album.item_count, 'file')}</Text>
                  </View>
                  {album.my_access && album.my_access !== 'owner' ? (
                    <Pill tone="info">You can {ACCESS_LABEL[album.my_access].toLowerCase()}</Pill>
                  ) : null}
                </Pressable>
              ))}
            </Card>
          )}
          {hidden > 0 && (
            <Text className="text-muted-foreground text-xs mt-2 mx-1">
              {hidden === 1
                ? `${owner}’s other album isn’t shared with you.`
                : `${owner}’s other ${hidden} albums aren’t shared with you.`}
            </Text>
          )}
        </View>

        <Card className="px-3.5 pt-3">
          <Text className="text-foreground text-sm font-semibold">What’s been happening</Text>
          <WorkspaceActivity workspaceId={id} limit={6} divider={palette.border} />
        </Card>

        <View>
          <SectionLabel>Who’s here</SectionLabel>
          <Card className="overflow-hidden">
            {membersQuery.members.map((member, i) => (
              <View
                key={member.id ?? `owner-${member.user_id}`}
                className="flex-row items-center gap-3 px-3.5 py-3"
                style={i > 0 ? { borderTopWidth: 1, borderTopColor: palette.border } : undefined}
              >
                <PersonAvatar name={member.name} url={member.avatar_url} size={38} />
                <View className="flex-1 min-w-0">
                  <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                    {member.name}
                    {member.is_you ? ' (you)' : ''}
                  </Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">{ROLE_LABEL[member.role]}</Text>
                </View>
              </View>
            ))}
          </Card>
        </View>

        <Pressable
          onPress={confirmLeave}
          disabled={leave.isPending}
          accessibilityRole="button"
          className="h-12 rounded-2xl bg-destructive/10 flex-row items-center justify-center gap-2 active:scale-[0.98]"
        >
          <LogOutIcon size={17} className="text-destructive" />
          <Text className="text-destructive text-sm font-bold">Leave workspace</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

export default function WorkspaceDetailScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const { data: workspace, isLoading } = useWorkspace(id);
  const initialSegment: Segment = tab === 'members' || tab === 'albums' ? tab : 'overview';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {workspace ? (
        workspace.is_owner ? (
          <OwnerView workspace={workspace} initialSegment={initialSegment} />
        ) : (
          <SharedView workspace={workspace} />
        )
      ) : isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        // Deleted, left, removed, or never there: one answer, since the server
        // gives one. This spun on "Loading workspace..." forever before.
        <View className="flex-1">
          <View className="px-2 pt-1">
            <BackButton />
          </View>
          <View className="flex-1 items-center justify-center px-10 gap-3 pb-24">
            <FolderXIcon size={30} className="text-muted-foreground" />
            <Text className="text-foreground text-lg font-bold text-center">This workspace isn’t available</Text>
            <Text className="text-muted-foreground text-sm text-center">
              It may have been deleted, or you are no longer a member.
            </Text>
            <Pressable
              onPress={() => router.replace('/(app)/(tabs)/workspaces')}
              accessibilityRole="button"
              className="mt-2 bg-action rounded-2xl px-5 py-3 active:scale-[0.96]"
            >
              <Text className="text-white text-sm font-semibold">Your workspaces</Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
