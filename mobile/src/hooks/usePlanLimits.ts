import { Alert } from 'react-native';
import { router } from 'expo-router';
import type { Workspace } from '@/src/api';
import { useUsage } from './useUsage';

/**
 * Front-stops the plan limits the API enforces.
 *
 * The server is still the authority — these limits are checked again on every
 * create, and hiding a button is presentation, not enforcement. What this adds
 * is telling the user *before* they fill in a form that they cannot submit it.
 */
export function usePlanLimits() {
  const { usage, atWorkspaceLimit, albumLimit, isAlbumLimitReached } = useUsage();

  const workspaceLimit = usage?.workspaces.limit ?? null;
  const plan = usage?.plan ?? 'free';

  const warn = (title: string, message: string) =>
    Alert.alert(title, message, [
      { text: 'Not now', style: 'cancel' },
      { text: 'See plans', onPress: () => router.push('/settings/storage/plans') },
    ]);

  /**
   * Wraps a create action. Returns a handler that either runs it or explains
   * why it cannot, so a single call site covers the button and the navigation.
   */
  const guardWorkspaceCreate = (proceed: () => void) => () => {
    if (!atWorkspaceLimit) return proceed();
    warn(
      'Workspace limit reached',
      `Your ${plan} plan includes ${workspaceLimit} workspace${
        workspaceLimit === 1 ? '' : 's'
      }. Delete one or upgrade to add another.`,
    );
  };

  /**
   * Wraps making an album in `workspace`.
   *
   * The limit is per workspace, so only the workspace the album is going into
   * can say whether there is room. Without one — from Home or the album list,
   * where the workspace is chosen on the next screen — it goes ahead, and the
   * create screen says so once a full one is picked.
   */
  const guardAlbumCreate =
    (proceed: () => void, workspace?: Pick<Workspace, 'name' | 'album_total'>) => () => {
      if (!workspace || !isAlbumLimitReached(workspace.album_total)) return proceed();
      warn(
        'This workspace is full',
        `${workspace.name} has ${albumLimit} album${albumLimit === 1 ? '' : 's'}, the most your ${plan} plan allows in one workspace. Delete one, use another workspace, or upgrade.`,
      );
    };

  return {
    atWorkspaceLimit,
    workspaceLimit,
    albumLimit,
    isAlbumLimitReached,
    workspacesUsed: usage?.workspaces.used ?? 0,
    plan,
    guardWorkspaceCreate,
    guardAlbumCreate,
  };
}
