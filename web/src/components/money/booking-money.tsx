'use client';

import { useState } from 'react';
import { Paperclip, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  dayLabel,
  formatMoney,
  todayIso,
  type MoneyEntry,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MoneyEntryDialog } from '@/components/money/money-entry-dialog';
import {
  useDismissMoneySuggestion,
  useMoneyForBooking,
  useUpdateMoneyEntry,
} from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

/**
 * A booking's money, on the booking's own page: the entry Money offers to
 * record for it, or what has been recorded from it. The phone's BookingMoney
 * (mobile/components/money/BookingMoney.tsx). Draws nothing when there is
 * nothing to say.
 */
export function BookingMoney({ bookingId, cancelled }: { bookingId: string; cancelled: boolean }) {
  const { suggestion, entries } = useMoneyForBooking(bookingId);
  const dismiss = useDismissMoneySuggestion();
  const update = useUpdateMoneyEntry();
  const today = todayIso();
  // What the dialog holds outlives its closing, as on the Money page.
  const [dialog, setDialog] = useState<{ entry?: MoneyEntry; record?: boolean }>({});
  const [open, setOpen] = useState(false);
  const show = (next: { entry?: MoneyEntry; record?: boolean }) => {
    setDialog(next);
    setOpen(true);
  };

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

  const dialogEl = (
    <MoneyEntryDialog
      open={open}
      onOpenChange={setOpen}
      entry={dialog.entry}
      suggestion={dialog.record ? (suggestion ?? undefined) : undefined}
    />
  );

  if (entries.length > 0) {
    return (
      <section className="mt-5">
        <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          In your Money
        </h3>
        <Card className="py-0">
          <ul>
            {entries.map((entry) => {
              const income = entry.kind === 'income';
              return (
                <li key={entry.id} className="flex items-center gap-3 border-b px-4 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => show({ entry })}
                    className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left hover:opacity-80"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        {income ? 'Income' : 'Expense'}
                        {entry.receipt && <Paperclip className="size-3 text-muted-foreground" aria-label="Has a receipt" />}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {entry.paidOn
                          ? `${income ? 'Received' : 'Paid'} ${dayLabel(entry.paidOn, today)}`
                          : `Not paid yet · due ${dayLabel(entry.occurredOn, today)}`}
                      </span>
                    </span>
                    <span className={cn('text-sm font-bold tabular-nums', income && 'text-success')}>
                      {`${income ? '+' : '−'}${formatMoney(entry.amountMinor)}`}
                    </span>
                  </button>
                  {entry.paidOn === null && (
                    <Button size="sm" variant="secondary" className="h-7 px-2.5 text-xs" onClick={() => markPaid(entry)}>
                      {income ? 'Got it' : 'Paid'}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
        {cancelled && (
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            This booking was cancelled. Keep these only for money that actually moved — a
            reservation fee you kept, say.
          </p>
        )}
        {dialogEl}
      </section>
    );
  }

  if (!suggestion) return null;
  const income = suggestion.kind === 'income';
  const amount = suggestion.amountMinor !== null ? formatMoney(suggestion.amountMinor) : null;

  return (
    <Card className="mt-5">
      <CardContent className="flex flex-wrap items-center gap-4 py-4">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-lg',
            income ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary',
          )}
        >
          <Wallet className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {income ? 'Record this fee in Money' : 'Record this cost in Money'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {income
              ? `${amount ? `${amount} from ${suggestion.counterparty}` : `From ${suggestion.counterparty}`} — so you know what this shoot really earned.`
              : `${amount ? `${amount} to ${suggestion.counterparty}` : `What you pay ${suggestion.counterparty}`} — so you know what this shoot really cost.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => show({ record: true })}>
            Record
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={dismiss.isPending}
            aria-label="Not this — don't offer this booking again"
            onClick={() => dismiss.mutate(suggestion.bookingId)}
          >
            Not this
          </Button>
        </div>
      </CardContent>
      {dialogEl}
    </Card>
  );
}
