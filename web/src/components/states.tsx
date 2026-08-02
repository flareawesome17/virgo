'use client';

import type { ComponentType, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/** Nothing here yet, or nothing matched — with the way out, when there is one. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-16 text-center',
        className,
      )}
    >
      <div className="grid size-14 place-items-center rounded-full bg-primary/10">
        <Icon className="size-6 text-primary" />
      </div>
      <h2 className="mt-4 text-base font-bold">{title}</h2>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function CenteredSpinner({ className }: { className?: string }) {
  return (
    <div className={cn('grid place-items-center py-16', className)}>
      <Loader2 className="size-5 animate-spin text-primary" />
    </div>
  );
}

/**
 * Placeholder rows shaped like the content they stand in for.
 *
 * Sized to the real thing rather than generic bars, so the page does not jump
 * when the data lands.
 */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border p-4">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({ tiles = 8 }: { tiles?: number }) {
  return (
    <div className="media-grid">
      {Array.from({ length: tiles }).map((_, i) => (
        <Skeleton key={i} className="aspect-square rounded-xl" />
      ))}
    </div>
  );
}

/** A query that failed for a reason worth surfacing rather than swallowing. */
export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
      <p className="font-medium text-destructive">
        {message || 'Something went wrong.'}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 text-xs font-semibold text-destructive underline underline-offset-2"
        >
          Try again
        </button>
      )}
    </div>
  );
}
