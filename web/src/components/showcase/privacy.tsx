'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { useShowcaseActions } from '@/hooks/useShowcases';
import { showcaseStatus, type Showcase } from '@/api';
import { showcaseActionMessage } from './action-message';

type Publishable = Pick<
  Showcase,
  'id' | 'visibility' | 'publishedAt' | 'unpublishedAt' | 'hiddenAt'
>;

/**
 * What putting a private post out is called. "Make public" would be untrue
 * of a post shown only to connections — publishing it puts it back in front
 * of them, not everyone — so it says that instead.
 */
export function publishLabel(item: Pick<Showcase, 'visibility'>): string {
  return item.visibility === 'connections' ? 'Show to connections' : 'Make public';
}

/**
 * Making your own post private, or public again: one rule wherever it is
 * offered (the card's menu, the banner over a private post).
 *
 * Private is a take-down the author can undo: likes, comments and keeps are
 * kept. Going private asks first, because the post leaves the feed and the
 * profile at once; going public does not, because nothing is lost by it.
 * A post Virgo took down offers neither — only Virgo can put it back.
 */
export function usePrivacyToggle(item: Publishable) {
  const { setPublished } = useShowcaseActions();
  const [confirming, setConfirming] = useState(false);
  const status = showcaseStatus(item);
  const live = status === 'live';
  const available = status !== 'removed';

  const apply = (published: boolean) =>
    setPublished.mutate(
      { id: item.id, published },
      {
        onSuccess: () => {
          setConfirming(false);
          toast.success(published ? 'Public now' : 'Private now', {
            description: published
              ? item.visibility === 'connections'
                ? 'Your connections can see it again.'
                : 'It is on your profile and in the feed.'
              : 'Only you can see it. Its likes, comments and keeps are kept.',
          });
        },
        onError: (err) =>
          toast.error("Couldn't change that", { description: showcaseActionMessage(err, 'takedown') }),
      },
    );

  /** Private asks first; public goes straight away. */
  const request = () => {
    if (!available || setPublished.isPending) return;
    if (live) setConfirming(true);
    else apply(true);
  };

  const confirmElement = (
    <AlertDialog
      open={confirming}
      onOpenChange={(open) => !open && !setPublished.isPending && setConfirming(false)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Make this post private?</AlertDialogTitle>
          <AlertDialogDescription>
            Only you will see it. It leaves the feed and your profile until you make it public
            again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={setPublished.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={setPublished.isPending}
            onClick={(event) => {
              // Open until it settles, so a failure has somewhere to be said.
              event.preventDefault();
              apply(false);
            }}
          >
            {setPublished.isPending && <Loader2 className="size-4 animate-spin" />}
            Make private
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return {
    /** Whether there is anything to offer: not on a post Virgo took down. */
    available,
    live,
    label: live ? 'Make private' : publishLabel(item),
    pending: setPublished.isPending,
    request,
    confirmElement,
  };
}
