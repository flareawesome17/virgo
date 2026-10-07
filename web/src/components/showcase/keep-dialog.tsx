'use client';

import { useState } from 'react';
import { Bookmark, Check, Globe, Loader2, Lock, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/states';
import { useShelfActions, useShelves } from '@/hooks/useShowcases';
import { makerOf, type FeedItem } from '@/api';
import { cn } from '@/lib/utils';
import { showcaseActionMessage } from './action-message';
import { shelfCoverUrls } from './kept-grid';

/** Matches the server's limits. */
const SHELF_NAME_LIMIT = 60;
const NOTE_LIMIT = 200;

/**
 * Keeping somebody's work on a shelf: the phone's Keep sheet, as a dialog.
 *
 * A shelf is a named group — the grouping is the taste, not the saving. And a
 * note on why you kept it is the part worth reading later; a bare save is a
 * number.
 *
 * What is kept is a pointer, never a copy. The dialog says so, because people
 * are right to wonder what happens to their work when a stranger keeps it.
 *
 * It also takes things off again, and moves them. The shelves come back
 * saying which already hold this showcase; choosing one of those asks, then
 * removes it, and choosing another offers to move it there or keep it on both.
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
  // left to say it failed.
  const actions = useShelfActions();
  const busy =
    actions.keep.isPending || actions.createShelf.isPending || actions.unkeep.isPending;

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-md">
        {shown && (
          <KeepBody
            key={shown.opened}
            item={shown.item}
            open={item !== null}
            actions={actions}
            busy={busy}
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
  onClose,
  onKept,
}: {
  item: FeedItem;
  open: boolean;
  actions: ReturnType<typeof useShelfActions>;
  busy: boolean;
  onClose: () => void;
  onKept?: (shelf: { id: string; name: string }) => void;
}) {
  const { shelves, isLoading, loadFailed, refetch } = useShelves({
    holding: item.id,
    enabled: open,
  });
  const { keep, unkeep, createShelf } = actions;
  const keptOn = shelves.filter((shelf) => shelf.holds);
  // Never read straight off the payload: see makerOf.
  const maker = makerOf(item);

  const [chosen, setChosen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [takingOff, setTakingOff] = useState<{ id: string; name: string } | null>(null);

  const takeOff = () => {
    if (!takingOff) return;
    const shelf = takingOff;
    setTakingOff(null);
    unkeep.mutate(
      // Still "Kept" on the card if another shelf has it too.
      { shelfId: shelf.id, showcaseId: item.id, stillKept: keptOn.length > 1 },
      {
        onSuccess: () => toast.success(`Taken off ${shelf.name}`),
        onError: (error) => toast.error(showcaseActionMessage(error, 'unkeep')),
      },
    );
  };

  const addShelf = () => {
    const name = newName.trim();
    if (!name || createShelf.isPending) return;
    createShelf.mutate(
      { name },
      {
        onSuccess: (result) => {
          setNaming(false);
          setNewName('');
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
   * Moving is keeping on the chosen shelf and then taking it off every shelf
   * that held it, in that order: a failure part way leaves it kept twice,
   * which is fixable from here, rather than kept nowhere, which loses it.
   */
  const [moving, setMoving] = useState(false);
  const move = async () => {
    if (!chosen || busy || moving) return;
    const shelf = shelves.find((s) => s.id === chosen);
    setMoving(true);
    try {
      await keep.mutateAsync({
        shelfId: chosen,
        showcaseId: item.id,
        note: note.trim() || undefined,
        alreadyKept: true,
      });
    } catch (error) {
      setMoving(false);
      toast.error(showcaseActionMessage(error, 'keep'));
      return;
    }
    try {
      for (const from of keptOn) {
        await unkeep.mutateAsync({ shelfId: from.id, showcaseId: item.id, stillKept: true });
      }
      if (shelf) {
        onKept?.({ id: shelf.id, name: shelf.name });
        toast.success(`Moved to ${shelf.name}`);
      }
      onClose();
    } catch (error) {
      toast.error(`Kept to ${shelf?.name ?? 'that shelf'}, but still on the old one too`, {
        description: showcaseActionMessage(error, 'unkeep'),
      });
    } finally {
      setMoving(false);
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
        alreadyKept: keptOn.length > 0,
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

  return (
    <>
      <DialogHeader>
        {/* Opened on something already kept, it starts by saying where. */}
        <DialogTitle>
          {keptOn.length > 0
            ? `Kept on ${keptOn.map((shelf) => shelf.name).join(', ')}`
            : 'Keep it on a shelf'}
        </DialogTitle>
        <DialogDescription>
          {keptOn.length > 0
            ? 'Choose another shelf to move it there, or take it off a shelf it is on. '
            : ''}
          What you keep always credits {maker.displayName}. They can take the work down; it is
          never copied out of their hands.
        </DialogDescription>
      </DialogHeader>

      <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2">
        {isLoading ? (
          <div className="grid place-items-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : loadFailed && shelves.length === 0 ? (
          // Not "no shelves": that offered only New shelf, and a second shelf
          // of the same name is how a failed load turned into clutter.
          <ErrorState message="Couldn't load your shelves." onRetry={() => void refetch()} />
        ) : (
          <div className="grid gap-1">
            {shelves.map((shelf) => {
              const on = chosen === shelf.id;
              const holds = Boolean(shelf.holds);
              return (
                <button
                  key={shelf.id}
                  type="button"
                  onClick={() =>
                    holds ? setTakingOff({ id: shelf.id, name: shelf.name }) : setChosen(shelf.id)
                  }
                  disabled={busy || moving}
                  aria-pressed={on || holds}
                  className={cn(
                    'flex min-h-14 items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                    on && 'bg-secondary hover:bg-secondary',
                  )}
                >
                  <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                    {shelfCoverUrls(shelf)[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a still from the media host; see PieceImage
                      <img
                        src={shelfCoverUrls(shelf)[0]}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Bookmark className="size-4 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{shelf.name}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {shelf.isPublic ? <Globe className="size-3" /> : <Lock className="size-3" />}
                      {holds ? 'Kept here · ' : ''}
                      {shelf.count} kept · {shelf.isPublic ? 'Public' : 'Private'}
                    </span>
                    {holds && <span className="sr-only">Choose to take it off this shelf.</span>}
                  </span>
                  {/* Said in words: a tick read as "chosen", and choosing a
                      ticked shelf taking the work off it surprised people. */}
                  {holds && (
                    <span
                      aria-hidden
                      className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold text-muted-foreground"
                    >
                      Take off
                    </span>
                  )}
                  {on && (
                    <span className="grid size-6 place-items-center rounded-full bg-action text-action-foreground">
                      <Check className="size-3.5" />
                    </span>
                  )}
                </button>
              );
            })}

            {naming ? (
              <form
                className="grid gap-2 px-2 pt-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addShelf();
                }}
              >
                <Label htmlFor="new-shelf-name" className="sr-only">
                  Shelf name
                </Label>
                <Input
                  id="new-shelf-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name it for what it teaches you"
                  maxLength={SHELF_NAME_LIMIT}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setNaming(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={!newName.trim() || createShelf.isPending}
                  >
                    {createShelf.isPending ? 'Adding…' : 'Add shelf'}
                  </Button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setNaming(true)}
                disabled={busy}
                className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted">
                  <Plus className="size-4 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">New shelf</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Group it with the rest of what you keep
                  </span>
                </span>
              </button>
            )}
          </div>
        )}

        {chosen && (
          <div className="grid gap-2 px-2 pt-4">
            <Label
              htmlFor="keep-note"
              className="text-[11px] font-bold uppercase tracking-wide text-primary"
            >
              Why this one
            </Label>
            <Input
              id="keep-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional, and shown on your shelf"
              maxLength={NOTE_LIMIT}
            />
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => !busy && !moving && onClose()} disabled={busy || moving}>
          Cancel
        </Button>
        {keptOn.length > 0 ? (
          // Already kept somewhere: the choice is whether this shelf is
          // instead of that one, or as well as it.
          <>
            <Button variant="secondary" onClick={confirm} disabled={!chosen || busy || moving}>
              Also keep here
            </Button>
            <Button onClick={() => void move()} disabled={!chosen || busy || moving}>
              {moving && <Loader2 className="animate-spin" />}
              {moving ? 'Moving…' : 'Move here'}
            </Button>
          </>
        ) : (
          <Button onClick={confirm} disabled={!chosen || busy}>
            {keep.isPending && <Loader2 className="animate-spin" />}
            {keep.isPending ? 'Keeping…' : 'Keep it'}
          </Button>
        )}
      </DialogFooter>

      <AlertDialog open={takingOff !== null} onOpenChange={(o) => !o && setTakingOff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take it off {takingOff?.name}?</AlertDialogTitle>
            <AlertDialogDescription>It stays in the feed and on their profile.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={takeOff}>
              Take off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
