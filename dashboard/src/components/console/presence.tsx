'use client';

import type { PresenceOther } from '@/api/console';
import { cn } from '@/lib/utils';

/**
 * Who else has this record open. Nothing when nobody does.
 *
 * "Replying" is said louder than "viewing": two people answering one ticket is
 * the collision this exists to prevent.
 */
export function PresenceBar({ others, className }: { others: PresenceOther[]; className?: string }) {
  if (others.length === 0) return null;
  const replying = others.filter((o) => o.state === 'replying');
  const names = (list: PresenceOther[]) =>
    list.length === 1
      ? list[0].name
      : `${list
          .slice(0, -1)
          .map((o) => o.name)
          .join(', ')} and ${list[list.length - 1].name}`;

  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs',
        replying.length
          ? 'border-warning/40 bg-warning/10 text-warning'
          : 'bg-muted/40 text-muted-foreground',
        className,
      )}
    >
      <span className="flex -space-x-1.5">
        {others.slice(0, 4).map((o) => (
          <span
            key={o.adminId}
            title={`${o.name} is ${o.state}`}
            className="grid size-5 place-items-center rounded-full border-2 border-background bg-primary/20 text-[9px] font-bold text-primary"
          >
            {o.name.slice(0, 2).toUpperCase()}
          </span>
        ))}
      </span>
      <span>
        {replying.length
          ? `${names(replying)} ${replying.length === 1 ? 'is' : 'are'} replying`
          : `${names(others)} ${others.length === 1 ? 'is' : 'are'} also here`}
      </span>
    </div>
  );
}
