'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Circle,
  Info,
  Landmark,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  dayLabel,
  formatMoney,
  TAX_FORM_LABELS,
  todayIso,
  type MoneyTax,
  type MoneyTaxOption,
} from '@/api';
import { PageHeader, Screen } from '@/components/app-shell';
import { ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMark2307, useMoneyTax } from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

const FIRST_YEAR = 2000;

const OPTIONS: { key: 'eightPercent' | 'osd' | 'itemized'; title: string; note: string }[] = [
  {
    key: 'eightPercent',
    title: '8% of gross',
    note: 'Only if you have no salary from an employer. Chosen on your first quarterly return, for the whole year. Replaces the 3% percentage tax.',
  },
  {
    key: 'osd',
    title: 'Graduated + OSD',
    note: '40% of gross is deducted for you, and expenses need no receipts. Plus 3% percentage tax.',
  },
  {
    key: 'itemized',
    title: 'Graduated + itemized',
    note: 'Your recorded expenses are deducted — each needs a receipt. Plus 3% percentage tax.',
  },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** A figure on an estimate; `minus` for what comes off, kept on one line with its sign. */
function Line({ label, minor, strong, minus }: { label: string; minor: number; strong?: boolean; minus?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className={strong ? 'font-bold' : 'text-muted-foreground'}>{label}</dt>
      <dd className={cn('whitespace-nowrap tabular-nums', strong ? 'font-bold' : 'font-semibold')}>
        {minus ? '−' : ''}
        {formatMoney(minor)}
      </dd>
    </div>
  );
}

function OptionCard({
  title,
  note,
  option,
  withheldMinor,
  lowest,
}: {
  title: string;
  note: string;
  option: MoneyTaxOption;
  withheldMinor: number;
  lowest: boolean;
}) {
  return (
    <Card className={cn('h-full', lowest && 'border-primary')}>
      <CardContent className="flex h-full flex-col py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold">{title}</p>
          {lowest && (
            <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary">
              Lowest on these numbers
            </span>
          )}
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{formatMoney(option.totalMinor)}</p>
        <dl className="mt-2 grid gap-1">
          <Line label="Income tax" minor={option.incomeTaxMinor} />
          {option.percentageTaxMinor > 0 && <Line label="Percentage tax (3%)" minor={option.percentageTaxMinor} />}
          {withheldMinor > 0 && option.incomeTaxMinor > 0 && (
            <Line label="Withheld by clients" minor={Math.min(withheldMinor, option.incomeTaxMinor)} minus />
          )}
          <Line label="Still to pay" minor={option.stillToPayMinor} strong />
        </dl>
        {option.excessCreditMinor > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {formatMoney(option.excessCreditMinor)} more was withheld than this income tax — a credit to ask your
            accountant about.
          </p>
        )}
        <p className="mt-auto pt-3 text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}

/** Gross receipts against the ₱3M line where VAT begins. */
function Meter({ tax }: { tax: MoneyTax }) {
  const share = Math.min(100, (tax.grossMinor / tax.threshold.limitMinor) * 100);
  const { status } = tax.threshold;
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs font-semibold text-muted-foreground">Gross receipts</p>
        <p className="mt-1 truncate text-3xl font-bold tracking-tight tabular-nums">{formatMoney(tax.grossMinor)}</p>
        <p className="text-xs text-muted-foreground">of the {formatMoney(tax.threshold.limitMinor)} line</p>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full',
              status === 'under' ? 'bg-success' : status === 'near' ? 'bg-warning' : 'bg-destructive',
            )}
            style={{ width: `${Math.max(1, Math.round(share))}%` }}
          />
        </div>
        <p
          className={cn(
            'mt-3 text-sm',
            status === 'under' ? 'text-muted-foreground' : status === 'near' ? 'font-semibold text-warning' : 'font-semibold text-destructive',
          )}
        >
          {status === 'under'
            ? 'Under ₱3M, so the 8% rate is open to you.'
            : status === 'near'
              ? 'Close to ₱3M. Above it you would register for VAT, and the 8% rate is no longer an option — talk to your accountant.'
              : 'Over ₱3M. You would register for VAT, so the estimates below do not apply — talk to your accountant.'}
        </p>
      </CardContent>
    </Card>
  );
}

export default function TaxPage() {
  // `useSearchParams` needs a Suspense boundary; see support/page-client.tsx.
  return (
    <Suspense fallback={null}>
      <Tax />
    </Suspense>
  );
}

/**
 * Tax help — the phone's screen (mobile/app/(app)/money/tax.tsx). Estimates
 * for planning, never advice, and the page says so before any number.
 */
function Tax() {
  const params = useSearchParams();
  const today = todayIso();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(() => {
    const asked = Number(params.get('year'));
    return Number.isInteger(asked) && asked >= FIRST_YEAR && asked <= thisYear ? asked : thisYear;
  });
  const { tax, isLoading, loadFailed, refetch } = useMoneyTax(year);
  const mark = useMark2307();

  const toggle2307 = (entryIds: string[], received: boolean) =>
    mark.mutate(
      { entryIds, received },
      {
        onError: (error) =>
          toast.error("Couldn't save that", {
            description: error instanceof ApiError && error.status !== 0 ? error.message : 'Please try again.',
          }),
      },
    );

  const next = tax?.deadlines.find((d) => d.dueOn >= today)?.dueOn;
  const missing = tax?.form2307.filter((g) => !g.received).length ?? 0;

  return (
    <Screen title="Tax help">
      <PageHeader title="Tax help" description="Estimates for planning — not tax advice" />
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href={`/money/insights?year=${year}`}>
            <ArrowLeft className="size-4" />
            Insights
          </Link>
        </Button>

        <div className="flex gap-3 rounded-xl bg-secondary p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            These are estimates from what you&apos;ve recorded, to plan with. They are not tax advice — have your
            accountant check them before you file. Virgo doesn&apos;t file returns.
          </p>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous year"
            disabled={year <= FIRST_YEAR}
            onClick={() => setYear((y) => Math.max(FIRST_YEAR, y - 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="flex-1 text-center text-lg font-bold">{year}</h2>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next year"
            disabled={year >= thisYear}
            onClick={() => setYear((y) => Math.min(thisYear, y + 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {!tax ? (
          isLoading ? (
            <div className="mt-5">
              <ListSkeleton rows={3} />
            </div>
          ) : loadFailed ? (
            <div className="mt-5">
              <ErrorState message="Could not load your tax summary." onRetry={() => void refetch()} />
            </div>
          ) : null
        ) : (
          <>
            <div className="mt-4">
              <Meter tax={tax} />
            </div>

            <Section title={year === thisYear ? `Estimates on ${year} so far` : `Estimates for ${year}`}>
              {tax.estimates ? (
                <>
                  <p className="mb-3 px-1 text-xs text-muted-foreground">
                    On {formatMoney(tax.grossMinor)} gross and {formatMoney(tax.expenseMinor)} of expenses
                    {year === thisYear ? ' recorded so far. If more comes in, these go up.' : ` in ${year}.`}
                  </p>
                  <div className="grid gap-3 md:grid-cols-3">
                    {OPTIONS.map((o) => (
                      <OptionCard
                        key={o.key}
                        title={o.title}
                        note={o.note}
                        option={tax.estimates![o.key]}
                        withheldMinor={tax.withheldMinor}
                        lowest={tax.estimates!.lowest === o.key}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className="px-1 text-sm text-muted-foreground">
                  Above ₱3M none of these apply. Your accountant can work out VAT and income tax with you.
                </p>
              )}
            </Section>

            <Section title="By quarter">
              <Card className="py-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="px-4 py-2 text-left font-bold">
                        <span className="sr-only">Quarter</span>
                      </th>
                      <th className="px-2 py-2 text-right font-bold">Gross</th>
                      <th className="px-2 py-2 text-right font-bold">Expenses</th>
                      <th className="px-4 py-2 text-right font-bold">Withheld</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tax.quarters.map((q) => (
                      <tr key={q.quarter} className="border-b last:border-b-0">
                        <th scope="row" className="px-4 py-2.5 text-left font-bold">
                          Q{q.quarter}
                        </th>
                        <td className="px-2 py-2.5 text-right tabular-nums">{formatMoney(q.grossMinor)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{formatMoney(q.expenseMinor)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(q.withheldMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </Section>

            <Section title={missing > 0 ? `Forms 2307 · ${missing} to collect` : 'Forms 2307'}>
              <p className="mb-2 px-1 text-xs text-muted-foreground">
                A company client who keeps tax from your fee owes you a BIR Form 2307 for each quarter. It is how you
                claim that tax. Tick each one when you have it.
              </p>
              {tax.form2307.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">
                  No tax withheld in {year}. When a client keeps part of a fee, enter it as Tax withheld on the income.
                </p>
              ) : (
                <Card className="py-0">
                  <ul>
                    {tax.form2307.map((g) => (
                      <li key={`${g.client ?? ''}-${g.quarter}`} className="border-b last:border-b-0">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={g.received}
                          disabled={mark.isPending}
                          onClick={() => toggle2307(g.entries.map((e) => e.id), !g.received)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 disabled:opacity-60"
                        >
                          {g.received ? (
                            <CircleCheck className="size-5 shrink-0 text-success" />
                          ) : (
                            <Circle className="size-5 shrink-0 text-muted-foreground" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {g.client ?? 'No client named'} · Q{g.quarter}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {formatMoney(g.withheldMinor)} withheld on {formatMoney(g.grossMinor)}
                              {g.entries.length > 1 ? ` · ${g.entries.length} payments` : ''}
                            </span>
                          </span>
                          <span className={cn('text-xs font-bold', g.received ? 'text-success' : 'text-warning')}>
                            {g.received ? 'Have it' : 'Missing'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </Section>

            <Section title="When returns are due">
              <Card className="py-0">
                <ul>
                  {tax.deadlines.map((d) => {
                    const past = d.dueOn < today;
                    const isNext = d.dueOn === next;
                    const Icon = d.form === '1701A' ? Landmark : CalendarClock;
                    return (
                      <li
                        key={`${d.form}-${d.period}`}
                        className={cn('flex items-center gap-3 border-b px-4 py-3 last:border-b-0', past && 'opacity-50')}
                      >
                        <Icon className={cn('size-4 shrink-0', isNext ? 'text-primary' : 'text-muted-foreground')} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {TAX_FORM_LABELS[d.form]} ({d.form}) · {d.period}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {d.who === 'graduated' ? 'Only on the graduated rates' : 'Everyone'}
                          </span>
                        </span>
                        <span className="text-right">
                          {isNext && <span className="block text-[11px] font-bold text-primary">Next</span>}
                          <span className={cn('text-sm', isNext ? 'font-bold' : 'text-muted-foreground')}>
                            {dayLabel(d.dueOn, today)}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
              <p className="mt-2 px-1 text-xs text-muted-foreground">
                A deadline on a weekend moves to the Monday. Holidays can move them too — check the BIR&apos;s
                announcements.
              </p>
            </Section>
          </>
        )}

        <p className="mx-auto mt-10 max-w-md text-center text-xs leading-relaxed text-muted-foreground">
          A summary for you and your accountant, counted on the day each payment moved. Virgo doesn&apos;t file or
          certify returns, and this isn&apos;t a book of accounts.
        </p>
      </div>
    </Screen>
  );
}
