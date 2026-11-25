'use client';

import { useId, useState } from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FORM_INPUT, FormField } from '@/components/kit';
import { ErrorState } from '@/components/states';
import { useShelfActions, useShelves } from '@/hooks/useShowcases';
import { makerOf, type FeedItem, type ShelfSummary } from '@/api';
import { cn } from '@/lib/utils';
import { showcaseActionMessage } from './action-message';
import { ShelfMosaic, shelfCoverUrls } from './kept-grid';
import {
  DARK_BUTTON,
  NewShelfForm,
  QUIET_BUTTON,
  SHELF_DIALOG,
  SHELF_FOOT_BUTTON,
} from './new-shelf-form';

/** Matches the server's limit. */
const NOTE_LIMIT = 200;

/** A shelf in the list: its cover, its name, and at the end what can be done with it. */
const ROW =
  'flex min-h-[68px] items-center gap-3 rounded-xl px-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 disabled:opacity-60';
/** The shelf chosen: a card on the page's colour. */
const ROW_CHOSEN = 'bg-card ring-1 ring-inset ring-border/60 hover:bg-card';

type Named = { id: string; name: string };

/**
 * Keeping somebody's work on a shelf: the phone's Keep sheet, as a dialog.
 *
 * A shelf is a named group — the grouping is the taste, not the saving. And a
 * note on why you kept it is the part worth reading later; a bare save is a
 * number.
 *
 * What is kept is a pointer, never a copy, so whose it is stays under the
 * title the whole time.
 *
 * It also takes things off again, and moves them. The shelves come back
 * saying which already hold this showcase. Those say "Kept here", and every
 * other one offers Move here: kept there, taken off where it was. Choosing
 * another instead keeps it on both. Take it off, beside the title, takes it
 * off every shelf it is on.
 *
 * A new shelf is made in the dialog, in place of the list, and comes back
 * chosen: naming a shelf and keeping to it is one errand.
 */
export function KeepDialog({
  item,
  onClose,
  onKept,
}: {
  /** The showcase being kept; null when the dialog is closed. */
  item: FeedItem | null;
  onClose: () => void;
  /** Where it went, so the next Keep can go there in one tap. */
  onKept?: (shelf: { id: string; name: string }) => void;
}) {
  /*
   * What the dialog draws, which outlives `item` by the length of the closing
   * animation — and a count of how many times it has opened, which keys the
   * body so each showcase starts fresh. Last time's shelf and last time's
   * reason are about the last photograph, not this one.
   */
  const [previous, setPrevious] = useState(item);
  const [shown, setShown] = useState<{ item: FeedItem; opened: number } | null>(
    item ? { item, opened: 1 } : null,
  );
  if (item !== previous) {
    setPrevious(item);
    if (item) setShown({ item, opened: (shown?.opened ?? 0) + 1 });
  }

  // Held here rather than in the body, so a click outside or Escape cannot
  // close the dialog with a request still on its way — there would be nowhere
  // left to say it failed. Moving, and taking it off several shelves, are
  // requests one after another with a moment between them when none is
  // pending, so those say so themselves.
  const actions = useShelfActions();
  const [working, setWorking] = useState(false);
  const busy =
    working ||
    actions.keep.isPending ||
    actions.createShelf.isPending ||
    actions.unkeep.isPending;

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        showCloseButton={false}
        className={SHELF_DIALOG}
        // The dialog itself rather than its first control, which on
        // something already kept is Take it off.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
        }}
      >
        {shown && (
          <KeepBody
            key={shown.opened}
            item={shown.item}
            open={item !== null}
            actions={actions}
            busy={busy}
            setWorking={setWorking}
            onClose={onClose}
            onKept={onKept}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function KeepBody({
  item,
  open,
  actions,
  busy,
  setWorking,
  onClose,
  onKept,
}: {
  item: FeedItem;
  open: boolean;
  actions: ReturnType<typeof useShelfActions>;
  busy: boolean;
  setWorking: (working: boolean) => void;
  onClose: () => void;
  onKept?: (shelf: { id: string; name: string }) => void;
}) {
  const { shelves, isLoading, loadFailed, refetch } = useShelves({
    holding: item.id,
    enabled: open,
  });
  const { keep, unkeep, createShelf } = actions;
  const keptOn = shelves.filter((shelf) => shelf.holds);
  const kept = keptOn.length > 0;
  // Known to be kept before the shelves say where.
  const keptSomewhere = kept || (isLoading && item.keptByMe);
  // Never read straight off the payload: see makerOf.
  const maker = makerOf(item);

  const [chosen, setChosen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [naming, setNaming] = useState(false);
  const [movingTo, setMovingTo] = useState<string | null>(null);
  // What is being asked about outlives the question by its closing
  // animation, so the words do not empty on the way out.
  const [takingOff, setTakingOff] = useState<{ from: Named[]; thenClose: boolean } | null>(null);
  const [asking, setAsking] = useState(false);

  const askToTakeOff = (from: Named[], thenClose: boolean) => {
    setTakingOff({ from, thenClose });
    setAsking(true);
  };

  const takeOff = async () => {
    if (!takingOff) return;
    const { from, thenClose } = takingOff;
    const before = keptOn.length;
    setAsking(false);
    setWorking(true);
    try {
      for (const [i, shelf] of from.entries()) {
        await unkeep.mutateAsync({
          shelfId: shelf.id,
          showcaseId: item.id,
          // Still "Kept" on the card while another shelf has it.
          stillKept: before - (i + 1) > 0,
        });
      }
      toast.success(
        from.length === 1 ? `Taken off ${from[0].name}` : `Taken off ${from.length} shelves`,
      );
      if (thenClose) onClose();
    } catch (error) {
      toast.error(showcaseActionMessage(error, 'unkeep'));
    } finally {
      setWorking(false);
    }
  };

  const addShelf = ({ name, isPublic }: { name: string; isPublic: boolean }) => {
    if (createShelf.isPending) return;
    createShelf.mutate(
      { name, isPublic },
      {
        onSuccess: (result) => {
          setNaming(false);
          // Select what was just made, so naming a shelf and keeping to it is
          // one gesture rather than two.
          const made = result.data.find((s) => s.name.toLowerCase() === name.toLowerCase());
          if (made) setChosen(made.id);
        },
        onError: (error) => toast.error(showcaseActionMessage(error, 'shelf')),
      },
    );
  };

  /*
   * Moving is keeping on the new shelf and then taking it off every shelf
   * that held it, in that order: a failure part way leaves it kept twice,
   * which is fixable from here, rather than kept nowhere, which loses it.
   */
  const move = async (to: ShelfSummary) => {
    if (busy) return;
    const from = keptOn;
    setWorking(true);
    setMovingTo(to.id);
    try {
      await keep.mutateAsync({
        shelfId: to.id,
        showcaseId: item.id,
        note: note.trim() || undefined,
        alreadyKept: true,
      });
    } catch (error) {
      setWorking(false);
      setMovingTo(null);
      toast.error(showcaseActionMessage(error, 'keep'));
      return;
    }
    try {
      for (const old of from) {
        await unkeep.mutateAsync({ shelfId: old.id, showcaseId: item.id, stillKept: true });
      }
      onKept?.({ id: to.id, name: to.name });
      toast.success(`Moved to ${to.name}`);
      onClose();
    } catch (error) {
      toast.error(`Kept to ${to.name}, but still on the old one too`, {
        description: showcaseActionMessage(error, 'unkeep'),
      });
    } finally {
      setWorking(false);
      setMovingTo(null);
    }
  };

  const confirm = () => {
    if (!chosen || busy) return;
    const shelf = shelves.find((s) => s.id === chosen);
    keep.mutate(
      {
        shelfId: chosen,
        showcaseId: item.id,
        note: note.trim() || undefined,
        alreadyKept: kept,
      },
      {
        onSuccess: () => {
          if (shelf) {
            onKept?.({ id: shelf.id, name: shelf.name });
            toast.success(`Kept to ${shelf.name}`);
          }
          onClose();
        },
        onError: (error) => toast.error(showcaseActionMessage(error, 'keep')),
      },
    );
  };

  if (naming) {
    return (
      <NewShelfForm
        onCancel={() => setNaming(false)}
        onSubmit={addShelf}
        pending={createShelf.isPending}
      />
    );
  }

  return (
    <>
      <div className="flex min-h-[52px] shrink-0 items-center gap-2 pl-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Opened on something already kept, it starts by saying where. */}
          <DialogTitle className="line-clamp-2 text-[17px] font-bold leading-6 tracking-tight">
            {kept
              ? `Kept on ${keptOn.map((shelf) => shelf.name).join(', ')}`
              : keptSomewhere
                ? 'Kept'
                : 'Keep it on a shelf'}
          </DialogTitle>
          <DialogDescription className="truncate text-[13px] leading-[18px]">
            {[item.title, `by ${maker.displayName}`].filter(Boolean).join(' · ')}
          </DialogDescription>
        </div>
        {kept && (
          <button
            type="button"
            onClick={() => askToTakeOff(keptOn, true)}
            disabled={busy}
            className="shrink-0 rounded-md px-1 text-[13px] font-semibold text-destructive outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            Take it off
          </button>
        )}
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

      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {isLoading ? (
          <div className="grid place-items-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : loadFailed && shelves.length === 0 ? (
          // Not "no shelves": that offered only New shelf, and a second shelf
          // of the same name is how a failed load turned into clutter.
          <div className="px-1">
            <ErrorState message="Couldn't load your shelves." onRetry={() => void refetch()} />
          </div>
        ) : (
          <>
            {shelves.map((shelf) => (
              <ShelfRow
                key={shelf.id}
                shelf={shelf}
                state={shelf.holds ? 'here' : kept ? 'elsewhere' : 'nowhere'}
                on={chosen === shelf.id}
                busy={busy}
                moving={movingTo === shelf.id}
                onChoose={() => setChosen(shelf.id)}
                onTakeOff={() => askToTakeOff([shelf], false)}
                onMove={() => void move(shelf)}
              />
            ))}
            <button
              type="button"
              onClick={() => setNaming(true)}
              disabled={busy}
              className={cn(ROW, 'min-h-14 text-[15px] font-semibold text-secondary-foreground')}
            >
              <span className="grid size-[52px] shrink-0 place-items-center rounded-[10px] border-[1.5px] border-dashed border-muted-foreground/40">
                <Plus aria-hidden className="size-[18px]" />
              </span>
              New shelf
            </button>
          </>
        )}

        {chosen && (
          <FormField label="Why this one" htmlFor="keep-note" optional className="px-2 pb-1 pt-3">
            <Input
              id="keep-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Shown on your shelf"
              maxLength={NOTE_LIMIT}
              className={cn(FORM_INPUT, 'bg-card')}
            />
          </FormField>
        )}
      </div>

      <div className="flex shrink-0 gap-2 pt-2">
        {keptSomewhere ? (
          // Already kept somewhere: Move here is on each shelf's own row, so
          // what is left to ask is whether the one chosen is as well as it.
          <>
            <Button
              variant="secondary"
              className={cn(SHELF_FOOT_BUTTON, QUIET_BUTTON)}
              onClick={confirm}
              disabled={!chosen || busy}
            >
              {keep.isPending && movingTo === null && <Loader2 className="animate-spin" />}
              {/* "Both" is two; a third shelf is another. */}
              {keptOn.length > 1 ? 'Keep here too' : 'Keep on both'}
            </Button>
            <Button
              className={cn(SHELF_FOOT_BUTTON, DARK_BUTTON)}
              onClick={onClose}
              disabled={busy}
            >
              Done
            </Button>
          </>
        ) : (
          <Button
            className={cn(SHELF_FOOT_BUTTON, DARK_BUTTON)}
            onClick={confirm}
            disabled={!chosen || busy}
          >
            {keep.isPending && <Loader2 className="animate-spin" />}
            {keep.isPending ? 'Keeping…' : 'Keep it'}
          </Button>
        )}
      </div>

      <AlertDialog open={asking} onOpenChange={(o) => !o && setAsking(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {takingOff && takingOff.from.length > 1
                ? 'Take it off your shelves?'
                : `Take it off ${takingOff?.from[0]?.name ?? 'this shelf'}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {takingOff && takingOff.from.length > 1
                ? `It is on ${takingOff.from.map((shelf) => shelf.name).join(', ')}. `
                : ''}
              It stays in the feed and on their profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void takeOff()}>
              Take off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * One shelf in the list. What its end offers depends on where the post is:
 * on this shelf it says so, and choosing it asks to take it off; on another,
 * Move here; on none yet, the row is simply the choice.
 */
function ShelfRow({
  shelf,
  state,
  on,
  busy,
  moving,
  onChoose,
  onTakeOff,
  onMove,
}: {
  shelf: ShelfSummary;
  state: 'here' | 'elsewhere' | 'nowhere';
  /** The one chosen to keep it on. */
  on: boolean;
  busy: boolean;
  /** Being moved to this shelf right now. */
  moving: boolean;
  onChoose: () => void;
  onTakeOff: () => void;
  onMove: () => void;
}) {
  const nameId = useId();
  const about = (
    <>
      <ShelfMosaic urls={shelfCoverUrls(shelf)} className="w-[52px] shrink-0 rounded-[10px]" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={nameId} className="truncate text-[15px] font-semibold leading-5">
          {shelf.name}
        </span>
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {shelf.count} kept · {shelf.isPublic ? 'Public' : 'Private'}
        </span>
      </span>
    </>
  );

  if (state === 'here') {
    return (
      <button type="button" onClick={onTakeOff} disabled={busy} aria-pressed className={ROW}>
        {about}
        {/* Said in words: a tick alone read as "chosen", and choosing a
            ticked shelf taking the work off it surprised people. */}
        <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-success">
          Kept here
          <Check aria-hidden className="size-3.5" strokeWidth={2.6} />
        </span>
        <span className="sr-only">Choose to take it off this shelf.</span>
      </button>
    );
  }

  if (state === 'elsewhere') {
    return (
      // Two buttons side by side, not one inside the other: the row chooses
      // the shelf, to keep it on both, and Move here moves it at once.
      <div className={cn(ROW, on && ROW_CHOSEN)}>
        <button
          type="button"
          onClick={onChoose}
          disabled={busy}
          aria-pressed={on}
          className="flex min-w-0 flex-1 items-center gap-3 self-stretch rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {about}
        </button>
        <Button
          type="button"
          variant="secondary"
          onClick={onMove}
          disabled={busy}
          aria-describedby={nameId}
          className={cn('h-8 shrink-0 rounded-[10px] px-3.5 text-sm font-semibold', QUIET_BUTTON)}
        >
          {moving && <Loader2 className="animate-spin" />}
          Move here
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onChoose}
      disabled={busy}
      aria-pressed={on}
      className={cn(ROW, on && ROW_CHOSEN)}
    >
      {about}
      {/* Dark when chosen, like a chip: terracotta is the button's. */}
      <span
        aria-hidden
        className={cn(
          'grid size-[22px] shrink-0 place-items-center rounded-full',
          on ? 'bg-foreground text-background' : 'border-2 border-muted-foreground/40',
        )}
      >
        {on && <Check className="size-3" strokeWidth={3} />}
      </span>
    </button>
  );
}
