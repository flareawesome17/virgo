'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Copy,
  Ellipsis,
  Loader2,
  MessageCircle,
  MessageCircleOff,
  Send,
  Trash2,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ErrorState } from '@/components/states';
import { Pill } from '@/components/kit';
import { useAuth } from '@/hooks/useAuth';
import { useCommentActions, useComments, useShowcaseActions } from '@/hooks/useShowcases';
import type { Comment } from '@/api';
import { cn } from '@/lib/utils';
import { showcaseActionMessage } from './action-message';
import { copyText } from './copy-text';
import { postedAgo } from './posted-time';

/** Matches the server's limit on a comment. */
const COMMENT_LIMIT = 1000;

/**
 * The conversation under a showcase: the phone's thread, on the web.
 *
 * Oldest first, which is how a conversation reads — newest-first is for a
 * feed, where you are catching up, not for a thread, where you are following
 * along. The newest page loads, and earlier comments come in above it on
 * request.
 *
 * Two layouts. `section` sits beside a post on its own page, headed and
 * flowing with the page. `panel` fills a dialog: the dialog carries the
 * heading, the comments scroll, and the box to write in stays at the bottom
 * where the newest comment is — opened from a card, that is what somebody
 * came to read or add to.
 */
export function CommentThread({
  showcaseId,
  isOwner,
  makerId,
  total,
  userId,
  layout = 'section',
  autoFocus = false,
}: {
  showcaseId: string;
  isOwner: boolean;
  /**
   * Who made the post, so their own comments can say "Maker". Without it the
   * owner's are still marked on their own post, where the maker is known to
   * be whoever is looking.
   */
  makerId?: string | null;
  /**
   * How many there are in all, from the showcase. Counting the ones loaded
   * read 30 while the card said 41.
   */
  total?: number;
  /** The signed-in person, to tell their own comments from anybody else's. */
  userId: string | undefined;
  layout?: 'section' | 'panel';
  /** Puts the cursor in the box: the comment button was pressed to write one. */
  autoFocus?: boolean;
}) {
  const { profile, user } = useAuth();
  const {
    comments,
    allowed,
    isLoading,
    loadFailed,
    refetch,
    hasEarlier,
    loadEarlier,
    loadingEarlier,
  } = useComments(showcaseId);
  const count = Math.max(total ?? 0, comments.length);
  const { add, remove } = useCommentActions(showcaseId);
  const { update } = useShowcaseActions();
  const [draft, setDraft] = useState('');
  const [removing, setRemoving] = useState<{ id: string; mine: boolean } | null>(null);
  const panel = layout === 'panel';
  const maker = makerId ?? (isOwner ? userId : undefined);
  // How many are above the ones loaded, when the post's own count says.
  const earlier = hasEarlier ? count - comments.length : 0;

  /*
   * In a panel, kept at the newest comment: on opening, and when one is
   * added. Keyed on the last comment rather than the count, so loading
   * earlier ones above does not throw the reader to the bottom.
   */
  const scroller = useRef<HTMLDivElement>(null);
  const newest = comments[comments.length - 1]?.id;
  useEffect(() => {
    const el = scroller.current;
    if (panel && el && newest) el.scrollTop = el.scrollHeight;
  }, [panel, newest]);

  const send = () => {
    const body = draft.trim();
    if (!body || add.isPending) return;
    add.mutate(body, {
      // Cleared on success only: a failed send that also lost what somebody
      // typed is the version of this people rewrite from memory.
      onSuccess: () => setDraft(''),
      onError: (error) => toast.error(showcaseActionMessage(error, 'comment')),
    });
  };

  // Enter is a new line, as it is in any box this size; Ctrl or ⌘ with it
  // sends, as it does in most places a comment is written.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      send();
    }
  };

  const confirmRemove = () => {
    if (!removing) return;
    const { id } = removing;
    setRemoving(null);
    remove.mutate(id, {
      onError: (error) => toast.error(showcaseActionMessage(error, 'uncomment')),
    });
  };

  // The same change the edit form's switch makes. Every showcase query is
  // refreshed by it, this thread's among them, which is what brings the box
  // back.
  const turnOn = () =>
    update.mutate(
      { id: showcaseId, body: { allowComments: true } },
      {
        onError: (error) =>
          toast.error("Couldn't change that", {
            description: showcaseActionMessage(error, 'takedown'),
          }),
      },
    );

  const heading = count === 1 ? '1 comment' : count > 0 ? `${count} comments` : 'Comments';
  // The owner still sees the thread with comments off — the server sends it
  // to them so they can keep track of it and remove from it.
  const shut = !allowed && !isOwner;
  const failed = loadFailed && comments.length === 0;

  /*
   * What the owner is told while their post takes no comments, with the way
   * back. A dialog pins it above the comments: inside a list that keeps to
   * its newest end it would be scrolled out of sight on arrival.
   */
  const offNotice = !allowed && isOwner && !isLoading && !failed && (
    <div className={cn('flex flex-col gap-2.5 rounded-2xl bg-muted p-3.5', panel && 'mx-4 mt-3')}>
      <div className="flex gap-2.5">
        <MessageCircleOff
          aria-hidden
          className="mt-px size-[18px] shrink-0 text-secondary-foreground"
        />
        <p className="min-w-0 flex-1 text-sm leading-5 text-secondary-foreground">
          <span className="font-semibold text-foreground">Comments are off.</span> Nobody else
          sees the thread, and nothing new can be added. Nothing said was deleted.
        </p>
      </div>
      <Button
        variant="outline"
        size="lg"
        className="self-start rounded-[10px] px-3.5 font-semibold"
        onClick={turnOn}
        disabled={update.isPending}
      >
        {update.isPending && <Loader2 className="animate-spin" />}
        Turn comments on
      </Button>
    </div>
  );

  const thread = shut ? (
    <Quiet icon={MessageCircleOff} className={cn(panel && 'my-auto')}>
      <p className="text-sm text-muted-foreground">Comments are off for this post.</p>
    </Quiet>
  ) : isLoading ? (
    <div className="grid place-items-center py-6 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  ) : failed ? (
    <ErrorState message="Couldn't load the comments." onRetry={() => void refetch()} />
  ) : (
    <>
      {!panel && offNotice}
      {hasEarlier && (
        <button
          type="button"
          disabled={loadingEarlier}
          onClick={() => void loadEarlier()}
          className="self-start rounded text-[13px] font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {loadingEarlier
            ? 'Loading…'
            : earlier > 0
              ? `View ${earlier.toLocaleString()} earlier ${earlier === 1 ? 'comment' : 'comments'}`
              : 'View earlier comments'}
        </button>
      )}

      {comments.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {comments.map((comment) => {
            // Yours by who wrote it. Judged by whose post it was, the owner
            // deleting their own comment was told "they are not told".
            const mine = comment.author.id === userId;
            return (
              <CommentRow
                key={comment.id}
                comment={comment}
                byMaker={Boolean(maker) && comment.author.id === maker}
                mine={mine}
                onRemove={() => setRemoving({ id: comment.id, mine })}
              />
            );
          })}
        </ul>
      ) : allowed ? (
        <Quiet icon={MessageCircle} className={cn(panel && 'my-auto')}>
          <p className="text-[15px] font-bold leading-5">Nothing said yet</p>
          <p className="text-sm text-muted-foreground">
            If the note taught you something, that is worth saying.
          </p>
        </Quiet>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing was said before you turned them off.
        </p>
      )}
    </>
  );

  const ready = Boolean(draft.trim()) && !add.isPending;
  const myName = profile?.displayName?.trim() || user?.email || '';
  // Not drawn at all while commenting is off, for the owner too: nothing new
  // can be added then, by anyone.
  const composer = !shut && !isLoading && !failed && allowed && (
    <form
      className={cn('flex items-end gap-2.5', panel && 'border-t border-border px-4 py-3')}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {/* Lined up with a one-line box, and staying at the foot of a tall one. */}
      <Avatar className="mb-1.5 size-8">
        {profile?.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" />}
        <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
          {myName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <label className="flex min-h-11 min-w-0 flex-1 cursor-text items-end gap-2 rounded-xl bg-card pl-3.5 pr-1.5 ring-1 ring-inset ring-border transition-shadow focus-within:ring-2 focus-within:ring-ring/60">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Say something"
          aria-label="Write a comment"
          maxLength={COMMENT_LIMIT}
          autoFocus={autoFocus}
          rows={1}
          className="field-sizing-content max-h-40 min-w-0 flex-1 resize-none bg-transparent py-3 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground"
        />
        <span className="shrink-0 pb-3.5 text-xs leading-4 tabular-nums text-muted-foreground">
          {draft.length >= COMMENT_LIMIT ? '1,000' : draft.length} of 1,000
        </span>
        <button
          type="submit"
          disabled={!ready}
          aria-label="Post this comment"
          className={cn(
            'mb-1.5 grid size-8 shrink-0 place-items-center rounded-[10px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
            // Dark once there is something to send, never terracotta: the
            // page's one filled button is not this one.
            ready ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
          )}
        >
          {add.isPending ? (
            <Loader2 className="size-[15px] animate-spin" />
          ) : (
            <Send className="size-[15px]" />
          )}
        </button>
      </label>
    </form>
  );

  return (
    <section
      id={panel ? undefined : 'comments'}
      aria-labelledby={panel ? undefined : 'comments-heading'}
      aria-label={panel ? heading : undefined}
      className={
        panel
          ? 'flex min-h-0 flex-1 flex-col'
          : 'flex scroll-mt-24 flex-col gap-4 border-t border-border pt-4'
      }
    >
      {!panel && (
        <h2 id="comments-heading" className="text-base font-bold">
          Comments
          {count > 0 && (
            <span className="font-medium text-muted-foreground"> {count.toLocaleString()}</span>
          )}
        </h2>
      )}

      {panel && offNotice}
      <div
        ref={scroller}
        className={cn(
          'flex flex-col gap-4',
          panel && 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4',
        )}
      >
        {thread}
      </div>
      {composer}

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removing?.mine ? 'Delete your comment?' : 'Remove this comment?'}
            </AlertDialogTitle>
            {!removing?.mine && (
              <AlertDialogDescription>It goes from your post. They are not told.</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmRemove}>
              {removing?.mine ? 'Delete' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** A thread with nothing in it to read: an icon over a line or two saying why. */
function Quiet({
  icon: Icon,
  className,
  children,
}: {
  icon: typeof MessageCircle;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-1 px-5 py-6 text-center', className)}>
      <span className="mb-2 grid size-12 place-items-center rounded-2xl bg-muted">
        <Icon aria-hidden className="size-[22px] text-secondary-foreground" />
      </span>
      {children}
    </div>
  );
}

/**
 * One comment: who said it, whether they made the post, when, and the words.
 * The "⋯" is on every row, since anybody may copy a comment or go to whoever
 * wrote it; taking one out of the thread is in there for whoever may.
 */
function CommentRow({
  comment,
  byMaker,
  mine,
  onRemove,
}: {
  comment: Comment;
  byMaker: boolean;
  mine: boolean;
  onRemove: () => void;
}) {
  const { author } = comment;
  const ago = postedAgo(comment.createdAt);
  const profileHref = author.handle ? `/u/${author.handle}` : null;
  const avatar = (
    <Avatar className="size-8">
      {author.avatarUrl && <AvatarImage src={author.avatarUrl} alt="" />}
      <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
        {author.displayName.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );

  const copy = () =>
    void copyText(comment.body).then((copied) => {
      if (copied) toast.success('Copied');
      else toast.error("Couldn't copy that.");
    });

  return (
    <li className="flex gap-2.5">
      {profileHref ? (
        <Link
          href={profileHref}
          aria-label={`${author.displayName}'s profile`}
          className="shrink-0 self-start rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {avatar}
        </Link>
      ) : (
        avatar
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {profileHref ? (
            <Link
              href={profileHref}
              className="min-w-0 truncate text-sm font-semibold hover:underline"
            >
              {author.displayName}
            </Link>
          ) : (
            <span className="min-w-0 truncate text-sm font-semibold">{author.displayName}</span>
          )}
          {byMaker && <Pill>Maker</Pill>}
          {ago.short && (
            <time
              dateTime={comment.createdAt}
              suppressHydrationWarning
              className="shrink-0 text-xs text-muted-foreground"
            >
              {/* "Just now" is a post's; in a thread, beside a name, the
                  short word sits better with "2h" and "3d". */}
              <span aria-hidden>{ago.short === 'Just now' ? 'now' : ago.short}</span>
              <span className="sr-only">{ago.label}</span>
            </time>
          )}
        </div>
        <p className="whitespace-pre-line break-words text-sm leading-5 text-secondary-foreground">
          {comment.body}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Options for this comment"
            className="-mr-1 shrink-0 rounded-[10px] text-muted-foreground"
          >
            <Ellipsis className="size-[15px]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onSelect={copy}>
            <Copy />
            Copy the words
          </DropdownMenuItem>
          {profileHref && (
            <DropdownMenuItem asChild>
              <Link href={profileHref}>
                <UserRound />
                View {author.displayName}&rsquo;s profile
              </Link>
            </DropdownMenuItem>
          )}
          {comment.canRemove && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                <Trash2 />
                {mine ? 'Delete your comment' : 'Remove from your post'}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
