'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarPlus,
  FolderX,
  Images,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Settings2,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell, PageHeader } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { NewAlbumDialog } from '@/components/new-album-dialog';
import { ActivityFeed } from '@/components/workspaces/activity-feed';
import { PeopleStack, PersonAvatar, Pill, WorkspaceTile } from '@/components/workspaces/bits';
import { InviteDialog } from '@/components/workspaces/invite-dialog';
import { MembersPanel } from '@/components/workspaces/members-panel';
import { WorkspaceSettingsDialog } from '@/components/workspaces/settings-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useLeaveWorkspace,
  useWorkspace,
  useWorkspaceMembers,
} from '@/hooks/useWorkspaces';
import { useAlbums } from '@/hooks/useAlbums';
import { useResendInvitation } from '@/hooks/useCollaborators';
import { useScheduleEvents } from '@/hooks/useScheduleEvents';
import { useUsage } from '@/hooks/useUsage';
import { formatBytes, type Album, type ScheduleEvent, type Workspace } from '@/api';
import { formatTime, isEventUpcoming, parseDateKey } from '@/lib/calendar';
import {
  ACCESS_LABEL,
  firstName,
  invitedWhen,
  joinNames,
  plural,
  roleInSentence,
} from '@/lib/workspaces';

const TABS = ['overview', 'albums', 'members', 'schedule'] as const;
type Tab = (typeof TABS)[number];

/** "Private", "Shared with 2", "Offered to 1": who can open an album. */
function sharingLabel(album: Album): string {
  const shared = album.shared_with ?? 0;
  const offered = album.offered_to ?? 0;
  if (shared > 0) return `Shared with ${shared}`;
  if (offered > 0) return `Offered to ${offered}`;
  return 'Private';
}

function AlbumTile({ album, showSharing }: { album: Album; showSharing: boolean }) {
  const label = sharingLabel(album);
  const isPrivate = label === 'Private';
  return (
    <Link
      href={`/albums/${album.id}`}
      className="group flex min-w-0 flex-col gap-1.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="block aspect-[4/3] overflow-hidden rounded-[10px] bg-muted">
        {album.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={album.cover_url}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <span className="grid size-full place-items-center">
            <Images className="size-6 text-muted-foreground" />
          </span>
        )}
      </span>
      <span className="truncate text-[13px] font-semibold">{album.name}</span>
      <span
        className={`flex items-center gap-1 truncate text-xs ${isPrivate && showSharing ? 'text-warning' : 'text-muted-foreground'}`}
      >
        {isPrivate && showSharing && <Lock className="size-3 shrink-0" aria-hidden />}
        {plural(album.item_count, 'file')}
        {showSharing ? ` · ${label}` : ''}
      </span>
    </Link>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 flex-1 basis-36 rounded-xl border bg-card px-4 py-3.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-[22px] font-bold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function EventRow({ event }: { event: ScheduleEvent }) {
  const date = parseDateKey(event.event_date);
  return (
    <Link
      href={`/schedule?date=${event.event_date}`}
      className="flex items-center gap-3 rounded-lg hover:bg-muted/60"
    >
      <span className="flex h-[52px] w-12 shrink-0 flex-col items-center justify-center rounded-[10px] bg-primary/10 text-primary">
        <span className="text-[11px] font-bold tracking-[0.08em]">
          {date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}
        </span>
        <span className="text-xl font-bold leading-[22px]">{date.getDate()}</span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{event.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {[
            date.toLocaleDateString(undefined, { weekday: 'short' }),
            event.event_time ? formatTime(event.event_time) : 'All day',
            event.location,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    </Link>
  );
}

/** The owner's workspace: everything in it, and everything about it. */
function OwnerWorkspace({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const wanted = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(TABS.includes(wanted as Tab) ? (wanted as Tab) : 'overview');

  const { albums, isLoading: loadingAlbums, loadFailed: albumsFailed, refetch: refetchAlbums } =
    useAlbums({ workspace_id: workspace.id, limit: 100 });
  const { members } = useWorkspaceMembers(workspace.id);
  // Latest-dated first, so the future is what fits in the page; the date
  // window mode would be tidier but does not filter by workspace.
  const { events } = useScheduleEvents({
    workspace_id: workspace.id,
    orderBy: 'event_date',
    direction: 'desc',
    limit: 100,
  });
  const { usage, isAlbumLimitReached, albumLimit } = useUsage();
  const resend = useResendInvitation();

  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [inviting, setInviting] = useState<{ preselect: string | null } | null>(null);
  const [editing, setEditing] = useState(false);

  const present = members.filter((m) => m.status === 'owner' || m.status === 'accepted');
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
  const upcoming = events
    .filter((e) => isEventUpcoming(e.event_date, e.event_time))
    .sort((a, b) =>
      `${a.event_date} ${a.event_time ?? ''}`.localeCompare(`${b.event_date} ${b.event_time ?? ''}`),
    );

  const storageUsed = usage?.storage.usedBytes ?? 0;
  const share =
    storageUsed > 0 && workspace.storage_bytes
      ? Math.max(1, Math.round((workspace.storage_bytes / storageUsed) * 100))
      : null;

  const startCreateAlbum = () => {
    if (isAlbumLimitReached(workspace.album_total)) {
      toast.error('This workspace is full', {
        description: `Your ${usage?.plan ?? 'free'} plan allows ${albumLimit} album${albumLimit === 1 ? '' : 's'} in each workspace. Delete one, use another workspace, or upgrade.`,
        action: { label: 'See plans', onClick: () => router.push('/settings/plans') },
      });
      return;
    }
    setCreatingAlbum(true);
  };

  const invite = (preselect: string | null = null) => setInviting({ preselect });

  const peopleNames = present.map((m) => (m.is_you ? 'You' : firstName(m.name)));

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Button asChild size="icon" variant="ghost" className="-ml-2 shrink-0">
              <Link href="/workspaces" aria-label="Back to workspaces">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <WorkspaceTile name={workspace.name} color={workspace.accent_color} className="size-9 text-sm" />
            <span className="truncate">{workspace.name}</span>
            {workspace.archived_at && <Pill tone="muted">Archived</Pill>}
          </span>
        }
        description={workspace.description || undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => invite()}>
              <UserPlus className="size-4" />
              Invite
            </Button>
            <Button onClick={startCreateAlbum}>
              <Plus className="size-4" />
              New album
            </Button>
            <Button variant="ghost" size="icon" aria-label="Workspace settings" onClick={() => setEditing(true)}>
              <Settings2 className="size-4" />
            </Button>
          </>
        }
      />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Pill>Yours</Pill>
          <PeopleStack people={present} size="size-7" max={5} />
          <span className="text-xs text-muted-foreground">
            {present.length <= 1 ? 'Only you so far' : joinNames(peopleNames)}
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          <Stat
            label="Albums"
            value={workspace.album_count.toLocaleString()}
            sub={
              unshared.length > 0
                ? `${unshared.length} not shared yet`
                : hasPeople
                  ? 'All shared with someone'
                  : 'Only you can see them'
            }
          />
          <Stat
            label="Files"
            value={workspace.media_count.toLocaleString()}
            sub={
              workspace.files_this_week > 0
                ? `${workspace.files_this_week.toLocaleString()} added this week`
                : 'None added this week'
            }
          />
          <Stat
            label="Storage"
            value={formatBytes(workspace.storage_bytes ?? 0)}
            sub={share !== null ? `${share}% of what you use` : undefined}
          />
          <Stat
            label="Members"
            value={workspace.member_count.toLocaleString()}
            sub={
              workspace.pending_count > 0
                ? `${plural(workspace.pending_count, 'invite')} waiting`
                : workspace.member_count <= 1
                  ? 'Just you'
                  : 'No invites waiting'
            }
          />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="albums">
              Albums <span className="ml-1 text-xs text-muted-foreground tabular-nums">{workspace.album_count}</span>
            </TabsTrigger>
            <TabsTrigger value="members">
              Members <span className="ml-1 text-xs text-muted-foreground tabular-nums">{workspace.member_count}</span>
            </TabsTrigger>
            <TabsTrigger value="schedule">
              Schedule <span className="ml-1 text-xs text-muted-foreground tabular-nums">{upcoming.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
                <section className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold">Albums</h2>
                    {albums.length > 0 && (
                      <Button variant="link" size="sm" className="px-0" onClick={() => setTab('albums')}>
                        See all
                      </Button>
                    )}
                  </div>
                  {loadingAlbums ? (
                    <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
                      {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="aspect-[4/3] rounded-[10px]" />
                      ))}
                    </div>
                  ) : albums.length === 0 ? (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        No albums yet. An album holds one shoot or one delivery.
                      </p>
                      <Button size="sm" variant="outline" onClick={startCreateAlbum}>
                        <Plus className="size-4" />
                        New album
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                      {albums.slice(0, 5).map((album) => (
                        <AlbumTile key={album.id} album={album} showSharing={hasPeople} />
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border bg-card px-4 pb-1 pt-3.5">
                  <h2 className="mb-1 text-[15px] font-semibold">What’s been happening</h2>
                  <ActivityFeed workspaceId={workspace.id} waiting={waitingIds} limit={8} />
                </section>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
                  <h2 className="text-[15px] font-semibold">Needs you</h2>
                  {unshared.length === 0 && waiting.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {hasPeople
                        ? 'Nothing right now. Every album is shared with someone and every invitation is answered.'
                        : 'Nothing right now. Invite someone when you want help with this job.'}
                    </p>
                  ) : (
                    <>
                      {unshared.slice(0, 3).map((album) => (
                        <div key={album.id} className="flex items-start gap-2.5 border-t pt-3 first-of-type:border-t-0 first-of-type:pt-0">
                          <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold">{album.name} isn’t shared with anyone</p>
                            <p className="text-xs text-muted-foreground">New albums start private.</p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => setTab('members')}>
                            Share
                          </Button>
                        </div>
                      ))}
                      {waiting.slice(0, 3).map((member) => (
                        <div key={member.id} className="flex items-start gap-2.5 border-t pt-3 first-of-type:border-t-0 first-of-type:pt-0">
                          <RefreshCw className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold">
                              {firstName(member.name)} hasn’t answered your invitation
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Sent {invitedWhen(member.invited_at)}, as {roleInSentence(member.role)}.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={resend.isPending}
                            onClick={() =>
                              resend.mutate(member.id!, {
                                onSuccess: () => toast.success(`Sent to ${firstName(member.name)} again`),
                                onError: (err: Error) => toast.error('Not sent', { description: err.message }),
                              })
                            }
                          >
                            Resend
                          </Button>
                        </div>
                      ))}
                    </>
                  )}
                </section>

                <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold">Coming up</h2>
                    <Button asChild variant="link" size="sm" className="px-0">
                      <Link href={`/schedule?new=1&workspace=${workspace.id}`}>Add</Link>
                    </Button>
                  </div>
                  {upcoming.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing scheduled for this workspace.</p>
                  ) : (
                    upcoming.slice(0, 3).map((event) => <EventRow key={event.id} event={event} />)
                  )}
                </section>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="albums" className="mt-4">
            {loadingAlbums && albums.length === 0 ? (
              <ListSkeleton rows={3} />
            ) : albumsFailed && albums.length === 0 ? (
              <ErrorState message="Could not load these albums." onRetry={() => refetchAlbums()} />
            ) : albums.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Images}
                  title="No albums yet"
                  description="An album holds the media for one shoot or one delivery. It starts private; share it from Members."
                  action={
                    <Button onClick={startCreateAlbum}>
                      <Plus className="size-4" />
                      Create the first album
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {albums.map((album) => (
                  <AlbumTile key={album.id} album={album} showSharing={hasPeople} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <MembersPanel workspace={workspace} onInvite={invite} />
          </TabsContent>

          <TabsContent value="schedule" className="mt-4">
            <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">Coming up in {workspace.name}</h2>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/schedule?new=1&workspace=${workspace.id}`}>
                    <CalendarPlus className="size-4" />
                    Add event
                  </Link>
                </Button>
              </div>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing scheduled. Events you add here show on your calendar too.
                </p>
              ) : (
                upcoming.map((event) => <EventRow key={event.id} event={event} />)
              )}
            </section>
          </TabsContent>
        </Tabs>
      </div>

      <NewAlbumDialog workspaceId={workspace.id} open={creatingAlbum} onOpenChange={setCreatingAlbum} />
      <InviteDialog
        workspace={workspace}
        open={!!inviting}
        preselect={inviting?.preselect}
        onOpenChange={(open) => !open && setInviting(null)}
      />
      <WorkspaceSettingsDialog
        workspace={workspace}
        albums={albums}
        open={editing}
        onOpenChange={setEditing}
      />
    </>
  );
}

/**
 * A workspace someone else owns: the albums shared with you and what you can
 * do in each, who else is here, what has been happening in your albums, and
 * a way out. Nothing that is the owner's to decide.
 */
function SharedWorkspace({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const { albums, isLoading, loadFailed, refetch } = useAlbums({ workspace_id: workspace.id, limit: 100 });
  const { members } = useWorkspaceMembers(workspace.id);
  const leave = useLeaveWorkspace();
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const owner = firstName(workspace.owner.name);
  const hidden = Math.max(0, workspace.album_total - workspace.album_count);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Button asChild size="icon" variant="ghost" className="-ml-2 shrink-0">
              <Link href="/workspaces" aria-label="Back to workspaces">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <WorkspaceTile name={workspace.name} color={workspace.accent_color} className="size-9 text-sm" />
            <span className="truncate">{workspace.name}</span>
          </span>
        }
        description={`Shared by ${workspace.owner.name} · you’re ${roleInSentence(workspace.my_role, true)}`}
        actions={
          <Button variant="outline" onClick={() => setConfirmingLeave(true)}>
            <LogOut className="size-4" />
            Leave
          </Button>
        }
      />

      <div className="mx-auto grid w-full max-w-6xl gap-4 px-6 py-5 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="text-[15px] font-semibold">Albums shared with you</h2>
            {isLoading ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="aspect-[4/3] rounded-[10px]" />
                ))}
              </div>
            ) : loadFailed && albums.length === 0 ? (
              <div className="mt-3">
                <ErrorState message="Could not load these albums." onRetry={() => refetch()} />
              </div>
            ) : albums.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {owner} hasn’t shared an album with you yet. They appear here as soon as one is.
              </p>
            ) : (
              <ul className="mt-2">
                {albums.map((album) => (
                  <li key={album.id} className="border-t first:border-t-0">
                    <Link href={`/albums/${album.id}`} className="flex items-center gap-3 py-2.5 hover:bg-muted/40">
                      <span className="size-11 shrink-0 overflow-hidden rounded-[10px] bg-muted">
                        {album.cover_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={album.cover_url} alt="" loading="lazy" className="size-full object-cover" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{album.name}</span>
                        <span className="block text-xs text-muted-foreground">{plural(album.item_count, 'file')}</span>
                      </span>
                      {album.my_access && album.my_access !== 'owner' && (
                        <Pill tone="info">You can {ACCESS_LABEL[album.my_access].toLowerCase()}</Pill>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {hidden > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {hidden === 1
                  ? `${owner}’s other album isn’t shared with you.`
                  : `${owner}’s other ${hidden} albums aren’t shared with you.`}
              </p>
            )}
          </section>

          <section className="rounded-2xl border bg-card px-4 pb-1 pt-3.5">
            <h2 className="mb-1 text-[15px] font-semibold">What’s been happening</h2>
            <ActivityFeed workspaceId={workspace.id} limit={8} />
          </section>
        </div>

        <section className="flex h-fit flex-col gap-1 rounded-2xl border bg-card p-4">
          <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            Who’s here
          </h2>
          {members.map((member) => (
            <div key={member.id ?? member.user_id} className="flex items-center gap-3 py-1.5">
              <PersonAvatar name={member.name} url={member.avatar_url} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {member.name}
                  {member.is_you && <span className="font-normal text-muted-foreground"> (you)</span>}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {member.status === 'owner' ? 'Owner' : roleInSentence(member.role, true).replace(/^an? /, '')}
                </span>
              </span>
            </div>
          ))}
        </section>
      </div>

      <AlertDialog open={confirmingLeave} onOpenChange={setConfirmingLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {workspace.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              You lose access to its albums straight away, and {owner} is told. Anything you
              uploaded stays in {owner}’s albums. {owner} can invite you again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() =>
                leave.mutate(workspace.id, {
                  onSuccess: () => {
                    toast.success(`You left ${workspace.name}`);
                    router.replace('/workspaces');
                  },
                  onError: (err: Error) => toast.error('Could not leave', { description: err.message }),
                })
              }
            >
              Leave workspace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function WorkspacePageBody() {
  const { id } = useParams<{ id: string }>();
  const { data: workspace, isLoading, isError, refetch } = useWorkspace(id);

  return (
    <AppShell title={workspace?.name ?? 'Workspace'}>
      {workspace ? (
        workspace.is_owner ? (
          <OwnerWorkspace workspace={workspace} />
        ) : (
          <SharedWorkspace workspace={workspace} />
        )
      ) : isLoading ? (
        <>
          <PageHeader title={<Skeleton className="h-6 w-56" />} />
          <div className="mx-auto w-full max-w-6xl px-6 py-6">
            <ListSkeleton rows={3} />
          </div>
        </>
      ) : (
        // Not found, not yours, left, or deleted — one answer, since the
        // server gives one. It spun here forever before.
        <>
          <PageHeader title="Workspace" />
          <div className="mx-auto w-full max-w-3xl px-6 py-10">
            <Card>
              <EmptyState
                icon={FolderX}
                title="This workspace isn’t available"
                description={
                  isError
                    ? 'It may have been deleted, or you are no longer a member. If it should be here, try again.'
                    : 'It may have been deleted, or you are no longer a member.'
                }
                action={
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => refetch()}>
                      Try again
                    </Button>
                    <Button asChild>
                      <Link href="/workspaces">Your workspaces</Link>
                    </Button>
                  </div>
                }
              />
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}

/**
 * Suspense is required, not decorative: useSearchParams (for ?tab=) opts the
 * tree into client rendering, and Next fails the build without a boundary.
 */
export default function WorkspacePage() {
  return (
    <Suspense fallback={null}>
      <WorkspacePageBody />
    </Suspense>
  );
}
