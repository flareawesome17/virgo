'use client';

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
import { DISCARD_BODY, DISCARD_TITLE, useDiscardQuestion } from '@/lib/discard-guard';

/**
 * "Discard your changes?" for a page left with something typed in it.
 *
 * Mounted once, at the root, and asked through askToDiscard: a link clicked on
 * a dirty page, or the page's own Back.
 */
export function DiscardPrompt() {
  const { asking, keepEditing, discard } = useDiscardQuestion();
  return (
    <AlertDialog open={asking} onOpenChange={(open) => !open && keepEditing()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{DISCARD_TITLE}</AlertDialogTitle>
          <AlertDialogDescription>{DISCARD_BODY}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={discard}>
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
