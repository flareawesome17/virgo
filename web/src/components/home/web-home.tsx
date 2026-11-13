'use client';

import Link from 'next/link';
import { CalendarDays, FolderPlus } from 'lucide-react';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  CARD,
  ComingUpRows,
  DownloadsGlance,
  MoneyGlance,
  NeedsRows,
  NextUp,
  SectionTitle,
  WorkspaceTile,
} from './parts';
import type { HomeData } from './use-home';

/**
 * Home on the web: your day on the left, how things stand on the right.
 *
 * The phone's Home, widened. It opened on four tiles of counts (workspaces,
 * albums, bytes stored, bytes downloaded) above a list of events with a
 * calendar icon each; the one thing somebody opens this page for, what is
 * next and what is waiting, was neither first nor largest.
 *
 * The left column is what to do: the next event on the page's one dark card,
 * what is waiting on you, what follows. The right is what to know: the month's
 * money, client downloads, and the work touched last.
 */
export function WebHome({ home }: { home: HomeData }) {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-7 px-4 pb-12 pt-8 sm:px-6">
      <div>
        <p className="text-[13px] font-semibold text-muted-foreground">{home.dateLine}</p>
        <h1 className="mt-0.5 text-[28px] font-bold leading-9 tracking-tight">{home.greeting}</h1>
      </div>

      <div className="flex flex-wrap items-start gap-7">
        {/* ── Your day ── */}
        <div className="flex min-w-0 flex-[2_1_460px] flex-col gap-7">
          {home.scheduleFailed ? (
            <ErrorState message="Could not load your schedule." onRetry={home.retrySchedule} />
          ) : home.nextEvent ? (
            <NextUp
              event={home.nextEvent}
              workspace={
                home.nextEvent.workspace_id
                  ? home.workspaceNameById[home.nextEvent.workspace_id]
                  : undefined
              }
            />
          ) : home.scheduleLoading ? (
            <Skeleton className="h-[116px] rounded-[20px]" />
          ) : (
            <Link
              href="/schedule?new=1"
              className={cn(CARD, 'flex items-center gap-3 p-4 transition-colors hover:border-border')}
            >
              <span className="grid size-11 place-items-center rounded-[14px] bg-muted">
                <CalendarDays className="size-5 text-secondary-foreground" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">Your schedule is clear</span>
                <span className="block text-[13px] text-muted-foreground">
                  Add a shoot, review, or deadline
                </span>
              </span>
              <span className="text-sm font-semibold text-primary">Add event</span>
            </Link>
          )}

          {/* Only when something is waiting: a quiet day is a short page, not
              a row of zeros. */}
          {home.needs.length > 0 && (
            <section>
              <SectionTitle count={home.needs.length}>Needs you</SectionTitle>
              <div className={cn(CARD, 'overflow-hidden')}>
                <NeedsRows needs={home.needs} />
              </div>
            </section>
          )}

          {home.laterEvents.length > 0 && (
            <section>
              <SectionTitle link={{ label: 'Schedule', href: '/schedule' }}>Coming up</SectionTitle>
              <div className={cn(CARD, 'overflow-hidden')}>
                <ComingUpRows events={home.laterEvents} workspaceNameById={home.workspaceNameById} />
              </div>
            </section>
          )}
        </div>

        {/* ── How things stand ── */}
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-7">
          <section>
            <SectionTitle>Overview</SectionTitle>
            <div className="flex flex-col gap-3">
              {home.moneyMonths ? (
                <MoneyGlance months={home.moneyMonths} />
              ) : home.moneyFailed ? (
                <ErrorState message="Could not load your money." onRetry={home.retryMoney} />
              ) : (
                <Skeleton className="h-[176px] rounded-2xl" />
              )}
              {home.usage && <DownloadsGlance usage={home.usage} />}
            </div>
          </section>

          <section>
            <SectionTitle link={{ label: 'All work', href: '/workspaces' }}>Recent work</SectionTitle>
            {home.workspacesLoading ? (
              <ListSkeleton rows={2} />
            ) : home.workspacesFailed ? (
              <ErrorState message="Could not load your workspaces." onRetry={home.retryWorkspaces} />
            ) : home.workspaces.length === 0 ? (
              <div className={CARD}>
                <EmptyState
                  icon={FolderPlus}
                  title="No workspaces yet"
                  description="A workspace holds the albums, schedule and people for one client."
                  action={
                    <Button asChild size="sm">
                      <Link href="/workspaces">Go to workspaces</Link>
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {home.workspaces.slice(0, 4).map((ws) => (
                  <WorkspaceTile key={ws.id} workspace={ws} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
