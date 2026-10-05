import { Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Workspace } from '@/src/api';
import { ROLE_LABEL, plural, relativeTime } from '@/src/lib/workspaces';
import { PeopleStack, Pill, WorkspaceTile } from '@/components/WorkspaceBits';
import { PressableScale } from '@/components/PressableScale';

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
 * One workspace in the list: its mark, whose it is, how much it holds, who
 * else is in it, and when something last happened there.
 */
export function WorkspaceCard({ workspace, ring }: { workspace: Workspace; ring: string }) {
  return (
    // Gives under the finger and springs back (PressableScale), where it used
    // to snap to 98% and back. Where it sits is a plain style; how it looks
    // is the class.
    <PressableScale
      onPress={() => router.push(`/workspaces/${workspace.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${workspace.name}, ${ownerLine(workspace)}`}
      scaleTo={0.98}
      style={{ marginHorizontal: 20, marginBottom: 12 }}
      className="bg-card rounded-2xl p-3.5 flex-row gap-3 border border-border/40"
    >
      <WorkspaceTile name={workspace.name} color={workspace.accent_color} size={48} />
      <View className="flex-1 min-w-0 gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-foreground text-[15px] font-semibold flex-shrink" numberOfLines={1}>
            {workspace.name}
          </Text>
          {workspace.archived_at ? <Pill tone="muted">Archived</Pill> : null}
        </View>
        <Text className="text-secondary-foreground text-xs" numberOfLines={1}>
          {ownerLine(workspace)}
        </Text>
        <View className="flex-row items-center justify-between mt-1.5 gap-2">
          <Text className="text-muted-foreground text-xs flex-shrink" numberOfLines={1}>
            {plural(workspace.album_count, 'album')} · {plural(workspace.media_count, 'file')}
          </Text>
          <View className="flex-row items-center gap-2">
            <PeopleStack people={workspace.people} ring={ring} size={22} />
            <Text className="text-muted-foreground text-xs">
              {relativeTime(workspace.last_activity_at)}
            </Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}
