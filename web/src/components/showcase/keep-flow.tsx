'use client';

import { useCallback, useState } from 'react';
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
      const toastId = toast(`Kept to ${last.name}`, {
        icon: <Bookmark className="size-4" />,
        duration: TOAST_MS,
        action: {
          label: 'Change',
          // Marked kept, so the dialog opens on where it is rather than
          // offering to keep it for the first time.
          onClick: () => setDialogItem({ ...item, keptByMe: true }),
        },
      });
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
    [userId, keepMutate],
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
