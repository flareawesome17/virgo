'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  FolderUp,
  ImageIcon,
  LayoutGrid,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { StatusDot } from '@/components/kit';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
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
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  UploadDropzone,
  openFilePicker,
  openFolderPicker,
} from '@/components/media/upload-dropzone';
import { MediaViewer } from '@/components/media/media-viewer';
import { useVideoPlayback } from '@/components/media/video-playback';
import { AlbumAudioPlayer } from '@/components/media/album-audio-player';
import { ShareDialog } from '@/components/media/share-dialog';
import { PartLinkDialog } from '@/components/media/part-links';
import { useAlbumShare, useCreatePartLink } from '@/hooks/useAlbumShare';
import { RetentionDialog } from '@/components/media/retention-dialog';
import { AlbumDetailsDialog } from '@/components/media/album-details-dialog';
import { AlbumGrid, TILE_GRID, type Density } from '@/components/media/album-grid';
import { DesktopAlbum } from '@/components/media/desktop-album';
import { SelectionBar } from '@/components/media/selection-bar';
import { KINDS, ShowAndSort, type KindFilter, type OrderFilter } from '@/components/media/show-and-sort';
import { PendingUploads, useAlbumUploads } from '@/components/upload/pending-uploads';
import { useUploadQueue } from '@/components/upload/upload-provider';
import { AlbumSections, NameDialog, type SectionFilter } from '@/components/media/album-sections';
import { useAlbum, useDeleteAlbum, useUpdateAlbum } from '@/hooks/useAlbums';
import { useAlbumFiles } from '@/hooks/useAlbumFiles';
import { useAlbumSections, useAssignSection, useCreateSection } from '@/hooks/useAlbumSections';
import { useDeleteFiles, useSelection } from '@/hooks/useMediaSelection';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspaces';
import {
  kindOf,
  retentionBadge,
  retentionOf,
  storageApi,
  type AlbumStatus,
  type PartShareLink,
  type StoredFile,
} from '@/api';
import { cn } from '@/lib/utils';
import { IS_DESKTOP, downloadHref } from '@/lib/desktop';
import { albumDeleteConsequence } from '@/lib/workspaces';

/**
 * A dot and a word. It was an uppercase pill, the loudest thing in the head,
 * for the thing least often changed.
 */
const STATUS: Record<AlbumStatus, { label: string; dot: string }> = {
  draft: { label: 'Draft', dot: 'bg-muted-foreground' },
  review: { label: 'In review', dot: 'bg-warning' },
  delivered: { label: 'Delivered', dot: 'bg-success' },
};

/** The head's buttons: 40px, as the boards draw a detail page's. */
const HEAD_BUTTON = 'h-10 gap-1.5 rounded-[10px] pr-4 pl-3 text-sm font-semibold';

/** "14 min", "1 h 12 min": how long a set of films runs. */
function runningTime(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function problem(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Please try again.';
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/**
 * Hands a signed download to the browser's own download manager — or, in the
 * desktop app, to the shell, which only takes a link marked as a download and
 * sends anything else to the browser.
 */
function startDownload(url: string) {
  const link = document.createElement('a');
  link.href = downloadHref(url);
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/*
 * `useSearchParams` needs a Suspense boundary in the app router, or the whole
 * route opts out of static rendering — which the desktop build cannot do.
 */
export default function AlbumPage() {
  return (
    <Suspense fallback={null}>
      <AlbumWorkspace />
    </Suspense>
  );
}

/**
 * One album, as a place to work in.
 *
 * Sections down the side, the media under the days it was taken, kind as a
 * filter rather than three separate rooms, and a selection that can be filed,
 * downloaded as one zip, or deleted in one go. It used to be a dark
 * presentation header over a masonry wall with no dates, drawn in colours
 * typed in by hand — handsome, and nowhere to do the work.
 */
function AlbumWorkspace() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const { user } = useAuth();
  const { data: album, isLoading: loadingAlbum } = useAlbum(id);
  const { data: workspace } = useWorkspace(album?.workspace_id ?? undefined);
  const sectionsQuery = useAlbumSections(id);

  // A "your client sent their picks" notification lands with ?picked=1.
  const [chosenSection, setSection] = useState<SectionFilter>(search.get('picked') ? 'picked' : 'all');
  // A section deleted while it was on screen falls back to everything, rather
  // than leaving the grid filtered to something that no longer exists.
  const section: SectionFilter =
    chosenSection === 'all' ||
    chosenSection === 'none' ||
    chosenSection === 'picked' ||
    !sectionsQuery.isSuccess ||
    sectionsQuery.sections.some((s) => s.id === chosenSection)
      ? chosenSection
      : 'all';
  const [kind, setKind] = useState<KindFilter>('all');
  const [order, setOrder] = useState<OrderFilter>('newest');
  // Seven or so across to start with: an album is looked over before it is
  // looked into, and the toggle is there for the larger tiles.
  const [density, setDensity] = useState<Density>('compact');
  // The desktop app has one size, smaller again, and no toggle for it.
  const tileSize: Density = IS_DESKTOP ? 'dense' : density;

  const filter = {
    kind: kind === 'all' ? undefined : kind,
    order: order === 'oldest' ? ('oldest' as const) : undefined,
    section: section === 'all' || section === 'picked' ? undefined : section,
    picked: section === 'picked' ? true : undefined,
  };
  const filesQuery = useAlbumFiles(id, filter);
  const files = filesQuery.files;
  const counts = filesQuery.counts;

  const selection = useSelection();
  const [selecting, setSelecting] = useState(false);
  const selectionMode = selecting || selection.active;

  const [viewerKey, setViewerKey] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [confirmingAlbumDelete, setConfirmingAlbumDelete] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string[] | null>(null);
  const [namingForMove, setNamingForMove] = useState(false);
  const [zipping, setZipping] = useState(false);
  // A link just made to a selection or a section, shown with its URL.
  const [partLink, setPartLink] = useState<PartShareLink | null>(null);
  const createPartLink = useCreatePartLink(id);

  const updateAlbum = useUpdateAlbum();
  const removeAlbum = useDeleteAlbum();
  const deleteFiles = useDeleteFiles(id);
  const assign = useAssignSection(id);
  const createSection = useCreateSection(id);

  const isOwner = !!album && !!user && album.user_id === user.id;
  // As the API decides it. A view-only member was offered Upload and a page
  // that took drops, and every file then failed on the server one at a time.
  const canUpload = isOwner || album?.my_access === 'upload' || album?.my_access === 'manage';
  // From the album's own access first. Read off the loaded files alone, a
  // manage collaborator lost Move and Delete in an empty or filtered view.
  const access = album?.my_access;
  const canManage = isOwner || access === 'manage' || files.some((file) => file.capabilities.manage);
  // The client link, as the API allows it: the owner, or a member granted
  // 'manage' on this album. Owner-only left a workspace's editors with a
  // finished album and no way to send it.
  const canShare = isOwner || access === 'manage';
  const canDownload =
    isOwner ||
    access === 'download' ||
    access === 'upload' ||
    access === 'manage' ||
    files.some((file) => file.capabilities.download);
  // Selecting is for doing something with what is selected. A view-only
  // member could select, and was then shown an empty action bar.
  const canSelect = canManage || canDownload;

  // Whether the client link is on, for the dot on its button. The dialog
  // writes the same answer as a link is made or turned off.
  const { link: clientLink } = useAlbumShare(canShare ? id : undefined);

  // Files on their way into this album, drawn at the top of its grid.
  const uploads = useAlbumUploads(id);

  // The selection's bar and the uploads share the bottom of the window. While
  // files are being chosen the uploads fold to their icon, as on the phone,
  // and open again afterwards if it was this that put them away.
  const {
    items: uploadItems,
    checking: uploadsChecking,
    minimised: dockMinimised,
    setMinimised: setDockMinimised,
  } = useUploadQueue();
  const dockShowing = uploadItems.length > 0 || uploadsChecking > 0;
  const wasSelecting = useRef(false);
  const foldedDock = useRef(false);
  useEffect(() => {
    const was = wasSelecting.current;
    wasSelecting.current = selectionMode;
    if (selectionMode && !was && dockShowing && !dockMinimised) {
      foldedDock.current = true;
      setDockMinimised(true);
    } else if (!selectionMode && was && foldedDock.current) {
      foldedDock.current = false;
      setDockMinimised(false);
    }
  }, [selectionMode, dockShowing, dockMinimised, setDockMinimised]);

  // Keep the selection to what is on screen, so a change of filter can never
  // leave invisible files chosen and waiting to be deleted.
  const keepOnly = selection.keepOnly;
  useEffect(() => {
    keepOnly(files.map((file) => file.key));
  }, [files, keepOnly]);


  const clearSelection = useCallback(() => {
    selection.clear();
    setSelecting(false);
  }, [selection]);

  // Escape leaves selection; ⌘/Ctrl-A takes everything loaded — unless the
  // keyboard is in a field, or the viewer (which has its own keys) is open.
  // The desktop app's layout listens for these itself, with its other keys.
  useEffect(() => {
    if (IS_DESKTOP) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (viewerKey || target?.closest('input, textarea, [contenteditable="true"], [role="dialog"], [role="menu"]')) return;
      if (event.key === 'Escape' && selectionMode) {
        event.preventDefault();
        clearSelection();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && files.length > 0 && canSelect) {
        event.preventDefault();
        setSelecting(true);
        selection.setMany(files.map((file) => file.key), true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerKey, selectionMode, clearSelection, files, selection, canSelect]);

  // Pages in as the end of the grid comes into view.
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = filesQuery;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const viewable = useMemo(
    () => files.filter((file) => ['image', 'video'].includes(kindOf(file.contentType))),
    [files],
  );
  const viewerIndex = viewerKey ? viewable.findIndex((file) => file.key === viewerKey) : -1;

  const { open: openFilm } = useVideoPlayback();
  const openFile = useCallback(
    (file: StoredFile) => {
      const fileKind = kindOf(file.contentType);
      if (fileKind === 'audio') {
        // The player lives on the Audio filter, with the album's whole set.
        setKind('audio');
        return;
      }
      if (fileKind === 'other') {
        if (file.url) window.open(file.url, '_blank', 'noopener');
        return;
      }
      // A film goes to the player held above the app, not the lightbox. The
      // lightbox belongs to this page, so a film opened in it stops the moment
      // you leave the album; the player carries on in the corner while you look
      // at something else. The queue is the album's films, so stepping to the
      // next one does not stop at every photograph in between.
      if (fileKind === 'video') {
        openFilm(
          file,
          files.filter((candidate) => kindOf(candidate.contentType) === 'video'),
        );
        return;
      }
      setViewerKey(file.key);
    },
    [files, openFilm],
  );

  const selected = useMemo(() => files.filter((file) => selection.has(file.key)), [files, selection]);
  const oneImage = selected.length === 1 && kindOf(selected[0].contentType) === 'image';

  const moveTo = (sectionId: string | null, keys: string[] = selection.keys()) => {
    assign.mutate(
      { keys, sectionId },
      {
        onSuccess: ({ moved }) => {
          const name = sectionId ? sectionsQuery.sections.find((s) => s.id === sectionId)?.name ?? 'the section' : 'no section';
          toast.success(`Moved ${plural(moved, 'file', 'files')} to ${name}`);
          clearSelection();
        },
        onError: (error) => toast.error('Could not move', { description: problem(error) }),
      },
    );
  };

  /** A client link to just a selection or one section, rather than the album. */
  const sharePart = (part: { sectionId: string } | { keys: string[] }) =>
    createPartLink.mutate(part, {
      onSuccess: setPartLink,
      onError: (error) => toast.error('Could not make the link', { description: problem(error) }),
    });

  const downloadSelection = async () => {
    setZipping(true);
    try {
      startDownload(await storageApi.zipUrl(id, selection.keys()));
      toast.success(`Preparing ${plural(selection.count, 'file', 'files')} as a zip`, {
        // The app has no browser to hand it to: the shell saves it itself, and
        // says so again when it lands.
        description: IS_DESKTOP
          ? 'Saving to your Downloads folder — large albums can take a while to start.'
          : 'Your browser takes it from here — large albums can take a while to start.',
      });
    } catch (error) {
      toast.error('Could not start the download', { description: problem(error) });
    } finally {
      setZipping(false);
    }
  };

  const setCover = () => {
    const photo = selected[0];
    if (!photo) return;
    updateAlbum.mutate(
      { id, cover_key: photo.key },
      {
        onSuccess: () => {
          toast.success('Cover set');
          clearSelection();
        },
        onError: (error) => toast.error('Could not set the cover', { description: problem(error) }),
      },
    );
  };

  const deleteNow = (keys: string[]) => {
    setConfirmingDelete(null);
    deleteFiles.mutate(keys, {
      onSuccess: ({ deleted, failed }) => {
        if (failed > 0) {
          toast.error(`${plural(failed, 'file was', 'files were')} not deleted`, {
            description: `${plural(deleted, 'file was', 'files were')} deleted. Try the rest again.`,
          });
        } else {
          toast.success(`Deleted ${plural(deleted, 'file', 'files')}`);
        }
        clearSelection();
        if (viewerKey && keys.includes(viewerKey)) setViewerKey(null);
      },
      onError: (error) => toast.error('Could not delete', { description: problem(error) }),
    });
  };

  const status = album ? STATUS[album.status] ?? STATUS.draft : null;
  const albumCounts = sectionsQuery.counts;
  const empty = !filesQuery.isLoading && !filesQuery.loadFailed && files.length === 0;
  const busy = assign.isPending || deleteFiles.isPending || zipping;
  const retention = album ? retentionBadge(retentionOf(album)) : null;
  // Narrowed to films, the head counts those and says how long they run:
  // known only once every one of them is on screen to add up.
  const filmsMs =
    kind === 'video' && section === 'all' && !hasNextPage && !filesQuery.isLoading
      ? files.reduce((sum, file) => sum + (file.durationMs ?? 0), 0)
      : 0;
  const countsLine =
    kind === 'video' && albumCounts.video
      ? [plural(albumCounts.video, 'film', 'films'), filmsMs > 0 ? runningTime(filmsMs) : null]
          .filter(Boolean)
          .join(' · ')
      : [
          albumCounts.image ? plural(albumCounts.image, 'photo', 'photos') : null,
          albumCounts.video ? plural(albumCounts.video, 'film', 'films') : null,
          albumCounts.audio ? plural(albumCounts.audio, 'recording', 'recordings') : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'Empty';
  // Select is offered where there are tiles to tick.
  const canSelectHere = files.length > 0 && kind !== 'audio' && canSelect;
  const home = workspace ? `/workspaces/${workspace.id}` : '/albums';
  // From the album itself, so the bar does not say "Albums" for the moment
  // its workspace takes to load.
  const inWorkspace = !!album?.workspace_id;

  // What both layouts draw. The web lays these out below; the desktop app
  // has its own layout for them, in its own file.

  // Where the album sits, in the shell's bar. On a phone-sized window there
  // is room for its name alone, and an arrow back.
  const crumbs = (
    <span className="flex min-w-0 items-center gap-2">
      {!IS_DESKTOP && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-ml-2 shrink-0 sm:hidden"
          aria-label="Back"
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push(home);
          }}
        >
          <ArrowLeft className="size-4" />
        </Button>
      )}
      {/* The desktop app starts at the workspace: its title bar has back,
          forward and Jump to, and the bar's room goes to the album's line. */}
      {!IS_DESKTOP && (
        <>
          <Link
            href={inWorkspace ? '/workspaces' : '/albums'}
            className="hidden shrink-0 font-medium text-muted-foreground hover:text-foreground sm:inline"
          >
            {inWorkspace ? 'Workspaces' : 'Albums'}
          </Link>
          <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground/70 sm:block" aria-hidden />
        </>
      )}
      {workspace && (
        <>
          <Link
            href={`/workspaces/${workspace.id}`}
            className="hidden max-w-[16rem] truncate font-medium text-muted-foreground hover:text-foreground md:inline"
          >
            {workspace.name}
          </Link>
          <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground/70 md:block" aria-hidden />
        </>
      )}
      <span className="truncate">{album?.name ?? 'Album'}</span>
    </span>
  );

  const uploadChoices = (
    <DropdownMenuContent align="start">
      <DropdownMenuItem onSelect={() => openFilePicker()}>
        <Upload className="size-4" />
        Files…
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => openFolderPicker()}>
        <FolderUp className="size-4" />
        A whole folder…
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        Or drop files or folders anywhere here
      </DropdownMenuLabel>
    </DropdownMenuContent>
  );

  const albumChoices = (
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuItem onSelect={() => setEditingDetails(true)}>
        <Pencil className="size-4" />
        Edit name and description
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Status</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={album?.status}
        onValueChange={(value) =>
          updateAlbum.mutate(
            { id, status: value as AlbumStatus },
            { onError: (error) => toast.error('Could not update the album', { description: problem(error) }) },
          )
        }
      >
        {(Object.keys(STATUS) as AlbumStatus[]).map((key) => (
          <DropdownMenuRadioItem key={key} value={key}>
            {STATUS[key].label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => setKeeping(true)}>
        <ShieldCheck className="size-4" />
        Keep the files…
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingAlbumDelete(true)}>
        <Trash2 className="size-4" />
        Delete album
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  // The rail or the chips. Each layout draws both and shows the one it has
  // room for.
  const sections = (layout: 'rail' | 'chips') => (
    <AlbumSections
      albumId={id}
      layout={layout}
      dense={IS_DESKTOP}
      counts={sectionsQuery}
      value={section}
      onChange={setSection}
      canManage={canManage}
      onDropFiles={(keys, sectionId) => moveTo(sectionId, keys)}
      onShareSection={canShare ? (shared) => sharePart({ sectionId: shared.id }) : undefined}
    />
  );

  const media = (
    <>
      {/* ── What is still on its way ── */}
      <PendingUploads albumId={id} density={tileSize} />

      {/* ── The media ── */}
      {kind === 'audio' ? (
        <AlbumAudioPlayer
          files={filesQuery.audio}
          albumName={album?.name ?? 'Virgo album'}
          visible
          isLoading={filesQuery.isLoading}
          hasMore={!!hasNextPage}
          loadingMore={isFetchingNextPage}
          onLoadMore={() => void fetchNextPage()}
        />
      ) : filesQuery.isLoading ? (
        <div className={cn('grid', TILE_GRID[tileSize])} aria-label="Loading">
          {Array.from({ length: 14 }).map((_, index) => (
            <div key={index} className="aspect-square animate-pulse bg-muted" />
          ))}
        </div>
      ) : filesQuery.loadFailed && files.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <p className="text-sm font-medium">This album could not be loaded</p>
          <p className="mt-1 text-xs text-muted-foreground">Your media is safe. This is a connection problem, not an empty album.</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => void filesQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : empty ? (
        // With files on their way in, the group above is what is here.
        uploads.pending.length === 0 && (
          <EmptyState
            albumEmpty={sectionsQuery.total === 0}
            section={section}
            kind={kind}
            canUpload={canUpload}
          />
        )
      ) : (
        <AlbumGrid
          files={files}
          selection={selection}
          selecting={selectionMode}
          density={tileSize}
          kind={kind}
          canDrag={canManage}
          canSelect={canSelect}
          onOpen={openFile}
        />
      )}

      <div ref={sentinel} aria-hidden />
      {isFetchingNextPage && (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading more" />
        </div>
      )}
    </>
  );

  const selectionBar = selectionMode && (
    <SelectionBar
      count={selection.count}
      selectAllLabel={`Select all${hasNextPage ? ' loaded' : ''}`}
      onSelectAll={() => selection.setMany(files.map((file) => file.key), true)}
      onClear={clearSelection}
      busy={busy}
      move={
        canManage
          ? {
              sections: sectionsQuery.sections,
              onMove: (sectionId) => moveTo(sectionId),
              onNew: () => setNamingForMove(true),
            }
          : undefined
      }
      download={canDownload ? { pending: zipping, run: () => void downloadSelection() } : undefined}
      link={
        canShare
          ? { pending: createPartLink.isPending, run: () => sharePart({ keys: selection.keys() }) }
          : undefined
      }
      onCover={isOwner && oneImage ? setCover : undefined}
      onDelete={canManage ? () => setConfirmingDelete(selection.keys()) : undefined}
    />
  );

  const overlays = (
    <>
      {viewerIndex >= 0 && (
        <MediaViewer
          files={viewable}
          index={viewerIndex}
          onIndexChange={(index) => setViewerKey(viewable[index]?.key ?? null)}
          onClose={() => setViewerKey(null)}
          onDelete={viewable[viewerIndex].capabilities.delete ? (file) => setConfirmingDelete([file.key]) : undefined}
        />
      )}

      <ShareDialog albumId={id} albumName={album?.name ?? 'this album'} open={sharing} onOpenChange={setSharing} />
      <PartLinkDialog
        link={partLink}
        albumName={album?.name ?? 'this album'}
        onOpenChange={(open) => !open && setPartLink(null)}
      />
      {album && isOwner && <RetentionDialog album={album} open={keeping} onOpenChange={setKeeping} />}
      {album && isOwner && (
        <AlbumDetailsDialog
          open={editingDetails}
          onOpenChange={setEditingDetails}
          albumId={album.id}
          name={album.name}
          description={album.description ?? null}
        />
      )}

      <NameDialog
        open={namingForMove}
        initial=""
        title="New section"
        onCancel={() => setNamingForMove(false)}
        onSave={(name) => {
          setNamingForMove(false);
          createSection.mutate(name, {
            onSuccess: (created) => moveTo(created.id),
            onError: (error) => toast.error('Could not add the section', { description: problem(error) }),
          });
        }}
      />

      <AlertDialog open={!!confirmingDelete} onOpenChange={(open) => !open && setConfirmingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {confirmingDelete && confirmingDelete.length > 1 ? plural(confirmingDelete.length, 'file', 'files') : 'this file'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmingDelete && confirmingDelete.length > 1 ? 'They are' : 'It is'} removed from storage for good, with {confirmingDelete && confirmingDelete.length > 1 ? 'their' : 'its'} previews. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmingDelete && deleteNow(confirmingDelete)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDialog
        open={confirmingAlbumDelete}
        onOpenChange={setConfirmingAlbumDelete}
        title={`Delete ${album?.name ?? 'this album'}?`}
        // Say what deleting gives back: room, at once, which is why someone
        // at their limit deletes an album at all.
        description={albumDeleteConsequence({
          item_count: album?.item_count ?? 0,
          size_bytes: album?.size_bytes,
        })}
        confirmLabel="Delete album"
        onConfirm={() => removeAlbum.mutateAsync({ id })}
        onDone={() => {
          // Back where it was opened from: a workspace, the albums list, the
          // dashboard. It always landed on one workspace. A tab opened
          // straight onto the album has nowhere to go back to, so that lands
          // on the list.
          if (window.history.length > 1) router.back();
          else router.replace('/albums');
        }}
      />
    </>
  );

  // The desktop app's own layout: three columns that fill the window, each
  // scrolling on its own, with the album's head in the shell's bar. The
  // state, the mutations and the dialogs are the ones above, handed over as
  // they are; the web's layout below is untouched.
  if (IS_DESKTOP) {
    return (
      <Screen title={album?.name ?? 'Album'}>
        <UploadDropzone
          target={{ scope: 'albums', albumId: id, albumName: album?.name }}
          disabled={!canUpload}
          className="h-full"
        >
          <DesktopAlbum
            title={crumbs}
            status={status}
            countsLine={countsLine}
            retention={retention}
            onKeep={isOwner ? () => setKeeping(true) : undefined}
            uploadMenu={canUpload ? uploadChoices : undefined}
            clientLink={canShare ? { on: !!clientLink, open: () => setSharing(true) } : undefined}
            albumMenu={isOwner ? albumChoices : undefined}
            rail={sections('rail')}
            chips={sections('chips')}
            toolbar={
              <ShowAndSort dense kind={kind} order={order} counts={counts} onKind={setKind} onOrder={setOrder} />
            }
            tiles={kind !== 'audio'}
            selectionBar={selectionBar}
            album={album}
            total={sectionsQuery.total}
            sections={sectionsQuery.sections}
            files={files}
            selected={selected}
            canSelect={canSelect}
            canManage={canManage}
            busy={busy}
            onSelectAll={() => selection.setMany(files.map((file) => file.key), true)}
            onOpen={openFile}
            onDelete={() => setConfirmingDelete(selection.keys())}
            onClear={clearSelection}
          >
            {media}
          </DesktopAlbum>
        </UploadDropzone>
        {overlays}
      </Screen>
    );
  }

  return (
    <Screen title={album?.name ?? 'Album'}>
      <PageHeader title={crumbs} />
      <UploadDropzone
        target={{ scope: 'albums', albumId: id, albumName: album?.name }}
        disabled={!canUpload}
        className="min-h-full"
      >
        <div
          className={cn(
            'mx-auto flex min-h-full w-full max-w-[1200px] flex-col gap-6 px-4 pt-7 sm:px-6',
            // Room under the last row for the selection's bar.
            selectionMode ? 'pb-6' : 'pb-12',
          )}
        >
          {/* ── The album ── */}
          <header className="flex flex-wrap items-end gap-4">
            <div className="flex min-w-0 flex-1 basis-[360px] flex-col gap-0.5">
              {workspace && (
                <Link
                  href={`/workspaces/${workspace.id}`}
                  className="max-w-full self-start truncate text-[13px] font-medium text-muted-foreground hover:text-foreground"
                >
                  {workspace.name}
                </Link>
              )}
              <h1 className="text-[26px] leading-8 font-bold tracking-[-0.025em] break-words">
                {album?.name ?? (loadingAlbum ? 'Opening album…' : 'Album')}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-secondary-foreground">
                {status && (
                  <>
                    <StatusDot className={status.dot} />
                    <span className="font-semibold text-foreground">{status.label}</span>
                  </>
                )}
                <span className="tabular-nums">
                  {status ? '· ' : ''}
                  {countsLine}
                </span>
              </div>
              {/* How long the files are kept, and the owner's way in to change it. */}
              {retention &&
                (isOwner ? (
                  <button
                    type="button"
                    onClick={() => setKeeping(true)}
                    title="Change how long the files are kept"
                    className="self-start text-left text-[13px] text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {retention}
                  </button>
                ) : (
                  <p className="text-[13px] text-muted-foreground">{retention}</p>
                ))}
              {album?.description && (
                <p className="mt-1.5 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">{album.description}</p>
              )}
            </div>

            {/* One filled button, and the rest quiet beside it. */}
            <div className="flex flex-wrap gap-2">
              {canUpload && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className={HEAD_BUTTON}>
                      <Upload className="size-4" />
                      Upload
                      <ChevronDown className="size-3.5 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  {uploadChoices}
                </DropdownMenu>
              )}
              {canShare && (
                <Button
                  variant="secondary"
                  className={HEAD_BUTTON}
                  onClick={() => setSharing(true)}
                  aria-label={clientLink ? 'Client link, on' : undefined}
                >
                  <Link2 className="size-4" />
                  Client link
                  {clientLink && <span aria-hidden className="size-[7px] rounded-full bg-success" />}
                </Button>
              )}
              {canSelectHere && (
                <Button
                  variant="secondary"
                  className={HEAD_BUTTON}
                  aria-pressed={selectionMode}
                  onClick={() => (selectionMode ? clearSelection() : setSelecting(true))}
                >
                  <CircleCheck className="size-4" />
                  Select
                </Button>
              )}
              {isOwner && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="icon" className="size-10 rounded-[10px]" aria-label="Album options">
                      <MoreHorizontal className="size-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  {albumChoices}
                </DropdownMenu>
              )}
            </div>
          </header>

          <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-start lg:gap-6">
            <aside className="hidden w-[196px] shrink-0 lg:block">
              <div className="sticky top-6">
                {sections('rail')}
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="lg:hidden">
                {sections('chips')}
              </div>

              {/* ── What is on screen ── */}
              <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-2 bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
                <ShowAndSort kind={kind} order={order} counts={counts} onKind={setKind} onOrder={setOrder} />
                <span className="flex-1" />
                {kind !== 'audio' && (
                  <div role="group" aria-label="Tile size" className="flex rounded-[10px] bg-muted p-0.5">
                    {(['compact', 'comfortable'] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setDensity(value)}
                        aria-pressed={density === value}
                        aria-label={value === 'compact' ? 'Smaller tiles' : 'Larger tiles'}
                        className={cn(
                          'grid size-8 place-items-center rounded-[8px] outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                          density === value
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {value === 'compact' ? <LayoutGrid className="size-4" /> : <ImageIcon className="size-4" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {media}
            </div>
          </div>

          {/* ── What is chosen, and what to do with it ── */}
          {selectionBar}
        </div>
      </UploadDropzone>

      {overlays}
    </Screen>
  );
}

function EmptyState({
  albumEmpty,
  section,
  kind,
  canUpload,
}: {
  albumEmpty: boolean;
  section: SectionFilter;
  kind: KindFilter;
  /** Without it, the drop hint and the pickers offer what the server refuses. */
  canUpload: boolean;
}) {
  if (albumEmpty && !canUpload) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-20 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <ImageIcon className="size-6" aria-hidden />
        </span>
        <h2 className="mt-5 text-lg font-semibold tracking-tight">Nothing here yet</h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
          Nothing has been added yet. You’ll see it here when it is.
        </p>
      </div>
    );
  }
  if (albumEmpty) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-20 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Upload className="size-6" aria-hidden />
        </span>
        <h2 className="mt-5 text-lg font-semibold tracking-tight">Nothing here yet</h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
          Drop the shoot’s folder anywhere on this page. It sorts itself by the day each frame was taken.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          {/* Quiet, both: the head's Upload is this page's one filled button. */}
          <Button variant="secondary" onClick={() => openFolderPicker()}>
            <FolderUp className="size-4" />
            Choose a folder
          </Button>
          <Button variant="secondary" onClick={() => openFilePicker()}>
            Choose files
          </Button>
        </div>
      </div>
    );
  }
  const message =
    section === 'picked'
      ? 'Nothing picked yet. When your client chooses from the delivery link, their picks appear here.'
      : section !== 'all'
        ? 'Nothing here yet. Select files under All media and choose Move, or drag them onto the section.'
        : `No ${kind === 'all' ? 'files' : (KINDS.find((k) => k.key === kind)?.label.toLowerCase() ?? 'files')} in this album.`;
  return <p className="rounded-xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">{message}</p>;
}
