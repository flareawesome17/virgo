'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { RetentionField } from '@/components/retention-field';
import { retentionInput, retentionReady, type Retention } from '@/api';
import { useCreateAlbum } from '@/hooks/useAlbums';
import { useUsage } from '@/hooks/useUsage';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import {
  DISCARD_BODY,
  DISCARD_TITLE,
  useDiscardGuard,
  useGuardedClose,
  useOpeningKey,
} from '@/lib/discard-guard';

type NewAlbumDialogProps = {
  /** The workspace to create it in; omitted, the dialog asks. */
  workspaceId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Creates an album and opens it.
 *
 * Lived inside the workspace page, which was the only place an album could be
 * made on the web. The albums list needs it too, where there is no workspace
 * in context — so without `workspaceId` it asks which workspace it belongs in.
 */
export function NewAlbumDialog(props: NewAlbumDialogProps) {
  // A fresh form for every opening. It stayed mounted between uses, so a
  // name typed and cancelled was still there next time — and "Discard"
  // has to mean it.
  const opening = useOpeningKey(props.open);
  return <NewAlbumForm key={opening} {...props} />;
}

function NewAlbumForm({ workspaceId, open, onOpenChange }: NewAlbumDialogProps) {
  const router = useRouter();
  const create = useCreateAlbum();
  // Only your own: an album can only be made in a workspace you own, and one
  // shared with you ended in "Unknown workspace" after the form was filled.
  const { workspaces: listed, isLoading } = useWorkspaces(
    { limit: 100, orderBy: 'name', direction: 'asc' },
    { enabled: open },
  );
  const workspaces = listed.filter((w) => w.is_owner);
  const { usage, isAlbumLimitReached, albumLimit } = useUsage();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [retention, setRetention] = useState<Retention>({ mode: 'forever' });
  const [chosenWorkspace, setChosenWorkspace] = useState<string | null>(null);
  const target = workspaceId ?? chosenWorkspace ?? workspaces[0]?.id ?? null;
  const targetWorkspace = listed.find((w) => w.id === target);
  // Per workspace, as the plan counts it: this one is full, not all of them.
  const full = !!targetWorkspace && isAlbumLimitReached(targetWorkspace.album_total);

  const { dirty } = useDiscardGuard({ name, description, retention, chosenWorkspace }, open);
  // Escape, the overlay, the X and Cancel ask first. Creating closes directly.
  const guard = useGuardedClose(dirty, onOpenChange);
  const close = guard.close;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || !target || full || !retentionReady(retention)) return;
    create.mutate(
      {
        name: trimmed,
        description: description.trim() || null,
        workspace_id: target,
        ...retentionInput(retention),
      },
      {
        onSuccess: (album) => {
          onOpenChange(false);
          router.push(`/albums/${album.id}`);
        },
        onError: (err: Error) => toast.error('Could not create album', { description: err.message }),
      },
    );
  };

  const noWorkspace = !workspaceId && !isLoading && workspaces.length === 0;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New album</DialogTitle>
          <DialogDescription>Albums hold the media for one shoot or one delivery.</DialogDescription>
        </DialogHeader>

        {noWorkspace ? (
          <div className="py-2 text-sm text-muted-foreground">
            An album lives inside a workspace, and you do not have one yet.{' '}
            {/* Straight into the new-workspace form, not the list. */}
            <Link href="/workspaces?new=1" className="font-medium text-primary underline-offset-4 hover:underline">
              Create a workspace
            </Link>{' '}
            first.
          </div>
        ) : (
          <div className="grid gap-4 py-2">
            {!workspaceId && (
              <div className="grid gap-2">
                <Label htmlFor="album-workspace">Workspace</Label>
                <Select value={target ?? undefined} onValueChange={setChosenWorkspace}>
                  <SelectTrigger id="album-workspace">
                    <SelectValue placeholder={isLoading ? 'Loading…' : 'Choose a workspace'} />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.name}
                        {isAlbumLimitReached(workspace.album_total) ? ' — full' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {full && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                {targetWorkspace?.name} has {albumLimit} album{albumLimit === 1 ? '' : 's'}, the most the{' '}
                {usage?.plan ?? 'free'} plan allows in one workspace.{' '}
                <Link href="/settings/plans" className="font-medium underline-offset-4 hover:underline">
                  See plans
                </Link>
              </p>
            )}
            <div className="grid gap-2">
              <Label htmlFor="album-name">Name</Label>
              <Input
                id="album-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Reyes × Tan Wedding"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="album-description">Description</Label>
              <Textarea
                id="album-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
                rows={3}
              />
            </div>

            {/* Matches the mobile album form. Without it, a setting that
                permanently deletes a client's files could only be chosen on a
                phone — and only reversed there too. */}
            <div className="grid gap-2">
              <Label>Keep the files</Label>
              <RetentionField value={retention} onChange={setRetention} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!name.trim() || !target || full || !retentionReady(retention) || create.isPending}
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Create album
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
