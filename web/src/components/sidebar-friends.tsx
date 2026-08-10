'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Briefcase } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useFriendPresence } from '@/hooks/useFriends';
import { useCollaborators } from '@/hooks/useCollaborators';
import { usePresence, lastSeenLabel } from '@/lib/presence-store';
import { cn } from '@/lib/utils';
import type { Friend } from '@/api';

/**
 * Friends, with who is around right now.
 *
 * Sorted online-first because that is the only question this list answers:
 * alphabetical order is no use when the point is "who could pick up an edit
 * this afternoon".
 *
 * Each row subscribes to its own presence rather than the list subscribing to
 * all of it. One person connecting re-renders one row; the alternative
 * re-sorts and repaints the whole sidebar every time anyone's socket blinks.
 */
export function SidebarFriends() {
  const { friends } = useFriendPresence();

  // Everyone this user has on a workspace, so a friend who is also a
  // collaborator can be marked as one.
  const { collaborators } = useCollaborators({ limit: 100 });
  const collaboratorIds = useMemo(
    () =>
      new Set(
        collaborators
          .filter((c) => c.status === 'accepted' && c.collaborator_user_id)
          .map((c) => c.collaborator_user_id as string),
      ),
    [collaborators],
  );

  const withAccounts = friends.filter((f) => f.friend_user_id);
  if (withAccounts.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Friends
      </p>
      <ul className="flex flex-col space-y-0.5">
        {withAccounts.map((friend) => (
          <FriendRow
            key={friend.id}
            friend={friend}
            isCollaborator={collaboratorIds.has(friend.friend_user_id as string)}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * Sorting lives here rather than in the parent because presence is read per
 * row: the parent has no idea who is online without subscribing to everyone,
 * which is the re-render it is trying to avoid. `order` on a flex column does
 * the same job in CSS, for free.
 */
function FriendRow({
  friend,
  isCollaborator,
}: {
  friend: Friend;
  isCollaborator: boolean;
}) {
  const { online, lastSeenAt } = usePresence(friend.friend_user_id);
  const name = friend.friend_name || 'Someone';

  return (
    <li style={{ order: online ? 0 : 1 }}>
      <Link
        href={`/chat?with=${friend.friend_user_id}`}
        className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm hover:bg-accent/50"
      >
        <span className="relative shrink-0">
          <Avatar className="size-7">
            <AvatarImage src={friend.friend_avatar_url ?? undefined} alt="" />
            <AvatarFallback className="text-[10px]">
              {name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {/* Ring in the sidebar's own colour, so the dot reads as a hole
              punched in the avatar rather than a sticker on top of it. */}
          <span
            aria-hidden
            className={cn(
              'absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background',
              online ? 'bg-emerald-500' : 'bg-muted-foreground/40',
            )}
          />
        </span>

        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            online ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {name}
        </span>

        {isCollaborator && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Briefcase
                className="size-3.5 shrink-0 text-primary"
                aria-label="Works with you"
              />
            </TooltipTrigger>
            <TooltipContent side="right">Works with you</TooltipContent>
          </Tooltip>
        )}

        <span className="sr-only">
          {online ? 'online' : lastSeenLabel(lastSeenAt)}
        </span>
      </Link>
    </li>
  );
}
