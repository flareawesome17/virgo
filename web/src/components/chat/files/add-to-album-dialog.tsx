'use client';

/* eslint-disable @next/next/no-img-element -- signed album covers, already small */

import { useRef, useState } from 'react';
import { Images, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useInfiniteAlbums } from '@/hooks/useAlbums';
import { useAddToAlbum } from '@/hooks/useChatFiles';
import { ApiError, describeAlbumCount, isStorageFull, type Album, type ChatAttachment } from '@/api';
import { PickerEmpty, PickerFailed, PickerLoading, PickRow } from '@/components/chat/share/shared';
import { STORAGE_FULL_TEXT } from '@/components/chat/files/send-queue';

/** Yours, or one you were given Upload or Manage on: what the server lets you add to. */
function canAddTo(album: Album, meId: string | undefined): boolean {
  if (album.my_access === undefined || album.my_access === null) return album.user_id === meId;
  return album.my_access === 'owner' || album.my_access === 'upload' || album.my_access === 'manage';
}

function addProblem(err: unknown): string {
  if (isStorageFull(err)) {
    return "There's no room left for it in that album's storage. Free some up, or choose another album.";
  }
  if (err instanceof ApiError) {
    if (err.status === 0) return "You're offline. Try again when you're connected.";
    if (err.status === 404) return "That photo or album isn't there any more.";
    if ((err.status === 400 || err.status === 403) && err.message) return err.message;
  }
  return 'Something went wrong. Please try again.';
}

/**
 * Add to album, from the photo viewer: a copy of the chat photo (or PDF)
 * filed into an album you can upload to, made on the server so nothing
 * passes through this computer. Counted like an upload into that album.
 */
export function AddToAlbumDialog({
  conversationId,
  target,
  onOpenChange,
}: {
  conversationId: string;
  /** What is being filed; open while there is one. */
  target: { messageId: string; attachment: Pick<ChatAttachment, 'id' | 'kind' | 'name'> } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const add = useAddToAlbum(conversationId);
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const pause = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { albums, isLoading, loadFailed, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteAlbums(
      { orderBy: 'updated_at', direction: 'desc', search: search || undefined },
      { enabled: target !== null },
    );
  const yours = albums.filter((a) => canAddTo(a, user?.id));

  const close = () => {
    onOpenChange(false);
    setTyped('');
    setSearch('');
  };

  const pick = (album: Album) => {
    if (!target || add.isPending) return;
    add.mutate(
      { messageId: target.messageId, attachmentId: target.attachment.id, albumId: album.id },
      {
        onSuccess: () => {
          close();
          toast.success(`Added to ${album.name}`);
        },
        onError: (err) =>
          toast.error('Could not add it to the album', {
            description: isStorageFull(err) && album.user_id === user?.id ? STORAGE_FULL_TEXT : addProblem(err),
          }),
      },
    );
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-4 pb-3 pt-4">
          <DialogTitle>Add to album</DialogTitle>
          <DialogDescription>
            A copy of this {target?.attachment.kind === 'file' ? 'file' : 'photo'} goes into the album
            you choose, and counts toward that album&apos;s storage.
          </DialogDescription>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={typed}
              onChange={(e) => {
                const next = e.target.value;
                setTyped(next);
                clearTimeout(pause.current);
                pause.current = setTimeout(() => setSearch(next.trim()), 250);
              }}
              placeholder="Search albums"
              aria-label="Search albums"
              className="pl-9"
            />
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {isLoading && albums.length === 0 ? (
            <PickerLoading />
          ) : loadFailed && albums.length === 0 ? (
            <PickerFailed what="your albums" onRetry={() => void refetch()} />
          ) : yours.length === 0 && !hasNextPage ? (
            search ? (
              <PickerEmpty>No albums match “{search}”.</PickerEmpty>
            ) : (
              <PickerEmpty href="/albums" action="Open albums">
                No albums to add to yet. Albums you own, or can upload to, show here.
              </PickerEmpty>
            )
          ) : (
            <ul className="flex flex-col gap-0.5">
              {yours.map((a) => (
                <PickRow
                  key={a.id}
                  leading={
                    <span className="block size-11 overflow-hidden rounded-lg bg-muted">
                      {a.cover_url ? (
                        <img src={a.cover_url} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
                      ) : (
                        <span className="grid size-full place-items-center text-muted-foreground">
                          <Images className="size-4" aria-hidden />
                        </span>
                      )}
                    </span>
                  }
                  title={a.name}
                  lines={[a.counts ? describeAlbumCount(a.counts) : null]}
                  busy={add.isPending && add.variables?.albumId === a.id}
                  disabled={add.isPending}
                  onPick={() => pick(a)}
                />
              ))}
              {hasNextPage && (
                <li className="flex justify-center py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isFetchingNextPage}
                    onClick={() => void fetchNextPage()}
                  >
                    {isFetchingNextPage && <Loader2 className="size-3.5 animate-spin" />}
                    Show more albums
                  </Button>
                </li>
              )}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
