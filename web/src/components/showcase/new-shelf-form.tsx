'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FORM_INPUT, FormCard, FormField } from '@/components/kit';
import { useShelfActions } from '@/hooks/useShowcases';
import { cn } from '@/lib/utils';
import { showcaseActionMessage } from './action-message';
import { RadioRow } from './radio-row';

/** Matches the server's limit on a shelf's name. */
const SHELF_NAME_LIMIT = 60;

/**
 * The frame of the Keep dialog and of New shelf: the page's own colour, so
 * the white fields and cards in it read as fields and cards.
 */
export const SHELF_DIALOG =
  'flex max-h-[90dvh] flex-col gap-1 overflow-hidden rounded-[20px] bg-background px-4 pb-4 pt-2 sm:max-w-[440px]';

/** A button across the foot of those dialogs. */
export const SHELF_FOOT_BUTTON = 'h-11 flex-1 rounded-xl px-4 text-sm font-semibold';

/**
 * The button a dialog over the feed is for. Dark, not terracotta: the page
 * under it already has its one terracotta button.
 */
export const DARK_BUTTON = 'bg-foreground text-background hover:bg-foreground/85';

/**
 * The quiet button beside it. The pale tile's fill rather than the secondary
 * button's own, which on the page's colour, where these dialogs sit, is too
 * close to it to read as a button.
 */
export const QUIET_BUTTON = 'bg-muted text-foreground hover:bg-muted/70';

/**
 * Making a shelf: its name, and who sees it. The phone's NewShelfForm.
 *
 * Who sees it is asked here rather than left for later. A shelf was always
 * made public, and one meant for a client's eyes only sat on the profile
 * until its owner found the menu that hides it.
 *
 * It fills a dialog and leaves the making to whoever shows it: the Keep
 * dialog goes on to choose the new shelf, the Taste tab only closes. With
 * `onCancel` there is a list to go back to, and a Cancel that goes there.
 */
export function NewShelfForm({
  onCancel,
  onSubmit,
  pending,
}: {
  onCancel?: () => void;
  onSubmit: (shelf: { name: string; isPublic: boolean }) => void;
  /** While the shelf is being made. */
  pending: boolean;
}) {
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const ready = name.trim().length > 0 && !pending;

  return (
    <form
      className="flex min-h-0 flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSubmit({ name: name.trim(), isPublic });
      }}
    >
      <div className="flex min-h-[52px] shrink-0 items-center gap-2 pl-1">
        <DialogTitle className="min-w-0 flex-1 truncate text-[17px] font-bold leading-6 tracking-tight">
          New shelf
        </DialogTitle>
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="shrink-0 rounded-[10px]"
            aria-label="Close"
          >
            <X />
          </Button>
        </DialogClose>
      </div>
      <DialogDescription className="sr-only">
        Name the shelf and choose who sees it.
      </DialogDescription>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 pb-1">
        <FormField label="Name" htmlFor="new-shelf-name" hint="Name it for what it teaches you.">
          <Input
            id="new-shelf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={SHELF_NAME_LIMIT}
            autoFocus
            className={cn(FORM_INPUT, 'bg-card')}
          />
        </FormField>

        <div className="flex flex-col gap-1.5">
          <p id="new-shelf-audience" className="text-sm font-semibold">
            Who sees the shelf
          </p>
          <div role="radiogroup" aria-labelledby="new-shelf-audience">
            <FormCard>
              <RadioRow
                name="new-shelf-audience"
                checked={isPublic}
                onSelect={() => setIsPublic(true)}
                disabled={pending}
                label="Public"
                detail="On your profile, under Taste"
              />
              <RadioRow
                name="new-shelf-audience"
                checked={!isPublic}
                onSelect={() => setIsPublic(false)}
                disabled={pending}
                label="Private"
                detail="Only you"
              />
            </FormCard>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 pt-3">
        {onCancel ? (
          <Button
            type="button"
            variant="secondary"
            className={cn(SHELF_FOOT_BUTTON, QUIET_BUTTON)}
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
        ) : null}
        <Button type="submit" className={cn(SHELF_FOOT_BUTTON, DARK_BUTTON)} disabled={!ready}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? 'Adding…' : 'Add shelf'}
        </Button>
      </div>
    </form>
  );
}

/**
 * A new shelf, made from the Taste tab rather than on the way to keeping
 * something. The same form the Keep dialog shows; here there is nothing to
 * go on to, so it closes once the shelf exists.
 */
export function NewShelfDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createShelf } = useShelfActions();
  const pending = createShelf.isPending;

  // Counted, and the form keyed by it, so each opening starts empty while the
  // one closing keeps what it shows until it has gone.
  const [wasOpen, setWasOpen] = useState(open);
  const [opened, setOpened] = useState(open ? 1 : 0);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpened(opened + 1);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent showCloseButton={false} className={SHELF_DIALOG}>
        {opened > 0 && (
          <NewShelfForm
            key={opened}
            pending={pending}
            onSubmit={(shelf) =>
              createShelf.mutate(shelf, {
                onSuccess: () => onClose(),
                onError: (error) => toast.error(showcaseActionMessage(error, 'shelf')),
              })
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
