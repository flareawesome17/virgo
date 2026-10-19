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
import { DISCARD_BODY, DISCARD_TITLE, type useGuardedClose } from '@/lib/discard-guard';

/**
 * "Discard your changes?", over a form dialog closed with something typed in
 * it. The X, Cancel, Escape and a stray click on the overlay all ask first.
 */
export function DiscardChangesDialog({ guard }: { guard: ReturnType<typeof useGuardedClose> }) {
  return (
    <AlertDialog open={guard.asking} onOpenChange={(o) => !o && guard.keepEditing()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{DISCARD_TITLE}</AlertDialogTitle>
          <AlertDialogDescription>{DISCARD_BODY}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={guard.discard}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
