'use client';

import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/**
 * A group's picture: the photo an admin set, or the group's initial.
 *
 * A workspace's team chat is a rounded square, as a workspace is drawn
 * (board 135); every other group is round, like a person. Avatar-sized and
 * always loaded, like a profile picture, whatever the line is like.
 */
export function GroupAvatar({
  title,
  photoUrl,
  team = false,
  className,
  initialClassName,
}: {
  title: string;
  photoUrl?: string | null;
  /** A workspace's team chat. */
  team?: boolean;
  className?: string;
  /** The initial's size, which grows with the avatar. */
  initialClassName?: string;
}) {
  const shape = team ? 'rounded-[28%] after:rounded-[28%]' : undefined;
  const initial = (title.trim()[0] ?? '?').toUpperCase();
  return (
    <Avatar className={cn(shape, className)}>
      {photoUrl && <AvatarImage src={photoUrl} alt="" className={cn(team && 'rounded-[28%]')} />}
      <AvatarFallback
        className={cn(
          'bg-info/15 font-bold text-info',
          team && 'rounded-[28%]',
          initialClassName ?? 'text-xs',
        )}
      >
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
