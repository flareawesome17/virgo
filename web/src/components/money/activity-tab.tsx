'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Link2, Wallet } from 'lucide-react';
import {
  formatMoney,
  monthLabel,
  monthOf,
  monthRange,
  payMethodName,
  shiftMonth,
  type MoneyEntry,
  type MoneyKind,
  type MoneySuggestion,
} from '@/api';
import { CARD, FilterChip } from '@/components/kit';
import {
  dayHeading,
  EntryRow,
  LateNotice,
  monthAndYear,
  ROW_BUTTON,
  signedNet,
  SuggestionRow,
  useOwed,
} from '@/components/money/money-bits';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  useDismissMoneySuggestion,
  useMoneyEntries,
  useMoneyPayMethods,
  useMoneySavings,
  useMoneySuggestions,
  useMoneySummary,
} from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

export type MoneyFilter = 'all' | MoneyKind;

export const MONEY_FILTERS: readonly (readonly [MoneyFilter, string])[] = [
  ['all', 'All'],
  ['income', 'Income'],
  ['expense', 'Expenses'],
];

/** Said under the month's totals when clients kept some of the income back. */
export const withheldLine = (minor: number) =>
  `${formatMoney(minor)} of the income was withheld by clients as tax. Keep their 2307s.`;

/** The disclaimer under the month's entries, as on the phone. Not to be shortened. */
export const TOTALS_NOTE =
  'Totals are what you’ve recorded, counted on the day each was paid. They are for planning — not tax advice, and not a BIR book of accounts.';

/**
 * What the month's page reads: its entries, its totals, the bookings not
 * recorded yet and what is still owed. One hook for the web's layout and the
 * desktop app's ledger, so the two never ask for different things.
 */
export function useMonthActivity(month: string, today: string, filter: MoneyFilter) {
  const range = monthRange(month);
  const kind = filter === 'all' ? undefined : filter;
  const summary = useMoneySummary(range.from, range.to);
  const list = useMoneyEntries({ from: range.from, to: range.to, kind, limit: 200 });
  const offers = useMoneySuggestions();
  const saved = useMoneySavings(month);
  const dismiss = useDismissMoneySuggestion();
  const owed = useOwed(today);

  const s = summary.summary;
  const inMinor = s?.incomeMinor ?? 0;
  const outMinor = s?.expenseMinor ?? 0;
  return {
    list,
    saved,
    owed,
    dismiss,
    offered: offers.suggestions.filter((offer) => !kind || offer.kind === kind),
    isThisMonth: month === monthOf(today),
    inMinor,
    outMinor,
    keptMinor: inMinor - outMinor,
    /** Tax clients kept back from the month's income. */
    withheldMinor: s?.withheldMinor ?? 0,
  };
}

/** A month with nothing in it: what the page is for, and the two ways to start. */
export function EmptyMonth({
  month,
  today,
  onAdd,
}: {
  month: string;
  today: string;
  onAdd: (kind: MoneyKind) => void;
}) {
  return (
    <div className={CARD}>
      <EmptyState
        icon={Wallet}
        title={`Nothing in ${monthLabel(month, today)} yet`}
        description="Log a job fee or an expense as it happens — the pamasahe, the meal, the second shooter. Only you can see it."
        action={
          // Quiet, both: the filled Add entry is in the bar.
          <div className="flex gap-2">
            <Button variant="secondary" className={ROW_BUTTON} onClick={() => onAdd('expense')}>
              Add expense
            </Button>
            <Button variant="secondary" className={ROW_BUTTON} onClick={() => onAdd('income')}>
              Add income
            </Button>
          </div>
        }
      />
    </div>
  );
}

/** One of the three figures under the month's lead. */
function Figure({ label, minor }: { label: string; minor: number }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-[15px] font-semibold tabular-nums">{formatMoney(minor)}</span>
    </div>
  );
}

/**
 * Activity: the month. What moved, by day, on the left; what was kept, and
 * the ways on to what is owed and how clients pay, on the right.
 *
 * What is not paid yet is on Owed, not under its due day here.
 */
export function ActivityTab({
  month,
  today,
  filter,
  onMonth,
  onFilter,
  onOpenOwed,
  onOpenEntry,
  onRecord,
  onAdd,
}: {
  /** YYYY-MM. */
  month: string;
  today: string;
  filter: MoneyFilter;
  onMonth: (month: string) => void;
  onFilter: (filter: MoneyFilter) => void;
  onOpenOwed: () => void;
  onOpenEntry: (entry: MoneyEntry) => void;
  onRecord: (suggestion: MoneySuggestion) => void;
  onAdd: (kind: MoneyKind) => void;
}) {
  const { list, saved, owed, dismiss, offered, isThisMonth, inMinor, outMinor, keptMinor, withheldMinor } =
    useMonthActivity(month, today, filter);
  const { payMethods } = useMoneyPayMethods();

  const days = useMemo(() => {
    const byDay = new Map<string, MoneyEntry[]>();
    for (const entry of list.entries) {
      if (entry.paidOn === null) continue;
      const bucket = byDay.get(entry.paidOn);
      if (bucket) bucket.push(entry);
      else byDay.set(entry.paidOn, [entry]);
    }
    return [...byDay.entries()];
  }, [list.entries]);

  const loading = list.isLoading;
  const failed = list.loadFailed && list.entries.length === 0;
  const empty = !loading && !failed && days.length === 0 && offered.length === 0;
  const payNames = payMethods.map(payMethodName).join(', ');

  return (
    <div className="flex flex-wrap items-start gap-7">
      <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-[10px]"
              aria-label="Previous month"
              onClick={() => onMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft className="size-[17px]" />
            </Button>
            <h2 className="px-1 text-base font-bold">{monthAndYear(month)}</h2>
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-[10px]"
              aria-label="Next month"
              // Nothing is paid in a month that has not come.
              disabled={isThisMonth}
              onClick={() => onMonth(shiftMonth(month, 1))}
            >
              <ChevronRight className="size-[17px]" />
            </Button>
          </div>
          {!isThisMonth && (
            <Button variant="link" size="sm" className="font-semibold" onClick={() => onMonth(monthOf(today))}>
              This month
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2" role="group" aria-label="Show">
            {MONEY_FILTERS.map(([key, label]) => (
              <FilterChip key={key} on={filter === key} onClick={() => onFilter(key)}>
                {label}
              </FilterChip>
            ))}
          </div>
        </div>

        <LateNotice owed={owed} today={today} onOpenOwed={onOpenOwed} />

        {loading ? (
          <ListSkeleton rows={4} />
        ) : failed ? (
          <ErrorState message="Could not load your money entries." onRetry={() => void list.refetch()} />
        ) : empty ? (
          <EmptyMonth month={month} today={today} onAdd={onAdd} />
        ) : (
          <>
            {/* Agreed bookings not recorded yet: each is a click from right. */}
            {offered.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-bold">From your bookings</h2>
                <ul className={CARD}>
                  {offered.map((suggestion) => (
                    <SuggestionRow
                      key={suggestion.bookingId}
                      suggestion={suggestion}
                      onRecord={() => onRecord(suggestion)}
                      onDismiss={() => dismiss.mutate(suggestion.bookingId)}
                    />
                  ))}
                </ul>
              </section>
            )}
            {days.map(([day, entries]) => (
              <section key={day} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-bold">{dayHeading(day, today)}</h2>
                  <span className="text-[13px] tabular-nums text-muted-foreground">
                    {signedNet(
                      entries.reduce(
                        (sum, entry) => sum + (entry.kind === 'income' ? entry.amountMinor : -entry.amountMinor),
                        0,
                      ),
                    )}
                  </span>
                </div>
                <ul className={cn(CARD, 'overflow-hidden')}>
                  {entries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} onOpen={() => onOpenEntry(entry)} />
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}

        <p className="text-[13px] leading-[18px] text-muted-foreground">{TOTALS_NOTE}</p>
      </div>

      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
        {/* The month: what was kept leads, and the rest explains it. */}
        <div className={cn(CARD, 'flex flex-col gap-3 p-4')}>
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-muted-foreground">
              Kept in {monthLabel(month, today)}
            </span>
            <span
              className={cn(
                'truncate text-[28px] font-bold leading-9 tracking-tight tabular-nums',
                keptMinor < 0 && 'text-destructive',
              )}
            >
              {formatMoney(keptMinor)}
            </span>
          </div>
          {/* In against out, as one bar: how much of what came in is still here. */}
          <span
            role="img"
            aria-label={`In ${formatMoney(inMinor)}, out ${formatMoney(outMinor)}`}
            className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted"
          >
            {inMinor > 0 && <span className="bg-success" style={{ flex: inMinor }} />}
            {outMinor > 0 && <span className="bg-muted-foreground/40" style={{ flex: outMinor }} />}
          </span>
          <div className="flex gap-3 border-t border-border/40 pt-3">
            <Figure label="In" minor={inMinor} />
            <Figure label="Out" minor={outMinor} />
            <Figure label="Set aside" minor={saved.monthMinor} />
          </div>
          {withheldMinor > 0 && (
            <p className="text-xs leading-[17px] text-muted-foreground">{withheldLine(withheldMinor)}</p>
          )}
        </div>

        {owed.toYou.length > 0 && (
          <button
            type="button"
            onClick={onOpenOwed}
            className={cn(
              CARD,
              'flex min-h-14 items-center gap-3 px-4 py-2 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50',
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold">Owed to you</span>
              <span className="text-[13px] text-muted-foreground">
                {owed.toYou.length} {owed.toYou.length === 1 ? 'entry' : 'entries'}
                {owed.late.length > 0 ? ` · ${owed.late.length} late` : ''}
              </span>
            </span>
            <span className="shrink-0 text-[15px] font-semibold tabular-nums">{formatMoney(owed.owedMinor)}</span>
            <ChevronRight className="size-[15px] shrink-0 text-muted-foreground/70" aria-hidden />
          </button>
        )}

        <Link
          href="/money/pay-methods"
          className={cn(
            CARD,
            'flex min-h-14 items-center gap-3 px-4 py-2 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50',
          )}
        >
          <Link2 className="size-[18px] shrink-0 text-secondary-foreground" aria-hidden />
          <span className="flex-1 text-sm font-semibold">How clients pay you</span>
          {payNames && <span className="min-w-0 truncate text-[13px] text-muted-foreground">{payNames}</span>}
          <ChevronRight className="size-[15px] shrink-0 text-muted-foreground/70" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
