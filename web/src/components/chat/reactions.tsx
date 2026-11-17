'use client';

import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  REACTION_EMOJI,
  REACTION_LABEL,
  groupReactions,
  type MessageReaction,
  type Participant,
  type ReactionKey,
} from '@/api';

/** "Ana Lim", or "You" for yourself, or a stand-in for someone who has left. */
function nameOf(
  userId: string,
  meId: string | undefined,
  people: ReadonlyMap<string, Participant>,
): string {
  if (userId === meId) return 'You';
  return people.get(userId)?.name ?? 'Someone who left';
}

/** "Ana, Marco and you", for a pill's tooltip. */
function namesLine(names: string[]): string {
  const sorted = [...names].sort((a, b) => (a === 'You' ? 1 : b === 'You' ? -1 : 0));
  const shown = sorted.map((n) => (n === 'You' ? 'you' : n));
  if (shown.length > 0) shown[0] = shown[0][0].toUpperCase() + shown[0].slice(1);
  if (shown.length <= 1) return shown.join('');
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

/**
 * The reactions under a message: one pill per kind, with how many.
 *
 * Ringed in the accent when one of them is yours. Clicking a pill toggles
 * yours of that kind — on, swapped from another, or taken back. The last
 * button says who, by name, filtered by kind (board 122).
 */
export function ReactionBar({
  reactions,
  meId,
  people,
  excerpt,
  side,
  onToggle,
}: {
  reactions: readonly MessageReaction[] | undefined;
  meId: string | undefined;
  people: ReadonlyMap<string, Participant>;
  /** The message, for the popover's heading. */
  excerpt: string;
  side: 'start' | 'end' | 'center';
  /** Absent when the thread takes nothing new: the pills only show. */
  onToggle?: (reaction: ReactionKey) => void;
}) {
  const groups = useMemo(() => groupReactions(reactions, meId), [reactions, meId]);
  if (groups.length === 0) return null;

  return (
    <div
      className={cn(
        'relative z-[1] -mt-2 flex flex-wrap items-center gap-1',
        side === 'end' ? 'mr-3 justify-end' : side === 'center' ? 'justify-center' : 'ml-3',
      )}
    >
      {groups.map((group) => {
        const who = (reactions ?? [])
          .filter((r) => r.reaction === group.reaction)
          .map((r) => nameOf(r.userId, meId, people));
        const label = `${REACTION_LABEL[group.reaction]}, ${group.count}${
          group.mine ? ', including you' : ''
        }`;
        const pill = cn(
          'flex h-6 items-center gap-1 rounded-full border bg-card px-2 text-[13px] leading-none shadow-xs',
          group.mine && 'border-primary ring-1 ring-primary',
        );
        const content = (
          <>
            <span aria-hidden>{REACTION_EMOJI[group.reaction]}</span>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
              {group.count}
            </span>
          </>
        );
        return onToggle ? (
          <button
            key={group.reaction}
            type="button"
            aria-pressed={group.mine}
            aria-label={label}
            title={namesLine(who)}
            onClick={() => onToggle(group.reaction)}
            className={cn(pill, 'transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
          >
            {content}
          </button>
        ) : (
          <span key={group.reaction} role="img" aria-label={label} title={namesLine(who)} className={pill}>
            {content}
          </span>
        );
      })}
      <WhoReacted reactions={reactions ?? []} meId={meId} people={people} excerpt={excerpt} />
    </div>
  );
}

/** Who reacted, by name: all of them, or one kind at a time. */
function WhoReacted({
  reactions,
  meId,
  people,
  excerpt,
}: {
  reactions: readonly MessageReaction[];
  meId: string | undefined;
  people: ReadonlyMap<string, Participant>;
  excerpt: string;
}) {
  const [filter, setFilter] = useState<ReactionKey | 'all'>('all');
  const groups = groupReactions(reactions, meId);
  const shown = reactions.filter((r) => filter === 'all' || r.reaction === filter);
  const tabs: { key: ReactionKey | 'all'; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: reactions.length },
    ...groups.map((g) => ({ key: g.reaction, label: REACTION_EMOJI[g.reaction], count: g.count })),
  ];

  return (
    <Popover onOpenChange={(open) => open && setFilter('all')}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="See who reacted"
          title="See who reacted"
          className="grid size-6 place-items-center rounded-full border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Users className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-2 p-3">
        <div>
          <p className="text-sm font-bold">Reactions</p>
          <p className="truncate text-xs text-muted-foreground">{excerpt}</p>
        </div>
        <div role="tablist" aria-label="Filter by reaction" className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={filter === tab.key}
              aria-label={
                tab.key === 'all' ? `All, ${tab.count}` : `${REACTION_LABEL[tab.key]}, ${tab.count}`
              }
              onClick={() => setFilter(tab.key)}
              className={cn(
                'h-7 rounded-full px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                filter === tab.key
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label} {tab.count}
            </button>
          ))}
        </div>
        <ul role="tabpanel" className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {shown.map((r) => {
            const person = people.get(r.userId);
            const name = nameOf(r.userId, meId, people);
            return (
              <li key={r.userId} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                <Avatar className="size-7">
                  {person?.avatar_url && <AvatarImage src={person.avatar_url} alt="" />}
                  <AvatarFallback className="bg-primary/15 text-[10px] font-bold text-primary">
                    {(person?.name ?? '?').slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                <span aria-label={REACTION_LABEL[r.reaction]} role="img" className="text-base">
                  {REACTION_EMOJI[r.reaction]}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          A ringed reaction is yours. Click it on the message to take it back.
        </p>
      </PopoverContent>
    </Popover>
  );
}
