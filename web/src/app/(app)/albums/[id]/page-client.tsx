'use client';

import Link from 'next/link';
import { BackButton } from '@/components/back-button';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  CheckSquare,
  ChevronDown,
  Download,
  FolderInput,
  FolderUp,
  Heart,
  ImageIcon,
  LayoutGrid,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Screen } from '@/components/app-shell';
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
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog';
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
import { useCreatePartLink } from '@/hooks/useAlbumShare';
import { RetentionDialog } from '@/components/media/retention-dialog';
import { AlbumDetailsDialog } from '@/components/media/album-details-dialog';
import { AlbumGrid, type Density } from '@/components/media/album-grid';
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

type KindFilter = 'all' | 'image' | 'video' | 'audio';

const KINDS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Photos' },
  { key: 'video', label: 'Films' },
  { key: 'audio', label: 'Audio' },
];

const STATUS: Record<AlbumStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  review: { label: 'In review', className: 'bg-warning/15 text-warning' },
  delivered: { label: 'Delivered', className: 'bg-success/15 text-success' },
};

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
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [density, setDensity] = useState<Density>('comfortable');

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
  useEffect(() => {
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

  return (
    <Screen title={album?.name ?? 'Album'}>
      <UploadDropzone
        target={{ scope: 'albums', albumId: id, albumName: album?.name }}
        disabled={!canUpload}
        className="min-h-full"
      >
        {/* ── The album ── */}
        <header className="border-b bg-card/40">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
            <BackButton fallback={workspace ? `/workspaces/${workspace.id}` : '/albums'} className="mb-2" />
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link href="/albums" className="hover:text-foreground">Albums</Link>
              {workspace && (
                <>
                  <span aria-hidden>/</span>
                  <Link href={`/workspaces/${workspace.id}`} className="truncate hover:text-foreground">
                    {workspace.name}
                  </Link>
                </>
              )}
            </nav>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
                  {album?.name ?? (loadingAlbum ? 'Opening album…' : 'Album')}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                  {status && (
                    <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide', status.className)}>
                      {status.label}
                    </span>
                  )}
                  <span className="tabular-nums">
                    {[
                      albumCounts.image ? plural(albumCounts.image, 'photo', 'photos') : null,
                      albumCounts.video ? plural(albumCounts.video, 'film', 'films') : null,
                      albumCounts.audio ? plural(albumCounts.audio, 'recording', 'recordings') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Empty'}
                  </span>
                  {album && retentionBadge(retentionOf(album)) && (
                    isOwner ? (
                      <button
                        type="button"
                        onClick={() => setKeeping(true)}
                        title="Change how long the files are kept"
                        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium hover:bg-muted hover:text-foreground"
                      >
                        <ShieldCheck className="size-3.5" aria-hidden />
                        {retentionBadge(retentionOf(album))}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="size-3.5" aria-hidden />
                        {retentionBadge(retentionOf(album))}
                      </span>
                    )
                  )}
                  {sectionsQuery.picked > 0 && (
                    <button
                      type="button"
                      onClick={() => setSection('picked')}
                      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium text-primary hover:bg-primary/10"
                    >
                      <Heart className="size-3.5 fill-current" aria-hidden />
                      {plural(sectionsQuery.picked, 'client pick', 'client picks')}
                    </button>
                  )}
                </div>
                {album?.description && (
                  <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">{album.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {canShare && (
                  <Button variant="outline" onClick={() => setSharing(true)}>
                    <Link2 className="size-4" />
                    Client link
                  </Button>
                )}
                {canUpload && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button>
                        <Upload className="size-4" />
                        Upload
                        <ChevronDown className="size-3.5 opacity-70" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
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
                  </DropdownMenu>
                )}
                {isOwner && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Album options">
                        <MoreHorizontal className="size-5" />
                      </Button>
                    </DropdownMenuTrigger>
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
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-5 sm:px-6 lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:pt-6">
          <aside className="hidden lg:block">
            <div className="sticky top-6">
              <AlbumSections
                albumId={id}
                layout="rail"
                counts={sectionsQuery}
                value={section}
                onChange={setSection}
                canManage={canManage}
                onDropFiles={(keys, sectionId) => moveTo(sectionId, keys)}
                onShareSection={canShare ? (section) => sharePart({ sectionId: section.id }) : undefined}
              />
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mb-3 lg:hidden">
              <AlbumSections
                albumId={id}
                layout="chips"
                counts={sectionsQuery}
                value={section}
                onChange={setSection}
                canManage={canManage}
                onDropFiles={(keys, sectionId) => moveTo(sectionId, keys)}
                onShareSection={canShare ? (section) => sharePart({ sectionId: section.id }) : undefined}
              />
            </div>

            {/* ── What is on screen, or what is chosen ── */}
            <div className="sticky top-0 z-20 -mx-4 mb-5 border-b bg-background/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
              {selectionMode ? (
                <div role="toolbar" aria-label="Selection" className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" size="icon" className="size-8" onClick={clearSelection} aria-label="Clear selection">
                    <X className="size-4" />
                  </Button>
                  <p className="text-sm font-semibold tabular-nums" aria-live="polite">
                    {selection.count === 0 ? 'Select files' : `${selection.count.toLocaleString()} selected`}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => selection.setMany(files.map((file) => file.key), true)}
                  >
                    Select all{hasNextPage ? ' loaded' : ''}
                  </Button>
                  <span className="flex-1" />
                  {selection.count > 0 && (
                    <>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" disabled={busy}>
                              <FolderInput className="size-4" />
                              Move to
                              <ChevronDown className="size-3.5 opacity-70" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            {sectionsQuery.sections.map((s) => (
                              <DropdownMenuItem key={s.id} onSelect={() => moveTo(s.id)}>
                                <span className="flex-1 truncate">{s.name}</span>
                                <span className="text-xs tabular-nums text-muted-foreground">{s.count}</span>
                              </DropdownMenuItem>
                            ))}
                            {sectionsQuery.sections.length > 0 && (
                              <>
                                <DropdownMenuItem onSelect={() => moveTo(null)}>No section</DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem onSelect={() => setNamingForMove(true)}>
                              <Plus className="size-4" />
                              New section…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {canDownload && (
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => void downloadSelection()}>
                          {zipping ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                          Download
                        </Button>
                      )}
                      {canShare && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || createPartLink.isPending}
                          onClick={() => sharePart({ keys: selection.keys() })}
                        >
                          {createPartLink.isPending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                          Link
                        </Button>
                      )}
                      {isOwner && oneImage && (
                        <Button variant="outline" size="sm" disabled={busy} onClick={setCover}>
                          <ImageIcon className="size-4" />
                          Set as cover
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          className="text-destructive hover:text-destructive"
                          onClick={() => setConfirmingDelete(selection.keys())}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <div role="tablist" aria-label="Kind" className="inline-flex rounded-lg bg-muted p-0.5">
                    {KINDS.map((option) => {
                      const active = kind === option.key;
                      const n = option.key === 'all' ? counts.image + counts.video + counts.audio + counts.other : counts[option.key];
                      return (
                        <button
                          key={option.key}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setKind(option.key)}
                          className={cn(
                            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                            active ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {option.label}
                          <span className="text-xs tabular-nums opacity-60">{n.toLocaleString()}</span>
                        </button>
                      );
                    })}
                  </div>
                  <span className="flex-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOrder((value) => (value === 'newest' ? 'oldest' : 'newest'))}
                    aria-label={order === 'newest' ? 'Newest first. Switch to oldest first' : 'Oldest first. Switch to newest first'}
                  >
                    <ArrowDownUp className="size-4" />
                    {order === 'newest' ? 'Newest first' : 'Oldest first'}
                  </Button>
                  {kind !== 'audio' && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => setDensity((value) => (value === 'comfortable' ? 'compact' : 'comfortable'))}
                      aria-pressed={density === 'compact'}
                      aria-label={density === 'compact' ? 'Larger tiles' : 'Smaller tiles'}
                    >
                      <LayoutGrid className="size-4" />
                    </Button>
                  )}
                  {files.length > 0 && kind !== 'audio' && canSelect && (
                    <Button variant="outline" size="sm" onClick={() => setSelecting(true)}>
                      <CheckSquare className="size-4" />
                      Select
                    </Button>
                  )}
                </div>
              )}
            </div>

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
              <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2" aria-label="Loading">
                {Array.from({ length: 12 }).map((_, index) => (
                  <div key={index} className="aspect-square animate-pulse rounded-lg bg-muted" />
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
              <EmptyState
                albumEmpty={sectionsQuery.total === 0}
                section={section}
                kind={kind}
                canUpload={canUpload}
              />
            ) : (
              <AlbumGrid
                files={files}
                selection={selection}
                selecting={selectionMode}
                density={density}
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
          </div>
        </div>
      </UploadDropzone>

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

      <DeleteConfirmDialog
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
        onConfirm={(proof) => removeAlbum.mutateAsync({ id, proof })}
        onDone={() => {
          // Back where it was opened from: a workspace, the albums list, the
          // dashboard. It always landed on one workspace. A tab opened
          // straight onto the album has nowhere to go back to, so that lands
          // on the list.
          if (window.history.length > 1) router.back();
          else router.replace('/albums');
        }}
      />
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
          <Button onClick={() => openFolderPicker()}>
            <FolderUp className="size-4" />
            Choose a folder
          </Button>
          <Button variant="outline" onClick={() => openFilePicker()}>
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
        ? 'Nothing here yet. Select files under All media and choose Move to — or drag them onto the section.'
        : `No ${KINDS.find((k) => k.key === kind)?.label.toLowerCase() ?? 'files'} in this album.`;
  return <p className="rounded-xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">{message}</p>;
}
