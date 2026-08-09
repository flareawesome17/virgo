'use client';

import { useState } from 'react';
import { Users, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/states';
import {
  useCollaboratorInvitations,
  useRespondToInvitation,
} from '@/hooks/useCollaborators';
import type { MediaAccess } from '@/api';

/**
 * The access levels, in the order they escalate.
 *
 * Labelled by what the person can do rather than by the stored value: "Can
 * download" is a sentence somebody can check against their intention, where
 * "download" on its own reads like a button.
 */
export const MEDIA_ACCESS_OPTIONS: { value: MediaAccess; label: string }[] = [
  { value: 'view', label: 'Can view' },
  { value: 'download', label: 'Can download' },
  { value: 'upload', label: 'Can add media' },
  { value: 'manage', label: 'Can add and delete' },
];

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  photographer: 'Photographer',
  editor: 'Editor',
  reviewer: 'Reviewer',
  client: 'Client',
};

/**
 * Workspace invitations waiting on an answer.
 *
 * This used to live on the Network page, which is where you go to find people
 * — not where you go to find your work. A workspace you have been invited to
 * is invisible until you accept, so an invitation sitting somewhere you never
 * look reads exactly like nothing having happened at all. It belongs above the
 * list it will join.
 *
 * Renders nothing at all when there is nothing pending: an empty "no
 * invitations" panel above every workspace would be permanent furniture built
 * for a rare event.
 */
export function WorkspaceInvitations() {
  const { invitations, loadFailed, refetch } = useCollaboratorInvitations();
  const respond = useRespondToInvitation();
  const [acting, setActing] = useState<string | null>(null);

  const answer = (id: string, name: string | null, accept: boolean) => {
    setActing(id);
    respond.mutate(
      { id, accept },
      {
        onSuccess: () =>
          toast.success(
            accept
              ? `You joined ${name ?? 'the workspace'}`
              : 'Invitation declined',
          ),
        onError: (error: Error) => toast.error(error.message),
        onSettled: () => setActing(null),
      },
    );
  };

  // A failed lookup must not look like an empty inbox — the whole point of
  // this section is that a missed invitation is indistinguishable from silence.
  if (loadFailed) {
    return (
      <section className="mb-6">
        <ErrorState
          message="Could not load your invitations."
          onRetry={() => refetch()}
        />
      </section>
    );
  }

  if (invitations.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {invitations.length === 1
          ? '1 pending invitation'
          : `${invitations.length} pending invitations`}
      </h2>
      <Card>
        <CardContent className="p-0">
          <ul>
            {invitations.map((invitation) => {
              const busy = acting === invitation.id;
              return (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-0"
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10">
                    <Users className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {invitation.workspace_name ?? 'A workspace'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {invitation.inviter_name ?? 'Someone'} invited you as{' '}
                      {ROLE_LABELS[invitation.role] ?? invitation.role}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        answer(invitation.id, invitation.workspace_name, false)
                      }
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <X className="size-4" />
                      )}
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        answer(invitation.id, invitation.workspace_name, true)
                      }
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      Accept
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
