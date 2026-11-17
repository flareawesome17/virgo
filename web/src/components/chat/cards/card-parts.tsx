'use client';

import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { ExternalLink, ImageDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Participant } from '@/api';

/** What every card needs to know about where it is drawn. */
export interface CardEnv {
  conversationId: string;
  /** You sent it. */
  mine: boolean;
  meId: string | undefined;
  isGroup: boolean;
  /** Everyone in the chat but you. */
  others: Participant[];
  /** Everyone, by id: who is going to a date. */
  people: ReadonlyMap<string, Participant>;
}

/**
 * The card's surface (board ChatCards): yours ringed in the brand colour on
 * your side, theirs a plain outline on theirs, and the same lift a bubble gets
 * while its actions show.
 */
export function cardShell(mine: boolean, className?: string): string {
  return cn(
    'block max-w-full overflow-hidden rounded-2xl bg-card text-left text-card-foreground transition-shadow',
    mine ? 'rounded-br-md border-[1.5px] border-primary' : 'rounded-bl-md border',
    'group-hover/message:ring-3 group-hover/message:ring-accent',
    'group-focus-visible/message:ring-2 group-focus-visible/message:ring-ring',
    className,
  );
}

/** "Job post", "Package": what the card is, over its title. */
export function CardKindLabel({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
      <Icon className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}

/** The quiet line a card shows once what it pointed at has gone. */
export function GoneNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

const ACTION =
  'mt-1 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** A card's one button, to a page of this app. */
export function CardAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={ACTION}>
      {children}
    </Link>
  );
}

/**
 * A card's one button, to a page outside the app: a new tab, which in the
 * desktop app is the system browser — the shell hands every new-window
 * request there, as message links do.
 */
export function CardExternalAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={ACTION}>
      {children}
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

/** Over a held-back picture: says a click loads it. */
export function ClickToLoad({ small }: { small?: boolean }) {
  return (
    <span className="pointer-events-none absolute inset-0 grid place-items-center">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-black/55 font-semibold text-white',
          small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        )}
      >
        <ImageDown className={small ? 'size-3' : 'size-3.5'} aria-hidden />
        {small ? 'Load' : 'Click to load'}
      </span>
    </span>
  );
}

/** A blurred stand-in, until the real picture may load. */
export function BlurredStandIn({ src }: { src: string | null | undefined }) {
  return src ? (
    <span
      aria-hidden
      className="absolute inset-0 scale-110 bg-cover bg-center blur-md"
      style={{ backgroundImage: `url("${src}")` }}
    />
  ) : null;
}

/** "Ana", from "Ana Lim". */
export function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || 'Someone';
}

/** "A", from "Ana Lim": what a small round face says (board ChatDateCard). */
export function initial(name: string | null | undefined): string {
  return (name ?? '').trim().charAt(0).toUpperCase() || '?';
}
