'use client';

import { useState, type ReactNode } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  minorToPesos,
  MONEY_CATEGORIES,
  MONEY_METHODS,
  pesosToMinor,
  todayIso,
  type MoneyEntry,
  type MoneyKind,
  type MoneyMethod,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { DatePickerField } from '@/components/date-picker-field';
import { DiscardChangesDialog } from '@/components/discard-changes-dialog';
import { CategoryIcon } from '@/components/money/icons';
import { ReceiptField, draftOf, receiptBusy, type ReceiptDraft } from '@/components/money/receipt-field';
import {
  useCreateMoneyEntry,
  useDeleteMoneyEntry,
  useUpdateMoneyEntry,
} from '@/hooks/useMoney';
import { useDiscardGuard, useGuardedClose, useOpeningKey } from '@/lib/discard-guard';
import { cn } from '@/lib/utils';

export type MoneyEntryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which kind a new entry starts as. */
  kind?: MoneyKind;
  /** Present to edit that entry; absent to make a new one. */
  entry?: MoneyEntry;
  /** Told once a new entry is saved, after the dialog has closed. */
  onCreated?: (entry: MoneyEntry) => void;
};

/** The web has crypto.randomUUID in every browser it supports. */
function newId(): string {
  return crypto.randomUUID();
}

/**
 * A money entry, new or an edit: the phone's form (mobile/app/(app)/money/
 * new.tsx) as a dialog. Keyed on the opening, so each one starts afresh.
 */
export function MoneyEntryDialog(props: MoneyEntryDialogProps) {
  const opening = useOpeningKey(props.open);
  return <MoneyEntryForm key={opening} {...props} />;
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
        on
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function MoneyEntryForm({ open, onOpenChange, kind: startKind, entry, onCreated }: MoneyEntryDialogProps) {
  const create = useCreateMoneyEntry();
  const update = useUpdateMoneyEntry();
  const remove = useDeleteMoneyEntry();
  const editing = Boolean(entry);
  const pending = create.isPending || update.isPending;

  // Made once per opening, so a retried save finds the entry it already wrote.
  const [id] = useState(() => entry?.id ?? newId());
  const [kind, setKind] = useState<MoneyKind>(entry?.kind ?? startKind ?? 'expense');
  const [amount, setAmount] = useState(entry ? minorToPesos(entry.amountMinor) : '');
  const [category, setCategory] = useState<string | null>(
    entry?.category ?? ((entry?.kind ?? startKind) === 'income' ? 'job' : null),
  );
  const [date, setDate] = useState(entry?.occurredOn ?? todayIso());
  const [paid, setPaid] = useState(entry ? entry.paidOn !== null : true);
  // Empty: paid on the entry's own date.
  const [paidOn, setPaidOn] = useState(
    entry?.paidOn && entry.paidOn !== entry.occurredOn ? entry.paidOn : '',
  );
  const [method, setMethod] = useState<MoneyMethod | null>(entry?.method ?? null);
  const [counterparty, setCounterparty] = useState(entry?.counterparty ?? '');
  const [reference, setReference] = useState(entry?.reference ?? '');
  const [withheld, setWithheld] = useState(
    entry && entry.withheldMinor > 0 ? minorToPesos(entry.withheldMinor) : '',
  );
  const [note, setNote] = useState(entry?.note ?? '');
  const [receipt, setReceipt] = useState<ReceiptDraft | null>(() => draftOf(entry?.receipt));
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { dirty } = useDiscardGuard(
    { kind, amount, category, date, paid, paidOn, method, counterparty, reference, withheld, note, receipt: receipt?.name ?? null },
    open,
  );
  const guard = useGuardedClose(dirty, onOpenChange);

  const income = kind === 'income';

  const switchKind = (next: MoneyKind) => {
    if (next === kind) return;
    setKind(next);
    if (!category || !MONEY_CATEGORIES[next].some((c) => c.slug === category)) {
      setCategory(next === 'income' ? 'job' : null);
    }
  };

  const failed = (error: unknown) =>
    toast.error("Couldn't save it", {
      description: error instanceof ApiError && error.status !== 0 ? error.message : 'Please try again.',
    });

  const submit = () => {
    setProblem(null);
    const amountMinor = pesosToMinor(amount);
    if (!amountMinor) return setProblem('Enter the amount in pesos, like 1500 or 350.50.');
    if (!category) return setProblem('Pick a category.');
    let withheldMinor = 0;
    if (income && withheld.trim()) {
      const parsed = pesosToMinor(withheld);
      if (!parsed) return setProblem('Enter the tax withheld in pesos, or leave it empty.');
      if (parsed > amountMinor) return setProblem("Tax withheld can't be more than the amount.");
      withheldMinor = parsed;
    }
    if (receiptBusy(receipt)) return setProblem('The receipt is still uploading.');
    if (receipt?.error) return setProblem("Remove the receipt that didn't upload, or add it again.");
    const paidDay = paid ? paidOn || date : null;
    if (paidDay && paidDay > todayIso()) {
      return setProblem(
        income
          ? "That day is still ahead. Turn off Received — it's money you're waiting for, due that day."
          : "That day is still ahead. Turn off Paid — it's a bill still to pay, due that day.",
      );
    }

    const fields = {
      kind,
      amountMinor,
      withheldMinor,
      category,
      occurredOn: date,
      paidOn: paidDay,
      method,
      reference: reference.trim() || null,
      counterparty: counterparty.trim() || null,
      note: note.trim() || null,
    };

    if (entry) {
      const receiptId = receipt?.id ?? null;
      update.mutate(
        { id, ...fields, ...(receiptId !== (entry.receipt?.id ?? null) ? { receiptId } : {}) },
        {
          onSuccess: () => {
            toast.success('Entry saved');
            onOpenChange(false);
          },
          onError: failed,
        },
      );
      return;
    }
    create.mutate(
      { id, ...fields, ...(receipt?.id ? { receiptId: receipt.id } : {}) },
      {
        onSuccess: (saved) => {
          toast.success(income ? 'Income saved' : 'Expense saved');
          onOpenChange(false);
          onCreated?.(saved);
        },
        onError: failed,
      },
    );
  };

  const deleteEntry = () =>
    remove.mutate(id, {
      onSuccess: () => {
        toast.success('Entry deleted');
        setConfirmDelete(false);
        onOpenChange(false);
      },
      onError: (error) =>
        toast.error("Couldn't delete it", {
          description: error instanceof ApiError && error.status !== 0 ? error.message : 'Please try again.',
        }),
    });

  return (
    <Dialog open={open} onOpenChange={guard.close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit entry' : income ? 'New income' : 'New expense'}</DialogTitle>
          <DialogDescription>Only you can see your money entries.</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div role="radiogroup" aria-label="Kind" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => switchKind(k)}
                className={cn(
                  'h-8 rounded-md text-sm font-semibold transition-colors',
                  kind === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {k === 'income' ? 'Income' : 'Expense'}
              </button>
            ))}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="money-amount">Amount</Label>
            <div className="relative">
              <span
                className={cn(
                  'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold',
                  income ? 'text-success' : 'text-muted-foreground',
                )}
              >
                ₱
              </span>
              <Input
                id="money-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                autoFocus={!editing}
                className="h-12 pl-8 text-xl font-bold tabular-nums"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Category</Label>
            <div className="flex flex-wrap gap-1.5">
              {MONEY_CATEGORIES[kind].map((c) => (
                <Chip key={c.slug} on={category === c.slug} onClick={() => setCategory(c.slug)}>
                  <CategoryIcon kind={kind} slug={c.slug} className="size-3.5" />
                  {c.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="money-date">{paid ? 'Date' : 'Due'}</Label>
              <DatePickerField
                id="money-date"
                value={date}
                onChange={(next) => next && setDate(next)}
                clearable={false}
              />
            </div>
            {paid && (
              <div className="grid gap-2">
                <Label htmlFor="money-paid-on">
                  {income ? 'Received on' : 'Paid on'}
                  <span className="font-normal text-muted-foreground">(if another day)</span>
                </Label>
                <DatePickerField
                  id="money-paid-on"
                  value={paidOn}
                  onChange={setPaidOn}
                  placeholder="Same day"
                  clearable
                />
              </div>
            )}
          </div>

          <div className="flex items-start gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <Label htmlFor="money-paid" className="text-sm font-semibold">
                {income ? 'Received' : 'Paid'}
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {paid
                  ? income
                    ? 'The money is in'
                    : 'It has been paid'
                  : income
                    ? 'The client still owes this — due on the date above'
                    : 'Still to pay — due on the date above'}
              </p>
            </div>
            <Switch
              id="money-paid"
              checked={paid}
              onCheckedChange={(next) => {
                setPaid(next);
                setPaidOn('');
              }}
              className="mt-0.5"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="money-who">
                {income ? 'Client' : 'Paid to'}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="money-who"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder={income ? 'Reyes–Santos wedding' : 'Grab, Lazada, your assistant'}
                maxLength={120}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="money-ref">
                Reference no.
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="money-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="GCash, bank or invoice no."
                maxLength={80}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>
              How
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {MONEY_METHODS.map((m) => (
                <Chip
                  key={m.slug}
                  on={method === m.slug}
                  onClick={() => setMethod((current) => (current === m.slug ? null : m.slug))}
                >
                  {m.label}
                </Chip>
              ))}
            </div>
          </div>

          {income && (
            <div className="grid gap-2">
              <Label htmlFor="money-withheld">
                Tax withheld
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  ₱
                </span>
                <Input
                  id="money-withheld"
                  inputMode="decimal"
                  value={withheld}
                  onChange={(e) => setWithheld(e.target.value)}
                  placeholder="0"
                  className="pl-7 tabular-nums"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                When a company client keeps part of your fee as tax and gives you a BIR Form 2307.
                Enter the full fee above, and what they kept here.
              </p>
            </div>
          )}

          <div className="grid gap-2">
            <Label>
              Receipt
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <ReceiptField value={receipt} onChange={setReceipt} disabled={pending} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="money-note">
              Note
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="money-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything worth remembering…"
              maxLength={1000}
              rows={2}
            />
          </div>

          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          {/* Enter saves from any field, as the form's own submit. */}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>

        <DialogFooter className="gap-2 sm:justify-between">
          {editing ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
              Delete
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
              {editing ? 'Save changes' : income ? 'Save income' : 'Save expense'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      <DiscardChangesDialog guard={guard} />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              It comes out of your totals, and its receipt is deleted too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteEntry();
              }}
              disabled={remove.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
