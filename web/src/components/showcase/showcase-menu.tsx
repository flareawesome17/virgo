'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Ellipsis, Eye, EyeOff, Flag, Loader2, Pencil, Send, Trash2, User } from 'lucide-react';
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
import { useShowcaseActions } from '@/hooks/useShowcases';
import { makerOf, type FeedItem } from '@/api';
import { shareShowcase, shareability } from '@/lib/share-showcase';
import { showcaseActionMessage } from './action-message';
import { usePrivacyToggle } from './privacy';

/**
 * The "…" on a post.
 *
 * Your own: share it, change it, make it private or public, or delete it.
 * Somebody else's: share it, go to whoever made it, or report it. A menu
 * rather than a flag on every card: reporting is rare, and a flag beside
 * somebody's name reads as an accusation.
 */
export function ShowcaseMenu({
  item,
  mine,
  onReport,
  onDeleted,
}: {
  item: FeedItem;
  mine: boolean;
  onReport: () => void;
  /** Where to go once it is gone, for a page or dialog that was showing it. */
  onDeleted?: () => void;
}) {
  return mine ? (
    <OwnMenu item={item} onDeleted={onDeleted} />
  ) : (
    <VisitorMenu item={item} onReport={onReport} />
  );
}

function Trigger({ label }: { label: string }) {
  return (
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" aria-label={label} className="-mr-1.5 shrink-0">
        <Ellipsis className="size-5" />
      </Button>
    </DropdownMenuTrigger>
  );
}

function VisitorMenu({ item, onReport }: { item: FeedItem; onReport: () => void }) {
  // Never read straight off the payload: see makerOf.
  const maker = makerOf(item);
  const share = shareability(item, false);

  return (
    <DropdownMenu>
      <Trigger label="More options for this post" />
      <DropdownMenuContent align="end" className="min-w-52">
        {share.ok && (
          <DropdownMenuItem
            onSelect={() =>
              void shareShowcase({ id: item.id, title: item.title, makerName: maker.displayName })
            }
          >
            <Send />
            Share
          </DropdownMenuItem>
        )}
        {/* Only somebody who has published a handle has a profile to go to. */}
        {maker.handle && (
          <DropdownMenuItem asChild>
            <Link href={`/u/${maker.handle}`}>
              <User />
              View {maker.displayName}&rsquo;s profile
            </Link>
          </DropdownMenuItem>
        )}
        {(share.ok || maker.handle) && <DropdownMenuSeparator />}
        <DropdownMenuItem variant="destructive" onSelect={onReport}>
          <Flag />
          Report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OwnMenu({ item, onDeleted }: { item: FeedItem; onDeleted?: () => void }) {
  const { remove } = useShowcaseActions();
  const privacy = usePrivacyToggle(item);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const share = shareability(item, true);
  const maker = makerOf(item);

  const deleteNow = () =>
    remove.mutate(item.id, {
      onSuccess: () => {
        setConfirmingDelete(false);
        toast.success('Deleted');
        onDeleted?.();
      },
      onError: (err) =>
        toast.error("Couldn't delete it", { description: showcaseActionMessage(err, 'delete') }),
    });

  return (
    <>
      <DropdownMenu>
        <Trigger label="Options for your post" />
        <DropdownMenuContent align="end" className="min-w-52 max-w-72">
          {share.ok ? (
            <DropdownMenuItem
              onSelect={() =>
                void shareShowcase({ id: item.id, title: item.title, makerName: maker.displayName })
              }
            >
              <Send />
              Share
            </DropdownMenuItem>
          ) : (
            // Shown, and said why not: a Share that has simply gone from a
            // private post is a question nobody can answer from the menu.
            <DropdownMenuItem disabled className="items-start">
              <Send className="mt-0.5" />
              <span className="grid gap-0.5">
                <span>Share</span>
                <span className="text-xs text-muted-foreground">{share.reason}</span>
              </span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href={`/showcase/new?edit=${item.id}`}>
              <Pencil />
              Edit
            </Link>
          </DropdownMenuItem>
          {privacy.available && (
            <DropdownMenuItem onSelect={privacy.request} disabled={privacy.pending}>
              {privacy.live ? <EyeOff /> : <Eye />}
              {privacy.label}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {privacy.confirmElement}

      <AlertDialog
        open={confirmingDelete}
        onOpenChange={(open) => !open && !remove.isPending && setConfirmingDelete(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              It&rsquo;s removed from the feed, your profile and everyone&rsquo;s shelves. Your
              album files stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
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
