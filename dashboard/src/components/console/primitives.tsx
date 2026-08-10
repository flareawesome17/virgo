'use client';

import { AlertTriangle, Inbox } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'warn' | 'good';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={cn(
            'mt-1 text-2xl font-bold tabular-nums',
            tone === 'warn' && 'text-amber-600 dark:text-amber-500',
            tone === 'good' && 'text-emerald-600 dark:text-emerald-500',
          )}
        >
          {value}
        </p>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
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
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-xs tabular-nums text-muted-foreground">{total} total</p>
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

export function peso(minor: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(minor / 100);
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
