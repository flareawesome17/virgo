'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useShowcase } from '@/hooks/useShowcases';
import { makerOf, type FeedItem } from '@/api';
import { CommentThread } from './comment-thread';

export interface CommentsRequest {
  item: FeedItem;
  /** Opened to write one (the comment button), not to read (View all). */
  write: boolean;
}

/**
 * A post's thread, over the feed: the card's comment button and its "View
 * all N comments" both open it, so reading and adding to a conversation no
 * longer leaves the feed for the post's own page.
 */
export function CommentsDialog({
  request,
  userId,
  onClose,
}: {
  /** What to show; null when the dialog is closed. */
  request: CommentsRequest | null;
  userId: string | undefined;
  onClose: () => void;
}) {
  // What the dialog draws outlives `request` by the length of the closing
  // animation, so it does not empty itself on the way out.
  const [shown, setShown] = useState(request);
  if (request && request !== shown) setShown(request);

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[min(80dvh,44rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        {shown && <CommentsBody key={shown.item.id} request={shown} userId={userId} />}
      </DialogContent>
    </Dialog>
  );
}

function CommentsBody({ request, userId }: { request: CommentsRequest; userId: string | undefined }) {
  const { item, write } = request;
  // The post as it is now, for its count, which a new comment moves; the
  // card it was opened from until that has loaded.
  const { showcase } = useShowcase(item.id);
  const live = showcase ?? item;
  const maker = makerOf(live);
  const mine = !!userId && live.userId === userId;

  return (
    <>
      <DialogHeader className="border-b px-4 pb-3 pt-4 pr-12">
        <DialogTitle>Comments</DialogTitle>
        <DialogDescription className="truncate">
          {live.title ? `On “${live.title}” by ${maker.displayName}` : `On ${maker.displayName}’s post`}
        </DialogDescription>
      </DialogHeader>
      <CommentThread
        showcaseId={live.id}
        isOwner={mine}
        total={live.commentCount}
        userId={userId}
        layout="panel"
        autoFocus={write}
      />
    </>
  );
}
