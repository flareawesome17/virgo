'use client';

import Link from 'next/link';
import { Wallet } from 'lucide-react';
import {
  formatMoney,
  monthLabel,
  monthOf,
  monthRange,
  shiftMonth,
  todayIso,
  type MoneyInsights,
  type MoneySummary,
} from '@/api';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMoneyInsights, useMoneySummary } from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

/** One month of money: `month` is "2026-10", amounts in centavos. */
export type MoneyMonth = MoneyInsights['months'][number];

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * This month's money in the Dashboard's side rail, and the five before it —
 * or, before anything is logged, what Money is for.
 */
export function MoneyCard() {
  const month = monthOf(todayIso());
  const range = monthRange(month);
  const { summary } = useMoneySummary(range.from, range.to);

  // The last six months, oldest first. Before June they reach back into last
  // year, which is a second year's insights; a hook cannot be skipped, so that
  // one is switched off when it is not needed.
  const keys = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
  const year = Number(month.slice(0, 4));
  const needsLastYear = Number(keys[0].slice(0, 4)) < year;
  const { insights: thisYear } = useMoneyInsights(year);
  const { insights: lastYear } = useMoneyInsights(year - 1, { enabled: needsLastYear });
  const known = [...(lastYear?.months ?? []), ...(thisYear?.months ?? [])];
  const months =
    thisYear && (!needsLastYear || lastYear)
      ? keys.map(
          (key) =>
            known.find((m) => m.month === key) ?? { month: key, incomeMinor: 0, expenseMinor: 0 },
        )
      : null;

  return <MoneyCardView month={month} summary={summary} months={months} />;
}

/**
 * The card itself, from plain figures: `summary` is this month's, `months`
 * the six months to the current one, oldest first, or null until they arrive.
 *
 * The whole card opens Money; the button at the foot only says so.
 */
export function MoneyCardView({
  month,
  summary,
  months,
}: {
  month: string;
  summary: MoneySummary | undefined;
  months: MoneyMonth[] | null;
}) {
  const history = !!months?.some((m) => m.incomeMinor > 0 || m.expenseMinor > 0);
  const started =
    history ||
    (!!summary && (summary.entries > 0 || summary.owedToYouCount > 0 || summary.youOweCount > 0));
  const kept = summary ? summary.incomeMinor - summary.expenseMinor : 0;

  return (
    <Link
      href="/money"
      className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Card className="transition-colors hover:ring-primary/40">
        <CardContent className="py-5">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Money</h3>
          </div>
          {started ? (
            <>
              <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
                <span
                  className={cn(
                    'text-2xl font-bold tabular-nums',
                    kept < 0 && 'text-destructive',
                  )}
                >
                  {summary ? formatMoney(kept) : '—'}
                </span>
                <span className="text-xs text-muted-foreground">kept in {monthLabel(month)}</span>
              </p>
              {/* A row each: the rail is a third of the page, too narrow for
                  two peso amounts side by side once they have centavos. */}
              <dl className="mt-2 grid gap-1.5 text-sm">
                {[
                  { label: 'In', minor: summary?.incomeMinor, className: 'text-success' },
                  { label: 'Out', minor: summary?.expenseMinor, className: '' },
                ].map((f) => (
                  <div key={f.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className={cn('font-bold tabular-nums', f.className)}>
                      {f.minor === undefined ? '—' : formatMoney(f.minor)}
                    </dd>
                  </div>
                ))}
              </dl>
              {summary && summary.owedToYouMinor > 0 && (
                <p className="mt-3 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs font-semibold">
                  {formatMoney(summary.owedToYouMinor)} still owed to you
                </p>
              )}
              {months && history && <MonthPairs months={months} />}
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              What each shoot earned, what it cost, and who still owes you. Only you can see it.
            </p>
          )}
          <span className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4 w-full')}>
            {started ? 'Open Money' : 'Start tracking'}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Six months as pairs of columns, in plain CSS: in beside out, against the
 * biggest figure in the six, so a quiet month looks quiet. The figures are in
 * the label for a screen reader and in each month's tooltip.
 */
function MonthPairs({ months }: { months: MoneyMonth[] }) {
  const top = Math.max(1, ...months.flatMap((m) => [m.incomeMinor, m.expenseMinor]));
  const height = (minor: number) => (minor > 0 ? `${Math.max(3, (minor / top) * 100)}%` : '0%');
  const said = (m: MoneyMonth) =>
    `${monthLabel(m.month)}: ${formatMoney(m.incomeMinor)} in, ${formatMoney(m.expenseMinor)} out`;
  const last = months.length - 1;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Last six months</p>
        <ul className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-success" />
            In
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-muted-foreground/45" />
            Out
          </li>
        </ul>
      </div>
      <div
        role="img"
        aria-label={`Last six months. ${months.map(said).join('. ')}.`}
        className="mt-2 flex h-16 items-end gap-2 border-b"
      >
        {months.map((m) => (
          <div
            key={m.month}
            title={said(m)}
            className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5"
          >
            <span
              className="w-full max-w-3 rounded-t-[3px] bg-success"
              style={{ height: height(m.incomeMinor) }}
            />
            <span
              className="w-full max-w-3 rounded-t-[3px] bg-muted-foreground/45"
              style={{ height: height(m.expenseMinor) }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2" aria-hidden>
        {months.map((m, i) => (
          <span
            key={m.month}
            className={cn(
              'min-w-0 flex-1 text-center text-[11px]',
              i === last ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {MONTH_SHORT[Number(m.month.slice(5, 7)) - 1]}
          </span>
        ))}
      </div>
    </div>
  );
}
