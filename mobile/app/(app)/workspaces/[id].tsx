import {
  View, Text, ScrollView, RefreshControl, Pressable, Alert, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { goToTab } from '@/src/lib/navigation';
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
import { ApiError, formatBytes, type Album, type ScheduleEvent, type Workspace, type WorkspaceMember } from '@/src/api';
import { isEventUpcoming } from '@/src/lib/calendar';
import {
  ACCESS_LABEL,
  ROLE_LABEL,
  accessPhrase,
  albumContents,
  deleteConsequence,
  firstName,
  invitedWhen,
  roleInSentence,
  plural,
} from '@/src/lib/workspaces';
import { RemoteImage } from '@/components/RemoteImage';
import { DeleteConfirmSheet } from '@/components/DeleteConfirmSheet';
import { LoadFailed } from '@/components/LoadFailed';
import { PageTabs } from '@/components/PageTabs';
import { DateTile } from '@/components/DateTile';
import { WorkspaceCover } from '@/components/WorkspaceCover';
import { WorkspaceActivity } from '@/components/WorkspaceActivity';
import { ActionSheet, PersonAvatar, Pill } from '@/components/WorkspaceBits';
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

/** A quiet square button for the actions beside Upload. */
function IconAction({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="w-11 h-11 rounded-[14px] bg-muted items-center justify-center active:scale-[0.96]"
    >
      <Icon size={19} className="text-foreground" />
    </Pressable>
  );
}

/** The screen's one filled button: putting files in is what a workspace is for. */
function UploadAction({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-1 h-11 rounded-[14px] bg-action flex-row items-center justify-center gap-2 active:opacity-90"
    >
      <UploadIcon size={17} className="text-action-foreground" />
      <Text className="text-action-foreground text-[15px] font-semibold">Upload</Text>
    </Pressable>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <View className={`bg-card rounded-[20px] border border-border/40 ${className}`}>{children}</View>;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" className="text-foreground text-[17px] leading-6 font-bold tracking-tight mb-2.5">
      {children}
    </Text>
  );
}

/** A round button that sits on the cover photograph. */
function OnCover({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      className="w-10 h-10 rounded-full bg-background/90 items-center justify-center active:opacity-70"
    >
      <Icon size={20} className="text-foreground" />
    </Pressable>
  );
}

/**
 * The top of a workspace: a photograph from it, then its name, what it holds
 * and whose it is.
 *
 * It was a band tinted with the workspace's colour, a letter on a square, and
 * three tiles of counts. A workspace is a client's photographs; the one thing
 * its own page did not show was any of them.
 */
function Hero({
  workspace,
  whose,
  onMore,
}: {
  workspace: Workspace;
  /** "Yours · 3 members", or who shared it and as what. */
  whose: string;
  onMore?: () => void;
}) {
  const { width } = useWindowDimensions();
  const holds = [
    workspace.album_count > 0 ? plural(workspace.album_count, 'album') : 'No albums yet',
    workspace.media_count > 0 ? plural(workspace.media_count, 'file') : null,
    // Its size only for the owner: the API keeps a member's share of
    // somebody else's storage to itself.
    workspace.storage_bytes ? formatBytes(workspace.storage_bytes) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View>
      <View>
        <WorkspaceCover workspace={workspace} width={width} height={Math.round(width * 0.5)} radius={0} />
        <View className="absolute left-2 right-2 top-2 flex-row justify-between">
          <OnCover icon={ArrowLeftIcon} label="Back" onPress={() => router.back()} />
          {onMore ? <OnCover icon={MoreHorizontalIcon} label="Workspace options" onPress={onMore} /> : null}
        </View>
      </View>
      <View className="px-5 pt-4">
        <Text
          accessibilityRole="header"
          className="text-foreground text-[24px] leading-[30px] font-bold tracking-tight"
          numberOfLines={2}
        >
          {workspace.name}
        </Text>
        <Text className="text-secondary-foreground text-[14px] leading-5 mt-1">{holds}</Text>
        <Text className="text-muted-foreground text-[13px] leading-[18px] mt-0.5">
          {workspace.archived_at ? 'Archived · ' : ''}
          {whose}
        </Text>
        {workspace.description ? (
          <Text className="text-secondary-foreground text-[14px] leading-5 mt-2.5" numberOfLines={3}>
            {workspace.description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function EventRow({ event }: { event: ScheduleEvent }) {
  const date = new Date(`${event.event_date}T00:00:00`);
  const when = [event.event_time ? formatClock(event.event_time) : 'All day', event.location]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={() => router.push(`/schedule/${event.id}`)}
      accessibilityRole="button"
      className="flex-row items-center gap-3 active:opacity-70"
    >
      {/* The tile every dated row starts with, so dates line up here as they
          do on the Dashboard and the Schedule. */}
      <DateTile
        small={date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
        large={date.getDate()}
      />
      <View className="flex-1 min-w-0">
        <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
          {event.title}
        </Text>
        <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
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

/**
 * A workspace's albums as pictures, two across.
 *
 * They were rows with a 56pt thumbnail and a chevron: a list of names in the
 * one place where the covers are what tell the albums apart. A private album
 * wears a lock on its cover; who it is shared with, or what you may do in it,
 * follows its size.
 */
function AlbumGrid({
  albums,
  showSharing = false,
  showAccess = false,
}: {
  albums: Album[];
  /** The owner's view: say which albums nobody else can open. */
  showSharing?: boolean;
  /** A member's view: say what they may do in each. */
  showAccess?: boolean;
}) {
  const { width } = useWindowDimensions();
  // Two across, inside the 20pt margins and the gap between them.
  const tile = Math.floor((width - 40 - 12) / 2);
  const height = Math.round(tile * 0.75);

  return (
    <View className="flex-row flex-wrap" style={{ columnGap: 12, rowGap: 16 }}>
      {albums.map((album) => {
        const label = sharingLabel(album);
        const isPrivate = showSharing && label === 'Private';
        const detail = [
          albumContents(album),
          showSharing && !isPrivate ? label : null,
          showAccess && album.my_access && album.my_access !== 'owner'
            ? `can ${ACCESS_LABEL[album.my_access].toLowerCase()}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <Pressable
            key={album.id}
            onPress={() => router.push(`/albums/${album.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${album.name}, ${detail}${isPrivate ? ', private' : ''}`}
            className="active:opacity-80"
            style={{ width: tile }}
          >
            <View className="rounded-2xl overflow-hidden bg-muted" style={{ height }}>
              {album.cover_url ? (
                <RemoteImage source={{ uri: album.cover_url }} style={{ width: tile, height }} contentFit="cover" />
              ) : null}
              {isPrivate && (
                <View
                  className="absolute right-2 top-2 w-6 h-6 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                >
                  <LockIcon size={12} color="#FFFFFF" />
                </View>
              )}
            </View>
            <Text className="text-foreground text-[14px] leading-5 font-semibold mt-2" numberOfLines={1}>
              {album.name}
            </Text>
            <Text className="text-muted-foreground text-[12px] leading-4" numberOfLines={1}>
              {detail}
            </Text>
          </Pressable>
        );
      })}
    </View>
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

  // Asks for the password (and the emailed code with two-factor on) first.
  const [deleting, setDeleting] = useState(false);
  const confirmDelete = () => setDeleting(true);

  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
    >
      <Hero workspace={workspace} whose={ownerLine(workspace)} onMore={() => setOptions(true)} />

      <View className="px-5 pt-4 gap-4">
        {/* One filled button, and the rest quiet beside it. They were four
            equal chips, so nothing said which one the screen is for. */}
        <View className="flex-row gap-2">
          <UploadAction onPress={() => router.push('/albums/upload')} />
          <IconAction icon={PlusIcon} label="New album" onPress={newAlbum} />
          <IconAction icon={UserPlusIcon} label="Invite someone" onPress={() => router.push(`/workspaces/${id}/invite`)} />
          <IconAction
            icon={CalendarPlusIcon}
            label="Add to the schedule"
            onPress={() => router.push(`/schedule/create?workspaceId=${id}`)}
          />
        </View>

        {/* The workspace's pages, as the Dashboard's and Jobs' are. Out to
            the screen edges, so the rule under them runs the full width. */}
        <View className="-mx-5">
          <PageTabs<Segment> tabs={SEGMENTS} value={segment} onChange={setSegment} />
        </View>

        {segment === 'overview' && (
          <>
            {unshared.length > 0 && (
              <View className="flex-row items-center gap-3 px-4 py-3 rounded-2xl bg-card border border-border/40">
                <LockIcon size={18} className="text-warning" />
                <View className="flex-1">
                  <Text className="text-foreground text-[14px] leading-5 font-semibold">
                    {unshared.length === 1
                      ? `${unshared[0].name} isn’t shared yet`
                      : `${unshared.length} albums aren’t shared yet`}
                  </Text>
                  <Text className="text-muted-foreground text-[13px] leading-[18px]">New albums start private.</Text>
                </View>
                <Pressable onPress={() => setSegment('members')} accessibilityRole="button" hitSlop={8}>
                  <Text className="text-primary text-[14px] font-semibold">Share</Text>
                </Pressable>
              </View>
            )}
            {waiting.length > 0 && (
              <View className="flex-row items-center gap-3 px-4 py-3 rounded-2xl bg-card border border-border/40">
                <RefreshCwIcon size={16} className="text-secondary-foreground" />
                <View className="flex-1">
                  <Text className="text-foreground text-[14px] leading-5 font-semibold">
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
                  <Text className="text-primary text-[14px] font-semibold">{waiting.length === 1 ? 'Resend' : 'See'}</Text>
                </Pressable>
              </View>
            )}

            <Card className="px-3.5 pt-3">
              <Text className="text-foreground text-[15px] font-semibold">What’s been happening</Text>
              <WorkspaceActivity workspaceId={id} waiting={waitingIds} limit={6} divider={palette.border} />
            </Card>

            <Card className="p-3.5 gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-foreground text-[15px] font-semibold">Coming up</Text>
                <Pressable onPress={() => router.push(`/schedule/create?workspaceId=${id}`)} hitSlop={8}>
                  <Text className="text-primary text-[14px] font-semibold">Add</Text>
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
            <AlbumGrid albums={albums} showSharing={hasPeople} />
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
                className="h-11 px-4 rounded-xl bg-action flex-row items-center gap-1.5 active:scale-[0.96]"
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
                          <Pressable
                            onPress={
                              member.status === 'pending'
                                ? () => router.push(`/workspaces/${id}/member/${member.id}`)
                                : undefined
                            }
                            disabled={member.status !== 'pending'}
                            accessibilityRole={member.status === 'pending' ? 'button' : undefined}
                            accessibilityHint={
                              member.status === 'pending'
                                ? 'Choose their role and what they see once they accept'
                                : undefined
                            }
                            className="flex-row items-center gap-3 active:opacity-70"
                          >
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
                              <>
                                <Pill tone="warning">Waiting</Pill>
                                <ChevronRightIcon size={18} className="text-muted-foreground" />
                              </>
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
                          </Pressable>
                          {member.status === 'pending' && (
                            <View className="flex-row gap-2 pl-[50px]">
                              <Pressable
                                onPress={() => sendAgain(member)}
                                disabled={resend.isPending}
                                accessibilityRole="button"
                                className="h-11 px-3.5 rounded-xl border border-border flex-row items-center gap-1.5 active:scale-[0.96]"
                              >
                                <RefreshCwIcon size={14} className="text-foreground" />
                                <Text className="text-foreground text-[13px] font-semibold">Resend</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => confirmCancel(member)}
                                accessibilityRole="button"
                                className="h-11 px-3.5 rounded-xl items-center justify-center active:opacity-60"
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
      <DeleteConfirmSheet
        visible={deleting}
        title={`Delete ${workspace.name}?`}
        message={deleteConsequence(workspace)}
        onCancel={() => setDeleting(false)}
        onConfirm={(proof) => remove.mutateAsync({ id, proof })}
        onDone={() => {
          setDeleting(false);
          router.dismissTo('/(app)/(tabs)/workspaces');
        }}
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
              onSuccess: () => router.dismissTo('/(app)/(tabs)/workspaces'),
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
      <Hero
        workspace={workspace}
        whose={`Shared by ${workspace.owner.name} · you’re ${roleInSentence(workspace.my_role, true)}`}
      />

      <View className="px-5 pt-4 gap-7">
        <View className="flex-row gap-2">
          {uploadable.length > 0 && (
            <UploadAction
              onPress={() =>
                router.push(uploadable.length === 1 ? `/albums/upload?albumId=${uploadable[0].id}` : '/albums/upload')
              }
            />
          )}
          <IconAction icon={CalendarPlusIcon} label="Open the schedule" onPress={() => goToTab('/(app)/(tabs)/schedule')} />
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
            <AlbumGrid albums={albums} showAccess />
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
          <Text className="text-foreground text-[15px] font-semibold">What’s been happening</Text>
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
  const { data: workspace, isLoading, error, isError, isPaused, refetch } = useWorkspace(id);
  // "It may have been deleted" is for a 404 or 403. Offline, or a server
  // having a bad minute, it told people their workspace might be gone.
  const gone =
    error instanceof ApiError && (error.status === 404 || error.status === 403);
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
      ) : !gone && (isError || isPaused) ? (
        <View className="flex-1">
          <View className="px-2 pt-1">
            <BackButton />
          </View>
          <LoadFailed what="this workspace" onRetry={() => void refetch()} />
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
              onPress={() => router.dismissTo('/(app)/(tabs)/workspaces')}
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
