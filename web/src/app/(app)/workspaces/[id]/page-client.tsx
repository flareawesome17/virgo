'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  CalendarPlus,
  FolderPlus,
  FolderX,
  Images,
  Lock,
  LogOut,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings2,
  UserPlus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import {
  CARD,
  DateTile,
  PageTabs,
  Pill,
  SectionTitle,
  StatusDot,
  dateTileParts,
  type PageTab,
} from '@/components/kit';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { NewAlbumDialog } from '@/components/new-album-dialog';
import { ActivityFeed } from '@/components/workspaces/activity-feed';
import { PersonAvatar } from '@/components/workspaces/bits';
import { Faces } from '@/components/workspaces/faces';
import { InviteDialog } from '@/components/workspaces/invite-dialog';
import { MembersPanel } from '@/components/workspaces/members-panel';
import { WorkspaceSettingsDialog } from '@/components/workspaces/settings-dialog';
import {
  workspaceCover,
  workspaceHolds,
  workspaceTint,
  yoursLine,
} from '@/components/workspaces/workspace-card';
import { WorkspaceUpload } from '@/components/workspaces/workspace-upload';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import type { Album, AlbumStatus, ScheduleEvent, Workspace, WorkspaceMember } from '@/api';
import { IS_DESKTOP } from '@/lib/desktop';
import { eventColor, eventTypeLabel, formatTime, isEventUpcoming } from '@/lib/calendar';
import {
  ACCESS_LABEL,
  albumContents,
  firstName,
  invitedWhen,
  roleInSentence,
} from '@/lib/workspaces';
import { cn } from '@/lib/utils';

const TABS = ['overview', 'albums', 'members', 'schedule'] as const;
type Tab = (typeof TABS)[number];

/** The page's width and rhythm, the same as the list it was opened from. */
const PAGE = 'mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-12 pt-6 sm:px-6';

/** A button beside the name: 40px tall, its icon set in from the edge. */
const ACTION = 'h-10 rounded-[10px] pl-3 pr-4 font-semibold';

/** Album tiles: four across beside the page's second column, more where they have the width. */
const TILES = 'grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-5';
const TILES_WIDE = 'grid grid-cols-[repeat(auto-fill,minmax(min(190px,100%),1fr))] gap-x-4 gap-y-5';

/** A draft says nothing on its cover: a status is news once the album has one. */
const ALBUM_STATUS: Partial<Record<AlbumStatus, { label: string; tone: 'good' | 'warm' }>> = {
  review: { label: 'In review', tone: 'warm' },
  delivered: { label: 'Delivered', tone: 'good' },
};

/** "Private", "Shared with 2", "Offered to 1": who can open an album. */
function sharingLabel(album: Album): string {
  const shared = album.shared_with ?? 0;
  const offered = album.offered_to ?? 0;
  if (shared > 0) return `Shared with ${shared}`;
  if (offered > 0) return `Offered to ${offered}`;
  return 'Private';
}

/**
 * An album as a picture: its status on the cover, and a lock there when
 * nobody else can open it.
 *
 * Who it is shared with, or what you may do in it, is a line of its own under
 * the size: a tile is too narrow for the count, the size and "Shared with 2"
 * together, and it was the sharing that got cut off.
 */
function AlbumTile({
  album,
  locked = false,
  note,
}: {
  album: Album;
  locked?: boolean;
  note?: string | null;
}) {
  const status = ALBUM_STATUS[album.status];
  return (
    <Link
      href={`/albums/${album.id}`}
      className="group flex min-w-0 flex-col rounded-[14px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <span className="relative block aspect-[4/3] overflow-hidden rounded-[14px] bg-muted">
        {album.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, not an asset to optimise
          <img
            src={album.cover_url}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <span className="grid size-full place-items-center">
            <Images className="size-6 text-muted-foreground" aria-hidden />
          </span>
        )}
        {status && (
          // On the page's colour, so the pill's tint reads the same over any photograph.
          <span className="absolute left-2 top-2 flex rounded-full bg-background">
            <Pill tone={status.tone}>{status.label}</Pill>
          </span>
        )}
        {locked && (
          <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-black/60 text-white">
            <Lock role="img" aria-label="Private" className="size-3" strokeWidth={2.4} />
          </span>
        )}
      </span>
      <span className="mt-2 truncate text-sm font-semibold leading-5">{album.name}</span>
      <span className="truncate text-xs leading-4 text-muted-foreground">{albumContents(album)}</span>
      {note && <span className="truncate text-xs leading-4 text-muted-foreground">{note}</span>}
    </Link>
  );
}

function AlbumTiles({
  albums,
  showSharing = false,
  showAccess = false,
  wide = false,
}: {
  albums: Album[];
  /** The owner's view: say which albums nobody else can open. */
  showSharing?: boolean;
  /** A member's view: say what they may do in each. */
  showAccess?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? TILES_WIDE : TILES}>
      {albums.map((album) => {
        const sharing = sharingLabel(album);
        const locked = showSharing && sharing === 'Private';
        const note =
          showSharing && !locked
            ? sharing
            : showAccess && album.my_access && album.my_access !== 'owner'
              ? `You can ${ACCESS_LABEL[album.my_access].toLowerCase()}`
              : null;
        return <AlbumTile key={album.id} album={album} locked={locked} note={note} />;
      })}
    </div>
  );
}

function TileSkeletons({ count, wide = false }: { count: number; wide?: boolean }) {
  return (
    <div className={wide ? TILES_WIDE : TILES}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-[4/3] rounded-[14px]" />
      ))}
    </div>
  );
}

/**
 * Dated rows: the tile every dated row starts with, what it is and where, and
 * the hour at the end.
 *
 * `byMonth` is for the list that runs on past this month: the tile says the
 * month there, and the weekday moves into the line under the title.
 */
function EventRows({ events, byMonth = false }: { events: ScheduleEvent[]; byMonth?: boolean }) {
  return (
    <>
      {events.map((event, i) => {
        const date = dateTileParts(event.event_date);
        const weekday = date.weekday.charAt(0) + date.weekday.slice(1).toLowerCase();
        const kind = [byMonth ? weekday : null, eventTypeLabel(event), event.location?.trim()]
          .filter(Boolean)
          .join(' · ');
        return (
          <Link
            key={event.id}
            href={`/schedule?date=${event.event_date}`}
            className={cn(
              'flex min-h-[60px] items-center gap-3 py-2 pl-2.5 pr-4 transition-colors hover:bg-muted/50',
              i > 0 && 'border-t border-border/40',
            )}
          >
            <DateTile top={byMonth ? date.month : date.weekday} day={date.day} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">{event.title}</span>
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
                <StatusDot color={eventColor(event.event_type)} className="size-[7px]" />
                <span className="truncate">{kind}</span>
              </span>
            </span>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-secondary-foreground">
              {event.event_time ? formatTime(event.event_time) : 'All day'}
            </span>
          </Link>
        );
      })}
    </>
  );
}

/** Something waiting on the owner, across the top of Overview: one row for each kind. */
function NeedRow({
  icon: Icon,
  lead,
  rest,
  action,
  onAction,
  disabled = false,
}: {
  icon: LucideIcon;
  lead: string;
  rest: string;
  action: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn(CARD, 'flex min-h-[52px] items-center gap-3 px-4 py-2.5')}>
      <Icon className="size-[18px] shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{lead}</span>{' '}
        <span className="text-muted-foreground">{rest}</span>
      </p>
      <Button
        variant="link"
        className="h-auto shrink-0 p-0 font-semibold"
        disabled={disabled}
        onClick={onAction}
      >
        {action}
      </Button>
    </div>
  );
}

/** A section's title with a button beside it, where the kit's SectionTitle takes only a link. */
function SectionHead({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h2 className="text-base font-bold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

/** The bar's half of a workspace: the way back, and its name. */
function BarTitle({ workspace }: { workspace: Workspace }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {/* The desktop title bar already has back and forward. */}
      {!IS_DESKTOP && (
        <Button asChild size="icon" variant="ghost" className="-ml-2 shrink-0">
          <Link href="/workspaces" aria-label="Back to workspaces">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
      )}
      <span className="truncate">{workspace.name}</span>
      {workspace.archived_at && <Pill>Archived</Pill>}
    </span>
  );
}

/**
 * The top of a workspace: a photograph from it across the page, then its
 * name, what it holds and whose it is, with the page's buttons beside them.
 *
 * It was a letter on a square in the bar and four tiles of counts. A
 * workspace is a client's photographs; the one thing its own page did not
 * show was any of them. With no photograph yet, the band is its own colour.
 */
function Hero({
  workspace,
  albums,
  people,
  whose,
  children,
}: {
  workspace: Workspace;
  /** Its albums, to find the cover among. */
  albums: Album[];
  people: { name: string; avatar_url: string | null }[];
  /** "Yours · 3 members", or who shared it and as what. */
  whose: string;
  /** The buttons. */
  children: ReactNode;
}) {
  const cover = workspaceCover(workspace, albums);
  return (
    <>
      <div
        className="h-40 overflow-hidden rounded-[20px] sm:h-[220px]"
        style={{ backgroundColor: workspaceTint(workspace) }}
      >
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, not an asset to optimise
          <img src={cover} alt="" className="size-full object-cover" />
        )}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-1 basis-[360px] flex-col gap-1">
          <h2 className="text-[26px] font-bold leading-8 tracking-[-0.025em]">{workspace.name}</h2>
          <p className="text-sm text-secondary-foreground">{workspaceHolds(workspace)}</p>
          <p className="mt-0.5 flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
            <Faces people={people} max={5} />
            <span className="min-w-0">
              {workspace.archived_at ? 'Archived · ' : ''}
              {whose}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">{children}</div>
      </div>
    </>
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

  const startCreateAlbum = () => {
    if (isAlbumLimitReached(workspace.album_total)) {
      toast.error('This workspace is full', {
        description: `Your ${usage?.plan ?? 'free'} plan allows ${albumLimit} album${albumLimit === 1 ? '' : 's'} in each workspace. Delete one, or use another workspace.`,
        action: { label: 'See plans', onClick: () => router.push('/settings/plans') },
      });
      return;
    }
    setCreatingAlbum(true);
  };

  const invite = (preselect: string | null = null) => setInviting({ preselect });

  const sendAgain = (member: WorkspaceMember) =>
    resend.mutate(member.id!, {
      onSuccess: () => toast.success(`Sent to ${firstName(member.name)} again`),
      onError: (err: Error) => toast.error('Not sent', { description: err.message }),
    });

  const newEventHref = `/schedule?new=1&workspace=${workspace.id}`;
  const pages: PageTab<Tab>[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'albums', label: 'Albums', count: workspace.album_count },
    { key: 'members', label: 'Members', count: workspace.member_count },
    { key: 'schedule', label: 'Schedule', count: upcoming.length },
  ];

  return (
    <>
      <PageHeader
        title={<BarTitle workspace={workspace} />}
        description={workspace.description || undefined}
      />

      <div className={PAGE}>
        <Hero
          workspace={workspace}
          albums={albums}
          // The members once they are known, you among them; until then the
          // faces the workspace itself came with.
          people={present.length > 0 ? present : workspace.people}
          whose={yoursLine(workspace)}
        >
          {/* One filled button, and the rest quiet beside it: putting files
              in is what a workspace is for. */}
          <WorkspaceUpload
            workspaceId={workspace.id}
            albums={albums}
            loading={loadingAlbums}
            onNewAlbum={startCreateAlbum}
            className={ACTION}
          />
          <Button variant="secondary" className={ACTION} onClick={startCreateAlbum}>
            <FolderPlus />
            New album
          </Button>
          <Button variant="secondary" className={ACTION} onClick={() => invite()}>
            <UserPlus />
            Invite
          </Button>
          <Button asChild variant="secondary" className={ACTION}>
            <Link href={newEventHref}>
              <CalendarPlus />
              Add to schedule
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" className="size-10 rounded-[10px]" aria-label="Workspace options">
                <MoreHorizontal className="size-[18px]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Settings2 />
                Workspace settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Hero>

        <PageTabs tabs={pages} value={tab} onChange={setTab} label="Workspace pages" />

        {tab === 'overview' && (
          <div role="tabpanel" aria-label="Overview" className="flex flex-col gap-6">
            {(unshared.length > 0 || waiting.length > 0) && (
              <div className="flex flex-col gap-2.5">
                {unshared.length > 0 && (
                  <NeedRow
                    icon={Lock}
                    lead={
                      unshared.length === 1
                        ? `${unshared[0].name} is private.`
                        : `${unshared.length} albums are private.`
                    }
                    rest={unshared.length === 1 ? 'Only you see it.' : 'Only you see them.'}
                    action="Share"
                    onAction={() => setTab('members')}
                  />
                )}
                {/* One invitation is resent from here. Several are a list,
                    and the list with a Resend on each row is in Members. */}
                {waiting.length === 1 && (
                  <NeedRow
                    icon={RefreshCw}
                    lead={`${firstName(waiting[0].name)} hasn’t answered your invitation.`}
                    rest={`Sent ${invitedWhen(waiting[0].invited_at)}, as ${roleInSentence(waiting[0].role)}.`}
                    action="Resend"
                    disabled={resend.isPending}
                    onAction={() => sendAgain(waiting[0])}
                  />
                )}
                {waiting.length > 1 && (
                  <NeedRow
                    icon={RefreshCw}
                    lead={`${waiting.length} invitations haven’t been answered.`}
                    rest="Resend or cancel them from Members."
                    action="See"
                    onAction={() => setTab('members')}
                  />
                )}
              </div>
            )}

            <div className="flex flex-wrap items-start gap-7">
              <section className="flex min-w-0 flex-[2_1_480px] flex-col">
                <SectionHead
                  action={
                    albums.length > 0 && (
                      <Button
                        variant="link"
                        className="h-auto p-0 font-semibold"
                        onClick={() => setTab('albums')}
                      >
                        See all
                      </Button>
                    )
                  }
                >
                  Albums
                </SectionHead>
                {loadingAlbums ? (
                  <TileSkeletons count={4} />
                ) : albumsFailed && albums.length === 0 ? (
                  <ErrorState message="Could not load these albums." onRetry={() => refetchAlbums()} />
                ) : albums.length === 0 ? (
                  <div className={cn(CARD, 'flex flex-wrap items-center justify-between gap-3 px-4 py-3.5')}>
                    <p className="text-sm text-muted-foreground">
                      No albums yet. An album holds one shoot or one delivery.
                    </p>
                    <Button size="sm" variant="secondary" onClick={startCreateAlbum}>
                      <Plus className="size-4" />
                      New album
                    </Button>
                  </div>
                ) : (
                  <AlbumTiles albums={albums.slice(0, 8)} showSharing={hasPeople} />
                )}
              </section>

              <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-7">
                <section>
                  <SectionTitle link={{ label: 'Add', href: newEventHref }}>Coming up</SectionTitle>
                  <div className={cn(CARD, 'flex flex-col overflow-hidden')}>
                    {upcoming.length === 0 ? (
                      <p className="px-4 py-3.5 text-sm text-muted-foreground">
                        Nothing scheduled for this workspace.
                      </p>
                    ) : (
                      <EventRows events={upcoming.slice(0, 3)} />
                    )}
                  </div>
                </section>

                <section>
                  <SectionTitle>What’s been happening</SectionTitle>
                  <div className={cn(CARD, 'px-4')}>
                    <ActivityFeed workspaceId={workspace.id} waiting={waitingIds} limit={8} />
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}

        {tab === 'albums' && (
          <div role="tabpanel" aria-label="Albums">
            {loadingAlbums && albums.length === 0 ? (
              <TileSkeletons count={4} wide />
            ) : albumsFailed && albums.length === 0 ? (
              <ErrorState message="Could not load these albums." onRetry={() => refetchAlbums()} />
            ) : albums.length === 0 ? (
              <div className={CARD}>
                <EmptyState
                  icon={Images}
                  title="No albums yet"
                  description="An album holds the media for one shoot or one delivery. It starts private; share it from Members."
                  action={
                    // Quiet: Upload, above, is the page's one filled button.
                    <Button variant="secondary" onClick={startCreateAlbum}>
                      <Plus className="size-4" />
                      Create the first album
                    </Button>
                  }
                />
              </div>
            ) : (
              <AlbumTiles albums={albums} showSharing={hasPeople} wide />
            )}
          </div>
        )}

        {tab === 'members' && (
          <div role="tabpanel" aria-label="Members">
            <MembersPanel workspace={workspace} onInvite={invite} />
          </div>
        )}

        {tab === 'schedule' && (
          <section role="tabpanel" aria-label="Schedule">
            <SectionHead
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href={newEventHref}>
                    <CalendarPlus className="size-4" />
                    Add event
                  </Link>
                </Button>
              }
            >
              Coming up in {workspace.name}
            </SectionHead>
            <div className={cn(CARD, 'flex flex-col overflow-hidden')}>
              {upcoming.length === 0 ? (
                <p className="px-4 py-3.5 text-sm text-muted-foreground">
                  Nothing scheduled. Events you add here show on your calendar too.
                </p>
              ) : (
                <EventRows events={upcoming} byMonth />
              )}
            </div>
          </section>
        )}
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
  // As the API decides it, the same test the album's own page makes.
  const uploadable = albums.filter((a) => a.my_access === 'upload' || a.my_access === 'manage');

  return (
    <>
      <PageHeader title={<BarTitle workspace={workspace} />} />

      <div className={PAGE}>
        <Hero
          workspace={workspace}
          albums={albums}
          people={workspace.people}
          whose={`Shared by ${workspace.owner.name} · you’re ${roleInSentence(workspace.my_role, true)}`}
        >
          {/* Only with somewhere to put files: an Upload that every album
              refuses is a button that does nothing. */}
          {uploadable.length > 0 && (
            <WorkspaceUpload workspaceId={workspace.id} albums={uploadable} className={ACTION} />
          )}
          <Button variant="secondary" className={ACTION} onClick={() => setConfirmingLeave(true)}>
            <LogOut />
            Leave
          </Button>
        </Hero>

        <div className="flex flex-wrap items-start gap-7">
          <section className="flex min-w-0 flex-[2_1_480px] flex-col">
            <SectionTitle>Albums shared with you</SectionTitle>
            {isLoading ? (
              <TileSkeletons count={2} />
            ) : loadFailed && albums.length === 0 ? (
              <ErrorState message="Could not load these albums." onRetry={() => refetch()} />
            ) : albums.length === 0 ? (
              <p className={cn(CARD, 'px-4 py-3.5 text-sm text-muted-foreground')}>
                {owner} hasn’t shared an album with you yet. They appear here as soon as one is.
              </p>
            ) : (
              <AlbumTiles albums={albums} showAccess />
            )}
            {hidden > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {hidden === 1
                  ? `${owner}’s other album isn’t shared with you.`
                  : `${owner}’s other ${hidden} albums aren’t shared with you.`}
              </p>
            )}
          </section>

          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-7">
            <section>
              <SectionTitle>Who’s here</SectionTitle>
              {members.length > 0 && (
                <div className={cn(CARD, 'flex flex-col overflow-hidden')}>
                  {members.map((member, i) => (
                    <div
                      key={member.id ?? member.user_id}
                      className={cn(
                        'flex min-h-[52px] items-center gap-3 px-4 py-2',
                        i > 0 && 'border-t border-border/40',
                      )}
                    >
                      <PersonAvatar name={member.name} url={member.avatar_url} className="size-7" />
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
                </div>
              )}
            </section>

            <section>
              <SectionTitle>What’s been happening</SectionTitle>
              <div className={cn(CARD, 'px-4')}>
                <ActivityFeed workspaceId={workspace.id} limit={8} />
              </div>
            </section>
          </div>
        </div>
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
    <Screen title={workspace?.name ?? 'Workspace'}>
      {workspace ? (
        workspace.is_owner ? (
          <OwnerWorkspace workspace={workspace} />
        ) : (
          <SharedWorkspace workspace={workspace} />
        )
      ) : isLoading ? (
        <>
          <PageHeader title={<Skeleton className="h-6 w-56" />} />
          <div className={PAGE}>
            <Skeleton className="h-40 rounded-[20px] sm:h-[220px]" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-72 max-w-full" />
              <Skeleton className="h-4 w-48" />
            </div>
            <ListSkeleton rows={3} />
          </div>
        </>
      ) : (
        // Not found, not yours, left, or deleted — one answer, since the
        // server gives one. It spun here forever before.
        <>
          <PageHeader title="Workspace" />
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-10">
            <div className={CARD}>
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
            </div>
          </div>
        </>
      )}
    </Screen>
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
