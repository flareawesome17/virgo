import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  neutral: 'bg-muted text-secondary-foreground',
  good: 'bg-success/15 text-success',
  warm: 'bg-primary/10 text-primary',
  late: 'bg-destructive/10 text-destructive',
} as const;

/** A small word in a pill: a status, "Starts in 3 h", "4 days late". */
export function Pill({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: keyof typeof TONES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold leading-4',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A dot beside a word: an album's status, an event's kind. Green unless given a colour. */
export function StatusDot({ color, className }: { color?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('size-2 shrink-0 rounded-full bg-success', className)}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}
