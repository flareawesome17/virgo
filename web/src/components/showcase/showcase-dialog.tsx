'use client';

import { useState } from 'react';
import { CloudOff, ImageOff, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/states';
import { useShowcase } from '@/hooks/useShowcases';
import { ApiError, makerOf, showcaseStatus } from '@/api';
import { ShowcaseCard } from './showcase-card';
import { StatusBanner } from './status-banner';

/** Taking a post off whatever it was opened from: a shelf, or everything kept. */
export interface DialogRemoval {
  label: string;
  pending: boolean;
  onRemove: () => void;
  /** Offered while the post is still there, not only once it has gone. */
  always?: boolean;
}

/**
 * A post opened over the page it was found on — a shelf, everything kept, a
 * profile's work — drawn as the same card the feed draws.
 *
 * What is kept is a pointer to somebody else's post, and the post can go
 * after it was kept. So a post that answers "not found" says so plainly and
 * offers to take it off the shelf, rather than a Try again that could only
 * fail again.
 */
export function ShowcaseDialog({
  showcaseId,
  onClose,
  note,
  removal,
}: {
  /** The post to show; null when the dialog is closed. */
  showcaseId: string | null;
  onClose: () => void;
  /** The keeper's own note on why they kept it. */
  note?: string | null;
  removal?: DialogRemoval;
}) {
  // What it draws outlives `showcaseId` by the length of the closing
  // animation, so it does not empty itself on the way out.
  const [shown, setShown] = useState(showcaseId);
  if (showcaseId && showcaseId !== shown) setShown(showcaseId);

  return (
    <Dialog open={showcaseId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92dvh] gap-0 overflow-y-auto overscroll-contain p-0 sm:max-w-[500px]"
      >
        {shown && <Body key={shown} id={shown} note={note} removal={removal} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  id,
  note,
  removal,
  onClose,
}: {
  id: string;
  note?: string | null;
  removal?: DialogRemoval;
  onClose: () => void;
}) {
  const { showcase, error, isLoading, loadFailed, refetch } = useShowcase(id);

  if (!showcase) {
    // Gone is not offline: see the post's own page.
    const gone = error instanceof ApiError && (error.status === 404 || error.status === 403);
    return (
      <div className="relative">
        <DialogTitle className="sr-only">Post</DialogTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2"
        >
          <X className="size-5" />
        </Button>
        {isLoading ? (
          <div className="grid place-items-center py-24 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : gone || !loadFailed ? (
          <EmptyState
            icon={ImageOff}
            title="This post is no longer available"
            description="Whoever posted it took it down or deleted it."
            action={
              removal ? (
                <Button onClick={removal.onRemove} disabled={removal.pending}>
                  {removal.pending && <Loader2 className="size-4 animate-spin" />}
                  {removal.label}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            icon={CloudOff}
            title="Couldn't load this post"
            description="Check your connection and try again."
            action={<Button onClick={() => void refetch()}>Try again</Button>}
          />
        )}
      </div>
    );
  }

  const maker = makerOf(showcase);
  return (
    <>
      <DialogTitle className="sr-only">
        {showcase.title ?? `${maker.displayName}'s post`}
      </DialogTitle>
      <ShowcaseCard item={showcase} variant="dialog" onDeleted={onClose} onClose={onClose} />
      {showcaseStatus(showcase) !== 'live' && (
        <StatusBanner showcase={showcase} className="mx-3 mb-3" />
      )}
      {(note || (removal?.always ?? false)) && (
        <div className="flex flex-wrap items-center gap-3 border-t px-3 py-3">
          {note && (
            <p className="min-w-0 flex-1 border-l-2 pl-2.5 text-sm italic leading-relaxed text-muted-foreground">
              {note}
            </p>
          )}
          {removal?.always && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={removal.onRemove}
              disabled={removal.pending}
            >
              {removal.pending && <Loader2 className="size-4 animate-spin" />}
              {removal.label}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
