'use client';

import { AlertTriangle, Inbox } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

type Tone = 'default' | 'good' | 'warn' | 'danger';

const TONE_TEXT: Record<Tone, string | undefined> = {
  default: undefined,
  good: 'text-success',
  warn: 'text-warning',
  danger: 'text-destructive',
};

export interface Stat {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: Tone;
}

/** Column counts that leave no empty cell showing through the hairlines. */
const STRIP_COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
};

/**
 * A row of numbers in one frame, divided by hairlines — Termix's stats bar.
 *
 * One frame rather than a card each: four boxes side by side read as four
 * things to look at, where a strip reads as one summary.
 */
export function StatStrip({ items, className }: { items: Stat[]; className?: string }) {
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden rounded-lg border bg-border',
        STRIP_COLUMNS[items.length] ?? STRIP_COLUMNS[4],
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0 bg-card px-4 py-3">
          <p className="caption truncate">{item.label}</p>
          <p
            className={cn(
              'mt-1 truncate text-xl font-semibold tabular-nums tracking-tight',
              TONE_TEXT[item.tone ?? 'default'],
            )}
          >
            {item.value}
          </p>
          {item.hint && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.hint}</p>
          )}
        </div>
      ))}
    </div>
  );
}

const DOT: Record<'ok' | 'warn' | 'danger' | 'info' | 'muted', string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-info',
  muted: 'bg-muted-foreground/50',
};

/** State as a dot and a word, where a filled badge would shout. */
export function StatusDot({
  tone,
  children,
}: {
  tone: keyof typeof DOT;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium">
      <span className={cn('size-1.5 shrink-0 rounded-full', DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}

/**
 * A titled block on a detail page: caption header over a hairline, then the
 * body. Termix's metric cards.
 */
export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card', className)}>
      <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b px-4">
        <h2 className="caption truncate">{title}</h2>
        {action}
      </header>
      <div className={cn('min-h-0 flex-1 p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** A label and its value on one line, for the facts on a detail page. */
export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{value}</span>
    </div>
  );
}

/**
 * Loading, failed and empty are three different things.
 *
 * Collapsing them into one "no data" is how a console tells you there are zero
 * users when in fact the API is down — the mistake this codebase already had
 * to fix once across the app's own lists.
 */
export function DataState({
  isLoading,
  isError,
  isEmpty,
  emptyLabel = 'Nothing here yet',
  onRetry,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  emptyLabel?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <AlertTriangle className="size-5 text-amber-600" />
        <div>
          <p className="text-sm font-medium">Could not load this</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The API did not answer. This is not an empty list.
          </p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-xs font-medium text-primary underline underline-offset-4"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
        <Inbox className="size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * A bar chart, in markup.
 *
 * No charting library: this is one series of small integers, and recharts
 * would be ~100 kB of JavaScript to draw rectangles. Scales to the tallest
 * bar so a quiet week still shows shape rather than a flat line.
 */
export function MiniBars({
  data,
  label,
}: {
  data: { day: string; value: number }[];
  label: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((n, d) => n + d.value, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="caption">{label}</p>
        <p className="text-xs tabular-nums text-muted-foreground">{num(total)} total</p>
      </div>
      <div className="mt-3 flex h-24 items-end gap-[3px]">
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground">No activity in this window.</p>
        ) : (
          data.map((d) => (
            // The tooltip is a `title` *attribute*, not a <title> element.
            // <title> is only valid inside SVG; in plain HTML the browser
            // hoists it and it becomes the document title — every console
            // page was briefly named after the last bar in its chart.
            <div
              key={d.day}
              title={`${d.day}: ${d.value}`}
              className="flex-1 rounded-t-[2px] bg-primary/70 transition-colors hover:bg-primary"
              style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
            >
              <span className="sr-only">
                {d.day}: {d.value}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function bytes(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!v) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(v) / Math.log(1024)), units.length - 1);
  const scaled = v / 1024 ** i;
  return `${scaled >= 100 || i === 0 ? Math.round(scaled) : scaled.toFixed(1)} ${units[i]}`;
}

/** A count with thousands separators: 1,284. */
export function num(n: number | string | null | undefined): string {
  return Number(n ?? 0).toLocaleString('en-PH');
}

export function peso(minor: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

/**
 * A date in the future, said forwards: "in 14 days".
 *
 * Separate from `when` rather than a branch inside it. `when` subtracts in one
 * direction and reads "just now" for anything not yet past, so a promo expiring
 * in a fortnight rendered as "just now" in the Expires column — a confident
 * statement, and the opposite of the truth.
 */
export function until(value: string | null | undefined): string {
  if (!value) return 'Never';
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.ceil(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * A calendar date, for when the day itself is the point: "Nov 12, 2026".
 *
 * A billing period's end is in the future, which `when` reads as "just now".
 */
export function day(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-PH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function when(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}
