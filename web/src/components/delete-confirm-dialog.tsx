'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import type { DeleteProof } from '@/api';
import { useDeleteProof } from '@/hooks/useDeleteProof';
import { useOpeningKey } from '@/lib/discard-guard';
import { Input } from '@/components/ui/input';
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

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What deleting it does, in a sentence or two. */
  description: string;
  confirmLabel?: string;
  onConfirm: (proof: DeleteProof) => Promise<unknown>;
  /** After the delete went through; the dialog is closed by then. */
  onDone: () => void;
}

/**
 * "Delete X?", with the password — and, with two-factor on, the code emailed
 * for it — before anything goes.
 *
 * A confirmation alone used to be enough, and one click on one deleted a
 * workspace from a session a stranger had signed in to (2026-10-25).
 *
 * `onConfirm` is the delete itself, given what the server asks for; the steps
 * between are useDeleteProof's, shared with the phone. The dialog stays open
 * while it runs, so a wrong password or an expired code is said here, with
 * the field still filled, instead of in a toast after it closed.
 *
 * The fields are keyed on each opening, so a password never waits in memory
 * for the next delete.
 */
export function DeleteConfirmDialog(props: DeleteConfirmDialogProps) {
  const opening = useOpeningKey(props.open);
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <DeleteConfirmContent key={opening} {...props} />
    </AlertDialog>
  );
}

function DeleteConfirmContent({
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  onDone,
}: DeleteConfirmDialogProps) {
  const form = useDeleteProof();
  const [showPassword, setShowPassword] = useState(false);

  const value = form.step === 'password' ? form.password : form.code;
  const ready = value.trim().length > 0 && !form.busy;
  const label = form.step === 'password' && form.twoFactor ? 'Continue' : confirmLabel;

  const submit = async () => {
    if (!ready) return;
    if (await form.submit(onConfirm)) {
      onOpenChange(false);
      onDone();
    }
  };

  return (
    <AlertDialogContent
      // Not while the delete is on its way: closing would hide its answer.
      onEscapeKeyDown={(event) => {
        if (form.busy) event.preventDefault();
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>

      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {form.step === 'password' ? (
          <>
            <label htmlFor="delete-password" className="text-sm font-medium">
              Your password
            </label>
            <div className="relative">
              <Input
                id="delete-password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => form.setPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="delete-code" className="text-sm font-medium">
              The code from the email
            </label>
            <Input
              id="delete-code"
              value={form.code}
              onChange={(e) => form.setCode(e.target.value)}
              autoComplete="one-time-code"
              placeholder="Email or recovery code"
              autoFocus
            />
          </>
        )}

        {form.notice ? (
          <p className="text-xs text-muted-foreground">{form.notice}</p>
        ) : form.step === 'password' && form.twoFactor ? (
          <p className="text-xs text-muted-foreground">
            Two-factor is on, so we will email you a code next.
          </p>
        ) : null}
        {form.step === 'code' && (
          <button
            type="button"
            onClick={() => void form.resend()}
            disabled={form.busy}
            className="justify-self-start text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            Send a new code
          </button>
        )}
        {form.error && (
          <p role="alert" className="text-sm text-destructive">
            {form.error}
          </p>
        )}
      </form>

      <AlertDialogFooter>
        <AlertDialogCancel disabled={form.busy}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          className="bg-destructive text-white hover:bg-destructive/90"
          disabled={!ready}
          onClick={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {form.busy && <Loader2 className="size-4 animate-spin" />}
          {label}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
