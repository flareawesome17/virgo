'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog } from '@/components/ui/dialog';
import { DiscardChangesDialog } from '@/components/discard-changes-dialog';
import { FORM_INPUT, FORM_SUBMIT, FORM_TEXTAREA, FormField, FormNotice } from '@/components/kit';
import { FORM_FIELD_FILL, FormDialogContent } from '@/components/schedule/form-dialog';
import { useUsage } from '@/hooks/useUsage';
import { useCreateWorkspace } from '@/hooks/useWorkspaces';
import { ACCENT_COLORS } from '@/lib/workspaces';
import type { Workspace } from '@/api';
import { useDiscardGuard, useGuardedClose, useOpeningKey } from '@/lib/discard-guard';
import { cn } from '@/lib/utils';

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

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/**
 * "This is your third workspace. Free includes three.": said while making
 * the last one a plan includes, so the limit is met here and not on the next
 * try. In words up to ten, where a plan's count reads as a sentence.
 */
function lastOneLine(plan: string, limit: number): string {
  const name = plan.charAt(0).toUpperCase() + plan.slice(1);
  if (limit > ORDINALS.length) return `This is workspace ${limit} of the ${limit} that ${name} includes.`;
  return `This is your ${ORDINALS[limit - 1]} workspace. ${name} includes ${NUMBERS[limit - 1]}.`;
}

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
  // The same reading the Create menu and the Workspaces page hold their own
  // buttons to, so the form never disagrees with the way into it.
  const { usage, atWorkspaceLimit } = useUsage();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(ACCENT_COLORS[0].hex);
  const { dirty } = useDiscardGuard({ name, description, color }, open);
  // Escape, the overlay and the X ask first. Creating closes directly.
  const guard = useGuardedClose(dirty, onOpenChange);
  const close = guard.close;

  const plan = usage?.plan ?? 'free';
  const limit = usage?.workspaces.limit ?? null;
  const lastOne = limit != null && !atWorkspaceLimit && (usage?.workspaces.used ?? 0) + 1 === limit;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || atWorkspaceLimit || create.isPending) return;
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
      <FormDialogContent
        title="New workspace"
        description="A workspace holds the albums, schedule and people for one client or one strand of work."
        footer={
          <Button
            type="button"
            className={FORM_SUBMIT}
            onClick={submit}
            disabled={!name.trim() || atWorkspaceLimit || create.isPending}
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Create workspace
          </Button>
        }
      >
        <FormField label="Name" htmlFor="ws-name">
          <Input
            id="ws-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ana & Marco Wedding"
            className={cn(FORM_INPUT, FORM_FIELD_FILL)}
            autoFocus
            maxLength={200}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        </FormField>

        <FormField label="About it" htmlFor="ws-description" optional>
          <Textarea
            id="ws-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Who it is for, and what you are making"
            rows={3}
            maxLength={2000}
            className={cn(FORM_TEXTAREA, FORM_FIELD_FILL)}
          />
        </FormField>

        <FormField label="Colour" hint="Shown on its tile until it has a cover photo.">
          <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-3 p-0.5">
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
                  className="size-8 rounded-full outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50"
                  style={{
                    backgroundColor: c.hex,
                    // A dark ring, not the swatch's own colour: the chosen
                    // one is told apart by the ring, whatever it holds.
                    boxShadow: on ? '0 0 0 2px var(--background), 0 0 0 4px var(--foreground)' : undefined,
                  }}
                />
              );
            })}
          </div>
        </FormField>

        {/* The ways into this form already stop at the limit. Said here too,
            for a count that changed while the form was open. */}
        {atWorkspaceLimit ? (
          <FormNotice>
            You have every workspace your plan includes. The {plan} plan includes {limit} workspace
            {limit === 1 ? '' : 's'}. Archived ones count too, so delete one you have finished with to
            add another.
          </FormNotice>
        ) : lastOne && limit != null ? (
          <FormNotice>{lastOneLine(plan, limit)}</FormNotice>
        ) : null}
      </FormDialogContent>

      <DiscardChangesDialog guard={guard} />
    </Dialog>
  );
}
