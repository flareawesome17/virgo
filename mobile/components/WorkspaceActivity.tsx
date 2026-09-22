import { ActivityIndicator, Text, View } from 'react-native';
import { Share2Icon, UserMinusIcon, UserPlusIcon } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useWorkspaceActivity } from '@/src/hooks';
import type { WorkspaceActivityItem } from '@/src/api';
import { describeActivity, relativeTime } from '@/src/lib/workspaces';
import { LoadFailed } from '@/components/LoadFailed';
import { PersonAvatar } from '@/components/WorkspaceBits';

cssInterop(Share2Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserMinusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * The owner's own business — invitations, sharing, removals — is marked with
 * what it is about rather than their own face, which would say nothing.
 */
const MARKS: Partial<
  Record<WorkspaceActivityItem['kind'], { icon: LucideIcon; bg: string; fg: string }>
> = {
  invited: { icon: UserPlusIcon, bg: 'bg-warning/15', fg: 'text-warning' },
  declined: { icon: UserMinusIcon, bg: 'bg-muted', fg: 'text-muted-foreground' },
  removed: { icon: UserMinusIcon, bg: 'bg-muted', fg: 'text-muted-foreground' },
  shared: { icon: Share2Icon, bg: 'bg-info/15', fg: 'text-info' },
};

/**
 * What has been happening in a workspace, newest first: who uploaded what,
 * who joined, which album was made.
 *
 * `waiting` holds the people whose invitation is unanswered, so an old
 * invitation line can say whether it still is.
 */
export function WorkspaceActivity({
  workspaceId,
  waiting,
  limit = 8,
  divider,
}: {
  workspaceId: string;
  waiting?: ReadonlySet<string>;
  limit?: number;
  /** The rule between lines. */
  divider: string;
}) {
  const { activity, isLoading, loadFailed, refetch } = useWorkspaceActivity(workspaceId);
  const items = activity.slice(0, limit);

  if (isLoading) {
    return (
      <View className="py-6 items-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (loadFailed && activity.length === 0) {
    return <LoadFailed what="what has been happening" onRetry={() => refetch()} compact />;
  }
  if (items.length === 0) {
    return (
      <Text className="text-muted-foreground text-sm py-4">
        Nothing yet. Uploads, new albums and people joining show up here.
      </Text>
    );
  }

  return (
    <View>
      {items.map((item, i) => {
        const { parts, subline } = describeActivity(item, waiting);
        const mark = MARKS[item.kind];
        const Icon = mark?.icon;
        return (
          <View
            key={item.id}
            className="flex-row items-start gap-3 py-3"
            style={i > 0 ? { borderTopWidth: 1, borderTopColor: divider } : undefined}
          >
            {mark && Icon ? (
              <View className={`w-8 h-8 rounded-full items-center justify-center ${mark.bg}`}>
                <Icon size={15} className={mark.fg} />
              </View>
            ) : (
              <PersonAvatar name={item.actor?.name ?? 'Client'} url={item.actor?.avatar_url} size={32} />
            )}
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-sm leading-5">
                {parts.map((part, j) => (
                  <Text key={j} className={part.strong ? 'font-bold' : undefined}>
                    {part.text}
                  </Text>
                ))}
              </Text>
              {subline ? (
                <Text className="text-muted-foreground text-xs mt-0.5">{subline}</Text>
              ) : null}
            </View>
            <Text className="text-muted-foreground text-xs">{relativeTime(item.created_at)}</Text>
          </View>
        );
      })}
    </View>
  );
}
