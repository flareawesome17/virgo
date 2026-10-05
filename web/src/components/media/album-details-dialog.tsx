'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { useUpdateAlbum } from '@/hooks/useAlbums';
import {
  DISCARD_BODY,
  DISCARD_TITLE,
  useDiscardGuard,
  useGuardedClose,
  useOpeningKey,
} from '@/lib/discard-guard';

/** UpdateAlbumDto's limits. */
const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  albumId: string;
  name: string;
  description: string | null;
};

/**
 * An album's name and description, after it was made.
 *
 * The web could set both only when creating the album, so a typo in the name
 * stayed on every share link. The phone has had this as "Edit name and
 * description"; it is owner-only there and on the server, and so here.
 */
export function AlbumDetailsDialog(props: Props) {
  // A fresh form for each opening, filled from the album as it is now.
  const opening = useOpeningKey(props.open);
  return <AlbumDetailsForm key={opening} {...props} />;
}

function AlbumDetailsForm({ open, onOpenChange, albumId, name: savedName, description: savedDescription }: Props) {
  const update = useUpdateAlbum();
  const [name, setName] = useState(savedName);
  const [description, setDescription] = useState(savedDescription ?? '');
  const { dirty } = useDiscardGuard({ name, description }, open);
  const guard = useGuardedClose(dirty, onOpenChange);

  const trimmed = name.trim();
  const changed = trimmed !== savedName || description.trim() !== (savedDescription ?? '').trim();

  const save = () => {
    if (!trimmed || !changed || update.isPending) return;
    update.mutate(
      { id: albumId, name: trimmed, description: description.trim() },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast.success('Album saved');
        },
        onError: (err: Error) => toast.error('Could not save the album', { description: err.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={guard.close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit name and description</DialogTitle>
          <DialogDescription>
            The name is what clients see on the share link.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="album-name">Name</Label>
            <Input
              id="album-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX}
              autoFocus
            />
            {!trimmed && <p className="text-xs text-destructive">An album needs a name.</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="album-description">Description</Label>
            <Textarea
              id="album-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESCRIPTION_MAX}
              rows={4}
              placeholder="Optional"
            />
          </div>
          {/* Inside the form so Enter in the name saves. */}
          <button type="submit" hidden />
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => guard.close(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!trimmed || !changed || update.isPending}>
            {update.isPending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>

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
    </Dialog>
  );
}
