'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A chip that narrows a list. Dark when it is the one chosen, never
 * terracotta: terracotta is for the page's one action.
 */
export function FilterChip({
  on = false,
  count,
  icon,
  caret = false,
  dense = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  on?: boolean;
  count?: number;
  icon?: ReactNode;
  /** A chevron: this chip opens something to choose from. */
  caret?: boolean;
  /** The desktop app's: 26px tall, 12px type. */
  dense?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      {...props}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5',
        dense ? 'h-[26px] px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
        on ? 'bg-foreground text-background' : 'bg-muted text-foreground hover:bg-muted/70',
        className,
      )}
    >
      {icon}
      {children}
      {count != null ? (
        <span className={cn('font-medium tabular-nums', on ? 'text-background/70' : 'text-muted-foreground')}>
          {count}
        </span>
      ) : null}
      {caret ? <ChevronDown aria-hidden /> : null}
    </button>
  );
}
