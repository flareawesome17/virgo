'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, PAY_METHOD_KINDS, type MoneyPayMethod, type PayMethodKind } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DiscardChangesDialog } from '@/components/discard-changes-dialog';
import { ReceiptField, draftOf, receiptBusy, type ReceiptDraft } from '@/components/money/receipt-field';
import {
  useCreateMoneyPayMethod,
  useDeleteMoneyPayMethod,
  useUpdateMoneyPayMethod,
} from '@/hooks/useMoney';
import { useDiscardGuard, useGuardedClose, useOpeningKey } from '@/lib/discard-guard';
import { cn } from '@/lib/utils';

export type PayMethodDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present to edit that method; absent to add one. */
  method?: MoneyPayMethod;
};

/** One way clients can pay you — the phone's form, as a dialog. */
export function PayMethodDialog(props: PayMethodDialogProps) {
  const opening = useOpeningKey(props.open);
  return <PayMethodForm key={opening} {...props} />;
}

function PayMethodForm({ open, onOpenChange, method }: PayMethodDialogProps) {
  const create = useCreateMoneyPayMethod();
  const update = useUpdateMoneyPayMethod();
  const remove = useDeleteMoneyPayMethod();
  const pending = create.isPending || update.isPending;

  const [kind, setKind] = useState<PayMethodKind>(method?.kind ?? 'gcash');
  const [label, setLabel] = useState(method?.label ?? '');
  const [accountName, setAccountName] = useState(method?.accountName ?? '');
  const [accountNumber, setAccountNumber] = useState(method?.accountNumber ?? '');
  const [qr, setQr] = useState<ReceiptDraft | null>(() => draftOf(method?.qr));
  const [problem, setProblem] = useState<string | null>(null);
  const needsLabel = kind === 'bank' || kind === 'other';

  const { dirty } = useDiscardGuard({ kind, label, accountName, accountNumber, qr: qr?.name ?? null }, open);
  const guard = useGuardedClose(dirty, onOpenChange);

  const failed = (error: unknown) =>
    toast.error("Couldn't save it", {
      description: error instanceof ApiError && error.status !== 0 ? error.message : 'Please try again.',
    });

  const submit = () => {
    setProblem(null);
    if (receiptBusy(qr)) return setProblem('The QR code is still uploading.');
    if (qr?.error) return setProblem("Remove the QR code that didn't upload, or add it again.");
    if (!accountNumber.trim() && !qr?.id) return setProblem('Add the number or a QR code — something a client can pay to.');
    const fields = {
      kind,
      label: needsLabel ? label.trim() || null : null,
      accountName: accountName.trim() || null,
      accountNumber: accountNumber.trim() || null,
    };
    const qrId = qr?.id ?? null;
    const done = {
      onSuccess: () => {
        toast.success('Saved');
        onOpenChange(false);
      },
      onError: failed,
    };
    if (method) {
      update.mutate({ id: method.id, ...fields, ...(qrId !== (method.qr?.id ?? null) ? { qrReceiptId: qrId } : {}) }, done);
      return;
    }
    create.mutate({ ...fields, ...(qrId ? { qrReceiptId: qrId } : {}) }, done);
  };

  return (
    <Dialog open={open} onOpenChange={guard.close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{method ? 'Edit way to pay' : 'Add a way to pay'}</DialogTitle>
          <DialogDescription>Shown only on statements you share. Virgo never takes or holds a payment.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Pay with">
            {PAY_METHOD_KINDS.map((k) => (
              <button
                key={k.slug}
                type="button"
                role="radio"
                aria-checked={kind === k.slug}
                onClick={() => setKind(k.slug)}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs font-medium transition-colors',
                  kind === k.slug ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-muted',
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          {needsLabel && (
            <div className="grid gap-2">
              <Label htmlFor="pm-label">{kind === 'bank' ? 'Bank' : 'What it is'}</Label>
              <Input id="pm-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === 'bank' ? 'BPI, BDO, UnionBank' : 'PayPal'} maxLength={60} />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="pm-name">
              Account name <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="pm-name" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="The name the client sees when they pay" maxLength={120} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pm-number">{kind === 'bank' ? 'Account number' : 'Number'}</Label>
            <Input id="pm-number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder={kind === 'gcash' || kind === 'maya' ? '0917 123 4567' : ''} maxLength={60} autoComplete="off" />
          </div>
          <div className="grid gap-2">
            <Label>
              QR code <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <ReceiptField value={qr} onChange={setQr} disabled={pending} label="Add QR code" hint="A screenshot of your GCash, Maya or bank QR" imagesOnly />
          </div>
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
        <DialogFooter className="gap-2 sm:justify-between">
          {method ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(method.id, {
                  onSuccess: () => {
                    toast.success('Removed');
                    onOpenChange(false);
                  },
                  onError: failed,
                })
              }
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => guard.close(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={submit}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      <DiscardChangesDialog guard={guard} />
    </Dialog>
  );
}
