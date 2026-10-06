'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Bookmark, BookmarkX, CloudOff, Ellipsis, Eye, EyeOff, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { useShelfActions, useShelfEntries, useShelves } from '@/hooks/useShowcases';
import { ApiError, makerOf, type ShelfEntry } from '@/api';

/** The API answers "not yours" and "not there" alike, so ids cannot be probed. */
const isGone = (error: unknown) =>
  error instanceof ApiError && (error.status === 404 || error.status === 403);

/** The longest a shelf's name may be. */
const NAME_MAX = 60;

/**
 * One shelf.
 *
 * Every kept thing names whoever made it and links to their showcase: that
 * credit is why keeping somebody's work is something they benefit from rather
 * than something done to them. The note underneath is the keeper's own.
 *
 * Your own shelf can be renamed, made private or public, and deleted here,
 * and anything on it removed. Somebody else's (?own=0) is read through the
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
  const [removing, setRemoving] = useState<ShelfEntry | null>(null);

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

  const removeEntry = () => {
    if (!removing) return;
    unkeep.mutate(
      { shelfId: id, showcaseId: removing.showcaseId },
      {
        onSuccess: () => setRemoving(null),
        onError: (e) => toast.error("Couldn't take it off", { description: showcaseActionMessage(e, 'unkeep') }),
      },
    );
  };

  return (
    <Screen title={title}>
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

      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => {
              const maker = makerOf(entry);
              return (
                <Card key={entry.showcaseId} className="gap-0 overflow-hidden py-0">
                  <Link
                    href={`/showcase/${entry.showcaseId}`}
                    aria-label={entry.title ?? `${maker.displayName}'s showcase`}
                    className="group relative block aspect-[4/3] overflow-hidden bg-muted"
                  >
                    <Image
                      src={entry.url}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 300px"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </Link>
                  <div className="p-3.5">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                        {maker.displayName.charAt(0).toUpperCase()}
                      </span>
                      {maker.handle ? (
                        <Link
                          href={`/u/${maker.handle}`}
                          className="min-w-0 flex-1 truncate text-xs font-bold hover:underline"
                        >
                          {maker.displayName}
                        </Link>
                      ) : (
                        <p className="min-w-0 flex-1 truncate text-xs font-bold">{maker.displayName}</p>
                      )}
                      {mine && shelf && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-my-1 h-7 px-2 text-xs text-primary"
                          onClick={() => setRemoving(entry)}
                          aria-label={`Remove ${entry.title ?? 'this'} from the shelf`}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    {entry.title && (
                      <Link
                        href={`/showcase/${entry.showcaseId}`}
                        className="mt-2 block truncate text-sm font-semibold hover:underline"
                      >
                        {entry.title}
                      </Link>
                    )}
                    {entry.craftTags.length > 0 && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {entry.craftTags.slice(0, 3).join(' · ')}
                      </p>
                    )}
                    {entry.note && (
                      <p className="mt-2 border-l-2 pl-2.5 text-xs italic leading-relaxed text-muted-foreground">
                        {entry.note}
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

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

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removing?.title ? `“${removing.title}”` : 'this'} from this shelf?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It stays on {removing ? makerOf(removing).displayName : 'its maker'}&rsquo;s profile.
              You can keep it again from there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unkeep.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={unkeep.isPending}
              onClick={(event) => {
                event.preventDefault();
                removeEntry();
              }}
            >
              {unkeep.isPending && <Loader2 className="size-4 animate-spin" />}
              Remove
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
