'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Participant } from '@/api';

function at(value: string | null): number {
  return value ? new Date(value).getTime() : -1;
}

/** "3:04 PM" today, "Mon 3:04 PM" this week, "3 Nov" before that. */
function readLabel(iso: string): string {
  const then = new Date(iso);
  const time = then.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (then.toDateString() === new Date().toDateString()) return time;
  if (Date.now() - then.getTime() < 6 * 86_400_000) {
    return `${then.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
  }
  return then.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function Person({ person, aside }: { person: Participant; aside?: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
      <Avatar className="size-7">
        {person.avatar_url && <AvatarImage src={person.avatar_url} alt="" />}
        <AvatarFallback className="bg-primary/15 text-[10px] font-bold text-primary">
          {person.name.slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{person.name}</span>
      {aside && <span className="shrink-0 text-xs text-muted-foreground">{aside}</span>}
    </li>
  );
}

function Section({ title, people, children }: { title: string; people: number; children: ReactNode }) {
  if (people === 0) return null;
  return (
    <div>
      <p className="mb-0.5 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {title} · {people}
      </p>
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

/**
 * "Seen by 3" in a group, which opens who: who has read it and when they
 * last read, who has it on their device but has not looked, and who it has
 * not reached yet (board 125). From each member's receipts, as the ticks are.
 */
export function SeenBy({
  sentAt,
  others,
  excerpt,
  children,
}: {
  sentAt: string;
  /** Everyone in the chat but you. */
  others: Participant[];
  excerpt: string;
  /** The time line's tick, which is the trigger alongside the count. */
  children: ReactNode;
}) {
  const sent = new Date(sentAt).getTime();
  const seen = others
    .filter((p) => at(p.last_read_at) >= sent)
    .sort((a, b) => at(a.last_read_at) - at(b.last_read_at));
  const delivered = others.filter(
    (p) => at(p.last_read_at) < sent && at(p.last_delivered_at) >= sent,
  );
  const waiting = others.filter(
    (p) => at(p.last_read_at) < sent && at(p.last_delivered_at) < sent,
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={seen.length > 0 ? `Seen by ${seen.length}. See who` : "Who's seen it"}
          className={cn(
            'inline-flex items-center gap-1 rounded px-0.5 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          {children}
          {seen.length > 0 && <span>Seen by {seen.length}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-3 p-3">
        <div>
          <p className="text-sm font-bold">Who&apos;s seen it</p>
          <p className="truncate text-xs text-muted-foreground">{excerpt}</p>
        </div>
        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
          <Section title="Seen" people={seen.length}>
            {seen.map((p) => (
              <Person key={p.id} person={p} aside={p.last_read_at ? readLabel(p.last_read_at) : null} />
            ))}
          </Section>
          <Section title="On their device, not seen yet" people={delivered.length}>
            {delivered.map((p) => (
              <Person key={p.id} person={p} />
            ))}
          </Section>
          <Section title="Not delivered yet" people={waiting.length}>
            {waiting.map((p) => (
              <Person key={p.id} person={p} />
            ))}
          </Section>
        </div>
      </PopoverContent>
    </Popover>
  );
}
