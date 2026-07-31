import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useUsage } from './useUsage';

/**
 * Front-stops the plan limits the API enforces.
 *
 * The server is still the authority — these limits are checked again on every
 * create, and hiding a button is presentation, not enforcement. What this adds
 * is telling the user *before* they fill in a form that they cannot submit it.
 * Previously `atWorkspaceLimit` / `atAlbumLimit` existed on useUsage and no
 * screen read them, so hitting a limit surfaced as a failed create at the end.
 */
export function usePlanLimits() {
  const { usage, atWorkspaceLimit, atAlbumLimit } = useUsage();

  const workspaceLimit = usage?.workspaces.limit ?? null;
  const albumLimit = usage?.albums.limit ?? null;
  const isFree = (usage?.plan ?? 'free') === 'free';

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
      `Your ${isFree ? 'free' : usage?.plan} plan includes ${workspaceLimit} workspace${
        workspaceLimit === 1 ? '' : 's'
      }. Delete one or upgrade to add another.`,
    );
  };

  const guardAlbumCreate = (proceed: () => void) => () => {
    if (!atAlbumLimit) return proceed();
    warn(
      'Album limit reached',
      `Your ${isFree ? 'free' : usage?.plan} plan includes ${albumLimit} album${
        albumLimit === 1 ? '' : 's'
      }. Delete one or upgrade to add another.`,
    );
  };

  return {
    atWorkspaceLimit,
    atAlbumLimit,
    workspaceLimit,
    albumLimit,
    workspacesUsed: usage?.workspaces.used ?? 0,
    albumsUsed: usage?.albums.used ?? 0,
    plan: usage?.plan ?? 'free',
    guardWorkspaceCreate,
    guardAlbumCreate,
  };
}
