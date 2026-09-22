import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useState } from 'react';
import { useCollaboratorInvitations, useRespondToInvitation } from '@/src/hooks';
import { LoadFailed } from '@/components/LoadFailed';
import { WorkspaceTile } from '@/components/WorkspaceBits';
import { invitationOffer } from '@/src/lib/workspaces';

/**
 * Workspace invitations waiting on an answer, each saying what accepting
 * would give you: the role, the albums on offer and what you could do in
 * them. Deciding whether to join without that was deciding blind.
 *
 * Above the list it would join, because a workspace you have been invited to
 * is invisible until you accept — an invitation somewhere you never look
 * reads exactly like nothing having happened.
 *
 * Renders nothing when there is nothing pending, so it costs no space in the
 * normal case.
 */
export function WorkspaceInvitations() {
  const { invitations, loadFailed, refetch } = useCollaboratorInvitations();
  const respond = useRespondToInvitation();
  const [acting, setActing] = useState<{ id: string; accept: boolean } | null>(null);

  const answer = (id: string, accept: boolean) => {
    setActing({ id, accept });
    respond.mutate(
      { id, accept },
      {
        onError: (error: Error) => Alert.alert('Could not respond', error.message),
        onSettled: () => setActing(null),
      },
    );
  };

  // A failed lookup must not read as an empty inbox — a missed invitation
  // already looks exactly like silence, which is the problem being fixed.
  if (loadFailed) {
    return (
      <View className="px-5 pt-2 pb-2">
        <LoadFailed what="your invitations" onRetry={() => refetch()} compact />
      </View>
    );
  }

  if (invitations.length === 0) return null;

  return (
    <View className="px-5 pt-3 gap-3">
      {invitations.map((inv) => {
        const busy = acting?.id === inv.id;
        const workspace = inv.workspace_name ?? 'a workspace';
        return (
          <View key={inv.id} className="bg-card rounded-2xl p-3.5 gap-3 border border-border/40">
            <View className="flex-row gap-3">
              <WorkspaceTile name={workspace} color={inv.workspace_color ?? '#B66A40'} size={40} />
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-sm font-semibold">
                  {inv.inviter_name ?? 'Someone'} invited you to {workspace}
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5">{invitationOffer(inv)}</Text>
              </View>
            </View>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => answer(inv.id, false)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Decline the invitation to ${workspace}`}
                className="flex-1 h-10 rounded-xl bg-muted items-center justify-center active:scale-[0.97]"
              >
                {busy && !acting?.accept ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text className="text-foreground text-sm font-semibold">Decline</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => answer(inv.id, true)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Accept the invitation to ${workspace}`}
                className="flex-1 h-10 rounded-xl bg-action items-center justify-center active:scale-[0.97]"
              >
                {busy && acting?.accept ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text className="text-action-foreground text-sm font-bold">Accept</Text>
                )}
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}
