'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Loader2, Send, Trash2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/components/states';
import { useCommentActions, useComments } from '@/hooks/useShowcases';
import type { Comment } from '@/api';
import { cn } from '@/lib/utils';
import { showcaseActionMessage } from './action-message';

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
 * Two layouts. `section` sits under a post on its own page, headed and
 * flowing with the page. `panel` fills a dialog: the dialog carries the
 * heading, the comments scroll, and the box to write in stays at the bottom
 * where the newest comment is — opened from a card, that is what somebody
 * came to read or add to.
 */
export function CommentThread({
  showcaseId,
  isOwner,
  total,
  userId,
  layout = 'section',
  autoFocus = false,
}: {
  showcaseId: string;
  isOwner: boolean;
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
  const [draft, setDraft] = useState('');
  const [removing, setRemoving] = useState<{ id: string; mine: boolean } | null>(null);
  const panel = layout === 'panel';

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

  const heading = count === 1 ? '1 comment' : count > 0 ? `${count} comments` : 'Comments';
  // The owner still sees the thread with comments off — the server sends it
  // to them so they can keep track of it and remove from it.
  const shut = !allowed && !isOwner;

  const thread = shut ? (
    <p className="text-sm text-muted-foreground">Comments are off for this post.</p>
  ) : isLoading ? (
    <div className="grid place-items-center py-6 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  ) : loadFailed && comments.length === 0 ? (
    <ErrorState message="Couldn't load the comments." onRetry={() => void refetch()} />
  ) : (
    <>
      {!allowed && (
        <p className="text-sm text-muted-foreground">
          You have commenting turned off. Nobody else sees the thread, and nothing new can be
          added.
        </p>
      )}
      {hasEarlier && (
        <Button
          variant="link"
          size="sm"
          className="justify-self-start px-0"
          disabled={loadingEarlier}
          onClick={() => void loadEarlier()}
        >
          {loadingEarlier ? 'Loading…' : 'View earlier comments'}
        </Button>
      )}

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {allowed
            ? 'Nothing said yet. If the note taught you something, that is worth saying.'
            : 'Nothing was said before you turned them off.'}
        </p>
      ) : (
        <ul className="grid gap-4">
          {comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              // Yours by who wrote it. Judged by whose post it was, the owner
              // deleting their own comment was told "they are not told".
              onRemove={() => setRemoving({ id: comment.id, mine: comment.author.id === userId })}
            />
          ))}
        </ul>
      )}
    </>
  );

  const composer = !shut && !isLoading && !(loadFailed && comments.length === 0) && allowed && (
    <form
      className={cn('flex items-end gap-2', panel ? 'border-t px-4 py-3' : 'mt-4')}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Add a comment"
        aria-label="Your comment"
        maxLength={COMMENT_LIMIT}
        autoFocus={autoFocus}
        className="max-h-40 min-h-10"
      />
      <Button
        type="submit"
        size="icon-lg"
        disabled={!draft.trim() || add.isPending}
        aria-label="Post this comment"
      >
        {add.isPending ? <Loader2 className="animate-spin" /> : <Send />}
      </Button>
    </form>
  );

  return (
    <section
      id={panel ? undefined : 'comments'}
      aria-labelledby={panel ? undefined : 'comments-heading'}
      aria-label={panel ? heading : undefined}
      className={panel ? 'flex min-h-0 flex-1 flex-col' : 'scroll-mt-24'}
    >
      {!panel && (
        <h2
          id="comments-heading"
          className="text-[11px] font-bold uppercase tracking-wide text-primary"
        >
          {heading}
        </h2>
      )}

      <div
        ref={scroller}
        className={cn(
          'grid content-start gap-3',
          panel ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4' : 'mt-3',
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

function CommentRow({ comment, onRemove }: { comment: Comment; onRemove: () => void }) {
  const { author } = comment;
  const avatar = (
    <Avatar className="size-8">
      {author.avatarUrl && <AvatarImage src={author.avatarUrl} alt="" />}
      <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
        {author.displayName.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <li className="flex gap-2.5">
      {author.handle ? (
        <Link href={`/u/${author.handle}`} aria-label={`${author.displayName}'s profile`}>
          {avatar}
        </Link>
      ) : (
        avatar
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold">
          {author.handle ? (
            <Link href={`/u/${author.handle}`} className="hover:underline">
              {author.displayName}
            </Link>
          ) : (
            author.displayName
          )}
        </p>
        <p className="mt-0.5 whitespace-pre-line break-words text-sm leading-6">{comment.body}</p>
      </div>
      {comment.canRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label="Remove this comment"
          className="-mr-1 text-muted-foreground"
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}
