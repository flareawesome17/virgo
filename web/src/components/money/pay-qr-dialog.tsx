'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Copy, ExternalLink, Landmark, QrCode, ShieldCheck } from 'lucide-react';
import { payMethodName, type MoneyPayMethod } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useOpeningKey } from '@/lib/discard-guard';
import { cn } from '@/lib/utils';

/**
 * Show QR — the phone's full-size code, as a large dialog: for a client at
 * the desk to scan from the screen. Chips switch between the saved ways to
 * pay; the main one opens first unless another was asked for.
 */
type PayQrDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payMethods: MoneyPayMethod[];
  initialId?: string;
};

export function PayQrDialog(props: PayQrDialogProps) {
  // Keyed on each opening, so it opens on the way to pay asked for, not the last one shown.
  const opening = useOpeningKey(props.open);
  return <PayQrContent key={`${opening}-${props.initialId ?? ''}`} {...props} />;
}

function PayQrContent({ open, onOpenChange, payMethods, initialId }: PayQrDialogProps) {
  const [picked, setPicked] = useState<string | undefined>(initialId);
  const [copied, setCopied] = useState(false);

  const method = payMethods.find((m) => m.id === picked) ?? payMethods[0];

  const copy = async () => {
    if (!method) return;
    try {
      await navigator.clipboard.writeText(
        method.accountNumber ?? [payMethodName(method), method.accountName].filter(Boolean).join(' · '),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // A browser that refuses the clipboard: the number is selectable instead.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Show a QR</DialogTitle>
          <DialogDescription>For a client to scan. Virgo never takes or holds a payment.</DialogDescription>
        </DialogHeader>
        {!method ? (
          <div className="grid gap-3 py-4 text-center">
            <p className="text-sm text-muted-foreground">No ways to pay yet.</p>
            <Button asChild>
              <Link href="/money/pay-methods">Add a way to pay</Link>
            </Button>
          </div>
        ) : (
          <div className="grid justify-items-center gap-4 pb-1">
            {payMethods.length > 1 && (
              <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Way to pay">
                {payMethods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={m.id === method.id}
                    onClick={() => setPicked(m.id)}
                    className={cn(
                      'h-9 rounded-full border px-4 text-sm font-semibold transition-colors',
                      m.id === method.id
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    {payMethodName(m)}
                  </button>
                ))}
              </div>
            )}

            {method.qr?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={method.qr.url}
                alt={`${payMethodName(method)} QR code`}
                className="size-72 max-w-full rounded-2xl border bg-white object-contain p-3"
              />
            ) : (
              <div className="grid size-56 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <div className="grid justify-items-center gap-2">
                  {method.kind === 'bank' ? <Landmark className="size-7" aria-hidden /> : <QrCode className="size-7" aria-hidden />}
                  <span className="text-sm font-semibold">No QR saved</span>
                </div>
              </div>
            )}

            <div className="grid justify-items-center gap-0.5 text-center">
              <span className="text-sm font-bold text-muted-foreground">{payMethodName(method)}</span>
              {method.accountName && <span className="text-xl font-bold">{method.accountName}</span>}
              {method.accountNumber && (
                <span className="select-all text-lg font-semibold tracking-wide tabular-nums">{method.accountNumber}</span>
              )}
            </div>
            {method.accountName && (
              <p className="flex max-w-xs gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                Before they send, ask them to check that their app shows the name {method.accountName}.
              </p>
            )}

            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" onClick={() => void copy()}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copied' : method.accountNumber ? 'Copy number' : 'Copy details'}
              </Button>
              {method.qr?.url && (
                <Button asChild variant="outline">
                  <a href={method.qr.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" />
                    Open the QR to save it
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
