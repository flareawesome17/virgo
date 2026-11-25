'use client';

import { useState } from 'react';
import { formatMoney, type MoneyEntry } from '@/api';
import { CARD, SectionTitle } from '@/components/kit';
import { OwedRow, PackageCard, useOwed } from '@/components/money/money-bits';
import { ErrorState, ListSkeleton } from '@/components/states';
import { useMoneyPackages } from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

/** How many finished packages show before the rest fold away: the open ones are the point. */
const PAID_SHOWN = 3;

/**
 * Owed: what has not been paid yet, whatever the month. The number a
 * freelancer chases on the page's one dark card, each payment with the way to
 * say it came, and the packages it belongs to beside them.
 */
export function OwedTab({
  today,
  onOpenEntry,
  onPaid,
  onNewPackage,
}: {
  today: string;
  onOpenEntry: (entry: MoneyEntry) => void;
  onPaid: (entry: MoneyEntry) => void;
  onNewPackage: () => void;
}) {
  const owed = useOwed(today);
  // Every package, not only the open ones: one paid in full says so here.
  const packages = useMoneyPackages('all');
  const [allPaid, setAllPaid] = useState(false);

  const open = packages.packages.filter((pkg) => !pkg.paidInFull);
  const paid = packages.packages.filter((pkg) => pkg.paidInFull);
  const shown = [...open, ...(allPaid ? paid : paid.slice(0, PAID_SHOWN))];
  const folded = packages.packages.length - shown.length;
  const waiting = owed.toYou.length + owed.byYou.length;
  const nothingOwed = waiting === 0 && open.length === 0;

  return (
    <div className="flex flex-wrap items-start gap-7">
      <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-6">
        <article className="flex flex-wrap items-center gap-4 rounded-[20px] bg-foreground px-6 py-5 text-background">
          <div className="flex flex-[1_1_240px] flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-background/70">Owed to you</span>
            <span className="text-[28px] font-bold leading-9 tracking-tight tabular-nums">
              {formatMoney(owed.owedMinor)}
            </span>
          </div>
          <span className="text-sm text-background/70">
            {owed.toYou.length === 0 ? (
              'Nobody owes you anything right now.'
            ) : (
              <>
                {owed.toYou.length} {owed.toYou.length === 1 ? 'entry' : 'entries'} ·{' '}
                {owed.lateMinor > 0 ? (
                  // The accent, mixed toward the card's own text so it reads on
                  // the dark card and on the light one dark mode turns it into.
                  <span className="font-semibold text-[color:color-mix(in_oklab,var(--primary)_65%,var(--background))]">
                    {formatMoney(owed.lateMinor)} is late
                  </span>
                ) : (
                  'none of it is late'
                )}
              </>
            )}
          </span>
        </article>

        {owed.isLoading && waiting === 0 ? (
          <ListSkeleton rows={2} />
        ) : owed.loadFailed && waiting === 0 ? (
          <ErrorState message="Could not load what is owed." onRetry={() => void owed.refetch()} />
        ) : null}

        {owed.toYou.length > 0 && (
          <section>
            <SectionTitle>Waiting for payment</SectionTitle>
            <ul className={cn(CARD, 'overflow-hidden')}>
              {owed.toYou.map((entry) => (
                <OwedRow
                  key={entry.id}
                  entry={entry}
                  today={today}
                  onOpen={() => onOpenEntry(entry)}
                  onPaid={() => onPaid(entry)}
                />
              ))}
            </ul>
          </section>
        )}

        {owed.byYou.length > 0 && (
          <section>
            <SectionTitle>You still owe</SectionTitle>
            <ul className={cn(CARD, 'overflow-hidden')}>
              {owed.byYou.map((entry) => (
                <OwedRow
                  key={entry.id}
                  entry={entry}
                  today={today}
                  onOpen={() => onOpenEntry(entry)}
                  onPaid={() => onPaid(entry)}
                />
              ))}
            </ul>
          </section>
        )}

        {nothingOwed && !owed.isLoading && !owed.loadFailed && (
          <p className="text-[13px] leading-[19px] text-muted-foreground">
            When you record income that has not been paid yet, it waits here until you mark it as received.
          </p>
        )}
      </div>

      <section className="flex min-w-0 flex-[1_1_320px] flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold tracking-tight">Packages</h2>
          <button
            type="button"
            onClick={onNewPackage}
            className="rounded-md text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            New
          </button>
        </div>
        {packages.isLoading && packages.packages.length === 0 ? (
          <ListSkeleton rows={2} />
        ) : packages.loadFailed && packages.packages.length === 0 ? (
          <ErrorState message="Could not load your packages." onRetry={() => void packages.refetch()} />
        ) : packages.packages.length === 0 ? (
          <p className={cn(CARD, 'p-4 text-[13px] leading-[19px] text-muted-foreground')}>
            A package is one job paid in parts: the total, the deposit and the balance. Virgo keeps track of what is
            left and when it is due.
          </p>
        ) : (
          <>
            {shown.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} today={today} />
            ))}
            {folded > 0 && (
              <button
                type="button"
                onClick={() => setAllPaid(true)}
                className="self-start rounded-md text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Show {folded} more
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
