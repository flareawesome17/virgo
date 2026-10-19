'use client';

import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { formatMoney, monthLabel, monthOf, monthRange, todayIso } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMoneySummary } from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

/**
 * This month's money in the Dashboard's side rail: in, out, and what clients
 * still owe — or, before anything is logged, what Money is for.
 */
export function MoneyCard() {
  const month = monthOf(todayIso());
  const range = monthRange(month);
  const { summary } = useMoneySummary(range.from, range.to);
  const started =
    !!summary && (summary.entries > 0 || summary.owedToYouCount > 0 || summary.youOweCount > 0);
  const kept = summary ? summary.incomeMinor - summary.expenseMinor : 0;

  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Money · {monthLabel(month)}</h3>
        </div>
        {started && summary ? (
          <>
            {/* A row each: the rail is a third of the page, too narrow for three
                peso amounts side by side once they have centavos. */}
            <dl className="mt-3 grid gap-1.5 text-sm">
              {[
                { label: 'In', minor: summary.incomeMinor, className: 'text-success' },
                { label: 'Out', minor: summary.expenseMinor, className: '' },
                { label: 'Kept', minor: kept, className: kept < 0 ? 'text-destructive' : '' },
              ].map((f) => (
                <div key={f.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className={cn('font-bold tabular-nums', f.className)}>{formatMoney(f.minor)}</dd>
                </div>
              ))}
            </dl>
            {summary.owedToYouMinor > 0 && (
              <p className="mt-3 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs font-semibold">
                {formatMoney(summary.owedToYouMinor)} still owed to you
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            What each shoot earned, what it cost, and who still owes you. Only you can see it.
          </p>
        )}
        <Button asChild variant="outline" size="sm" className="mt-4 w-full">
          <Link href="/money">{started ? 'Open Money' : 'Start tracking'}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
