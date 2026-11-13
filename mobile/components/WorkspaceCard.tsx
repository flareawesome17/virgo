import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatBytes, type Workspace } from '@/src/api';
import { ROLE_LABEL, plural, relativeTime } from '@/src/lib/workspaces';
import { PeopleStack, Pill } from '@/components/WorkspaceBits';
import { PressableScale } from '@/components/PressableScale';
import { WorkspaceCover } from '@/components/WorkspaceCover';

/**
 * Whose a workspace is and who else is in it, in one line:
 * "Yours · 4 members", "Yours · just you", "Shared by Bea Lim · Photographer".
 */
export function ownerLine(workspace: Workspace): string {
  if (!workspace.is_owner) {
    return `Shared by ${workspace.owner.name} · ${ROLE_LABEL[workspace.my_role]}`;
  }
  if (workspace.member_count <= 1) {
    return workspace.pending_count > 0
      ? `Yours · ${plural(workspace.pending_count, 'invite')} waiting`
      : 'Yours · just you';
  }
  return `Yours · ${plural(workspace.member_count, 'member')}`;
}

/**
 * One workspace in the list, led by a photograph from it: its name and when
 * something last happened there, how much it holds, then whose it is and who
 * else is in it.
 *
 * Three lines, each a step quieter than the one above: the name is what you
 * look for, the size is what you check, the people are what you already know.
 */
export function WorkspaceCard({ workspace, ring }: { workspace: Workspace; ring: string }) {
  const holds = [
    workspace.album_count > 0 ? plural(workspace.album_count, 'album') : 'No albums yet',
    workspace.media_count > 0 ? plural(workspace.media_count, 'file') : null,
    // Its size only for the owner: the API keeps a member's share of
    // somebody else's storage to itself.
    workspace.storage_bytes ? formatBytes(workspace.storage_bytes) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    // Gives under the finger and springs back (PressableScale). Where it sits
    // is a plain style; how it looks is the class.
    <PressableScale
      onPress={() => router.push(`/workspaces/${workspace.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${workspace.name}, ${holds}, ${ownerLine(workspace)}`}
      scaleTo={0.98}
      style={{ marginHorizontal: 20, marginBottom: 12 }}
      className="bg-card rounded-[20px] p-3 flex-row gap-3 border border-border/40"
    >
      <WorkspaceCover workspace={workspace} width={76} height={76} />
      <View className="flex-1 min-w-0 justify-center">
        <View className="flex-row items-baseline gap-2">
          <Text
            className="text-foreground text-[16px] leading-[22px] font-semibold flex-shrink"
            numberOfLines={1}
          >
            {workspace.name}
          </Text>
          {workspace.archived_at ? <Pill tone="muted">Archived</Pill> : null}
          <View className="flex-1" />
          <Text className="text-muted-foreground text-[12px]">
            {relativeTime(workspace.last_activity_at)}
          </Text>
        </View>
        <Text className="text-secondary-foreground text-[14px] leading-5 mt-0.5" numberOfLines={1}>
          {holds}
        </Text>
        <View className="flex-row items-center gap-2 mt-1.5">
          <PeopleStack people={workspace.people} ring={ring} size={20} />
          <Text className="flex-1 text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
            {ownerLine(workspace)}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}
