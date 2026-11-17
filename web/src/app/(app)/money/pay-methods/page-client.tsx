'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Pencil, Plus, QrCode, ShieldCheck, Wallet } from 'lucide-react';
import { MAX_PAY_METHODS, payMethodName, type MoneyPayMethod } from '@/api';
import { PageHeader, Screen } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PayMethodDialog } from '@/components/money/pay-method-dialog';
import { PayQrDialog } from '@/components/money/pay-qr-dialog';
import { useMoneyPayMethods } from '@/hooks/useMoney';

/**
 * How clients pay you — the phone's screen (mobile/app/(app)/money/pay-methods):
 * the main way to pay first, each with Show QR, and what keeps them safe.
 */
export default function PayMethodsPage() {
  const { payMethods, isLoading, loadFailed, refetch } = useMoneyPayMethods();
  const [editing, setEditing] = useState<MoneyPayMethod | undefined>();
  const [open, setOpen] = useState(false);
  const [showing, setShowing] = useState<string | undefined>();
  const [qrOpen, setQrOpen] = useState(false);
  const edit = (method?: MoneyPayMethod) => {
    setEditing(method);
    setOpen(true);
  };
  const show = (method: MoneyPayMethod) => {
    setShowing(method.id);
    setQrOpen(true);
  };

  return (
    <Screen title="How clients pay you">
      <PageHeader
        title="How clients pay you"
        description="Show your QR, or let your statements show it"
        actions={
          payMethods.length < MAX_PAY_METHODS ? (
            <Button size="sm" onClick={() => edit()}>
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
              description="Add your GCash, Maya or bank details and their QR codes. Show a QR for a client to scan, or let your statements show it."
              action={<Button size="sm" onClick={() => edit()}>Add a way to pay</Button>}
            />
          </Card>
        ) : (
          <div className="grid gap-3">
            {payMethods.map((m, i) => (
              <Card key={m.id} className={i === 0 ? 'border-foreground/40' : undefined}>
                <CardContent className="flex items-center gap-4 py-4">
                  <button
                    type="button"
                    onClick={() => show(m)}
                    aria-label={`Show ${payMethodName(m)} QR`}
                    className="shrink-0 rounded-md focus-visible:outline-2"
                  >
                    {m.qr?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.qr.url}
                        alt=""
                        className={i === 0 ? 'size-24 rounded-md border bg-white object-contain p-1' : 'size-16 rounded-md border bg-white object-contain p-1'}
                      />
                    ) : (
                      <span className={`grid place-items-center rounded-md bg-muted ${i === 0 ? 'size-24' : 'size-16'}`}>
                        <QrCode className="size-5 text-muted-foreground" aria-hidden />
                      </span>
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    {i === 0 && (
                      <span className="mb-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                        Main
                      </span>
                    )}
                    <p className="font-bold">{payMethodName(m)}</p>
                    {m.accountName && <p className="truncate text-sm text-muted-foreground">{m.accountName}</p>}
                    {m.accountNumber && <p className="mt-1 font-semibold tabular-nums">{m.accountNumber}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <Button type="button" size="sm" variant={i === 0 ? 'default' : 'outline'} onClick={() => show(m)}>
                      <QrCode className="size-4" />
                      Show QR
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => edit(m)}>
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            <div className="mt-2 flex gap-3 rounded-xl bg-muted/60 px-4 py-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="text-sm font-semibold">Locked to you</p>
                <p className="text-sm text-muted-foreground">
                  Adding or changing a way to pay asks for your password, and we email you when it changes. Clients see
                  these when you show your QR, and on statements you share. Virgo never takes or holds a payment.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      <PayMethodDialog open={open} onOpenChange={setOpen} method={editing} isMain={!!editing && payMethods[0]?.id === editing.id} />
      <PayQrDialog open={qrOpen} onOpenChange={setQrOpen} payMethods={payMethods} initialId={showing} />
    </Screen>
  );
}
