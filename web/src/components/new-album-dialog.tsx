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
import { useCreateAlbum } from '@/hooks/useAlbums';
import { useWorkspaces } from '@/hooks/useWorkspaces';

/**
 * Creates an album and opens it.
 *
 * Lived inside the workspace page, which was the only place an album could be
 * made on the web. The albums list needs it too, where there is no workspace
 * in context — so without `workspaceId` it asks which workspace it belongs in.
 */
export function NewAlbumDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  /** The workspace to create it in; omitted, the dialog asks. */
  workspaceId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const create = useCreateAlbum();
  const { workspaces, isLoading } = useWorkspaces({ limit: 100 }, { enabled: open && !workspaceId });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  /** Days to keep the files. 'none' keeps them until deleted by hand. */
  const [retention, setRetention] = useState('none');
  const [chosenWorkspace, setChosenWorkspace] = useState<string | null>(null);
  const target = workspaceId ?? chosenWorkspace ?? workspaces[0]?.id ?? null;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || !target) return;
    create.mutate(
      {
        name: trimmed,
        description: description.trim() || null,
        workspace_id: target,
        retention_days: retention === 'none' ? null : Number(retention),
      },
      {
        onSuccess: (album) => {
          onOpenChange(false);
          setName('');
          setDescription('');
          setRetention('none');
          router.push(`/albums/${album.id}`);
        },
        onError: (err: Error) => toast.error('Could not create album', { description: err.message }),
      },
    );
  };

  const noWorkspace = !workspaceId && !isLoading && workspaces.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New album</DialogTitle>
          <DialogDescription>Albums hold the media for one shoot or one delivery.</DialogDescription>
        </DialogHeader>

        {noWorkspace ? (
          <div className="py-2 text-sm text-muted-foreground">
            An album lives inside a workspace, and you do not have one yet.{' '}
            <Link href="/workspaces" className="font-medium text-primary underline-offset-4 hover:underline">
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
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              <Label htmlFor="album-retention">Keep files for</Label>
              <Select value={retention} onValueChange={setRetention}>
                <SelectTrigger id="album-retention">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Until I delete them</SelectItem>
                  <SelectItem value="30">30 days after upload</SelectItem>
                  <SelectItem value="60">60 days after upload</SelectItem>
                  <SelectItem value="90">90 days after upload</SelectItem>
                  <SelectItem value="180">180 days after upload</SelectItem>
                  <SelectItem value="365">1 year after upload</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {retention === 'none'
                  ? 'Files stay until you remove them.'
                  : `Each file is deleted ${retention} days after it is uploaded. This cannot be undone.`}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || !target || create.isPending}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Create album
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
