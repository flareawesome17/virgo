'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { DiscardChangesDialog } from '@/components/discard-changes-dialog';
import { useCreateWorkspace } from '@/hooks/useWorkspaces';
import { ACCENT_COLORS } from '@/lib/workspaces';
import type { Workspace } from '@/api';
import { useDiscardGuard, useGuardedClose, useOpeningKey } from '@/lib/discard-guard';

type CreateWorkspaceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Where to go once it exists. Absent, the new workspace opens; the Create
   * menu passes its own, which stays put when the page beneath has unsaved
   * work.
   */
  onCreated?: (workspace: Workspace) => void;
};

/**
 * A fresh form for every opening. It stayed mounted between uses, so a name
 * typed and cancelled was still waiting next time — and "Discard" has to
 * mean it.
 */
export function CreateWorkspaceDialog(props: CreateWorkspaceDialogProps) {
  const opening = useOpeningKey(props.open);
  return <CreateWorkspaceForm key={opening} {...props} />;
}

function CreateWorkspaceForm({ open, onOpenChange, onCreated }: CreateWorkspaceDialogProps) {
  const router = useRouter();
  const create = useCreateWorkspace();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(ACCENT_COLORS[0].hex);
  const { dirty } = useDiscardGuard({ name, description, color }, open);
  // Escape, the overlay, the X and Cancel ask first. Creating closes directly.
  const guard = useGuardedClose(dirty, onOpenChange);
  const close = guard.close;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, description: description.trim() || null, accent_color: color },
      {
        onSuccess: (workspace) => {
          onOpenChange(false);
          if (onCreated) onCreated(workspace);
          else router.push(`/workspaces/${workspace.id}`);
        },
        onError: (err: Error) => toast.error('Could not create workspace', {
          description: err.message,
        }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>
            A workspace holds the albums, schedule and people for one client or
            one strand of work.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Reyes Wedding"
              autoFocus
              maxLength={200}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ws-description">Description</Label>
            <Textarea
              id="ws-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={3}
              maxLength={2000}
            />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Colour</legend>
            <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
              {ACCENT_COLORS.map((c) => {
                const on = c.hex === color;
                return (
                  <button
                    key={c.hex}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={c.name}
                    title={c.name}
                    onClick={() => setColor(c.hex)}
                    className="size-7 rounded-full"
                    style={{
                      backgroundColor: c.hex,
                      boxShadow: on ? `0 0 0 2px var(--background), 0 0 0 4px ${c.hex}` : undefined,
                    }}
                  />
                );
              })}
            </div>
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || create.isPending}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Create workspace
          </Button>
        </DialogFooter>
      </DialogContent>

      <DiscardChangesDialog guard={guard} />
    </Dialog>
  );
}
