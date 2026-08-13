'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
 *
 * **It scrolls on its own.** This used to sit inside the nav's scroll area, so
 * a long friends list pushed Support and Rewards off the bottom and you had to
 * scroll past every destination in the app to reach a person. Now the heading
 * stays put, the list is capped, and the nav above is untouched by how many
 * friends somebody has.
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

  const listRef = useRef<HTMLUListElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  /**
   * Whether the list is actually cut off.
   *
   * The fade below is the only thing telling a reader there are more friends
   * under the fold, because the scrollbar is hidden. Drawing it unconditionally
   * would put a gradient over the last row of a list that ends there anyway,
   * which reads as a rendering fault rather than as an edge.
   */
  useEffect(() => {
    const node = listRef.current;
    if (!node) return;

    const measure = () =>
      setOverflowing(node.scrollHeight - node.clientHeight > 1);

    measure();
    // Height changes without the friend count changing: a window resize, or a
    // row that wraps once a display name gets long.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [withAccounts.length]);

  if (withAccounts.length === 0) return null;

  return (
    // shrink rather than flex-none: on a short window this yields height to
    // the nav above instead of pushing it away, down to the floor below.
    <div className="mt-6 flex min-h-[5rem] shrink flex-col">
      <p className="shrink-0 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Friends
      </p>

      <div className="relative min-h-0">
        {/* Capped at ~5 rows so a well-connected account cannot let this take
            over the sidebar, and scrolling its own overflow rather than the
            whole nav's. */}
        <ul
          ref={listRef}
          className="no-scrollbar flex max-h-56 min-h-0 flex-col space-y-0.5 overflow-y-auto"
        >
          {withAccounts.map((friend) => (
            <FriendRow
              key={friend.id}
              friend={friend}
              isCollaborator={collaboratorIds.has(friend.friend_user_id as string)}
            />
          ))}
        </ul>

        {overflowing && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-sidebar to-transparent"
          />
        )}
      </div>
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
    <li className="shrink-0" style={{ order: online ? 0 : 1 }}>
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
