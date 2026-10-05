'use client';

import Link from 'next/link';
import { Ellipsis, Flag, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FeedMaker } from '@/api';

/**
 * The "…" on somebody else's post.
 *
 * A menu rather than a flag on every card: reporting is rare, and a flag
 * beside somebody's name reads as an accusation. Never offered on your own
 * post — reporting yourself is absurd, and editing is done on the phone.
 */
export function ShowcaseMenu({
  maker,
  onReport,
}: {
  maker: Pick<FeedMaker, 'displayName' | 'handle'>;
  onReport: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="More options for this post">
          <Ellipsis className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {/* Only somebody who has published a handle has a profile to go to. */}
        {maker.handle && (
          <DropdownMenuItem asChild>
            <Link href={`/u/${maker.handle}`}>
              <User />
              View {maker.displayName}&rsquo;s profile
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onSelect={onReport}>
          <Flag />
          Report this post
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
