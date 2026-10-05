'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArchiveRestore, EyeOff, Loader2, Pencil, Trash2, Ellipsis } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { showcaseActionMessage } from '@/components/showcase/action-message';
import { useShowcaseActions } from '@/hooks/useShowcases';
import { showcaseStatus, type Showcase } from '@/api';

/**
 * The "…" on your own post: change it, take it down, or delete it.
 *
 * The web could do none of these; the menu was hidden on your own posts and
 * said editing was done on the phone. Taking down keeps the post and
 * everything on it, and putting it back up brings it all back; deleting is
 * for good, so it asks first.
 */
export function OwnShowcaseMenu({
  showcase,
  onDeleted,
}: {
  showcase: Pick<Showcase, 'id' | 'title' | 'publishedAt' | 'unpublishedAt' | 'hiddenAt'>;
  /** Where to go once it is gone, for a page that was showing it. */
  onDeleted?: () => void;
}) {
  const { setPublished, remove } = useShowcaseActions();
  const [confirming, setConfirming] = useState(false);
  const status = showcaseStatus(showcase);
  const live = status === 'live';
  // Taken down by Virgo: only Virgo can put it back.
  const removed = status === 'removed';

  const togglePublished = () =>
    setPublished.mutate(
      { id: showcase.id, published: !live },
      {
        onSuccess: () =>
          toast.success(live ? 'Taken down' : 'Back up', {
            description: live
              ? 'Nobody else can see it. Its likes, comments and keeps are kept.'
              : 'It is on your profile and in the feed again.',
          }),
        onError: (err) =>
          toast.error("Couldn't change that", { description: showcaseActionMessage(err, 'takedown') }),
      },
    );

  const deleteNow = () =>
    remove.mutate(showcase.id, {
      onSuccess: () => {
        setConfirming(false);
        toast.success('Deleted');
        onDeleted?.();
      },
      onError: (err) =>
        toast.error("Couldn't delete it", { description: showcaseActionMessage(err, 'delete') }),
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Options for your post">
            <Ellipsis className="size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem asChild>
            <Link href={`/showcase/new?edit=${showcase.id}`}>
              <Pencil />
              Edit
            </Link>
          </DropdownMenuItem>
          {!removed && (
            <DropdownMenuItem onSelect={togglePublished} disabled={setPublished.isPending}>
              {live ? <EyeOff /> : <ArchiveRestore />}
              {live ? 'Take down' : 'Put back up'}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {showcase.title ? `“${showcase.title}”` : 'this showcase'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It goes for good, with its likes and comments, and it leaves every shelf it was
              kept on. Your photos and films stay in their albums. To hide it for now, take it
              down instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                // Open until it settles, so a failure is reported.
                event.preventDefault();
                deleteNow();
              }}
            >
              {remove.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
