'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PageTab<K extends string> {
  key: K;
  label: ReactNode;
  /** A count beside the word. Zero and undefined draw nothing. */
  count?: number;
}

/**
 * Word tabs with an underline: the one way between a screen's pages, as on
 * the phone (components/PageTabs.tsx there). A switch inside a page is a
 * FilterChip row instead.
 */
export function PageTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
  dense = false,
  className,
}: {
  tabs: PageTab<K>[];
  value: K;
  onChange: (key: K) => void;
  /** What these pages are, for a screen reader: "Workspace pages". */
  label: string;
  /** The desktop app's: 32px tall, 13px type, no rule under the row. */
  dense?: boolean;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'flex overflow-x-auto [scrollbar-width:none]',
        dense ? 'gap-5' : 'gap-7 border-b border-border',
        className,
      )}
    >
      {tabs.map((tab) => {
        const on = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.key)}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 outline-none transition-colors focus-visible:text-foreground',
              dense ? 'h-8 text-[13px]' : 'h-11 text-sm',
              on ? 'font-bold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.count ? (
              <span className="font-medium tabular-nums text-muted-foreground">{tab.count}</span>
            ) : null}
            {on && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
          </button>
        );
      })}
    </div>
  );
}
