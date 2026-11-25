import { cn } from '@/lib/utils';
import { PersonAvatar } from './bits';

/**
 * The people in a workspace as overlapping faces, ringed in the page's own
 * colour. On the list and at the top of a workspace they sit on the page, not
 * on a card, and a card-coloured ring showed there as a pale halo.
 *
 * Names go in the label, not in a tooltip on each face: a row of faces is
 * read as one thing, “Carlo, Andrea and Maria”. How many there are is said in
 * words beside it, so there is no “+2” after the last one.
 */
export function Faces({
  people,
  max = 4,
  className,
}: {
  people: { name: string; avatar_url: string | null }[];
  max?: number;
  className?: string;
}) {
  if (people.length === 0) return null;
  return (
    <span
      role="img"
      aria-label={people.map((p) => p.name).join(', ')}
      className={cn('flex shrink-0 -space-x-1.5', className)}
    >
      {people.slice(0, max).map((person, i) => (
        <PersonAvatar
          key={`${person.name}-${i}`}
          name={person.name}
          url={person.avatar_url}
          className="size-[22px] ring-2 ring-background"
        />
      ))}
    </span>
  );
}
