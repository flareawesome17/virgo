'use client';

import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Minus,
  Paperclip,
  Plus,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  categoryLabel,
  dayLabel,
  formatMoney,
  isOverdue,
  methodLabel,
  monthLabel,
  monthOf,
  monthRange,
  shiftMonth,
  todayIso,
  type MoneyEntry,
  type MoneyKind,
} from '@/api';
import { PageHeader, Screen } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoneyEntryDialog } from '@/components/money/money-entry-dialog';
import { CategoryIcon } from '@/components/money/icons';
import {
  useMoneyEntries,
  useMoneyExport,
  useMoneySummary,
  useUpdateMoneyEntry,
} from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

type Filter = 'all' | MoneyKind;

/** "+₱15,000" in, "−₱350.50" out. */
function signed(kind: MoneyKind, minor: number): string {
  return `${kind === 'income' ? '+' : '−'}${formatMoney(minor)}`;
}

/**
 * One of the month's three figures: a row of its own on a phone, where three
 * peso amounts with centavos do not fit side by side, and a column from a
 * tablet up.
 */
function Figure({ label, minor, tone }: { label: string; minor: number; tone?: 'in' }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 sm:block">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p
        className={cn(
          'truncate text-xl font-bold tracking-tight tabular-nums sm:mt-1 sm:text-2xl',
          tone === 'in' ? 'text-success' : minor < 0 ? 'text-destructive' : 'text-foreground',
        )}
      >
        {formatMoney(minor)}
      </p>
    </div>
  );
}

function EntryRow({
  entry,
  today,
  onOpen,
  onMarkPaid,
}: {
  entry: MoneyEntry;
  today: string;
  onOpen: () => void;
  onMarkPaid?: () => void;
}) {
  const income = entry.kind === 'income';
  const label = categoryLabel(entry.kind, entry.category);
  const title = entry.counterparty || label;
  const overdue = isOverdue(entry, today);
  const detail =
    entry.paidOn === null
      ? `${overdue ? 'Overdue · was due' : 'Due'} ${dayLabel(entry.occurredOn, today)}`
      : [entry.counterparty ? label : null, methodLabel(entry.method), entry.reference]
          .filter(Boolean)
          .join(' · ');
  return (
    <li className="flex items-center gap-3 border-b px-4 last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left hover:opacity-80"
      >
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-lg',
            income ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary',
          )}
        >
          <CategoryIcon kind={entry.kind} slug={entry.category} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{title}</span>
            {entry.receipt && (
              <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-label="Has a receipt" />
            )}
          </span>
          {detail && (
            <span
              className={cn(
                'block truncate text-xs',
                overdue ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {detail}
            </span>
          )}
        </span>
        <span
          className={cn(
            'shrink-0 text-sm font-bold tabular-nums',
            income ? 'text-success' : 'text-foreground',
          )}
        >
          {signed(entry.kind, entry.amountMinor)}
        </span>
      </button>
      {onMarkPaid && (
        <Button size="sm" variant="secondary" className="h-7 shrink-0 px-2.5 text-xs" onClick={onMarkPaid}>
          {income ? 'Got it' : 'Paid'}
        </Button>
      )}
    </li>
  );
}

/**
 * Money: one person's own ledger, a month at a time — the phone's Money
 * screen (mobile/app/(app)/money/index.tsx), laid out for a wider window.
 */
export default function MoneyPage() {
  const today = todayIso();
  const [month, setMonth] = useState(() => monthOf(today));
  const [filter, setFilter] = useState<Filter>('all');
  // What the dialog holds outlives its closing, so it doesn't change under
  // the closing animation.
  const [dialog, setDialog] = useState<{ kind?: MoneyKind; entry?: MoneyEntry }>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const openDialog = (next: { kind?: MoneyKind; entry?: MoneyEntry }) => {
    setDialog(next);
    setDialogOpen(true);
  };
  const range = monthRange(month);
  const kind = filter === 'all' ? undefined : filter;

  const summary = useMoneySummary(range.from, range.to);
  const list = useMoneyEntries({ from: range.from, to: range.to, kind, limit: 200 });
  const unpaid = useMoneyEntries({ unpaid: true, kind, limit: 100 });
  const update = useUpdateMoneyEntry();
  const exporter = useMoneyExport();

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

  const owed = useMemo(
    () => [...unpaid.entries].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn)),
    [unpaid.entries],
  );

  const markPaid = (entry: MoneyEntry) =>
    update.mutate(
      { id: entry.id, paidOn: todayIso() },
      {
        onError: (error) =>
          toast.error("Couldn't mark it paid", {
            description: error instanceof ApiError && error.status !== 0 ? error.message : 'Please try again.',
          }),
      },
    );

  const exportRange = (from: string, to: string) =>
    exporter.mutate(
      { from, to },
      {
        // A link to the file, which the browser saves rather than opens:
        // the server sends it as an attachment.
        onSuccess: (url) => window.location.assign(url),
        onError: (error) =>
          toast.error("Couldn't export", {
            description:
              error instanceof ApiError && error.status !== 0 ? error.message : 'Check your connection and try again.',
          }),
      },
    );

  const year = month.slice(0, 4);
  const s = summary.summary;
  const inMinor = s?.incomeMinor ?? 0;
  const outMinor = s?.expenseMinor ?? 0;
  const loading = list.isLoading && unpaid.isLoading;
  const failed = list.loadFailed && list.entries.length === 0 && unpaid.entries.length === 0;
  const empty = !loading && !failed && days.length === 0 && owed.length === 0;

  return (
    <Screen title="Money">
      <PageHeader
        title="Money"
        description="Only you can see this"
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={exporter.isPending}>
                  {exporter.isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  A CSV for Excel, Google Sheets or your accountant
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => exportRange(range.from, range.to)}>
                  {monthLabel(month, today)}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportRange(`${year}-01-01`, `${year}-12-31`)}>
                  All of {year}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="secondary" onClick={() => openDialog({ kind: 'expense' })}>
              <Minus className="size-4" />
              Expense
            </Button>
            <Button size="sm" onClick={() => openDialog({ kind: 'income' })}>
              <Plus className="size-4" />
              Income
            </Button>
          </>
        }
      />

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="flex-1 text-center text-lg font-bold">{monthLabel(month, today)}</h2>
          {month !== monthOf(today) && (
            <Button variant="ghost" size="sm" onClick={() => setMonth(monthOf(today))}>
              This month
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <Card className="mt-4">
          <CardContent className="py-5">
            <div className="grid gap-2 sm:grid-cols-3 sm:gap-4">
              <Figure label="In" minor={inMinor} tone="in" />
              <Figure label="Out" minor={outMinor} />
              <Figure label="Kept" minor={inMinor - outMinor} />
            </div>
            {s && s.withheldMinor > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {formatMoney(s.withheldMinor)} of the income was withheld by clients as tax. Keep their 2307s.
              </p>
            )}
            {s && s.owedToYouMinor > 0 && (
              <p className="mt-3 text-sm font-semibold">
                Owed to you: {formatMoney(s.owedToYouMinor)}
                <span className="font-normal text-muted-foreground">
                  {' '}
                  · {s.owedToYouCount} {s.owedToYouCount === 1 ? 'entry' : 'entries'}
                </span>
              </p>
            )}
          </CardContent>
        </Card>

        <div className="mt-5 flex gap-1.5" role="group" aria-label="Show">
          {(
            [
              ['all', 'All'],
              ['income', 'Income'],
              ['expense', 'Expenses'],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={filter === key ? 'default' : 'outline'}
              aria-pressed={filter === key}
              className="rounded-full"
              onClick={() => setFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="mt-5">
            <ListSkeleton rows={4} />
          </div>
        ) : failed ? (
          <div className="mt-5">
            <ErrorState
              message="Could not load your money entries."
              onRetry={() => {
                void list.refetch();
                void unpaid.refetch();
              }}
            />
          </div>
        ) : empty ? (
          <Card className="mt-5">
            <EmptyState
              icon={Wallet}
              title={`Nothing in ${monthLabel(month, today)} yet`}
              description="Log a job fee or an expense as it happens — the pamasahe, the meal, the second shooter. Only you can see it."
              action={
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openDialog({ kind: 'expense' })}>
                    Add expense
                  </Button>
                  <Button size="sm" onClick={() => openDialog({ kind: 'income' })}>
                    Add income
                  </Button>
                </div>
              }
            />
          </Card>
        ) : (
          <>
            {owed.length > 0 && (
              <section className="mt-6">
                <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.12em] text-warning">
                  Not paid yet · {unpaid.total}
                </h3>
                <Card className="py-0">
                  <ul>
                    {owed.map((entry) => (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        today={today}
                        onOpen={() => openDialog({ entry })}
                        onMarkPaid={() => markPaid(entry)}
                      />
                    ))}
                  </ul>
                </Card>
              </section>
            )}
            {days.map(([day, entries]) => (
              <section key={day} className="mt-6">
                <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {dayLabel(day, today)}
                </h3>
                <Card className="py-0">
                  <ul>
                    {entries.map((entry) => (
                      <EntryRow key={entry.id} entry={entry} today={today} onOpen={() => openDialog({ entry })} />
                    ))}
                  </ul>
                </Card>
              </section>
            ))}
          </>
        )}

        <p className="mx-auto mt-10 max-w-md text-center text-xs leading-relaxed text-muted-foreground">
          Totals are what you&apos;ve recorded, counted on the day each was paid. They are for
          planning — not tax advice, and not a BIR book of accounts.
        </p>
      </div>

      <MoneyEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        kind={dialog.kind}
        entry={dialog.entry}
      />
    </Screen>
  );
}
