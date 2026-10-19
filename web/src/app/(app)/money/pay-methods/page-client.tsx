'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Plus, QrCode, Wallet } from 'lucide-react';
import { MAX_PAY_METHODS, payMethodName, type MoneyPayMethod } from '@/api';
import { PageHeader, Screen } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PayMethodDialog } from '@/components/money/pay-method-dialog';
import { useMoneyPayMethods } from '@/hooks/useMoney';

/** How clients pay you — the phone's screen (mobile/app/(app)/money/pay-methods). */
export default function PayMethodsPage() {
  const { payMethods, isLoading, loadFailed, refetch } = useMoneyPayMethods();
  const [editing, setEditing] = useState<MoneyPayMethod | undefined>();
  const [open, setOpen] = useState(false);
  const show = (method?: MoneyPayMethod) => {
    setEditing(method);
    setOpen(true);
  };

  return (
    <Screen title="How clients pay you">
      <PageHeader
        title="How clients pay you"
        description="Shown on statements you share"
        actions={
          payMethods.length < MAX_PAY_METHODS ? (
            <Button size="sm" onClick={() => show()}>
              <Plus className="size-4" />
              Add a way to pay
            </Button>
          ) : null
        }
      />
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/money">
            <ArrowLeft className="size-4" />
            Money
          </Link>
        </Button>
        {isLoading ? (
          <ListSkeleton rows={2} />
        ) : loadFailed && payMethods.length === 0 ? (
          <ErrorState message="Could not load your payment details." onRetry={() => void refetch()} />
        ) : payMethods.length === 0 ? (
          <Card>
            <EmptyState
              icon={Wallet}
              title="No ways to pay yet"
              description="Add your GCash, Maya or bank details — and the QR code, if you have one — and every statement you share shows the client how to pay you."
              action={<Button size="sm" onClick={() => show()}>Add a way to pay</Button>}
            />
          </Card>
        ) : (
          <div className="grid gap-3">
            {payMethods.map((m) => (
              <button key={m.id} type="button" onClick={() => show(m)} className="text-left">
                <Card className="transition-colors hover:border-primary/40">
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{payMethodName(m)}</p>
                      {m.accountName && <p className="truncate text-sm text-muted-foreground">{m.accountName}</p>}
                      {m.accountNumber && <p className="mt-1 font-semibold tabular-nums">{m.accountNumber}</p>}
                    </div>
                    {m.qr?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.qr.url} alt={`${payMethodName(m)} QR code`} className="size-16 rounded-md border bg-white object-contain" />
                    ) : (
                      <span className="grid size-16 place-items-center rounded-md bg-muted">
                        <QrCode className="size-5 text-muted-foreground" aria-hidden />
                      </span>
                    )}
                  </CardContent>
                </Card>
              </button>
            ))}
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Only people you send a statement to see these. Virgo never takes or holds a payment — clients pay you directly.
            </p>
          </div>
        )}
      </div>
      <PayMethodDialog open={open} onOpenChange={setOpen} method={editing} />
    </Screen>
  );
}
