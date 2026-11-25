'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { FolderPlus, Images, Upload } from 'lucide-react';
import { queryKeys, type Album } from '@/api';
import { UploadDropzone, openFilePicker } from '@/components/media/upload-dropzone';
import { useUploadQueue } from '@/components/upload/upload-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Upload from a workspace: choose which of its albums the files are for, then
 * the picker, the checks and the queue the album's own Upload uses.
 *
 * The dropzone is here for its picker and its filter, not as somewhere to
 * drop. It wraps only the button and is told it is disabled, so a file let go
 * over the button is swallowed, not sent to whichever album was chosen last.
 */
export function WorkspaceUpload({
  workspaceId,
  albums,
  loading = false,
  onNewAlbum,
  className,
  menuOpen,
  onMenuOpenChange,
}: {
  workspaceId: string;
  /** The albums the viewer may add files to. */
  albums: Album[];
  loading?: boolean;
  /** Offered when there is no album yet. Absent for a member, who cannot make one. */
  onNewAlbum?: () => void;
  className?: string;
  /** For a page that opens the menu from a key (the desktop app's Ctrl U). Left out, the menu keeps its own state. */
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [album, setAlbum] = useState<Album | null>(null);
  const { active } = useUploadQueue();
  const queryClient = useQueryClient();
  const wasActive = useRef(false);

  // The queue refreshes the albums it fills, not the workspace over them.
  // Without this the page went on saying how many files it held before.
  useEffect(() => {
    if (wasActive.current && !active) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.detail(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.activity(workspaceId) });
    }
    wasActive.current = active;
  }, [active, queryClient, workspaceId]);

  const choose = (next: Album) => {
    // Committed before the picker opens: the files it hands back are queued
    // for whichever album the dropzone holds when they arrive.
    flushSync(() => setAlbum(next));
    openFilePicker(root.current ?? document);
  };

  return (
    <div ref={root}>
      <UploadDropzone
        target={{ scope: 'albums', albumId: album?.id, albumName: album?.name }}
        disabled
      >
        <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
          <DropdownMenuTrigger asChild>
            <Button className={className}>
              <Upload />
              Upload
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            // A hundred albums is a list to scroll, not one to run off the window.
            className="max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] w-64"
          >
            {albums.length > 0 ? (
              <>
                <DropdownMenuLabel>Upload to</DropdownMenuLabel>
                {albums.map((item) => (
                  <DropdownMenuItem key={item.id} onSelect={() => choose(item)} className="gap-2.5 py-1.5">
                    <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                      {item.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, not an asset to optimise
                        <img src={item.cover_url} alt="" loading="lazy" className="size-full object-cover" />
                      ) : (
                        <Images className="size-3.5 text-muted-foreground" />
                      )}
                    </span>
                    <span className="truncate">{item.name}</span>
                  </DropdownMenuItem>
                ))}
              </>
            ) : (
              <>
                <DropdownMenuLabel className={cn(!loading && onNewAlbum && 'pb-1.5')}>
                  {loading ? 'Loading albums…' : 'No albums yet. Files go into an album.'}
                </DropdownMenuLabel>
                {!loading && onNewAlbum && (
                  <DropdownMenuItem onSelect={onNewAlbum}>
                    <FolderPlus />
                    New album
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </UploadDropzone>
    </div>
  );
}
