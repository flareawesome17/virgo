'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ApiError } from '@/api';
import { useOpeningKey } from '@/lib/discard-guard';
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

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What deleting it does, in a sentence or two. */
  description: string;
  confirmLabel?: string;
  /** The delete itself. */
  onConfirm: () => Promise<unknown>;
  /** After it went through; the dialog is closed by then. */
  onDone: () => void;
}

function messageOf(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) {
    return 'Too many tries. Wait a minute, then try again.';
  }
  return err instanceof Error && err.message ? err.message : 'Please try again.';
}

/**
 * "Delete X?", and nothing more: what deleting does, Cancel, and the button.
 *
 * For what a restore undoes: an album or a workspace goes to Recently deleted
 * for 30 days. Changing where a client's money goes still asks for the
 * password, through DeleteConfirmDialog, which this matches.
 *
 * It stays open while `onConfirm` runs, so a refusal is said here instead of
 * in a toast after it closed. Keyed on each opening, so no error is left over
 * from the last one.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const opening = useOpeningKey(props.open);
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ConfirmContent key={opening} {...props} />
    </AlertDialog>
  );
}

function ConfirmContent({
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  onDone,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
      return;
    }
    setBusy(false);
    onOpenChange(false);
    onDone();
  };

  return (
    <AlertDialogContent
      // Not while the delete is on its way: closing would hide its answer.
      onEscapeKeyDown={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          className="bg-destructive text-white hover:bg-destructive/90"
          disabled={busy}
          onClick={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
