'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ChartColumn, ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import { categoryLabel, formatMoney, todayIso, type MoneyInsights, type MoneyKind } from '@/api';
import { PageHeader, Screen } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CategoryIcon } from '@/components/money/icons';
import { useMoneyInsights, useMoneyRecurring } from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
/** The oldest year the ledger takes. */
const FIRST_YEAR = 2000;

/** "up 24%" / "down 8%" against last year, or null when there is nothing to compare. */
function change(now: number, before: number): { up: boolean; text: string } | null {
  if (before <= 0 || now === before) return null;
  const pct = Math.round((Math.abs(now - before) / before) * 100);
  if (pct === 0) return null;
  return { up: now > before, text: `${now > before ? 'up' : 'down'} ${pct}%` };
}

/** "Mar 8". */
function shortDate(day: string): string {
  return `${MONTH_SHORT[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** A row with a bar under it for its share of the largest. */
function ShareRow({
  label,
  detail,
  minor,
  share,
  tone,
  icon,
  href,
}: {
  label: string;
  detail?: string;
  minor: number;
  share: number;
  tone: 'in' | 'out';
  icon?: { kind: MoneyKind; slug: string };
  href?: string;
}) {
  const income = tone === 'in';
  const body = (
    <>
      <span className="flex items-center gap-3">
        {icon && (
          <span
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-lg',
              income ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary',
            )}
          >
            <CategoryIcon kind={icon.kind} slug={icon.slug} className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{label}</span>
          {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
        </span>
        <span
          className={cn(
            'shrink-0 text-sm font-bold tabular-nums',
            minor < 0 ? 'text-destructive' : income ? 'text-success' : 'text-foreground',
          )}
        >
          {formatMoney(minor)}
        </span>
      </span>
      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
        <span
          className={cn('block h-full rounded-full', income ? 'bg-success' : 'bg-primary')}
          style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
        />
      </span>
    </>
  );
  return (
    <li className="border-b last:border-b-0">
      {href ? (
        <Link href={href} className="block px-4 py-3 hover:bg-muted/40">
          {body}
        </Link>
      ) : (
        <div className="px-4 py-3">{body}</div>
      )}
    </li>
  );
}

/**
 * Twelve months as pairs of bars, in plain CSS: in beside out, against the
 * year's biggest month. A month is clicked to read its figures.
 */
function MonthBars({
  months,
  selected,
  onSelect,
}: {
  months: MoneyInsights['months'];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const top = Math.max(1, ...months.map((m) => Math.max(m.incomeMinor, m.expenseMinor)));
  return (
    <div className="flex h-40 items-end gap-0.5 sm:gap-1.5" role="group" aria-label="Month by month">
      {months.map((m, i) => {
        const on = i === selected;
        const height = (minor: number) => (minor > 0 ? `${Math.max(2, (minor / top) * 100)}%` : '0%');
        return (
          <button
            key={m.month}
            type="button"
            onClick={() => onSelect(i)}
            aria-pressed={on}
            aria-label={`${MONTH_LONG[i]}: ${formatMoney(m.incomeMinor)} in, ${formatMoney(m.expenseMinor)} out`}
            className="flex h-full min-w-0 flex-1 flex-col items-center"
          >
            <span
              className={cn(
                'flex w-full flex-1 items-end justify-center gap-[2px] rounded-md px-0.5 pt-1 transition-colors',
                on ? 'bg-muted' : 'hover:bg-muted/50',
              )}
            >
              <span className="w-2/5 max-w-4 rounded-t-[3px] bg-success" style={{ height: height(m.incomeMinor) }} />
              <span className="w-2/5 max-w-4 rounded-t-[3px] bg-primary/70" style={{ height: height(m.expenseMinor) }} />
            </span>
            <span className={cn('mt-1.5 text-[10px] sm:text-xs', on ? 'font-bold text-foreground' : 'text-muted-foreground')}>
              {MONTH_SHORT[i]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function InsightsPage() {
  // `useSearchParams` needs a Suspense boundary, or the route opts out of the
  // static shell; see support/page-client.tsx.
  return (
    <Suspense fallback={null}>
      <Insights />
    </Suspense>
  );
}

/**
 * Insights: a year of Money at a glance — the phone's screen
 * (mobile/app/(app)/money/insights.tsx), laid out for a wider window.
 */
function Insights() {
  const params = useSearchParams();
  const today = todayIso();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(() => {
    const asked = Number(params.get('year'));
    return Number.isInteger(asked) && asked >= FIRST_YEAR && asked <= thisYear ? asked : thisYear;
  });
  const [picked, setPicked] = useState<number | null>(() => {
    const asked = Number(params.get('month')?.slice(5, 7));
    return Number.isInteger(asked) && asked >= 1 && asked <= 12 ? asked - 1 : null;
  });
  const { insights: y, isLoading, loadFailed, refetch } = useMoneyInsights(year);
  const { recurring } = useMoneyRecurring();
  const running = recurring.filter((r) => !r.stopped).length;

  // This year opens on this month; a past year on its busiest.
  const selected = useMemo(() => {
    if (picked !== null) return picked;
    if (!y) return 0;
    if (year === thisYear) return Number(today.slice(5, 7)) - 1;
    let best = 0;
    y.months.forEach((m, i) => {
      const b = y.months[best];
      if (m.incomeMinor + m.expenseMinor > b.incomeMinor + b.expenseMinor) best = i;
    });
    return best;
  }, [picked, y, year, thisYear, today]);

  const switchYear = (next: number) => {
    setYear(next);
    setPicked(null);
  };

  const empty = y ? y.incomeMinor + y.expenseMinor === 0 && y.packages.length === 0 : false;
  const kept = y ? y.incomeMinor - y.expenseMinor : 0;
  const incomeChange = y ? change(y.incomeMinor, y.lastYear.incomeMinor) : null;
  const month = y?.months[selected];
  const byKind = (kind: MoneyKind) => (y ? y.byCategory.filter((c) => c.kind === kind).slice(0, 6) : []);
  const spending = byKind('expense');
  const earning = byKind('income');
  const topSpend = Math.max(1, ...spending.map((c) => c.totalMinor));
  const topEarn = Math.max(1, ...earning.map((c) => c.totalMinor));
  const topClient = Math.max(1, ...(y?.topClients.map((c) => c.totalMinor) ?? []));
  const topJob = Math.max(1, ...(y?.packages.map((p) => Math.max(p.profitMinor, 0)) ?? []));

  return (
    <Screen title="Insights">
      <PageHeader title="Insights" description="Only you can see this" />
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/money">
            <ArrowLeft className="size-4" />
            Money
          </Link>
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous year"
            disabled={year <= FIRST_YEAR}
            onClick={() => switchYear(Math.max(FIRST_YEAR, year - 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="flex-1 text-center text-lg font-bold">{year}</h2>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next year"
            disabled={year >= thisYear}
            onClick={() => switchYear(Math.min(thisYear, year + 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {!y ? (
          isLoading ? (
            <div className="mt-5">
              <ListSkeleton rows={3} />
            </div>
          ) : loadFailed ? (
            <div className="mt-5">
              <ErrorState message="Could not load your insights." onRetry={() => void refetch()} />
            </div>
          ) : null
        ) : empty ? (
          <Card className="mt-5">
            <EmptyState
              icon={ChartColumn}
              title={`Nothing recorded in ${year}`}
              description="Once money comes in or goes out, this is where you see the year: your best months, where it went, and what each job earned."
            />
          </Card>
        ) : (
          <>
            <Card className="mt-4">
              <CardContent className="py-5">
                <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {year === thisYear ? `Kept so far in ${year}` : `Kept in ${year}`}
                    </p>
                    <p
                      className={cn(
                        'mt-1 truncate text-3xl font-bold tracking-tight tabular-nums',
                        kept < 0 && 'text-destructive',
                      )}
                    >
                      {formatMoney(kept)}
                    </p>
                  </div>
                  <dl className="grid gap-1 text-sm sm:min-w-48">
                    <div className="flex justify-between gap-4">
                      <dt className="font-semibold text-muted-foreground">In</dt>
                      <dd className="font-bold tabular-nums text-success">{formatMoney(y.incomeMinor)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="font-semibold text-muted-foreground">Out</dt>
                      <dd className="font-bold tabular-nums">{formatMoney(y.expenseMinor)}</dd>
                    </div>
                  </dl>
                </div>
                {incomeChange && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Income is{' '}
                    <span className={cn('font-bold', incomeChange.up ? 'text-success' : 'text-foreground')}>
                      {incomeChange.text}
                    </span>{' '}
                    on {year - 1}
                    {year === thisYear ? ` to ${shortDate(y.lastYear.through)}` : ''}.
                  </p>
                )}
                {y.withheldMinor > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatMoney(y.withheldMinor)} was withheld by clients as tax. Keep their 2307s.
                  </p>
                )}
              </CardContent>
            </Card>

            <Section title="Month by month">
              <Card className="py-0">
                <CardContent className="px-3 py-4 sm:px-5">
                  <MonthBars months={y.months} selected={selected} onSelect={setPicked} />
                  {month && (
                    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1 text-sm">
                      <span className="font-bold">{MONTH_LONG[selected]}</span>
                      <span className="tabular-nums">
                        <span className="font-bold text-success">{formatMoney(month.incomeMinor)}</span>
                        <span className="text-muted-foreground"> in · </span>
                        <span className="font-bold">{formatMoney(month.expenseMinor)}</span>
                        <span className="text-muted-foreground"> out</span>
                      </span>
                    </div>
                  )}
                  <div className="mt-2 flex gap-4 px-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-success" />
                      In
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-primary/70" />
                      Out
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Section>

            {y.packages.length > 0 && (
              <Section title="What each job earned">
                <Card className="py-0">
                  <ul>
                    {y.packages.map((p) => (
                      <ShareRow
                        key={p.id}
                        label={p.title}
                        detail={`${formatMoney(p.receivedMinor)} in${p.costsMinor > 0 ? ` · ${formatMoney(p.costsMinor)} costs` : ''}`}
                        minor={p.profitMinor}
                        share={Math.max(p.profitMinor, 0) / topJob}
                        tone="in"
                        href={`/money/packages/${p.id}`}
                      />
                    ))}
                  </ul>
                </Card>
              </Section>
            )}

            <div className="grid gap-x-6 lg:grid-cols-2">
              {y.topClients.length > 0 && (
                <Section title="Top clients">
                  <Card className="py-0">
                    <ul>
                      {y.topClients.map((c) => (
                        <ShareRow
                          key={c.name}
                          label={c.name}
                          detail={`${c.count} ${c.count === 1 ? 'payment' : 'payments'}`}
                          minor={c.totalMinor}
                          share={c.totalMinor / topClient}
                          tone="in"
                        />
                      ))}
                    </ul>
                  </Card>
                  {y.unnamedIncomeMinor > 0 && (
                    <p className="mt-2 px-1 text-xs text-muted-foreground">
                      {formatMoney(y.unnamedIncomeMinor)} of income has no client named. Add one on the entry to see it here.
                    </p>
                  )}
                </Section>
              )}

              {spending.length > 0 && (
                <Section title="Where it went">
                  <Card className="py-0">
                    <ul>
                      {spending.map((c) => (
                        <ShareRow
                          key={c.category}
                          label={categoryLabel('expense', c.category)}
                          detail={`${Math.round((c.totalMinor / Math.max(1, y.expenseMinor)) * 100)}% of spending`}
                          minor={c.totalMinor}
                          share={c.totalMinor / topSpend}
                          tone="out"
                          icon={{ kind: 'expense', slug: c.category }}
                        />
                      ))}
                    </ul>
                  </Card>
                </Section>
              )}

              {earning.length > 0 && (
                <Section title="Where it came from">
                  <Card className="py-0">
                    <ul>
                      {earning.map((c) => (
                        <ShareRow
                          key={c.category}
                          label={categoryLabel('income', c.category)}
                          detail={`${c.count} ${c.count === 1 ? 'entry' : 'entries'}`}
                          minor={c.totalMinor}
                          share={c.totalMinor / topEarn}
                          tone="in"
                          icon={{ kind: 'income', slug: c.category }}
                        />
                      ))}
                    </ul>
                  </Card>
                </Section>
              )}
            </div>
          </>
        )}

        <Link href="/money/recurring" className="mt-6 block">
          <Card className="transition-colors hover:border-primary/40">
            <CardContent className="flex items-center gap-3 py-4">
              <Repeat className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Repeats every month</p>
                <p className="truncate text-xs text-muted-foreground">
                  {running > 0
                    ? `${running} running — subscriptions, rent, retainers`
                    : 'Subscriptions, rent, retainers — turn on Repeat on an entry'}
                </p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>

        <p className="mx-auto mt-10 max-w-md text-center text-xs leading-relaxed text-muted-foreground">
          Counted on the day each was paid, from what you&apos;ve recorded. For planning — not tax advice.
        </p>
      </div>
    </Screen>
  );
}
