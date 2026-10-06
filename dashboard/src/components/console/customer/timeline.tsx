'use client';

import Link from 'next/link';
import {
  BadgeCheck,
  Briefcase,
  CalendarCheck,
  CreditCard,
  Flag,
  FolderOpen,
  Gift,
  Image as ImageIcon,
  LifeBuoy,
  Link2,
  Mail,
  ShieldAlert,
  StickyNote,
  UserPlus,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { TimelineEvent } from '@/api/console';
import { useTimeline } from '@/hooks/useConsole';
import { DataState } from '@/components/console/primitives';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const KIND: Record<string, { icon: LucideIcon; tone?: string }> = {
  signup: { icon: UserPlus, tone: 'text-primary' },
  verified: { icon: BadgeCheck, tone: 'text-success' },
  console: { icon: Wrench, tone: 'text-info' },
  note: { icon: StickyNote, tone: 'text-warning' },
  album: { icon: FolderOpen },
  link: { icon: Link2 },
  ticket: { icon: LifeBuoy },
  reported: { icon: ShieldAlert, tone: 'text-destructive' },
  report: { icon: Flag },
  promo: { icon: Gift },
  showcase: { icon: ImageIcon },
  job: { icon: Briefcase },
  application: { icon: Briefcase },
  enquiry: { icon: Mail },
  booking: { icon: CalendarCheck, tone: 'text-success' },
  subscription: { icon: CreditCard },
};

function dayOf(at: string) {
  return new Date(at).toLocaleDateString('en-PH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Everything that happened to and by the account, newest first and grouped by
 * day: what they did in the app, what staff did to the account, and the notes
 * staff left. Older days load on request.
 */
export function TimelineTab({ id }: { id: string }) {
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTimeline(id);
  const events = data?.pages.flatMap((p) => p.data) ?? [];

  const days: { day: string; events: TimelineEvent[] }[] = [];
  for (const e of events) {
    const day = dayOf(e.at);
    if (days[days.length - 1]?.day !== day) days.push({ day, events: [] });
    days[days.length - 1].events.push(e);
  }

  return (
    <DataState
      isLoading={isLoading}
      isError={isError}
      isEmpty={events.length === 0}
      emptyLabel="Nothing recorded yet"
      onRetry={() => void refetch()}
    >
      <div className="space-y-6">
        {days.map(({ day, events: list }) => (
          <section key={day}>
            <p className="caption mb-2">{day}</p>
            <ol className="relative space-y-0.5 border-l pl-5">
              {list.map((e, i) => {
                const kind = KIND[e.kind] ?? { icon: Wrench };
                const Icon = kind.icon;
                const body = (
                  <>
                    <span
                      className={cn(
                        'absolute -left-[11px] top-2.5 grid size-5 place-items-center rounded-full border bg-card',
                        kind.tone ?? 'text-muted-foreground',
                      )}
                    >
                      <Icon className="size-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{e.title}</span>
                        {e.actor && (
                          <span className="ml-1.5 text-xs text-muted-foreground">by {e.actor}</span>
                        )}
                      </p>
                      {e.detail && (
                        <p
                          className={cn(
                            'mt-0.5 text-xs text-muted-foreground',
                            e.kind === 'note' ? 'whitespace-pre-wrap wrap-anywhere' : 'truncate',
                          )}
                        >
                          {e.detail}
                        </p>
                      )}
                    </div>
                    <time
                      className="shrink-0 text-xs tabular-nums text-muted-foreground"
                      title={new Date(e.at).toLocaleString()}
                    >
                      {new Date(e.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                    </time>
                  </>
                );
                return (
                  <li key={`${e.at}-${i}`} className="relative">
                    {e.link ? (
                      <Link
                        href={e.link}
                        className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-start gap-3 px-2 py-2">{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        {hasNextPage && (
          <Button
            variant="outline"
            size="sm"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load older'}
          </Button>
        )}
      </div>
    </DataState>
  );
}
