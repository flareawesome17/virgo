import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * The desktop app's own pieces, beside the dense variants of the shared
 * ones: a panel with a headed bar (as on its Home), a key cap, and the line
 * of shortcuts along the foot of a page.
 */

/** A white panel with a 36px headed bar. */
export function Panel({
  title,
  right,
  className,
  children,
}: {
  title: ReactNode;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'flex flex-col overflow-hidden rounded-[14px] border border-border/60 bg-card text-[13px]',
        className,
      )}
    >
      <div className="flex min-h-9 items-center gap-2 border-b border-border/40 px-3">
        <h2 className="flex-1 text-[13px] font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** A key cap: Ctrl K, Enter. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'rounded bg-muted px-1.5 py-px font-sans text-[11px] font-semibold text-muted-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** The shortcuts that work on this page, along its foot. */
export function HintBar({
  hints,
  className,
}: {
  hints: Array<[keys: string, does: string]>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-8 flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-border px-5 text-xs text-muted-foreground',
        className,
      )}
    >
      {hints.map(([keys, does]) => (
        <span key={keys} className="flex items-center gap-1.5">
          <Kbd>{keys}</Kbd>
          {does}
        </span>
      ))}
    </div>
  );
}
