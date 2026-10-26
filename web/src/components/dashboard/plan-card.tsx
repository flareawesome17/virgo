import Link from 'next/link';
import { Gauge } from 'lucide-react';
import { downloadsPaused, formatBytes, type UsageSummary } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** One kind of file and what it takes up, from the storage breakdown. */
export interface StoredKind {
  kind: string;
  bytes: number;
}

/**
 * The kinds in the order the bar draws them, with the phone's colours: the
 * brand for photos, then blue, green and the muted ink. Not the storage
 * screen's chart-1 and chart-2 for photos and videos, which are two shades of
 * the same terracotta and could not be told apart side by side in one bar.
 */
const KINDS = [
  { kind: 'image', label: 'Photos', color: 'var(--chart-1)' },
  { kind: 'video', label: 'Videos', color: 'var(--chart-5)' },
  { kind: 'audio', label: 'Audio', color: 'var(--chart-4)' },
  { kind: 'other', label: 'Other', color: 'var(--muted-foreground)' },
];

/** From here the month's downloads read as nearly gone. */
const DOWNLOADS_WARNING = 0.8;

function percent(part: number, whole: number): string {
  return `${Math.min(100, Math.max(0, (part / whole) * 100))}%`;
}

/**
 * "Your plan" in the Dashboard's side rail: what the account has used of
 * everything the plan limits.
 *
 * Storage as one bar split by kind, so it says what is filling it as well as
 * how full it is; the month's client downloads, which turn red from 80% and
 * say when they start again, or that they are paused; and the two counts the
 * plan caps. Takes plain figures, and dashes until `usage` arrives: "0 B" is
 * a real answer and must not be given before there is one.
 */
export function PlanCard({
  usage,
  byKind,
}: {
  usage: UsageSummary | undefined;
  /** Bytes by kind. Empty draws the storage bar in one colour. */
  byKind: StoredKind[];
}) {
  const plan = usage?.plan;
  const usedBytes = usage?.storage.usedBytes ?? 0;
  const limitBytes = usage?.storage.limitBytes ?? null;
  // Against the limit when there is one; an unlimited plan's bar is the split
  // alone, full width.
  const scale = limitBytes || Math.max(usedBytes, 1);
  const kinds = KINDS.map((k) => ({
    ...k,
    bytes: byKind.find((row) => row.kind === k.kind)?.bytes ?? 0,
  })).filter((k) => k.bytes > 0);

  const downloads = usage?.downloads ?? null;
  const downloadLimit = downloads?.limitBytes ?? null;
  const downloadFraction = downloads && downloadLimit ? downloads.usedBytes / downloadLimit : 0;
  const paused = !!downloads && downloadsPaused(downloads);
  // In UTC: the count starts again at midnight UTC on the 1st, which reads as
  // the 31st anywhere west of Greenwich in the browser's own zone.
  const resets = downloads
    ? new Date(downloads.resetsAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : '';

  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            Your plan{plan ? ` · ${plan.charAt(0).toUpperCase()}${plan.slice(1)}` : ''}
          </h3>
        </div>

        {/* Storage */}
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs text-muted-foreground">Storage</p>
            <p className="text-sm font-bold tabular-nums">
              {usage ? formatBytes(usedBytes) : '—'}
              <span className="font-medium text-muted-foreground">
                {limitBytes ? ` / ${formatBytes(limitBytes)}` : usage ? ' used' : ''}
              </span>
            </p>
          </div>
          {/* The legend below names each part, so no kind is told by colour
              alone; the gaps keep neighbours apart where two are close. */}
          <div
            className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={
              usage
                ? `${formatBytes(usedBytes)}${limitBytes ? ` of ${formatBytes(limitBytes)}` : ''} stored${
                    kinds.length
                      ? `: ${kinds.map((k) => `${k.label.toLowerCase()} ${formatBytes(k.bytes)}`).join(', ')}`
                      : ''
                  }`
                : 'Storage not loaded yet'
            }
          >
            {kinds.length > 0
              ? kinds.map((k) => (
                  <span
                    key={k.kind}
                    className="h-full shrink-0"
                    // A sliver at least, or a few megabytes of audio would be
                    // in the legend and nowhere on the bar.
                    style={{ width: percent(k.bytes, scale), minWidth: 3, backgroundColor: k.color }}
                    title={`${k.label}: ${formatBytes(k.bytes)}`}
                  />
                ))
              : usedBytes > 0 && (
                  <span className="h-full bg-primary" style={{ width: percent(usedBytes, scale) }} />
                )}
          </div>
          {kinds.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {kinds.map((k) => (
                <li key={k.kind} className="flex items-center gap-1.5">
                  <span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: k.color }} />
                  {k.label}
                  <span className="font-medium tabular-nums text-foreground">{formatBytes(k.bytes)}</span>
                </li>
              ))}
            </ul>
          )}
          {/* The ceiling is more than the plan gives once a reward is
              claimed; say so, or the reward looks like it did nothing. */}
          {usage?.bonus?.storageBytes ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Includes {formatBytes(usage.bonus.storageBytes)} from rewards
            </p>
          ) : null}
        </div>

        {/* What share links delivered this month, each file once. Over the
            allowance the gallery still opens; new downloads wait for the
            reset, so say when that is. Absent when the server could not count. */}
        {downloads && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs text-muted-foreground">Client downloads this month</p>
              <p className="shrink-0 text-sm font-bold tabular-nums">
                {formatBytes(downloads.usedBytes)}
                {downloadLimit != null && (
                  <span className="font-medium text-muted-foreground"> / {formatBytes(downloadLimit)}</span>
                )}
              </p>
            </div>
            {downloadLimit != null && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full',
                    downloadFraction >= DOWNLOADS_WARNING ? 'bg-destructive' : 'bg-primary',
                  )}
                  style={{ width: percent(downloads.usedBytes, downloadLimit) }}
                />
              </div>
            )}
            <p
              className={cn(
                'mt-1.5 text-xs',
                paused ? 'font-semibold text-destructive' : 'text-muted-foreground',
              )}
            >
              {paused ? `Paused until ${resets}` : `Resets ${resets}`}
              {!!downloads.extraBytes && ` · includes ${formatBytes(downloads.extraBytes)} extra`}
            </p>
          </div>
        )}

        {/* What the plan counts */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted px-3 py-2.5">
            <p className="text-sm font-bold tabular-nums">
              {usage
                ? usage.workspaces.limit != null
                  ? `${usage.workspaces.used} of ${usage.workspaces.limit}`
                  : usage.workspaces.used.toLocaleString()
                : '—'}
            </p>
            <p className="text-xs text-muted-foreground">Workspaces</p>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2.5">
            <p className="truncate text-sm font-bold tabular-nums">
              {usage
                ? usage.albums.limit != null
                  ? `${usage.albums.limit} per workspace`
                  : usage.albums.used.toLocaleString()
                : '—'}
            </p>
            <p className="text-xs text-muted-foreground">Albums</p>
          </div>
        </div>

        <Button asChild variant="outline" size="sm" className="mt-4 w-full">
          <Link href="/settings/storage">Manage storage</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
