'use client';

import { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/states';
import { WorkspaceTile } from '@/components/workspaces/bits';
import {
  useCollaboratorInvitations,
  useRespondToInvitation,
} from '@/hooks/useCollaborators';
import { invitationOffer } from '@/lib/workspaces';

/**
 * Workspace invitations waiting on an answer, each saying what accepting
 * would give you: the role, the albums on offer, and what you could do in
 * them. Deciding whether to join without that was deciding blind.
 *
 * Above the list it would join, because a workspace you have been invited to
 * is invisible until you accept — an invitation somewhere you never look
 * reads exactly like nothing having happened.
 *
 * Renders nothing when there is nothing pending: an empty "no invitations"
 * panel above every workspace would be permanent furniture for a rare event.
 */
export function WorkspaceInvitations() {
  const { invitations, loadFailed, refetch } = useCollaboratorInvitations();
  const respond = useRespondToInvitation();
  const [acting, setActing] = useState<{ id: string; accept: boolean } | null>(null);

  const answer = (id: string, name: string | null, accept: boolean) => {
    setActing({ id, accept });
    respond.mutate(
      { id, accept },
      {
        onSuccess: () =>
          toast.success(accept ? `You joined ${name ?? 'the workspace'}` : 'Invitation declined'),
        onError: (error: Error) => toast.error(error.message),
        onSettled: () => setActing(null),
      },
    );
  };

  // A failed lookup must not look like an empty inbox — the whole point of
  // this section is that a missed invitation is indistinguishable from silence.
  if (loadFailed) {
    return (
      <section>
        <ErrorState message="Could not load your invitations." onRetry={() => refetch()} />
      </section>
    );
  }

  if (invitations.length === 0) return null;

  return (
    <section aria-label="Invitations" className="flex flex-col gap-3">
      {invitations.map((invitation) => {
        const busy = acting?.id === invitation.id;
        const workspace = invitation.workspace_name ?? 'a workspace';
        return (
          <div
            key={invitation.id}
            className="flex flex-wrap items-center gap-3.5 rounded-2xl border bg-card px-4 py-3.5"
          >
            <WorkspaceTile name={workspace} color={invitation.workspace_color ?? '#B66A40'} />
            <div className="min-w-0 flex-1 basis-64">
              <p className="text-sm font-semibold">
                {invitation.inviter_name ?? 'Someone'} invited you to {workspace}
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{invitationOffer(invitation)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => answer(invitation.id, invitation.workspace_name, false)}
              >
                {busy && !acting?.accept ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                Decline
              </Button>
              <Button
                disabled={busy}
                onClick={() => answer(invitation.id, invitation.workspace_name, true)}
              >
                {busy && acting?.accept ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Accept
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
