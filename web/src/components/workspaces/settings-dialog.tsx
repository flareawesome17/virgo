'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Archive, ArchiveRestore, Check, Loader2, Trash2 } from 'lucide-react';
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
import { useDeleteWorkspace, useUpdateWorkspace } from '@/hooks/useWorkspaces';
import type { Album, Workspace } from '@/api';
import { ACCENT_COLORS, deleteConsequence } from '@/lib/workspaces';

/** The cover select's value for "no album chosen". */
const NEWEST = 'newest';

/**
 * Everything about a workspace that is its owner's to change: its name,
 * description, colour and cover; archiving it; deleting it.
 *
 * The colour was only choosable on the phone, and only when the workspace was
 * made. Deleting said the media would go with it, which was not true — the
 * files stay in the owner's library, unsorted — so someone could keep a
 * workspace they wanted gone for fear of losing work that was never at risk.
 */
export function WorkspaceSettingsDialog({
  workspace,
  albums,
  open,
  onOpenChange,
}: {
  workspace: Workspace;
  /** The workspace's albums, for the cover. */
  albums: Album[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const update = useUpdateWorkspace();
  const remove = useDeleteWorkspace();

  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description ?? '');
  const [color, setColor] = useState(workspace.accent_color);
  const [cover, setCover] = useState(workspace.cover_album_id ?? NEWEST);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Refilled on each opening, so a cancelled edit is not waiting next time.
  const [filledFor, setFilledFor] = useState(open);
  if (open !== filledFor) {
    setFilledFor(open);
    if (open) {
      setName(workspace.name);
      setDescription(workspace.description ?? '');
      setColor(workspace.accent_color);
      setCover(workspace.cover_album_id ?? NEWEST);
    }
  }

  const withCovers = albums.filter((a) => a.cover_url);
  const coverUrl =
    cover === NEWEST ? withCovers[0]?.cover_url : albums.find((a) => a.id === cover)?.cover_url;
  const archived = !!workspace.archived_at;

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    update.mutate(
      {
        id: workspace.id,
        name: trimmed,
        description: description.trim() || null,
        accent_color: color,
        cover_album_id: cover === NEWEST ? null : cover,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast.success('Saved');
        },
        onError: (err: Error) => toast.error('Could not save', { description: err.message }),
      },
    );
  };

  const setArchived = (next: boolean) =>
    update.mutate(
      { id: workspace.id, archived: next },
      {
        onSuccess: () => {
          onOpenChange(false);
          if (next) {
            toast.success(`${workspace.name} is archived`, {
              description: 'Find it under Archived on your workspaces. Albums and sharing are as they were.',
            });
            router.push('/workspaces');
          } else {
            toast.success(`${workspace.name} is back in your list`);
          }
        },
        onError: (err: Error) => toast.error('Could not change that', { description: err.message }),
      },
    );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Workspace settings</DialogTitle>
            <DialogDescription>Only you can change these. Members see the result.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="ws-settings-name">Name</Label>
              <Input
                id="ws-settings-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ws-settings-description">Description</Label>
              <Textarea
                id="ws-settings-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
                rows={2}
                maxLength={2000}
              />
            </div>

            <div className="flex flex-wrap gap-5">
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">Colour</legend>
                <div role="radiogroup" aria-label="Colour" className="grid w-44 grid-cols-4 gap-2">
                  {ACCENT_COLORS.map((c) => {
                    const on = c.hex.toLowerCase() === color.toLowerCase();
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={c.name}
                        title={c.name}
                        onClick={() => setColor(c.hex)}
                        className="grid size-8 place-items-center rounded-full transition-shadow"
                        style={{
                          backgroundColor: c.hex,
                          // A ring in the colour itself, set off by the page:
                          // the chosen swatch reads as chosen on any theme.
                          boxShadow: on ? `0 0 0 2px var(--background), 0 0 0 4px ${c.hex}` : undefined,
                        }}
                      >
                        {on && <Check className="size-4 text-white" />}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid min-w-0 flex-1 gap-2">
                <Label htmlFor="ws-settings-cover">Cover</Label>
                <div className="flex items-center gap-3">
                  <span
                    className="h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-muted"
                    style={coverUrl ? undefined : { backgroundColor: `${color}26` }}
                  >
                    {coverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={coverUrl} alt="" className="size-full object-cover" />
                    )}
                  </span>
                  <Select value={cover} onValueChange={setCover}>
                    <SelectTrigger id="ws-settings-cover" className="min-w-0 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NEWEST}>The newest album’s</SelectItem>
                      {withCovers.map((album) => (
                        <SelectItem key={album.id} value={album.id}>
                          From {album.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-secondary p-3">
              {archived ? (
                <ArchiveRestore className="size-5 shrink-0 text-secondary-foreground" />
              ) : (
                <Archive className="size-5 shrink-0 text-secondary-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{archived ? 'Archived' : 'Archive'}</p>
                <p className="text-xs text-muted-foreground">
                  {archived
                    ? 'Out of your list since the job finished. Bring it back to work in it again.'
                    : 'Moves it out of your list when the job is done. Albums and sharing stay as they are.'}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={update.isPending}
                onClick={() => setArchived(!archived)}
              >
                {archived ? 'Bring back' : 'Archive'}
              </Button>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-destructive/30 p-3">
              <Trash2 className="size-5 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-destructive">Delete workspace</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {deleteConsequence(workspace)}
                </p>
              </div>
              <Button size="sm" variant="destructive" onClick={() => setConfirmingDelete(true)}>
                Delete…
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!name.trim() || update.isPending}>
              {update.isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {workspace.name}?</AlertDialogTitle>
            <AlertDialogDescription>{deleteConsequence(workspace)} This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() =>
                remove.mutate(workspace.id, {
                  onSuccess: () => {
                    toast.success(`${workspace.name} is deleted`, {
                      description: 'Its files stay in your library and still count toward your storage.',
                    });
                    router.replace('/workspaces');
                  },
                  onError: (err: Error) => toast.error('Could not delete', { description: err.message }),
                })
              }
            >
              Delete workspace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
