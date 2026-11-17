'use client';

import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { newClientId } from '@/lib/outbox';
import { useSendCard } from '@/hooks/useChatCards';
import { cardProblem } from '@/components/chat/chat-errors';
import type { Participant, SendCardInput } from '@/api';

/** Who a card goes to: the chat's other people, and whether it is a group. */
export interface Audience {
  isGroup: boolean;
  /** Everyone in the chat but you. */
  others: Participant[];
}

/** "Ana", from "Ana Lim". */
export function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || 'them';
}

/** "Ana, Marco, Jo and Bea". */
export function namesList(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Who sees it, in a sentence's middle: "Ana", or "everyone here" in a group. */
export function audienceName(audience: Audience): string {
  return audience.isGroup ? 'everyone here' : firstName(audience.others[0]?.name);
}

/** A sentence's first word made capital: "everyone here" → "Everyone here". */
export function capitalise(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Sends a card, with one client id per card.
 *
 * The id is kept by what the card is (its `sig`) until it has gone, so trying
 * the same booking again after a lost answer is stored once, while choosing a
 * different one makes a new card. Held by the menu rather than a picker, so
 * closing the picker and coming back keeps it too.
 */
export function useCardSender(conversationId: string) {
  const send = useSendCard(conversationId);
  const ids = useRef(new Map<string, string>());
  const [sending, setSending] = useState<string | null>(null);

  const sendCard = (sig: string, input: SendCardInput, onSent: () => void) => {
    if (send.isPending) return;
    let clientId = ids.current.get(sig);
    if (!clientId) {
      clientId = newClientId();
      ids.current.set(sig, clientId);
    }
    setSending(sig);
    send.mutate(
      { ...input, clientId },
      {
        onSuccess: () => {
          ids.current.delete(sig);
          onSent();
        },
        onError: (err) =>
          toast.error('Could not send it', { description: cardProblem(err, input.kind) }),
        onSettled: () => setSending(null),
      },
    );
  };

  return { sendCard, pending: send.isPending, sending };
}

export type CardSender = ReturnType<typeof useCardSender>;

/** A picker's list while it loads. */
export function PickerLoading() {
  return (
    <div className="grid place-items-center py-10">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  );
}

/** A picker's list when it could not load. */
export function PickerFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <p role="alert" className="py-8 text-center text-sm text-muted-foreground">
      Couldn&apos;t load {what}.{' '}
      <button type="button" className="font-semibold text-primary underline" onClick={onRetry}>
        Try again
      </button>
    </p>
  );
}

/** A picker with nothing to choose, and where to make something. */
export function PickerEmpty({
  children,
  href,
  action,
}: {
  children: ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
      {href && action && (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          {action}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** One thing to send. Choosing it sends it. */
export function PickRow({
  leading,
  title,
  lines,
  trailing,
  label,
  busy,
  disabled,
  dim,
  onPick,
}: {
  leading: ReactNode;
  title: string;
  lines: (string | null | undefined | false)[];
  trailing?: ReactNode;
  /** What a screen reader hears; the words on the row when absent. */
  label?: string;
  /** This one is on its way. */
  busy?: boolean;
  /** Another one is on its way. */
  disabled?: boolean;
  /** Shown, but faded: cancelled, closed. */
  dim?: boolean;
  onPick: () => void;
}) {
  const shown = lines.filter((line): line is string => !!line);
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        aria-label={label}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent',
          disabled && !busy && 'opacity-60',
        )}
      >
        <span className={cn('shrink-0', dim && 'opacity-60')}>{leading}</span>
        <span className={cn('flex min-w-0 flex-1 flex-col', dim && 'opacity-70')}>
          <span className="truncate text-sm font-semibold">{title}</span>
          {shown.map((line, i) => (
            <span key={i} className="truncate text-xs text-muted-foreground">
              {line}
            </span>
          ))}
        </span>
        {busy ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="Sending" />
        ) : (
          trailing
        )}
      </button>
    </li>
  );
}

/** The square at a row's start: an icon on the brand tint. */
export function RowIcon({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">
      {children}
    </span>
  );
}
