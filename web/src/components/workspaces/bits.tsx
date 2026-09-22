import type { ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/** Two letters from a name, for an avatar with no photograph. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * A workspace's letter on its colour: the mark that stands for it on cards,
 * headers and pickers.
 *
 * The colour is the workspace's own, chosen by its owner, so it is data and
 * set inline; the letter is white on it, which every colour on offer carries.
 */
export function WorkspaceTile({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-[11px] font-bold text-white',
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {name.trim().charAt(0).toUpperCase() || '·'}
    </span>
  );
}

export function PersonAvatar({
  name,
  url,
  className,
}: {
  name: string;
  url?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn('size-8 shrink-0', className)}>
      {url && <AvatarImage src={url} alt="" />}
      <AvatarFallback className="bg-primary/15 text-[11px] font-bold text-primary">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Overlapping faces for the people in a workspace, with a count or a note
 * after them ("+1 invited").
 *
 * Names go in the accessible label rather than in tooltips on each face: a
 * row of faces is read as one thing, "Carlo, Andrea and Maria".
 */
export function PeopleStack({
  people,
  max = 4,
  size = 'size-6',
  extra,
  className,
}: {
  people: { name: string; avatar_url: string | null }[];
  max?: number;
  size?: string;
  extra?: string;
  className?: string;
}) {
  if (people.length === 0 && !extra) return null;
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  return (
    <span
      className={cn('flex items-center gap-1.5', className)}
      aria-label={people.map((p) => p.name).join(', ')}
    >
      {shown.length > 0 && (
        <span className="flex -space-x-1.5">
          {shown.map((person, i) => (
            <PersonAvatar
              key={`${person.name}-${i}`}
              name={person.name}
              url={person.avatar_url}
              className={cn(size, 'ring-2 ring-card')}
            />
          ))}
        </span>
      )}
      {(more > 0 || extra) && (
        <span className="text-xs text-muted-foreground">
          {more > 0 ? `+${more}` : ''}
          {more > 0 && extra ? ' · ' : ''}
          {extra}
        </span>
      )}
    </span>
  );
}

/** A small rounded label: "Yours", "Waiting", "Declined". */
export function Pill({
  children,
  tone = 'primary',
  className,
}: {
  children: ReactNode;
  tone?: 'primary' | 'warning' | 'muted' | 'info' | 'success';
  className?: string;
}) {
  const tones = {
    primary: 'bg-primary/12 text-primary',
    warning: 'bg-warning/15 text-warning',
    muted: 'bg-muted text-muted-foreground',
    info: 'bg-info/12 text-info',
    success: 'bg-success/15 text-success',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
