'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight, ChevronRight, FolderOpen } from 'lucide-react';
import {
  downloadsPaused,
  formatBytes,
  formatMoney,
  type ScheduleEvent,
  type UsageSummary,
  type Workspace,
} from '@/api';
import { useAlbums } from '@/hooks/useAlbums';
import { eventColor, eventTypeLabel, formatTime, labelForDateKey, parseDateKey } from '@/lib/calendar';
import { plural } from '@/lib/workspaces';
import { cn } from '@/lib/utils';
import { startsIn, type MoneyMonth, type Need } from './use-home';

/*
 * The pieces Home is made of, on the web and in the desktop app.
 *
 * The same pieces at two densities: `dense` is the desktop app's, where rows
 * are 40px and type is 13px because the window is a place to work in all day.
 * The web's are roomier, for somebody dropping in from a browser tab.
 */

/** The one card: white on the page, one radius, one hairline. */
export const CARD = 'rounded-2xl border border-border/60 bg-card';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

/** A section's title, with what is waiting in it and where the rest is. */
export function SectionTitle({
  children,
  count,
  link,
}: {
  children: ReactNode;
  count?: number;
  link?: { label: string; href: string };
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold tracking-tight">{children}</h2>
        {count ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold tabular-nums text-primary-foreground">
            {count}
          </span>
        ) : null}
      </div>
      {link && (
        <Link href={link.href} className="text-sm font-semibold text-primary hover:underline">
          {link.label}
        </Link>
      )}
    </div>
  );
}

/** "SAT" over "14": the date as every dated row here shows it. */
function dateParts(dateStr: string): { weekday: string; day: number } {
  const d = parseDateKey(dateStr.slice(0, 10));
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    day: d.getDate(),
  };
}

/**
 * What is next, on the page's one inverted card: dark on the light theme,
 * light on the dark one, so it is the first thing seen in either.
 */
export function NextUp({
  event,
  workspace,
  dense = false,
}: {
  event: ScheduleEvent;
  workspace?: string;
  dense?: boolean;
}) {
  const countdown = startsIn(event);
  const date = dateParts(event.event_date);
  const facts = [formatTime(event.event_time), event.location?.trim(), dense ? null : workspace]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      href={`/schedule?date=${event.event_date}`}
      className={cn(
        'group flex bg-foreground text-background outline-none transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring',
        dense ? 'flex-col gap-3 rounded-[14px] p-4' : 'flex-wrap items-center gap-5 rounded-[20px] p-6',
      )}
    >
      {dense && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-background/70">Next up</span>
          <Countdown text={countdown ? `Starts ${countdown}` : labelForDateKey(event.event_date)} dense />
        </div>
      )}
      <div className={cn('flex min-w-0', dense ? 'gap-3' : 'flex-1 basis-64 items-center gap-5')}>
        <div
          className={cn(
            'flex shrink-0 flex-col items-center bg-background/10',
            dense ? 'w-11 rounded-[10px] py-1.5' : 'w-16 rounded-[14px] py-2.5',
          )}
        >
          <span className="text-[10px] font-bold tracking-wider text-background/70">{date.weekday}</span>
          <span className={cn('font-bold tabular-nums', dense ? 'text-lg leading-[22px]' : 'text-[28px] leading-8')}>
            {date.day}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          {!dense && (
            <div className="flex items-center gap-2.5">
              <span className="text-[13px] font-semibold text-background/70">Next up</span>
              <Countdown text={countdown ? `Starts ${countdown}` : labelForDateKey(event.event_date)} />
            </div>
          )}
          <h2
            className={cn(
              'truncate font-bold tracking-tight',
              dense ? 'text-[15px] leading-5' : 'text-[22px] leading-7',
            )}
          >
            {event.title}
          </h2>
          <p className={cn('truncate text-background/70', dense ? 'text-xs' : 'text-sm')}>
            {facts || eventTypeLabel(event)}
          </p>
        </div>
      </div>
      {!dense && (
        <span className="flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] bg-background px-4 text-sm font-semibold text-foreground">
          Open event
          <ArrowUpRight className="size-4" />
        </span>
      )}
    </Link>
  );
}

function Countdown({ text, dense = false }: { text: string; dense?: boolean }) {
  return (
    <span
      className={cn(
        'rounded-full bg-action font-bold text-action-foreground',
        dense ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs',
      )}
    >
      {text}
    </span>
  );
}

/** Everything waiting on you, one row each; each row says where it leads. */
export function NeedsRows({ needs, dense = false }: { needs: Need[]; dense?: boolean }) {
  return (
    <>
      {needs.map((need, i) => {
        const Icon = need.icon;
        return (
          <Link
            key={need.key}
            href={need.href}
            className={cn(
              'flex items-center transition-colors hover:bg-muted/50',
              dense ? 'h-10 gap-2.5 px-3 text-[13px]' : 'min-h-[52px] gap-3 px-4 text-sm',
              i > 0 && 'border-t border-border/40',
            )}
          >
            <Icon
              className={cn(
                'shrink-0',
                dense ? 'size-[15px]' : 'size-[18px]',
                need.urgent ? 'text-destructive' : 'text-secondary-foreground',
              )}
            />
            <span className={cn('min-w-0 flex-1 truncate', dense ? 'font-medium' : 'font-semibold')}>
              {need.text}
            </span>
            <span className={cn('shrink-0 text-muted-foreground', dense ? 'text-xs' : 'text-[13px]')}>
              {need.where}
            </span>
            {!dense && <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" />}
          </Link>
        );
      })}
    </>
  );
}

/** What follows, led by the date. */
export function ComingUpRows({
  events,
  workspaceNameById,
  dense = false,
}: {
  events: ScheduleEvent[];
  workspaceNameById: Record<string, string>;
  dense?: boolean;
}) {
  return (
    <>
      {events.map((event, i) => {
        const date = dateParts(event.event_date);
        const workspace = event.workspace_id ? workspaceNameById[event.workspace_id] : '';
        const kind = [eventTypeLabel(event), workspace].filter(Boolean).join(' · ');
        const dot = (
          <span
            aria-hidden
            className="size-[7px] shrink-0 rounded-full"
            style={{ backgroundColor: eventColor(event.event_type) }}
          />
        );
        return (
          <Link
            key={event.id}
            href={`/schedule?date=${event.event_date}`}
            className={cn(
              'flex items-center transition-colors hover:bg-muted/50',
              dense ? 'h-11 gap-2.5 px-3 text-[13px]' : 'min-h-[60px] gap-3.5 pl-2.5 pr-4 text-sm',
              i > 0 && 'border-t border-border/40',
            )}
          >
            {dense ? (
              <>
                <span className="w-[52px] shrink-0 text-xs font-semibold tabular-nums text-secondary-foreground">
                  {date.weekday.charAt(0) + date.weekday.slice(1).toLowerCase()} {date.day}
                </span>
                {dot}
                <span className="min-w-0 flex-1 truncate font-medium">{event.title}</span>
              </>
            ) : (
              <>
                <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-muted">
                  <span className="text-[10px] font-bold leading-3 tracking-wider text-muted-foreground">
                    {date.weekday}
                  </span>
                  <span className="text-base font-bold leading-5 tabular-nums">{date.day}</span>
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{event.title}</span>
                <span className="hidden min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground sm:flex">
                  {dot}
                  <span className="truncate">{kind}</span>
                </span>
              </>
            )}
            {event.event_time ? (
              <span
                className={cn(
                  'shrink-0 text-right tabular-nums',
                  dense ? 'text-xs text-muted-foreground' : 'w-[72px] text-[13px] font-semibold text-secondary-foreground',
                )}
              >
                {formatTime(event.event_time)}
              </span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}

/**
 * This month's income and what was spent, in the six months it sits in. This
 * month's bar is the coloured one. The whole tile opens Money.
 */
export function MoneyGlance({ months, dense = false }: { months: MoneyMonth[]; dense?: boolean }) {
  const current = months[months.length - 1];
  const peak = Math.max(...months.map((m) => m.incomeMinor), 1);
  const monthName = MONTHS[Number(current.month.slice(5, 7)) - 1] ?? 'this month';
  const height = dense ? 40 : 48;

  const bars = (
    <span
      role="img"
      aria-label={`Income over the last six months; ${formatMoney(current.incomeMinor)} this month`}
      className={cn('flex items-end', dense ? 'w-24 gap-1' : 'mt-4 gap-2')}
      style={{ height }}
    >
      {months.map((m, i) => (
        <span
          key={m.month}
          className={cn('flex-1 rounded', i === months.length - 1 ? 'bg-primary' : 'bg-muted-foreground/25')}
          style={{ height: Math.max(3, Math.round((m.incomeMinor / peak) * height)) }}
        />
      ))}
    </span>
  );

  return (
    <Link
      href="/money"
      className={cn(
        CARD,
        'flex transition-colors hover:border-border',
        dense ? 'items-end gap-3 rounded-[14px] p-3' : 'flex-col p-4',
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('font-semibold text-muted-foreground', dense ? 'text-xs' : 'text-[13px]')}>
          Earned in {monthName}
        </span>
        <span
          className={cn(
            'truncate font-bold tracking-tight tabular-nums',
            dense ? 'text-xl leading-[26px]' : 'mt-1 text-2xl leading-[30px]',
          )}
        >
          {formatMoney(current.incomeMinor)}
        </span>
        <span className={cn('text-muted-foreground', dense ? 'text-xs' : 'text-[13px]')}>
          {formatMoney(current.expenseMinor)} spent
        </span>
      </span>
      {bars}
      {!dense && (
        <span aria-hidden className="mt-1.5 flex gap-2 text-center text-[11px] text-muted-foreground">
          {months.map((m, i) => (
            <span
              key={m.month}
              className={cn('flex-1', i === months.length - 1 && 'font-semibold text-foreground')}
            >
              {SHORT[Number(m.month.slice(5, 7)) - 1]}
            </span>
          ))}
        </span>
      )}
    </Link>
  );
}

/**
 * This month's client downloads against the allowance. Red from 80%, and it
 * says when they are paused: the first sign of that allowance running out
 * was once a client's screenshot.
 */
export function DownloadsGlance({ usage }: { usage: UsageSummary }) {
  const downloads = usage.downloads;
  if (!downloads) return null;
  const limit = downloads.limitBytes ?? null;
  const fraction = limit ? downloads.usedBytes / limit : 0;
  const paused = downloadsPaused(downloads);
  const hot = paused || fraction >= 0.8;
  // Named in UTC: the count starts again at midnight UTC on the 1st.
  const reset = new Date(downloads.resetsAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <Link
      href="/settings/storage"
      className={cn(CARD, 'flex flex-col gap-2.5 p-4 transition-colors hover:border-border')}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-muted-foreground">Client downloads this month</span>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums">
          {formatBytes(downloads.usedBytes)}
          {limit != null ? ` of ${formatBytes(limit)}` : ''}
        </span>
      </span>
      {limit != null && (
        <span aria-hidden className="flex h-1.5 overflow-hidden rounded-full bg-muted">
          <span
            className={hot ? 'bg-destructive' : 'bg-primary'}
            style={{ width: `${Math.min(fraction * 100, 100)}%` }}
          />
        </span>
      )}
      <span className={cn('text-xs', hot ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
        {paused ? `Paused until ${reset}` : `Resets ${reset}`}
      </span>
    </Link>
  );
}

/**
 * A workspace under a photograph from it: its chosen album's cover, or the
 * newest album that has one. With none yet, a folder in the workspace's own
 * colour.
 *
 * It asks for the workspace's albums to find the picture — the same request
 * the workspace makes when opened, so the click after it lands on a list
 * already loaded.
 */
export function WorkspaceTile({ workspace: ws, dense = false }: { workspace: Workspace; dense?: boolean }) {
  const { albums } = useAlbums(
    { workspace_id: ws.id, orderBy: 'created_at', direction: 'desc', limit: 100 },
    { enabled: ws.album_count > 0 },
  );
  const cover =
    albums.find((a) => a.id === ws.cover_album_id)?.cover_url ??
    albums.find((a) => a.cover_url)?.cover_url ??
    null;
  const accent = ws.accent_color || 'var(--primary)';

  return (
    <Link href={`/workspaces/${ws.id}`} className="group flex min-w-0 flex-col">
      <span
        className={cn(
          'grid place-items-center overflow-hidden',
          dense ? 'aspect-[3/2] rounded-lg' : 'aspect-[4/3] rounded-xl',
        )}
        style={{ backgroundColor: `color-mix(in srgb, ${accent} 15%, transparent)` }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, not an asset to optimise
          <img src={cover} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
        ) : (
          <FolderOpen className="size-6" style={{ color: accent }} />
        )}
      </span>
      <span className={cn('truncate font-semibold', dense ? 'mt-1.5 text-xs' : 'mt-2 text-[13px]')}>{ws.name}</span>
      <span className={cn('truncate text-muted-foreground', dense ? 'text-[11px]' : 'text-xs')}>
        {/* Its size only for the owner: the API keeps a member's share of
            somebody else's storage to itself. */}
        {[
          ws.album_count > 0 ? plural(ws.album_count, 'album') : 'No albums yet',
          ws.storage_bytes ? formatBytes(ws.storage_bytes) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </Link>
  );
}
