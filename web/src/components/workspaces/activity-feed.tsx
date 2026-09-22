'use client';

import { Activity, Share2, UserMinus, UserPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ErrorState } from '@/components/states';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceActivity } from '@/hooks/useWorkspaces';
import type { WorkspaceActivityItem } from '@/api';
import { describeActivity, relativeTime } from '@/lib/workspaces';
import { PersonAvatar } from './bits';

/**
 * The owner's own business — invitations, sharing, removals — is marked with
 * what it is about rather than a face: "You invited Paolo" under your own
 * avatar says less than an invitation icon does.
 */
const MARKS: Partial<Record<WorkspaceActivityItem['kind'], { icon: LucideIcon; tint: string }>> = {
  invited: { icon: UserPlus, tint: 'bg-warning/15 text-warning' },
  declined: { icon: UserMinus, tint: 'bg-muted text-muted-foreground' },
  removed: { icon: UserMinus, tint: 'bg-muted text-muted-foreground' },
  shared: { icon: Share2, tint: 'bg-info/12 text-info' },
};

/**
 * What has been happening in a workspace: who uploaded what, who joined,
 * which album was made. Newest first.
 *
 * `waiting` is the people whose invitation is unanswered, so an invitation
 * line can say whether it still is.
 */
export function ActivityFeed({
  workspaceId,
  waiting,
  limit,
}: {
  workspaceId: string;
  waiting?: ReadonlySet<string>;
  limit?: number;
}) {
  const { activity, isLoading, loadFailed, refetch } = useWorkspaceActivity(workspaceId);
  const items = limit ? activity.slice(0, limit) : activity;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 py-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (loadFailed && activity.length === 0) {
    return (
      <div className="py-3">
        <ErrorState message="Could not load what has been happening." onRetry={() => refetch()} />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-8 text-center">
        <Activity className="size-5 text-muted-foreground" />
        <p className="text-sm font-medium">Nothing yet</p>
        <p className="text-xs text-muted-foreground">
          Uploads, new albums and people joining show up here.
        </p>
      </div>
    );
  }

  return (
    <ul>
      {items.map((item) => {
        const { parts, subline } = describeActivity(item, waiting);
        const mark = MARKS[item.kind];
        return (
          <li key={item.id} className="flex items-start gap-3 border-t py-3 first:border-t-0">
            {mark ? (
              <span className={`grid size-8 shrink-0 place-items-center rounded-full ${mark.tint}`}>
                <mark.icon className="size-4" />
              </span>
            ) : (
              <PersonAvatar
                name={item.actor?.name ?? 'Client'}
                url={item.actor?.avatar_url}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-5">
                {parts.map((part, i) =>
                  part.strong ? (
                    <strong key={i} className="font-semibold">
                      {part.text}
                    </strong>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )}
              </p>
              {subline && <p className="mt-0.5 text-xs text-muted-foreground">{subline}</p>}
            </div>
            <time
              dateTime={item.created_at}
              className="shrink-0 whitespace-nowrap text-xs text-muted-foreground"
            >
              {relativeTime(item.created_at)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
