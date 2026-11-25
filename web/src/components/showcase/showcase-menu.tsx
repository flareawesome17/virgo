'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Ellipsis,
  Eye,
  EyeOff,
  Flag,
  Link2,
  Loader2,
  MessageCircle,
  MessageCircleOff,
  Pencil,
  Share,
  Trash2,
  User,
  Users,
} from 'lucide-react';
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
import { makerOf, showcaseStatus, type FeedItem, type NewShowcase } from '@/api';
import { shareShowcase, shareability, showcaseLink } from '@/lib/share-showcase';
import { showcaseActionMessage } from './action-message';
import { copyText } from './copy-text';
import { usePrivacyToggle } from './privacy';

/**
 * The "⋯" on a post.
 *
 * Your own: share it, copy its link, change it, narrow or widen who sees it,
 * turn its comments off or on, make it private or public, or delete it.
 * Somebody else's: share it, copy its link, go to whoever made it, or report
 * it. A menu rather than a flag on every card: reporting is rare, and a flag
 * beside somebody's name reads as an accusation.
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
      <Button variant="ghost" size="icon-lg" aria-label={label} className="shrink-0 rounded-[10px]">
        <Ellipsis className="size-[18px]" />
      </Button>
    </DropdownMenuTrigger>
  );
}

/**
 * The post's link, on the clipboard. Only ever offered for a post that has
 * one (see shareability). Where nothing will copy, the address is shown
 * instead, so it can still be copied by hand.
 */
async function copyShowcaseLink(id: string): Promise<void> {
  const url = showcaseLink(id);
  if (await copyText(url)) toast.success('Link copied', { description: url });
  else toast.info(url);
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
          <>
            <DropdownMenuItem
              onSelect={() =>
                void shareShowcase({ id: item.id, title: item.title, makerName: maker.displayName })
              }
            >
              <Share />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copyShowcaseLink(item.id)}>
              <Link2 />
              Copy the link
            </DropdownMenuItem>
          </>
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
  const { remove, update } = useShowcaseActions();
  const privacy = usePrivacyToggle(item);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const share = shareability(item, true);
  const maker = makerOf(item);
  const status = showcaseStatus(item);
  // Out, and to everyone: the one state where who sees it can be narrowed
  // and its comments switched, as on the phone.
  const out = status === 'live' && item.visibility === 'public';
  // Out, but to connections only: the way back from "Show to connections only".
  const narrowed = status === 'live' && item.visibility === 'connections';

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

  // The same change the edit form makes, without opening it. Every showcase
  // query is refreshed by it, so the card and the thread follow.
  const change = (body: Partial<NewShowcase>, done: string, more?: string) =>
    update.mutate(
      { id: item.id, body },
      {
        onSuccess: () => toast.success(done, more ? { description: more } : undefined),
        onError: (err) =>
          toast.error("Couldn't change that", {
            description: showcaseActionMessage(err, 'takedown'),
          }),
      },
    );

  return (
    <>
      <DropdownMenu>
        <Trigger label="Options for your post" />
        <DropdownMenuContent align="end" className="min-w-52 max-w-72">
          {share.ok ? (
            <>
              <DropdownMenuItem
                onSelect={() =>
                  void shareShowcase({
                    id: item.id,
                    title: item.title,
                    makerName: maker.displayName,
                  })
                }
              >
                <Share />
                Share
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copyShowcaseLink(item.id)}>
                <Link2 />
                Copy the link
              </DropdownMenuItem>
            </>
          ) : (
            // Shown, and said why not: a Share that has simply gone from a
            // private post is a question nobody can answer from the menu.
            <DropdownMenuItem disabled className="items-start">
              <Share className="mt-0.5" />
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
          {out && (
            <DropdownMenuItem
              disabled={update.isPending}
              onSelect={() =>
                change(
                  { visibility: 'connections' },
                  'Shown to connections only',
                  'It has left the public feed and has no link to share.',
                )
              }
            >
              <Users />
              Show to connections only
            </DropdownMenuItem>
          )}
          {narrowed && (
            <DropdownMenuItem
              disabled={update.isPending}
              onSelect={() =>
                change(
                  { visibility: 'public' },
                  'Public now',
                  'Everyone on Virgo can see it, and anyone with the link.',
                )
              }
            >
              <Eye />
              Make public
            </DropdownMenuItem>
          )}
          {privacy.available && (
            <DropdownMenuItem onSelect={privacy.request} disabled={privacy.pending}>
              {privacy.live ? <EyeOff /> : <Eye />}
              {privacy.label}
            </DropdownMenuItem>
          )}
          {out && (
            <DropdownMenuItem
              disabled={update.isPending}
              onSelect={() =>
                item.allowComments
                  ? change({ allowComments: false }, 'Comments are off', 'Nothing said is deleted.')
                  : change({ allowComments: true }, 'Comments are on')
              }
            >
              {item.allowComments ? <MessageCircleOff /> : <MessageCircle />}
              {item.allowComments ? 'Turn off comments' : 'Turn on comments'}
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
