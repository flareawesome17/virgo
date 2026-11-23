'use client';

import { useState } from 'react';
import { Check, Copy, Landmark, QrCode, TriangleAlert, Wallet } from 'lucide-react';
import {
  formatMoney,
  payCardAsMethod,
  payDetailsAreNew,
  payMethodName,
  type Booking,
  type ConversationMessage,
  type PayCardContext,
  type PayCardMethod,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PayQrDialog } from '@/components/money/pay-qr-dialog';
import { cn } from '@/lib/utils';

/** "Mika", from "Mika Dela Cruz". */
function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || 'them';
}

function Qr({ card, size }: { card: PayCardMethod; size: string }) {
  return card.qrUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={card.qrUrl} alt={`${payMethodName(card)} QR code`} className={cn(size, 'shrink-0 rounded-lg border bg-white object-contain p-1')} />
  ) : (
    <span className={cn(size, 'grid shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground')}>
      {card.kind === 'bank' ? <Landmark className="size-5" aria-hidden /> : <QrCode className="size-5" aria-hidden />}
    </span>
  );
}

/**
 * A way to pay, sent in a chat — the phone's card (mobile PayChatCard): on
 * its sender's side, with the QR, the name and number, what it was sent for,
 * and a button that opens it full size. A card whose way to pay was removed
 * says so; for a day after a change the other side is told to check first.
 */
export function PayChatCard({ message, mine }: { message: ConversationMessage; mine: boolean }) {
  const [open, setOpen] = useState(false);
  const context = (message.context ?? null) as PayCardContext | null;
  const card = context?.method;
  const who = firstName(message.sender_name);
  const pkg = context?.package;

  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'w-72 overflow-hidden rounded-2xl border-[1.5px] border-primary bg-card',
          mine ? 'rounded-br-md' : 'rounded-bl-md',
        )}
      >
        <p className="flex items-center gap-2 px-3.5 pt-3 text-xs font-bold text-primary">
          <Wallet className="size-4" aria-hidden />
          How to pay {who}
        </p>
        {card ? (
          <>
            <div className="flex items-center gap-3 px-3.5 pt-2.5">
              <Qr card={card} size="size-20" />
              <div className="min-w-0 text-sm">
                <p className="font-bold">{payMethodName(card)}</p>
                {card.accountName && <p className="truncate text-muted-foreground">{card.accountName}</p>}
                {card.accountNumber && <p className="select-all font-bold tabular-nums">{card.accountNumber}</p>}
              </div>
            </div>
            {pkg && pkg.balanceMinor > 0 && (
              <p className="mx-3.5 mt-3 flex justify-between border-t pt-2.5 text-sm">
                <span className="truncate text-muted-foreground">{pkg.title}, balance</span>
                <span className="font-bold">{formatMoney(pkg.balanceMinor)}</span>
              </p>
            )}
            {!mine && payDetailsAreNew(card.detailsChangedAt) && (
              <p className="mx-3.5 mt-3 flex gap-2 rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {who} changed these details today. If you have paid {who} before at another number, check with them first.
              </p>
            )}
            <div className="px-3.5 pb-3.5 pt-2.5">
              <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => setOpen(true)}>
                Show QR full size
              </Button>
            </div>
            <PayQrDialog open={open} onOpenChange={setOpen} payMethods={[payCardAsMethod(card)]} />
          </>
        ) : (
          <p className="px-3.5 pb-3.5 pt-2 text-sm text-muted-foreground">
            {card === null ? `${who} removed this way to pay.` : message.body}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Pay the creative, on a booking (mobile BookingPayCard): their main way to
 * pay, for the poster once they have confirmed. Nothing when the server sent
 * no `payTo`; a line saying so when they have none yet.
 */
export function BookingPayCard({ booking }: { booking: Booking }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (booking.payTo === undefined) return null;
  const first = firstName(booking.otherParty.displayName);

  return (
    <section className="mt-4 grid gap-2">
      <h2 className="text-base font-bold">Pay {first}</h2>
      {booking.payTo === null ? (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            {first} hasn&apos;t added a way to get paid yet. Ask them in the chat.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="grid gap-3 py-4">
            <div className="flex items-center gap-4">
              <Qr card={booking.payTo} size="size-24" />
              <div className="min-w-0 text-sm">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {first}&apos;s main way to pay
                </p>
                <p className="text-base font-bold">{payMethodName(booking.payTo)}</p>
                {booking.payTo.accountName && <p className="text-muted-foreground">{booking.payTo.accountName}</p>}
                {booking.payTo.accountNumber && (
                  <p className="select-all text-base font-bold tabular-nums">{booking.payTo.accountNumber}</p>
                )}
              </div>
            </div>
            {payDetailsAreNew(booking.payTo.detailsChangedAt) && (
              <p className="text-xs text-destructive">
                {first} changed these details today. If you have paid {first} before at another number, check with them first.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => setOpen(true)}>
                <QrCode className="size-4" />
                Show QR
              </Button>
              {booking.payTo.accountNumber && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(booking.payTo?.accountNumber ?? '');
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    } catch {
                      // The number is selectable instead.
                    }
                  }}
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? 'Copied' : 'Copy number'}
                </Button>
              )}
            </div>
            <PayQrDialog open={open} onOpenChange={setOpen} payMethods={[payCardAsMethod(booking.payTo)]} />
          </CardContent>
        </Card>
      )}
      {booking.payTo !== null && (
        <p className="text-xs text-muted-foreground">
          Only you see this, because {first} confirmed your booking. Pay {first} directly: Virgo never holds the money.
        </p>
      )}
    </section>
  );
}
