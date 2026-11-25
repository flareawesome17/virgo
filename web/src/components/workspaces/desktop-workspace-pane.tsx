'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Folder, Images, Lock, MoreHorizontal, Settings2 } from 'lucide-react';
import type { Album, AlbumStatus, Workspace } from '@/api';
import { ComingUpRows } from '@/components/home/parts';
import { Kbd, Panel, Pill } from '@/components/kit';
import { NewAlbumDialog } from '@/components/new-album-dialog';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useAlbums } from '@/hooks/useAlbums';
import { useScheduleEvents } from '@/hooks/useScheduleEvents';
import { isEventUpcoming } from '@/lib/calendar';
import { albumContents, firstName } from '@/lib/workspaces';
import { cn } from '@/lib/utils';
import { WorkspaceSettingsDialog } from './settings-dialog';
import { workspaceCover, workspaceHolds, workspaceTint } from './workspace-card';
import { WorkspaceUpload } from './workspace-upload';

/** Present while the pane shows an Upload: the page's Ctrl U works only then. */
export const PANE_UPLOAD_TRIGGER = '[data-pane-upload] button[aria-haspopup="menu"]';

/** The pane's column: 320px with a hairline on its left, scrolling by itself. */
const PANE = 'flex w-80 shrink-0 flex-col gap-3.5 overflow-y-auto border-l border-border p-4';

/** A draft says nothing: a status is news once the album has one. */
const ALBUM_STATUS: Partial<Record<AlbumStatus, { label: string; tone: 'good' | 'warm' }>> = {
  review: { label: 'In review', tone: 'warm' },
  delivered: { label: 'Delivered', tone: 'good' },
};

const ROW_RULE = 'border-t border-border/40';

/**
 * False for the first moment after mounting. The pane is made again for each
 * row chosen, and a held arrow key passes through rows faster than any of
 * them is worth asking the server about: only the one stopped on asks.
 */
function useSettled(ms = 120): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), ms);
    return () => window.clearTimeout(timer);
  }, [ms]);
  return settled;
}

function AlbumRow({ album, locked, divided }: { album: Album; locked: boolean; divided: boolean }) {
  const status = ALBUM_STATUS[album.status];
  return (
    <Link
      href={`/albums/${album.id}`}
      className={cn(
        'flex min-h-11 items-center gap-2.5 px-3 py-1 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        divided && ROW_RULE,
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
        {album.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, not an asset to optimise
          <img src={album.cover_url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <Images className="size-3.5 text-muted-foreground" aria-hidden />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{album.name}</span>
        <span className="truncate text-xs text-muted-foreground">{albumContents(album)}</span>
      </span>
      {status ? (
        <Pill tone={status.tone}>{status.label}</Pill>
      ) : locked ? (
        <Lock role="img" aria-label="Private" className="size-[13px] shrink-0 text-muted-foreground" />
      ) : null}
    </Link>
  );
}

function AlbumSkeletons({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn('flex h-11 items-center gap-2.5 px-3', i > 0 && ROW_RULE)}>
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * The chosen workspace's next three events, as its own page's Overview lists
 * them. Nothing at all once it is known that none is coming.
 */
function ComingUp({ workspaceId, ready }: { workspaceId: string; ready: boolean }) {
  // The query the workspace's page makes, so the two share one answer.
  const { events, isPending, loadFailed } = useScheduleEvents(
    { workspace_id: workspaceId, orderBy: 'event_date', direction: 'desc', limit: 100 },
    { enabled: ready },
  );
  // Pending, not loading: it has not asked yet while the row settles.
  if (isPending && !loadFailed) return <Skeleton className="h-[124px] shrink-0 rounded-[14px]" />;

  const upcoming = events
    .filter((e) => isEventUpcoming(e.event_date, e.event_time))
    .sort((a, b) =>
      `${a.event_date} ${a.event_time ?? ''}`.localeCompare(`${b.event_date} ${b.event_time ?? ''}`),
    )
    .slice(0, 3);
  if (upcoming.length === 0) return null;

  return (
    <Panel title="Coming up" className="shrink-0">
      <ComingUpRows events={upcoming} workspaceNameById={{}} dense />
    </Panel>
  );
}

/**
 * The workspace chosen in the table, beside it: its cover, what it holds, the
 * ways into it, its albums and what is coming up.
 *
 * A row in a table has no room for the photograph, and opening each workspace
 * to see which album is which is the walk a wide window is there to save.
 *
 * Mounted once for each workspace (the table keys it), so a half-chosen
 * upload or an open form never carries over to the next row.
 */
export function DesktopWorkspacePane({
  workspace,
  whose,
  listAlbums,
  uploadOpen,
  onUploadOpenChange,
}: {
  workspace: Workspace;
  /** "Yours · 3 members", or whose it is and what you are in it: the table's words. */
  whose: string;
  /** The albums the table already has, for a cover before the pane's own arrive. */
  listAlbums: Album[];
  /** The Upload menu, held by the page so that Ctrl U can open it. */
  uploadOpen?: boolean;
  onUploadOpenChange?: (open: boolean) => void;
}) {
  const mine = workspace.is_owner;
  // The query the workspace's page makes, so opening it finds them loaded.
  const settled = useSettled();
  const { albums, isPending, loadFailed, refetch } = useAlbums(
    { workspace_id: workspace.id, limit: 100 },
    { enabled: settled },
  );
  // Pending, not loading: it has not asked yet while the row settles.
  const loading = isPending && !loadFailed;
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [editing, setEditing] = useState(false);

  // As the API decides it, the same test the workspace's page makes.
  const uploadable = mine
    ? albums
    : albums.filter((a) => a.my_access === 'upload' || a.my_access === 'manage');
  // A lock only where there is somebody to keep out, as on the workspace's page.
  const hasPeople = workspace.collaborator_count + workspace.pending_count > 0;
  const cover = workspaceCover(workspace, albums.length > 0 ? albums : listAlbums);
  const about = [workspace.archived_at ? 'Archived' : null, whose, workspace.description]
    .filter(Boolean)
    .join(' · ');

  return (
    <aside aria-label={workspace.name} className={PANE}>
      <span
        className="grid aspect-[16/10] shrink-0 place-items-center overflow-hidden rounded-xl"
        style={{ backgroundColor: workspaceTint(workspace) }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, not an asset to optimise
          <img src={cover} alt="" className="size-full object-cover" />
        ) : (
          <Folder
            aria-hidden
            className="size-10"
            strokeWidth={1.6}
            style={{ color: workspace.accent_color || 'var(--primary)' }}
          />
        )}
      </span>

      <div className="flex shrink-0 flex-col gap-0.5">
        <h2 className="text-base font-bold leading-[22px]">{workspace.name}</h2>
        <p className="text-secondary-foreground">{workspaceHolds(workspace)}</p>
        <p className="line-clamp-3 text-xs text-muted-foreground">{about}</p>
      </div>

      <div className="flex shrink-0 gap-2">
        <Link
          href={`/workspaces/${workspace.id}`}
          className="inline-flex h-[30px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 text-[13px] font-semibold text-background outline-none transition-colors hover:bg-foreground/85 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Open
          <Kbd className="bg-transparent px-0 font-medium text-background/70">Enter</Kbd>
        </Link>
        {/* The one filled button. Only with somewhere to put files: an Upload
            that every album refuses is a button that does nothing. */}
        {(mine || uploadable.length > 0) && (
          <div data-pane-upload className="min-w-0 flex-1">
            <WorkspaceUpload
              workspaceId={workspace.id}
              albums={uploadable}
              loading={loading}
              onNewAlbum={mine ? () => setCreatingAlbum(true) : undefined}
              menuOpen={uploadOpen}
              onMenuOpenChange={onUploadOpenChange}
              className="h-[30px] w-full rounded-lg px-3 text-[13px] font-semibold [&_svg:not([class*='size-'])]:size-3.5"
            />
          </div>
        )}
        {/* What the workspace's own page keeps under its "…". A member's page
            has none, so neither does a member's pane. */}
        {mine && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="size-[30px] rounded-lg"
                aria-label="Workspace options"
              >
                <MoreHorizontal className="size-[15px]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Settings2 />
                Workspace settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Panel
        title="Albums"
        className="shrink-0"
        right={
          mine ? (
            <button
              type="button"
              aria-label="New album"
              onClick={() => setCreatingAlbum(true)}
              className="rounded text-xs font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              New
            </button>
          ) : undefined
        }
      >
        {loading ? (
          // As many as the table says it has, so the panel does not jump.
          <AlbumSkeletons count={Math.min(workspace.album_count, 6) || 1} />
        ) : loadFailed && albums.length === 0 ? (
          <div className="p-3">
            <ErrorState message="Could not load these albums." onRetry={() => refetch()} />
          </div>
        ) : albums.length === 0 ? (
          <p className="px-3 py-3 text-muted-foreground">
            {mine
              ? 'No albums yet. An album holds one shoot or one delivery.'
              : `${firstName(workspace.owner.name)} hasn’t shared an album with you yet. They appear here as soon as one is.`}
          </p>
        ) : (
          albums.map((album, i) => (
            <AlbumRow
              key={album.id}
              album={album}
              locked={
                mine && hasPeople && (album.shared_with ?? 0) === 0 && (album.offered_to ?? 0) === 0
              }
              divided={i > 0}
            />
          ))
        )}
      </Panel>

      {/* The schedule is the owner's, on the workspace's page too. */}
      {mine && <ComingUp workspaceId={workspace.id} ready={settled} />}

      {mine && (
        <>
          <NewAlbumDialog
            workspaceId={workspace.id}
            open={creatingAlbum}
            onOpenChange={setCreatingAlbum}
          />
          <WorkspaceSettingsDialog
            workspace={workspace}
            albums={albums}
            open={editing}
            onOpenChange={setEditing}
          />
        </>
      )}
    </aside>
  );
}

/** The pane while the table itself is loading: the same shapes, empty. */
export function DesktopWorkspacePaneSkeleton() {
  return (
    <div aria-hidden className={PANE}>
      <Skeleton className="aspect-[16/10] shrink-0 rounded-xl" />
      <div className="flex shrink-0 flex-col gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-[30px] shrink-0 rounded-lg" />
      <Skeleton className="h-[124px] shrink-0 rounded-[14px]" />
    </div>
  );
}
