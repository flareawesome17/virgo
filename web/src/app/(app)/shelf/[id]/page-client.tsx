'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Bookmark, BookmarkX, CloudOff, Ellipsis, Eye, EyeOff, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { BackButton } from '@/components/back-button';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { showcaseActionMessage } from '@/components/showcase/action-message';
import { KeptGrid } from '@/components/showcase/kept-grid';
import { ShowcaseDialog } from '@/components/showcase/showcase-dialog';
import { ShowcaseHost } from '@/components/showcase/showcase-host';
import { useShelfActions, useShelfEntries, useShelves } from '@/hooks/useShowcases';
import { ApiError, type ShelfEntry } from '@/api';

/** The API answers "not yours" and "not there" alike, so ids cannot be probed. */
const isGone = (error: unknown) =>
  error instanceof ApiError && (error.status === 404 || error.status === 403);

/** The longest a shelf's name may be. */
const NAME_MAX = 60;

/**
 * One shelf: what is kept on it, as a contact sheet of square stills. A click
 * opens the post over the shelf, drawn as the feed draws it, crediting
 * whoever made it; the keeper's note on why they kept it goes with it.
 *
 * Your own shelf can be renamed, made private or public, and deleted here,
 * and anything on it taken off. Somebody else's (?own=0) is read through the
 * public route, which only ever returns public shelves.
 */
function Shelf() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const mine = params.get('own') !== '0';
  const nameParam = params.get('name');

  const { entries, isLoading, loadFailed, error, refetch } = useShelfEntries(id, { own: mine });
  // Your shelves are usually cached already (Taste lists them), and this is
  // what keeps the name and privacy current after a change here.
  const { shelves } = useShelves({ enabled: mine });
  const shelf = mine ? shelves.find((s) => s.id === id) : undefined;
  const title = shelf?.name ?? nameParam ?? 'Shelf';
  const { updateShelf, removeShelf, unkeep } = useShelfActions();

  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState<ShelfEntry | null>(null);

  const togglePrivacy = () => {
    if (!shelf) return;
    updateShelf.mutate(
      { id, isPublic: !shelf.isPublic },
      {
        onSuccess: () =>
          toast.success(shelf.isPublic ? 'Private now' : 'Public now', {
            description: shelf.isPublic
              ? 'Only you see this shelf.'
              : 'It shows on your profile, under Taste.',
          }),
        onError: (e) => toast.error("Couldn't change who sees it", { description: showcaseActionMessage(e, 'shelf') }),
      },
    );
  };

  const deleteShelf = () =>
    removeShelf.mutate(id, {
      onSuccess: () => {
        setDeleting(false);
        toast.success('Shelf deleted');
        router.replace('/profile?tab=taste');
      },
      onError: (e) => toast.error("Couldn't delete it", { description: showcaseActionMessage(e, 'shelf') }),
    });

  const takeOff = (entry: ShelfEntry) =>
    unkeep.mutate(
      { shelfId: id, showcaseId: entry.showcaseId },
      {
        onSuccess: () => {
          setOpen(null);
          toast.success(`Taken off ${title}`);
        },
        onError: (e) => toast.error("Couldn't take it off", { description: showcaseActionMessage(e, 'unkeep') }),
      },
    );

  return (
    <Screen title={title}>
      <ShowcaseHost>
        <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
          <BackButton fallback="/kept" />
        </div>
        <PageHeader
          title={title}
          description={
            shelf
              ? `${shelf.count} kept${shelf.isPublic ? '' : ' · Private, only you see it'}`
              : undefined
          }
          actions={
            shelf ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Shelf options">
                    <Ellipsis className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  <DropdownMenuItem onSelect={() => setRenaming(true)}>
                    <Pencil />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={togglePrivacy} disabled={updateShelf.isPending}>
                    {shelf.isPublic ? <EyeOff /> : <Eye />}
                    {shelf.isPublic ? 'Make private' : 'Make public'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                    <Trash2 />
                    Delete shelf
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : undefined
          }
        />

        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {isLoading ? (
            <CenteredSpinner />
          ) : loadFailed && entries.length === 0 && isGone(error) ? (
            // Deleted, or made private since the link was shared. Not a
            // connection problem, and a Try again could only fail again.
            <EmptyState
              icon={BookmarkX}
              title="This shelf is no longer available"
              description="Whoever made it deleted it or made it private."
            />
          ) : loadFailed && entries.length === 0 ? (
            <EmptyState
              icon={CloudOff}
              title="Could not load this shelf"
              description="Check your connection and try again."
              action={<Button onClick={() => void refetch()}>Try again</Button>}
            />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="Nothing on this shelf"
              description="Work kept here shows up with whoever made it. If they take a piece down, it leaves the shelf."
              action={
                mine ? (
                  <Button asChild>
                    <Link href="/feed">Open the feed</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <KeptGrid entries={entries} onOpen={setOpen} />
          )}
        </div>

        <ShowcaseDialog
          showcaseId={open?.showcaseId ?? null}
          onClose={() => setOpen(null)}
          note={open?.note}
          // Your own shelf only: somebody else's is theirs to tidy.
          removal={
            mine && shelf && open
              ? {
                  label: `Take off ${shelf.name}`,
                  pending: unkeep.isPending,
                  onRemove: () => takeOff(open),
                  always: true,
                }
              : undefined
          }
        />
      </ShowcaseHost>

      {shelf && (
        <RenameShelfDialog
          // A fresh form each opening, starting from the current name.
          key={renaming ? `open:${shelf.name}` : 'closed'}
          open={renaming}
          initial={shelf.name}
          pending={updateShelf.isPending}
          onCancel={() => setRenaming(false)}
          onSave={(name) => {
            if (name === shelf.name) {
              setRenaming(false);
              return;
            }
            updateShelf.mutate(
              { id, name },
              {
                onSuccess: () => setRenaming(false),
                onError: (e) => toast.error("Couldn't rename it", { description: showcaseActionMessage(e, 'shelf') }),
              },
            );
          }}
        />
      )}

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The shelf goes, and so does everything you kept on it. Nobody&rsquo;s work is touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeShelf.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeShelf.isPending}
              onClick={(event) => {
                event.preventDefault();
                deleteShelf();
              }}
            >
              {removeShelf.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}

function RenameShelfDialog({
  open,
  initial,
  pending,
  onCancel,
  onSave,
}: {
  open: boolean;
  initial: string;
  pending: boolean;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename shelf</DialogTitle>
          <DialogDescription>The name shows on your profile when the shelf is public.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-2 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed) onSave(trimmed);
          }}
        >
          <Label htmlFor="shelf-name">Shelf name</Label>
          <Input
            id="shelf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX}
            autoFocus
          />
          <button type="submit" hidden />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => trimmed && onSave(trimmed)} disabled={!trimmed || pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ShelfPage() {
  return (
    <Suspense fallback={null}>
      <Shelf />
    </Suspense>
  );
}
