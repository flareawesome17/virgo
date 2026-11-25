'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog } from '@/components/ui/dialog';
import { DiscardChangesDialog } from '@/components/discard-changes-dialog';
import {
  FORM_INPUT,
  FORM_SUBMIT,
  FORM_TEXTAREA,
  FormCard,
  FormField,
  FormNotice,
  FormSection,
} from '@/components/kit';
import { RetentionField } from '@/components/retention-field';
import { FORM_FIELD_FILL, FormDialogContent, FormSelectRow } from '@/components/schedule/form-dialog';
import { retentionInput, retentionReady, type Album, type Retention } from '@/api';
import { useCreateAlbum } from '@/hooks/useAlbums';
import { useUsage } from '@/hooks/useUsage';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useDiscardGuard, useGuardedClose, useOpeningKey } from '@/lib/discard-guard';
import { cn } from '@/lib/utils';

type NewAlbumDialogProps = {
  /** The workspace to create it in; omitted, the dialog asks. */
  workspaceId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Where to go once it exists. Absent, the album opens; the Create menu
   * passes its own, which stays put when the page beneath has unsaved work.
   */
  onCreated?: (album: Album) => void;
};

/**
 * The three choices of RetentionField, drawn as the form's other cards are:
 * white, on the card's radius and hairline. From outside, because the album's
 * own settings use the same field and keep its look.
 */
const RETENTION_AS_CARD =
  '[&>div>[role=radiogroup]]:rounded-2xl [&>div>[role=radiogroup]]:border-border/60 [&>div>[role=radiogroup]]:bg-card';

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

function NewAlbumForm({ workspaceId, open, onOpenChange, onCreated }: NewAlbumDialogProps) {
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
  // Escape, the overlay and the X ask first. Creating closes directly.
  const guard = useGuardedClose(dirty, onOpenChange);
  const close = guard.close;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || !target || full || !retentionReady(retention) || create.isPending) return;
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
          if (onCreated) onCreated(album);
          else router.push(`/albums/${album.id}`);
        },
        onError: (err: Error) => toast.error('Could not create album', { description: err.message }),
      },
    );
  };

  const noWorkspace = !workspaceId && !isLoading && workspaces.length === 0;

  return (
    <Dialog open={open} onOpenChange={close}>
      <FormDialogContent
        title="New album"
        description="Albums hold the media for one shoot or one delivery."
        footer={
          <Button
            type="button"
            className={FORM_SUBMIT}
            onClick={submit}
            disabled={!name.trim() || !target || full || !retentionReady(retention) || create.isPending}
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Create album
          </Button>
        }
      >
        {noWorkspace ? (
          <p className="py-2 text-sm text-muted-foreground">
            An album lives inside a workspace, and you do not have one yet.{' '}
            {/* Straight into the new-workspace form, not the list. */}
            <Link href="/workspaces?new=1" className="font-medium text-primary underline-offset-4 hover:underline">
              Create a workspace
            </Link>{' '}
            first.
          </p>
        ) : (
          <>
            {/* The name first. The workspace led, and it is already chosen
                whenever the form is opened from one. */}
            <FormField label="Name" htmlFor="album-name">
              <Input
                id="album-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ceremony"
                className={cn(FORM_INPUT, FORM_FIELD_FILL)}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </FormField>

            {!workspaceId && (
              <FormSection title="Where it goes">
                <FormCard>
                  <FormSelectRow
                    id="album-workspace"
                    label="Workspace"
                    value={target ?? undefined}
                    onValueChange={setChosenWorkspace}
                    display={targetWorkspace?.name ?? (isLoading ? 'Loading…' : 'Choose a workspace')}
                    placeholder={!targetWorkspace}
                    options={workspaces.map((workspace) => ({
                      value: workspace.id,
                      label: `${workspace.name}${isAlbumLimitReached(workspace.album_total) ? ' — full' : ''}`,
                    }))}
                  />
                </FormCard>
              </FormSection>
            )}

            {full && (
              <FormNotice>
                {targetWorkspace?.name} has {albumLimit} album{albumLimit === 1 ? '' : 's'}, the most the{' '}
                {usage?.plan ?? 'free'} plan allows in one workspace.{' '}
                <Link href="/settings/plans" className="font-semibold text-primary underline-offset-4 hover:underline">
                  See plans
                </Link>
              </FormNotice>
            )}

            <FormField label="About it" htmlFor="album-description" optional>
              <Textarea
                id="album-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A line your team will see"
                rows={3}
                className={cn(FORM_TEXTAREA, FORM_FIELD_FILL)}
              />
            </FormField>

            {/* Matches the mobile album form. Without it, a setting that
                permanently deletes a client's files could only be chosen on a
                phone — and only reversed there too. */}
            <FormSection title="Keep the files">
              <div className={RETENTION_AS_CARD}>
                <RetentionField value={retention} onChange={setRetention} />
              </div>
            </FormSection>
          </>
        )}
      </FormDialogContent>

      <DiscardChangesDialog guard={guard} />
    </Dialog>
  );
}
