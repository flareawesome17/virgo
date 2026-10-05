'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RetentionField } from '@/components/retention-field';
import {
  ApiError,
  retentionInput,
  retentionOf,
  retentionReady,
  retentionSummary,
  sameRetention,
  type Album,
  type Retention,
} from '@/api';
import { useUpdateAlbum } from '@/hooks/useAlbums';

/**
 * How long an album keeps its files, changed after it was made.
 *
 * It could only be chosen once, in the New album dialog, and the web album
 * page did not even say what had been chosen.
 */
export function RetentionDialog({
  album,
  open,
  onOpenChange,
}: {
  album: Album;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {/* Mounted only while open, so each opening starts from the album. */}
        <RetentionEditor album={album} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RetentionEditor({ album, onDone }: { album: Album; onDone: () => void }) {
  const update = useUpdateAlbum();
  const current = retentionOf(album);
  const [retention, setRetention] = useState<Retention>(current);

  const changed = !sameRetention(current, retention);
  const ready = changed && retentionReady(retention) && !update.isPending;

  const save = () =>
    update.mutate(
      { id: album.id, ...retentionInput(retention) },
      {
        onSuccess: () => {
          onDone();
          toast.success('Saved', { description: retentionSummary(retention) });
        },
        onError: (error) =>
          toast.error("Couldn't save it", {
            description: error instanceof ApiError && error.message ? error.message : 'Please try again.',
          }),
      },
    );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Keep the files</DialogTitle>
        <DialogDescription>Now: {retentionSummary(current)}</DialogDescription>
      </DialogHeader>
      <RetentionField value={retention} onChange={setRetention} />
      {retention.mode !== 'forever' && (
        <p className="text-xs text-muted-foreground">
          Anything already past it is removed in the next overnight clean-up, and you&rsquo;ll get a note
          saying how many files went. Removed files can&rsquo;t be brought back.
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!ready}>
          {update.isPending && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
