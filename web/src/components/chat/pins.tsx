'use client';

import type { ComponentProps } from 'react';
import { ChevronDown, Loader2, Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MAX_PINNED_MESSAGES, pinLine, type ConversationMessage } from '@/api';

/** "Ana Lim · Dec 2": who said it, and when. */
function pinMeta(message: ConversationMessage, meId: string | undefined): string {
  const who = message.sender_id === meId ? 'You' : (message.sender_name ?? 'Someone');
  const when = new Date(message.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return `${who} · ${when}`;
}

/** Three as a word, the way the note says it. */
const COUNT_WORD = ['none', 'one', 'two', 'three', 'four', 'five'];

/**
 * Under the header while anything is pinned (boards 135 and 148): how many,
 * and the newest pin's one line. Words only: a pinned photo card draws no
 * picture here, whatever the line is like.
 */
export function PinnedStrip({
  pins,
  className,
  ...props
}: { pins: ConversationMessage[] } & ComponentProps<'button'>) {
  const newest = pins[0];
  if (!newest) return null;
  return (
    <button
      type="button"
      aria-label={`Pinned messages, ${pins.length}. Newest: ${pinLine(newest)}`}
      className={cn(
        'flex min-h-11 w-full shrink-0 items-center gap-3 border-b bg-card px-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        className,
      )}
      {...props}
    >
      <Pin className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="shrink-0 text-xs font-bold text-primary">Pinned · {pins.length}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{pinLine(newest)}</span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

/**
 * What the Pinned popover holds (board 136): each pin, newest first, to jump
 * to, with Unpin; and a note on how pins work.
 */
export function PinnedPanel({
  pins,
  meId,
  loading,
  failed,
  onRetry,
  canChange,
  unpinning,
  onJump,
  onUnpin,
}: {
  pins: ConversationMessage[];
  meId: string | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  /** Whether this chat takes changes: a frozen one keeps its pins as they are. */
  canChange: boolean;
  /** The pin coming down, while it does. */
  unpinning: string | null;
  onJump: (message: ConversationMessage) => void;
  onUnpin: (message: ConversationMessage) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-base font-bold">Pinned</p>
        <p className="text-xs text-muted-foreground">
          {pins.length > 0 ? 'Click one to jump to it in the chat' : 'Nothing is pinned in this chat yet.'}
        </p>
      </div>

      {pins.length === 0 ? (
        loading ? (
          <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" aria-label="Loading pins" />
        ) : failed ? (
          <button
            type="button"
            onClick={onRetry}
            className="self-start text-xs font-semibold text-primary underline underline-offset-2"
          >
            Couldn&apos;t load the pins. Try again
          </button>
        ) : null
      ) : (
        <ul className="overflow-hidden rounded-xl border">
          {pins.map((message, i) => (
            <li
              key={message.id}
              className={cn('flex items-center gap-1 py-1 pl-1 pr-1', i > 0 && 'border-t')}
            >
              <button
                type="button"
                onClick={() => onJump(message)}
                className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="line-clamp-2 text-sm font-semibold wrap-anywhere">{pinLine(message)}</span>
                <span className="text-xs text-muted-foreground">{pinMeta(message, meId)}</span>
              </button>
              {canChange && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Unpin “${pinLine(message)}”`}
                  title="Unpin"
                  disabled={unpinning === message.id}
                  onClick={() => onUnpin(message)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  {unpinning === message.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <PinOff className="size-4" />
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Anyone here can pin, {COUNT_WORD[MAX_PINNED_MESSAGES] ?? MAX_PINNED_MESSAGES} at most. Pinning
        a fourth asks which one to take down. Everyone sees the same pins.
      </p>
    </div>
  );
}

/**
 * The chat already holds three pins: which one comes down for this one.
 * Answered from the 409, with the pins as they are now.
 */
export function ReplacePinDialog({
  message,
  pins,
  meId,
  pending,
  onPick,
  onOpenChange,
}: {
  /** The message waiting to be pinned; the dialog is open while there is one. */
  message: ConversationMessage | null;
  pins: ConversationMessage[];
  meId: string | undefined;
  /** The pin being swapped out, while it is. */
  pending: string | null;
  onPick: (replace: ConversationMessage) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={message !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Which one should come down?</DialogTitle>
          <DialogDescription>
            A chat holds {COUNT_WORD[MAX_PINNED_MESSAGES] ?? MAX_PINNED_MESSAGES} pins. The one you
            pick comes down for everyone, and{' '}
            <span className="font-medium text-foreground">
              “{message ? pinLine(message) : ''}”
            </span>{' '}
            goes up in its place.
          </DialogDescription>
        </DialogHeader>
        <ul className="overflow-hidden rounded-xl border">
          {pins.map((pin, i) => (
            <li key={pin.id} className={cn(i > 0 && 'border-t')}>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => onPick(pin)}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-60"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="line-clamp-2 text-sm font-semibold wrap-anywhere">{pinLine(pin)}</span>
                  <span className="text-xs text-muted-foreground">{pinMeta(pin, meId)}</span>
                </span>
                {pending === pin.id ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <PinOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep these
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
