'use client';
/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, DotsThree, FilmSlate, ImageSquare, LinkSimple, MusicNotesSimple, Play, Trash, UploadSimple } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { UploadDropzone, openFilePicker } from '@/components/media/upload-dropzone';
import { MediaViewer } from '@/components/media/media-viewer';
import { AlbumAudioPlayer } from '@/components/media/album-audio-player';
import { ShareDialog } from '@/components/media/share-dialog';
import { useAlbum, useDeleteAlbum } from '@/hooks/useAlbums';
import { useAlbumFiles } from '@/hooks/useAlbumFiles';
import { useUpload } from '@/hooks/useUpload';
import { useWorkspace } from '@/hooks/useWorkspaces';
import { formatBytes, storageApi, type StoredFile, type StoredMediaKind } from '@/api';

type Room = Exclude<StoredMediaKind, 'other'>;
const ROOMS: { value: Room; label: string; Icon: typeof ImageSquare }[] = [
  { value: 'image', label: 'Photos', Icon: ImageSquare },
  { value: 'video', label: 'Films', Icon: FilmSlate },
  { value: 'audio', label: 'Audio', Icon: MusicNotesSimple },
];

export default function AlbumPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: album, isLoading: loadingAlbum } = useAlbum(id);
  const { data: workspace } = useWorkspace(album?.workspace_id ?? undefined);
  const removeAlbum = useDeleteAlbum();
  const upload = useUpload({ scope: 'albums', albumId: id });
  const [room, setRoom] = useState<Room>('image');
  // Reuse the unfiltered album response across all media rooms. The album
  // overview already proves this response contains and classifies the files.
  const albumFilesQuery = useAlbumFiles(id);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingFile, setDeletingFile] = useState<StoredFile | null>(null);

  const counts = albumFilesQuery.counts;
  const files = room === 'image'
    ? albumFilesQuery.images
    : room === 'video' ? albumFilesQuery.videos : albumFilesQuery.audio;
  const totalItems = counts.image + counts.video + counts.audio;

  const removeFile = async (file: StoredFile) => {
    try {
      await storageApi.remove(file.key);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['storage', 'files', id] }),
        queryClient.invalidateQueries({ queryKey: ['me', 'usage'] }),
      ]);
      setDeletingFile(null);
      setViewerIndex(null);
      toast.success('File removed');
    } catch (error) {
      toast.error('Could not remove file', { description: error instanceof Error ? error.message : undefined });
    }
  };

  return (
    <AppShell title={album?.name ?? 'Album'}>
      <UploadDropzone onFiles={upload.upload} items={upload.items} onCancel={upload.cancel} onClearFinished={upload.clearFinished} accept="image/*,video/*,audio/*" className="min-h-full bg-[#fbf7f2] dark:bg-[#171411]">
        <main className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-5 sm:px-7 lg:px-10 lg:pt-8">
          <section className="relative overflow-hidden rounded-[2rem] bg-[#201c19] p-1.5 text-white shadow-[0_28px_80px_-48px_rgba(62,39,26,0.72)]">
            <div className="relative overflow-hidden rounded-[1.65rem] border border-white/[0.08] bg-[#211d1a] px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:px-8 sm:py-8 lg:px-10 lg:py-10">
              <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(circle_at_78%_20%,rgba(193,119,69,0.16),transparent_35%),radial-gradient(circle_at_10%_110%,rgba(193,119,69,0.10),transparent_34%)]" />
              <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(22rem,0.6fr)] lg:items-end">
                <div>
                  <Link href={album?.workspace_id ? `/workspaces/${album.workspace_id}` : '/workspaces'} className="inline-flex items-center gap-2 text-xs font-medium text-white/46 transition-colors hover:text-white"><ArrowLeft size={15} weight="light" />Back to {workspace?.name ?? 'workspace'}</Link>
                  <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.22em] text-[#d89566]">Album archive</p>
                  <h1 className="mt-3 max-w-3xl text-balance text-4xl font-semibold leading-[0.96] tracking-[-0.055em] sm:text-5xl lg:text-6xl">{album?.name ?? (loadingAlbum ? 'Opening album…' : 'Album')}</h1>
                  {album?.description && <p className="mt-5 max-w-[62ch] text-sm leading-6 text-white/52">{album.description}</p>}
                </div>

                <div className="lg:justify-self-end">
                  <dl className="grid grid-cols-3 gap-5 border-t border-white/[0.09] pt-5 lg:min-w-[25rem]">
                    <Stat label="Photos" value={counts.image} />
                    <Stat label="Films" value={counts.video} />
                    <Stat label="Audio" value={counts.audio} />
                  </dl>
                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={() => setSharing(true)} className="rounded-full border-white/[0.12] bg-white/[0.04] text-white hover:bg-white/[0.1] hover:text-white"><LinkSimple size={16} weight="light" />Client link</Button>
                    <Button onClick={() => openFilePicker()} className="group rounded-full bg-[#c17745] text-white hover:bg-[#ce8554]"><UploadSimple size={16} weight="light" />Upload media</Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Album actions" className="rounded-full text-white/65 hover:bg-white/[0.08] hover:text-white"><DotsThree size={20} weight="light" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setSharing(true)}><LinkSimple size={16} weight="light" />Client link</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openFilePicker()}><UploadSimple size={16} weight="light" />Upload files</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}><Trash size={16} weight="light" />Delete album</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <nav aria-label="Album media" className="mt-8 flex items-center justify-between gap-4 border-b border-[#ded3ca] dark:border-white/[0.08]">
            <div className="flex min-w-0 gap-1 overflow-x-auto no-scrollbar">
              {ROOMS.map(({ value, label, Icon }) => {
                const selected = room === value;
                return <button key={value} onClick={() => { setRoom(value); setViewerIndex(null); }} aria-current={selected ? 'page' : undefined} className={`relative flex min-h-12 shrink-0 items-center gap-2 px-4 text-sm font-semibold transition-colors ${selected ? 'text-[#9e5431] dark:text-[#d89566]' : 'text-[#78675c] hover:text-foreground dark:text-white/45 dark:hover:text-white'}`}><Icon size={17} weight="light" />{label}<span className="font-mono text-[10px] tabular-nums opacity-55">{counts[value]}</span>{selected && <span className="absolute inset-x-3 bottom-0 h-0.5 origin-center rounded-full bg-[#b66a40]" />}</button>;
              })}
            </div>
            <p className="hidden shrink-0 text-xs text-muted-foreground sm:block">{totalItems} item{totalItems === 1 ? '' : 's'}</p>
          </nav>

          <section className="pt-7">
            {room !== 'audio' && <MediaRoom room={room} files={files} loading={albumFilesQuery.isLoading} failed={albumFilesQuery.loadFailed} onRetry={() => albumFilesQuery.refetch()} onOpen={setViewerIndex} hasMore={!!albumFilesQuery.hasNextPage} loadingMore={albumFilesQuery.isFetchingNextPage} onLoadMore={() => albumFilesQuery.fetchNextPage()} onUpload={() => openFilePicker()} />}
            <AlbumAudioPlayer files={albumFilesQuery.audio} albumName={album?.name ?? 'Virgo album'} visible={room === 'audio'} isLoading={albumFilesQuery.isLoading} hasMore={!!albumFilesQuery.hasNextPage} loadingMore={albumFilesQuery.isFetchingNextPage} onLoadMore={() => albumFilesQuery.fetchNextPage()} />
          </section>
        </main>
      </UploadDropzone>

      {viewerIndex !== null && files[viewerIndex] && <MediaViewer files={files} index={viewerIndex} onIndexChange={setViewerIndex} onClose={() => setViewerIndex(null)} onDelete={files[viewerIndex].capabilities.delete ? setDeletingFile : undefined} />}
      <ShareDialog albumId={id} albumName={album?.name ?? 'this album'} open={sharing} onOpenChange={setSharing} />

      <AlertDialog open={!!deletingFile} onOpenChange={(open) => !open && setDeletingFile(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this file?</AlertDialogTitle><AlertDialogDescription>{deletingFile?.originalName} will be permanently removed from storage.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deletingFile && removeFile(deletingFile)}>Remove file</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this album?</AlertDialogTitle><AlertDialogDescription>{album?.name} and everything in it will be permanently removed. Keep a separate backup of anything you cannot lose.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => removeAlbum.mutate(id, { onSuccess: () => router.replace(album?.workspace_id ? `/workspaces/${album.workspace_id}` : '/workspaces'), onError: (error: Error) => toast.error('Could not delete album', { description: error.message }) })}>Delete album</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div><dt className="text-[10px] uppercase tracking-[0.16em] text-white/35">{label}</dt><dd className="mt-1 font-mono text-xl tabular-nums text-white/86">{value}</dd></div>;
}

function MediaRoom({ room, files, loading, failed, onRetry, onOpen, hasMore, loadingMore, onLoadMore, onUpload }: {
  room: 'image' | 'video'; files: StoredFile[]; loading: boolean; failed: boolean; onRetry: () => void; onOpen: (index: number) => void; hasMore: boolean; loadingMore: boolean; onLoadMore: () => void; onUpload: () => void;
}) {
  if (loading && files.length === 0) return <GallerySkeleton room={room} />;
  if (failed && files.length === 0) return <RoomState Icon={room === 'image' ? ImageSquare : FilmSlate} title="This room could not be loaded" description="Your media is still safe. Check the connection and try again." action={<Button variant="outline" onClick={onRetry}>Try again</Button>} />;
  if (files.length === 0) return <RoomState Icon={room === 'image' ? ImageSquare : FilmSlate} title={room === 'image' ? 'The contact sheet is empty' : 'No films have been added'} description={room === 'image' ? 'Upload photographs to begin arranging this album.' : 'Upload a video and Virgo will prepare its poster and playback details.'} action={<Button onClick={onUpload} className="rounded-full"><UploadSimple size={16} weight="light" />Choose files</Button>} />;

  return <>
    {room === 'image' ? <div className="columns-2 gap-2.5 sm:columns-3 lg:columns-4 xl:columns-5">{files.map((file, index) => <button key={file.key} onClick={() => onOpen(index)} className="group relative mb-2.5 block w-full break-inside-avoid overflow-hidden rounded-[1rem] bg-[#e8ded6] text-left dark:bg-white/[0.05]" style={{ aspectRatio: file.width && file.height ? `${file.width}/${file.height}` : '1/1' }}>{ }<img src={file.thumbnailUrl ?? file.url ?? ''} alt={file.originalName} loading="lazy" className="size-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.025]" /><span className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-[#141210]/80 to-transparent px-3 pb-3 pt-10 text-xs font-medium text-white opacity-0 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0 group-hover:opacity-100">{file.originalName}</span>{file.processingStatus === 'pending' && <span className="absolute left-2 top-2 rounded-full bg-[#211d1a]/82 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-white/70 backdrop-blur-md">Indexing</span>}</button>)}</div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.25fr_0.75fr]">{files.map((file, index) => <button key={file.key} onClick={() => onOpen(index)} className={`group relative overflow-hidden rounded-[1.5rem] bg-[#201c19] text-left ${index % 5 === 0 ? 'md:row-span-2' : ''}`}><div className="aspect-video size-full min-h-52">{file.posterUrl ? <>{ }<img src={file.posterUrl} alt={`Poster for ${file.originalName}`} loading="lazy" className="size-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.025]" /></> : <div className="grid size-full place-items-center bg-[radial-gradient(circle_at_35%_20%,rgba(193,119,69,.2),transparent_42%),#211d1a]"><FilmSlate size={34} weight="light" className="text-white/25" /></div>}</div><span className="absolute inset-0 bg-gradient-to-t from-[#141210]/90 via-transparent to-transparent" /><span className="absolute bottom-0 left-0 right-0 flex items-end gap-3 p-4"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-[#211d1a] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"><Play size={15} weight="fill" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{file.originalName}</span><span className="mt-1 block font-mono text-[10px] text-white/45">{file.durationMs ? durationLabel(file.durationMs) : file.processingStatus === 'pending' ? 'Preparing poster' : formatBytes(file.sizeBytes)}</span></span></span></button>)}</div>}
    {hasMore && <div className="mt-10 text-center"><Button variant="outline" disabled={loadingMore} onClick={onLoadMore} className="rounded-full">{loadingMore ? 'Loading…' : `Load more ${room === 'image' ? 'photos' : 'films'}`}</Button></div>}
  </>;
}

function RoomState({ Icon, title, description, action }: { Icon: typeof ImageSquare; title: string; description: string; action: React.ReactNode }) {
  return <div className="py-24 text-center"><span className="mx-auto grid size-16 place-items-center rounded-[1.4rem] bg-[#e9dfd7] text-[#8b7669] dark:bg-white/[0.06] dark:text-white/35"><Icon size={28} weight="light" /></span><h2 className="mt-6 text-xl font-semibold tracking-[-0.025em]">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p><div className="mt-6">{action}</div></div>;
}

function GallerySkeleton({ room }: { room: 'image' | 'video' }) {
  return <div aria-label={`Loading ${room === 'image' ? 'photos' : 'films'}`} className={room === 'image' ? 'columns-2 gap-2.5 sm:columns-3 lg:columns-4 xl:columns-5' : 'grid gap-4 md:grid-cols-2'}>{Array.from({ length: 8 }).map((_, index) => <div key={index} className={`mb-2.5 animate-pulse break-inside-avoid rounded-[1.2rem] bg-[#e9dfd7]/80 dark:bg-white/[0.05] ${room === 'image' ? (index % 3 === 0 ? 'aspect-[4/5]' : index % 3 === 1 ? 'aspect-[3/2]' : 'aspect-square') : 'aspect-video'}`} />)}</div>;
}

function durationLabel(durationMs: number) {
  const total = Math.floor(durationMs / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
