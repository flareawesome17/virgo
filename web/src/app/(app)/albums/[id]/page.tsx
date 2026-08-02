'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CloudUpload,
  FileQuestion,
  Images,
  Link2,
  Music,
  Play,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AppShell, PageHeader } from '@/components/app-shell';
import { EmptyState, GridSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { UploadDropzone, openFilePicker } from '@/components/media/upload-dropzone';
import { MediaViewer } from '@/components/media/media-viewer';
import { ShareDialog } from '@/components/media/share-dialog';
import { useAlbum, useDeleteAlbum } from '@/hooks/useAlbums';
import { useAlbumFiles, fileNameFromKey, fileDate } from '@/hooks/useAlbumFiles';
import { useUpload } from '@/hooks/useUpload';
import { useWorkspace } from '@/hooks/useWorkspaces';
import { formatBytes, kindOf, storageApi, type StoredFile } from '@/api';
import { useQueryClient } from '@tanstack/react-query';
import { albumFilesQueryKey } from '@/hooks/useAlbumFiles';

type Filter = 'all' | 'image' | 'video' | 'audio';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Photos' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
];

/** One tile. Videos and audio get a tile too, not a list row. */
function MediaTile({
  file,
  onOpen,
}: {
  file: StoredFile;
  onOpen: () => void;
}) {
  const kind = kindOf(file.contentType);
  const name = fileNameFromKey(file.key);

  return (
    <button
      onClick={onOpen}
      className="group relative aspect-square overflow-hidden rounded-xl border bg-muted text-left transition-colors hover:border-primary/50"
    >
      {kind === 'image' && file.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={file.url}
          alt={name}
          loading="lazy"
          className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
        />
      ) : kind === 'video' && file.url ? (
        <>
          {/* The first frame as a poster: `preload="metadata"` fetches only
              the header, so a grid of videos does not pull whole files. */}
          <video
            src={file.url}
            preload="metadata"
            muted
            playsInline
            className="size-full object-cover"
          />
          <span className="absolute inset-0 grid place-items-center bg-black/25">
            <span className="grid size-11 place-items-center rounded-full bg-black/55 backdrop-blur-sm">
              <Play className="size-4 fill-white text-white" />
            </span>
          </span>
        </>
      ) : (
        <span className="grid size-full place-items-center">
          {kind === 'audio' ? (
            <Music className="size-7 text-muted-foreground" />
          ) : (
            <FileQuestion className="size-7 text-muted-foreground" />
          )}
        </span>
      )}

      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="block truncate text-[11px] font-medium text-white">{name}</span>
        <span className="block text-[10px] text-white/70">
          {formatBytes(file.sizeBytes)} · {fileDate(file.createdAt)}
        </span>
      </span>
    </button>
  );
}

export default function AlbumPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: album, isLoading: loadingAlbum } = useAlbum(id);
  const { files, isLoading: loadingFiles } = useAlbumFiles(id);
  const { data: workspace } = useWorkspace(album?.workspace_id ?? undefined);
  const removeAlbum = useDeleteAlbum();
  const upload = useUpload({ scope: 'albums', albumId: id });

  const [filter, setFilter] = useState<Filter>('all');
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingFile, setDeletingFile] = useState<StoredFile | null>(null);

  const visible = useMemo(
    () => (filter === 'all' ? files : files.filter((f) => kindOf(f.contentType) === filter)),
    [files, filter],
  );

  const counts = useMemo(
    () => ({
      all: files.length,
      image: files.filter((f) => kindOf(f.contentType) === 'image').length,
      video: files.filter((f) => kindOf(f.contentType) === 'video').length,
      audio: files.filter((f) => kindOf(f.contentType) === 'audio').length,
    }),
    [files],
  );

  const totalBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);

  const removeFile = async (file: StoredFile) => {
    try {
      await storageApi.remove(file.key);
      queryClient.invalidateQueries({ queryKey: albumFilesQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: ['me', 'usage'] });
      setDeletingFile(null);
      setViewerIndex(null);
      toast.success('Deleted');
    } catch (err) {
      toast.error('Could not delete', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <AppShell title={album?.name ?? 'Album'}>
      <UploadDropzone
        onFiles={upload.upload}
        items={upload.items}
        onCancel={upload.cancel}
        onClearFinished={upload.clearFinished}
        accept="image/*,video/*,audio/*"
        className="min-h-full"
      >
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              <Button asChild size="icon" variant="ghost" className="-ml-2 shrink-0">
                <Link
                  href={album?.workspace_id ? `/workspaces/${album.workspace_id}` : '/workspaces'}
                  aria-label="Back"
                >
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
              {album?.name ?? 'Album'}
            </span>
          }
          description={
            loadingAlbum
              ? 'Loading…'
              : `${files.length} item${files.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}${workspace ? ` · ${workspace.name}` : ''}`
          }
          actions={
            <>
              <Button variant="outline" onClick={() => setSharing(true)}>
                <Link2 className="size-4" />
                Client link
              </Button>
              <Button onClick={() => openFilePicker()}>
                <CloudUpload className="size-4" />
                Upload
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Album actions">
                    <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
                      <circle cx="8" cy="3" r="1.4" />
                      <circle cx="8" cy="8" r="1.4" />
                      <circle cx="8" cy="13" r="1.4" />
                    </svg>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setSharing(true)}>
                    <Link2 className="size-4" />
                    Client link
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openFilePicker()}>
                    <CloudUpload className="size-4" />
                    Upload files
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setConfirmingDelete(true)}
                  >
                    <Trash2 className="size-4" />
                    Delete album
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />

        <div className="mx-auto w-full max-w-7xl px-6 py-6">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              {FILTERS.map((option) => (
                <TabsTrigger key={option.value} value={option.value}>
                  {option.label}
                  <Badge variant="secondary" className="ml-1.5 tabular-nums">
                    {counts[option.value]}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="mt-5">
            {loadingFiles && files.length === 0 ? (
              <GridSkeleton />
            ) : visible.length === 0 ? (
              <div className="rounded-xl border border-dashed">
                <EmptyState
                  icon={filter === 'all' ? CloudUpload : Images}
                  title={
                    filter === 'all'
                      ? 'Nothing uploaded yet'
                      : `No ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}`
                  }
                  description={
                    filter === 'all'
                      ? 'Drag photos, video or audio anywhere on this page, or use the Upload button.'
                      : 'Switch to All to see everything in this album.'
                  }
                  action={
                    filter === 'all' ? (
                      <Button onClick={() => openFilePicker()}>
                        <CloudUpload className="size-4" />
                        Choose files
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div className="media-grid">
                {visible.map((file) => (
                  <MediaTile
                    key={file.key}
                    file={file}
                    onOpen={() => setViewerIndex(visible.indexOf(file))}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </UploadDropzone>

      {viewerIndex !== null && visible[viewerIndex] && (
        <MediaViewer
          files={visible}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          onDelete={setDeletingFile}
        />
      )}

      <ShareDialog
        albumId={id}
        albumName={album?.name ?? 'this album'}
        open={sharing}
        onOpenChange={setSharing}
      />

      <AlertDialog
        open={!!deletingFile}
        onOpenChange={(o) => !o && setDeletingFile(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingFile ? fileNameFromKey(deletingFile.key) : ''} will be
              removed from storage. This cannot be undone, and it frees the
              space immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingFile && removeFile(deletingFile)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this album?</AlertDialogTitle>
            <AlertDialogDescription>
              {album?.name} and everything in it will be removed. This cannot be
              undone — keep your own backup of anything you cannot lose.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn('bg-destructive text-white hover:bg-destructive/90')}
              onClick={() =>
                removeAlbum.mutate(id, {
                  onSuccess: () =>
                    router.replace(
                      album?.workspace_id ? `/workspaces/${album.workspace_id}` : '/workspaces',
                    ),
                  onError: (err: Error) =>
                    toast.error('Could not delete', { description: err.message }),
                })
              }
            >
              Delete album
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
