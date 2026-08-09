import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useState } from 'react';
import { UsersIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useCollaboratorInvitations,
  useRespondToInvitation,
  useTheme,
} from '@/src/hooks';
import { LoadFailed } from '@/components/LoadFailed';

cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

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
 * This used to live only on the Network tab, which is where you go to find
 * people — not where you go to find your work. A workspace you have been
 * invited to is invisible until you accept, so an invitation sitting somewhere
 * you never look is indistinguishable from nothing having happened. It belongs
 * above the list it will join.
 *
 * Renders nothing when there is nothing pending, so it costs no space in the
 * normal case.
 */
export function WorkspaceInvitations() {
  const { isDark } = useTheme();
  const { invitations, loadFailed, refetch } = useCollaboratorInvitations();
  const respond = useRespondToInvitation();
  const [acting, setActing] = useState<string | null>(null);

  const answer = (id: string, accept: boolean) => {
    setActing(id);
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
      <View className="px-5 pt-2 pb-4">
        <LoadFailed what="your invitations" onRetry={() => refetch()} compact />
      </View>
    );
  }

  if (invitations.length === 0) return null;

  return (
    <View className="px-5 pt-2 pb-4 gap-2">
      <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
        {invitations.length === 1
          ? '1 pending invitation'
          : `${invitations.length} pending invitations`}
      </Text>

      <View className="bg-card rounded-2xl overflow-hidden">
        {invitations.map((inv, i) => (
          <View
            key={inv.id}
            className="px-4 py-3 flex-row items-center gap-3"
            style={
              i < invitations.length - 1
                ? {
                    borderBottomWidth: 1,
                    borderBottomColor: isDark ? '#2A2522' : '#F0E8E2',
                  }
                : undefined
            }
          >
            <View
              className="w-10 h-10 rounded-xl items-center justify-center"
              style={{ backgroundColor: '#B66A4018' }}
            >
              <UsersIcon size={17} style={{ color: '#B66A40' }} />
            </View>

            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                {inv.workspace_name ?? 'A workspace'}
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                {inv.inviter_name ?? 'Someone'} invited you as{' '}
                {ROLE_LABELS[inv.role] ?? inv.role}
              </Text>
            </View>

            {acting === inv.id ? (
              <ActivityIndicator size="small" color="#B66A40" />
            ) : (
              <>
                <Pressable
                  onPress={() => answer(inv.id, false)}
                  className="px-3 py-2 rounded-xl bg-muted active:scale-[0.94]"
                >
                  <Text className="text-muted-foreground text-xs font-bold">Decline</Text>
                </Pressable>
                <Pressable
                  onPress={() => answer(inv.id, true)}
                  className="px-3 py-2 rounded-xl active:scale-[0.94]"
                  style={{ backgroundColor: '#B66A40' }}
                >
                  <Text className="text-white text-xs font-bold">Accept</Text>
                </Pressable>
              </>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
