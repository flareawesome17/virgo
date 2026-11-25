'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark } from 'lucide-react';
import { toast } from 'sonner';
import { useShelfActions } from '@/hooks/useShowcases';
import { ApiError, type FeedItem } from '@/api';
import { clearLastShelf, getLastShelf, setLastShelf } from '@/lib/last-shelf';
import { showcaseActionMessage } from './action-message';
import { KeepDialog } from './keep-dialog';

/** How long "Kept to …" stays up. Long enough to read and reach Change. */
const TOAST_MS = 4000;

/**
 * Keep, in one click — the phone's flow.
 *
 * Every Keep opening a dialog to choose a shelf is a chore for somebody with
 * one shelf who keeps everything on it. So Keep goes to the shelf used last,
 * at once, and says where — "Kept to Light · Change" — with Change opening
 * the dialog for another shelf, a note, or to take it off. The first Keep, a
 * Keep on something already kept, and a Keep whose shelf has since gone all
 * open the dialog instead.
 *
 * Takes the signed-in user's id rather than reading it, because the last
 * shelf is per account and the page already has it. Returns the handler and
 * the dialog, which the page renders once for every card on it.
 */
export function useKeepFlow(userId: string | undefined) {
  const router = useRouter();
  const { keep } = useShelfActions();
  const keepMutate = keep.mutate;
  const [dialogItem, setDialogItem] = useState<FeedItem | null>(null);

  const onKeep = useCallback(
    (item: FeedItem) => {
      // Already kept: the dialog is where it is moved or taken off.
      if (item.keptByMe || !userId) {
        setDialogItem(item);
        return;
      }
      const last = getLastShelf(userId);
      if (!last) {
        setDialogItem(item);
        return;
      }
      const toastId = toast.custom(
        (id) => (
          <KeptBar
            shelf={last.name}
            onChange={() => {
              toast.dismiss(id);
              // Marked kept, so the dialog opens on where it is rather than
              // offering to keep it for the first time.
              setDialogItem({ ...item, keptByMe: true });
            }}
            // Where it went. A keep led nowhere: shelves could not be opened.
            onView={() => {
              toast.dismiss(id);
              router.push(`/shelf/${last.id}`);
            }}
          />
        ),
        // In the middle, under the post it is about, not in the corner with
        // the messages about everything else.
        { duration: TOAST_MS, position: 'bottom-center' },
      );
      keepMutate(
        { shelfId: last.id, showcaseId: item.id },
        {
          onError: (err) => {
            toast.dismiss(toastId);
            // The shelf has gone since: forget it, and ask where instead.
            if (err instanceof ApiError && err.status === 404) {
              clearLastShelf(userId);
              setDialogItem(item);
              return;
            }
            toast.error(showcaseActionMessage(err, 'keep'));
          },
        },
      );
    },
    [userId, keepMutate, router],
  );

  const element = (
    <KeepDialog
      item={dialogItem}
      onClose={() => setDialogItem(null)}
      onKept={(shelf) => {
        if (userId) setLastShelf(userId, shelf);
      }}
    />
  );

  return { onKeep, element };
}

/**
 * "Kept to Light I like": where a one-click Keep went, on the dark bar the
 * selection bar and the upload dock use, with the two things to do about it.
 *
 * The outer box is as wide as the toaster's own column, which is what the
 * toaster centres; the bar sits in the middle of that at its own width.
 */
function KeptBar({
  shelf,
  onChange,
  onView,
}: {
  shelf: string;
  onChange: () => void;
  onView: () => void;
}) {
  return (
    <div className="flex w-(--width) max-w-[calc(100vw-2rem)] justify-center">
      <div className="flex min-h-12 max-w-full items-center gap-3 rounded-[14px] bg-foreground pl-4 pr-2 text-sm text-background shadow-[0_12px_32px_rgb(0_0_0/0.3)]">
        <Bookmark aria-hidden className="size-4 shrink-0" fill="currentColor" />
        <span className="min-w-0 truncate">
          Kept to <span className="font-semibold">{shelf}</span>
        </span>
        <button
          type="button"
          onClick={onChange}
          className="h-8 shrink-0 rounded-lg bg-background/10 px-2.5 text-[13px] font-semibold outline-none transition-colors hover:bg-background/20 focus-visible:ring-3 focus-visible:ring-background/40"
        >
          Change
        </button>
        {/* The brand accent, not `primary`: on this inverted bar primary is
            the wrong way round in both themes, dark on dark and pale on pale. */}
        <button
          type="button"
          onClick={onView}
          className="h-8 shrink-0 rounded-lg px-2.5 text-[13px] font-semibold text-brand-accent outline-none transition-colors hover:bg-background/10 focus-visible:ring-3 focus-visible:ring-background/40"
        >
          View shelf
        </button>
      </div>
    </div>
  );
}
