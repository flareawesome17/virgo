'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { CalendarDays, Check, FolderDown, X } from 'lucide-react';
import { ErrorState } from '@/components/states';
import { Skeleton } from '@/components/ui/skeleton';
import { summarize } from '@/components/upload/upload-dock-state';
import { useUploadQueue } from '@/components/upload/upload-provider';
import { revealInFolder } from '@/lib/desktop';
import { cn } from '@/lib/utils';
import { ComingUpRows, MoneyGlance, NeedsRows, NextUp, WorkspaceTile } from './parts';
import type { HomeData } from './use-home';

/** A desktop panel: tighter than the web's card, with its title in its head. */
const PANEL = 'overflow-hidden rounded-[14px] border border-border/60 bg-card';

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="text-xs font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function PanelHead({ title, count, right }: { title: string; count?: number; right?: ReactNode }) {
  return (
    <div className="flex h-9 items-center gap-2 border-b border-border/40 px-3">
      <span className="text-[13px] font-semibold">{title}</span>
      {count ? (
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[11px] font-bold tabular-nums text-primary-foreground">
          {count}
        </span>
      ) : null}
      <span className="flex-1" />
      {right}
    </div>
  );
}

/**
 * Home in the desktop app: three working columns, at the density of a tool.
 *
 * The same day as the web's Home, laid out for a window somebody keeps open
 * while they work: 13px type and 40px rows, so today, the week and the files
 * moving are all in view at once without scrolling. The third column is the
 * one the web has no use for: what is being uploaded and what has just been
 * saved to this computer.
 */
export function DesktopHome({ home }: { home: HomeData }) {
  return (
    <div className="flex flex-col gap-5 px-6 pb-6 pt-5 text-[13px]">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-bold leading-7 tracking-tight">{home.greeting}</h1>
        <p className="text-muted-foreground">{home.dateLine}</p>
      </div>

      <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        <Column title="Today">
          {home.scheduleFailed ? (
            <ErrorState message="Could not load your schedule." onRetry={home.retrySchedule} />
          ) : home.nextEvent ? (
            <NextUp event={home.nextEvent} dense />
          ) : home.scheduleLoading ? (
            <Skeleton className="h-[112px] rounded-[14px]" />
          ) : (
            <Link
              href="/schedule?new=1"
              className={cn(PANEL, 'flex h-12 items-center gap-2.5 px-3 transition-colors hover:border-border')}
            >
              <CalendarDays className="size-4 text-secondary-foreground" />
              <span className="flex-1 text-muted-foreground">Your schedule is clear</span>
              <span className="text-xs font-semibold text-primary">Add event</span>
            </Link>
          )}

          <div className={PANEL}>
            <PanelHead title="Needs you" count={home.needs.length} />
            {home.needs.length > 0 ? (
              <NeedsRows needs={home.needs} dense />
            ) : (
              <p className="px-3 py-3 text-muted-foreground">Nothing is waiting on you.</p>
            )}
          </div>
        </Column>

        <Column title="This week">
          <div className={PANEL}>
            <PanelHead
              title="Coming up"
              right={
                <Link href="/schedule" className="text-xs font-semibold text-primary hover:underline">
                  Schedule
                </Link>
              }
            />
            {home.laterEvents.length > 0 ? (
              <ComingUpRows events={home.laterEvents} workspaceNameById={home.workspaceNameById} dense />
            ) : (
              <p className="px-3 py-3 text-muted-foreground">Nothing else in the next 60 days.</p>
            )}
          </div>

          <div className={PANEL}>
            <PanelHead
              title="Recent work"
              right={
                <Link href="/workspaces" className="text-xs font-semibold text-primary hover:underline">
                  All work
                </Link>
              }
            />
            {home.workspacesFailed ? (
              <div className="p-3">
                <ErrorState message="Could not load your workspaces." onRetry={home.retryWorkspaces} />
              </div>
            ) : home.workspaces.length === 0 ? (
              <p className="px-3 py-3 text-muted-foreground">
                {home.workspacesLoading ? 'Loading…' : 'No workspaces yet.'}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 p-3">
                {home.workspaces.slice(0, 4).map((ws) => (
                  <WorkspaceTile key={ws.id} workspace={ws} dense />
                ))}
              </div>
            )}
          </div>
        </Column>

        <Column title="Studio">
          <Transfers />
          {home.moneyMonths ? (
            <MoneyGlance months={home.moneyMonths} dense />
          ) : home.moneyFailed ? (
            <ErrorState message="Could not load your money." onRetry={home.retryMoney} />
          ) : (
            <Skeleton className="h-[86px] rounded-[14px]" />
          )}
        </Column>
      </div>
    </div>
  );
}

interface Saved {
  name: string;
  path: string | null;
  at: number;
}

/** What the desktop shell announces when a download lands in Downloads. */
const DOWNLOAD_FINISHED = 'virgo:download-finished';

/**
 * Files moving: what is uploading, and what has been saved to this computer
 * since the window was opened.
 *
 * Uploads come from the same queue the upload dock shows, so the two never
 * disagree. A download is only known once it has finished — the shell reports
 * that and nothing before it — so this lists what was saved, not a progress
 * bar it would have to invent.
 */
function Transfers() {
  const { items, checking } = useUploadQueue();
  const uploads = summarize(items);
  const running = uploads.uploading + uploads.queued;
  const [saved, setSaved] = useState<Saved[]>([]);

  useEffect(() => {
    const onFinished = (event: Event) => {
      const detail = (event as CustomEvent<{ name: string; path: string | null; ok: boolean } | undefined>)
        .detail;
      if (!detail?.ok) return;
      setSaved((list) => [{ name: detail.name, path: detail.path, at: Date.now() }, ...list].slice(0, 4));
    };
    window.addEventListener(DOWNLOAD_FINISHED, onFinished);
    return () => window.removeEventListener(DOWNLOAD_FINISHED, onFinished);
  }, []);

  const idle = uploads.total === 0 && checking === 0 && saved.length === 0;

  return (
    <div className={PANEL}>
      <PanelHead
        title="Transfers"
        right={
          running > 0 ? (
            <span className="text-xs tabular-nums text-muted-foreground">{running.toLocaleString()} to go</span>
          ) : undefined
        }
      />
      {idle && (
        <p className="px-3 py-3 text-muted-foreground">
          Nothing is moving. Uploads and saved downloads show here.
        </p>
      )}

      {checking > 0 && (
        <p className="px-3 py-2.5 tabular-nums text-muted-foreground">
          Checking {checking.toLocaleString()} for duplicates
        </p>
      )}

      {uploads.total > 0 && (
        <div className="flex flex-col gap-1.5 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-medium">
              {running > 0 ? 'Uploading' : uploads.failed > 0 ? 'Upload stopped' : 'Uploaded'}
              {uploads.album ? ` to ${uploads.album}` : ''}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {uploads.done.toLocaleString()} of {uploads.total.toLocaleString()}
            </span>
          </div>
          <span aria-hidden className="flex h-1 overflow-hidden rounded-full bg-muted">
            <span
              className={uploads.failed > 0 && running === 0 ? 'bg-destructive' : 'bg-primary'}
              style={{ width: `${Math.round(uploads.fraction * 100)}%` }}
            />
          </span>
          {uploads.failed > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-destructive">
              <X className="size-3.5" />
              {uploads.failed.toLocaleString()} failed
            </span>
          )}
        </div>
      )}

      {saved.map((file) => (
        <div
          key={`${file.name}-${file.at}`}
          className="flex h-10 items-center gap-2 border-t border-border/40 px-3 first:border-t-0"
        >
          <Check className="size-3.5 shrink-0 text-success" />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">Saved {file.name}</span>
          {file.path && (
            <button
              type="button"
              onClick={() => void revealInFolder(file.path as string).catch(() => {})}
              aria-label={`Show ${file.name} in its folder`}
              title="Show in folder"
              className="grid size-7 shrink-0 place-items-center rounded-md text-secondary-foreground transition-colors hover:bg-muted"
            >
              <FolderDown className="size-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
