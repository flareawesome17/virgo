'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Loader2, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  categoryLabel,
  dayLabel,
  dayOfMonthLabel,
  formatMoney,
  minorToPesos,
  pesosToMinor,
  todayIso,
  type MoneyRecurring,
} from '@/api';
import { PageHeader, Screen } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CategoryIcon } from '@/components/money/icons';
import { useMoneyRecurring, useStopMoneyRecurring, useUpdateMoneyRecurring } from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

function message(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.status !== 0 ? error.message : fallback;
}

/** One repeating entry; opened to change its amount or stop it. */
function RecurringItem({
  item,
  today,
  open,
  onToggle,
  onStop,
}: {
  item: MoneyRecurring;
  today: string;
  open: boolean;
  onToggle: () => void;
  onStop: () => void;
}) {
  const update = useUpdateMoneyRecurring();
  const [amount, setAmount] = useState(() => minorToPesos(item.amountMinor));
  const [problem, setProblem] = useState<string | null>(null);
  const income = item.kind === 'income';
  const title = item.counterparty || categoryLabel(item.kind, item.category);
  const detail = item.stopped
    ? 'Stopped'
    : `Every month on ${dayOfMonthLabel(item.dayOfMonth)} · next ${dayLabel(item.nextOn, today)}`;

  const save = () => {
    setProblem(null);
    const amountMinor = pesosToMinor(amount);
    if (!amountMinor) return setProblem('Enter the amount in pesos, like 1500 or 350.50.');
    if (income && amountMinor < item.withheldMinor) {
      return setProblem("It can't be less than the tax the client withholds each month.");
    }
    update.mutate(
      { id: item.id, amountMinor },
      {
        onSuccess: () => {
          toast.success('Saved', { description: 'The new amount applies from the next one.' });
          onToggle();
        },
        onError: (error) => toast.error("Couldn't save it", { description: message(error, 'Please try again.') }),
      },
    );
  };

  return (
    <li className={cn('border-b last:border-b-0', item.stopped && 'opacity-60')}>
      <button
        type="button"
        onClick={onToggle}
        disabled={item.stopped}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left enabled:hover:bg-muted/40"
      >
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-lg',
            income ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary',
          )}
        >
          <CategoryIcon kind={item.kind} slug={item.category} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{detail}</span>
        </span>
        <span className={cn('shrink-0 text-sm font-bold tabular-nums', income ? 'text-success' : 'text-foreground')}>
          {income ? '+' : '−'}
          {formatMoney(item.amountMinor)}
        </span>
      </button>
      {open && (
        <div className="grid gap-2 px-4 pb-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                ₱
              </span>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Amount each month, in pesos"
                className="pl-7 tabular-nums"
              />
            </div>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </form>
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            A new amount applies from the next one. Entries already made stay as they are — edit those in Money.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start px-0 text-destructive hover:bg-transparent hover:text-destructive"
            onClick={onStop}
          >
            Stop repeating
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * What repeats every month — the phone's screen
 * (mobile/app/(app)/money/recurring.tsx).
 */
export default function RecurringPage() {
  const today = todayIso();
  const { recurring, isLoading, loadFailed, refetch } = useMoneyRecurring();
  const stop = useStopMoneyRecurring();
  const [open, setOpen] = useState<string | null>(null);
  const [stopping, setStopping] = useState<MoneyRecurring | null>(null);
  const running = recurring.filter((r) => !r.stopped);
  const stopped = recurring.filter((r) => r.stopped);

  return (
    <Screen title="Repeats every month">
      <PageHeader title="Repeats every month" description="Made on their day, once" />
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/money">
            <ArrowLeft className="size-4" />
            Money
          </Link>
        </Button>
        {isLoading ? (
          <ListSkeleton rows={3} />
        ) : loadFailed && recurring.length === 0 ? (
          <ErrorState message="Could not load what repeats." onRetry={() => void refetch()} />
        ) : recurring.length === 0 ? (
          <Card>
            <EmptyState
              icon={Repeat}
              title="Nothing repeats yet"
              description="Open an entry that comes every month — a subscription, your studio rent, a retainer — and turn on Repeat every month. Money adds it on its day."
            />
          </Card>
        ) : (
          <>
            {running.length > 0 && (
              <Card className="py-0">
                <ul>
                  {running.map((item) => (
                    <RecurringItem
                      key={item.id}
                      item={item}
                      today={today}
                      open={open === item.id}
                      onToggle={() => setOpen((current) => (current === item.id ? null : item.id))}
                      onStop={() => setStopping(item)}
                    />
                  ))}
                </ul>
              </Card>
            )}
            {stopped.length > 0 && (
              <section className="mt-6">
                <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Stopped
                </h3>
                <Card className="py-0">
                  <ul>
                    {stopped.map((item) => (
                      <RecurringItem
                        key={item.id}
                        item={item}
                        today={today}
                        open={false}
                        onToggle={() => undefined}
                        onStop={() => undefined}
                      />
                    ))}
                  </ul>
                </Card>
              </section>
            )}
            <p className="mt-6 px-1 text-xs text-muted-foreground">
              Expenses are added as paid on their day; income is added as due, for you to mark received when it
              lands.
            </p>
          </>
        )}
      </div>

      <AlertDialog open={stopping !== null} onOpenChange={(next) => !next && setStopping(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop repeating?</AlertDialogTitle>
            <AlertDialogDescription>
              No more entries are made from it. The ones already made stay in your Money.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={stop.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!stopping) return;
                stop.mutate(stopping.id, {
                  onSuccess: () => {
                    toast.success('Stopped repeating');
                    setStopping(null);
                    setOpen(null);
                  },
                  onError: (error) => toast.error("Couldn't stop it", { description: message(error, 'Please try again.') }),
                });
              }}
            >
              Stop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
