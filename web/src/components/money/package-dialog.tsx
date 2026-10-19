'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  formatMoney,
  minorToPesos,
  pesosToMinor,
  todayIso,
  type MoneyPackage,
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
import { DatePickerField } from '@/components/date-picker-field';
import { DiscardChangesDialog } from '@/components/discard-changes-dialog';
import { useCreateMoneyPackage, useUpdateMoneyPackage } from '@/hooks/useMoney';
import { useDiscardGuard, useGuardedClose, useOpeningKey } from '@/lib/discard-guard';

export type PackageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present to edit that package; absent to make a new one. */
  pkg?: MoneyPackage;
  /** Told once a new package is made, after the dialog has closed. */
  onCreated?: (pkg: MoneyPackage) => void;
};

/**
 * A package, new or an edit — the phone's form (mobile/app/(app)/money/
 * packages/new.tsx) as a dialog. New, it takes the plan too: the down
 * payment, received or due, and when the balance is due.
 */
export function PackageDialog(props: PackageDialogProps) {
  const opening = useOpeningKey(props.open);
  return <PackageForm key={opening} {...props} />;
}

function PesoInput({ id, value, onChange, large }: { id: string; value: string; onChange: (v: string) => void; large?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₱</span>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className={large ? 'h-11 pl-7 text-lg font-bold tabular-nums' : 'pl-7 tabular-nums'}
      />
    </div>
  );
}

function PackageForm({ open, onOpenChange, pkg, onCreated }: PackageDialogProps) {
  const create = useCreateMoneyPackage();
  const update = useUpdateMoneyPackage();
  const editing = Boolean(pkg);
  const pending = create.isPending || update.isPending;

  const [id] = useState(() => pkg?.id ?? crypto.randomUUID());
  const [title, setTitle] = useState(pkg?.title ?? '');
  const [client, setClient] = useState(pkg?.clientName ?? '');
  const [total, setTotal] = useState(pkg ? minorToPesos(pkg.totalMinor) : '');
  const [eventDate, setEventDate] = useState(pkg?.eventDate ?? '');
  const [note, setNote] = useState(pkg?.note ?? '');
  const [deposit, setDeposit] = useState('');
  const [received, setReceived] = useState(true);
  const [depositDate, setDepositDate] = useState(todayIso());
  const [balanceDue, setBalanceDue] = useState('');
  const [balanceTouched, setBalanceTouched] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const { dirty } = useDiscardGuard(
    { title, client, total, eventDate, note, deposit, received, depositDate, balanceDue },
    open,
  );
  const guard = useGuardedClose(dirty, onOpenChange);

  const totalMinor = pesosToMinor(total);
  const depositMinor = deposit.trim() ? pesosToMinor(deposit) : 0;
  const rest = totalMinor && depositMinor !== null ? totalMinor - depositMinor : null;

  const failed = (error: unknown) =>
    toast.error("Couldn't save it", {
      description: error instanceof ApiError && error.status !== 0 ? error.message : 'Please try again.',
    });

  const submit = () => {
    setProblem(null);
    if (!title.trim()) return setProblem('Name the package: the job it is for.');
    if (!totalMinor) return setProblem('Enter the total the client agreed to pay, in pesos.');
    const fields = {
      title: title.trim(),
      clientName: client.trim() || null,
      totalMinor,
      eventDate: eventDate || null,
      note: note.trim() || null,
    };
    if (pkg) {
      update.mutate(
        { id: pkg.id, ...fields },
        {
          onSuccess: () => {
            toast.success('Package saved');
            onOpenChange(false);
          },
          onError: failed,
        },
      );
      return;
    }
    if (depositMinor === null) return setProblem('Enter the down payment in pesos, or leave it empty.');
    if (depositMinor > totalMinor) return setProblem("The down payment can't be more than the total.");
    if (depositMinor > 0 && received && depositDate > todayIso()) {
      return setProblem('That day is still ahead. Turn off Received — it is a down payment still to come.');
    }
    create.mutate(
      {
        id,
        ...fields,
        deposit:
          depositMinor > 0
            ? received
              ? { amountMinor: depositMinor, paidOn: depositDate }
              : { amountMinor: depositMinor, paidOn: null, dueOn: depositDate }
            : null,
        balanceDueOn: balanceDue || null,
      },
      {
        onSuccess: (made) => {
          onOpenChange(false);
          onCreated?.(made.package);
        },
        onError: failed,
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={guard.close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit package' : 'New package'}</DialogTitle>
          <DialogDescription>
            What a client agreed to pay for a job — and, as it is paid, what is left.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="pkg-title">Job</Label>
            <Input
              id="pkg-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Garcia–Lim wedding"
              maxLength={120}
              autoFocus={!editing}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pkg-client">
                Client <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="pkg-client" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Who is paying" maxLength={120} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pkg-date">
                Event date <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <DatePickerField
                id="pkg-date"
                value={eventDate}
                onChange={(next) => {
                  setEventDate(next);
                  if (!balanceTouched) setBalanceDue(next);
                }}
                placeholder="Not set"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pkg-total">Total</Label>
            <PesoInput id="pkg-total" value={total} onChange={setTotal} large />
          </div>

          {!editing && (
            <div className="grid gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-semibold">Payment plan</p>
                <p className="text-xs text-muted-foreground">
                  The down payment or reservation fee, and when the rest is due. You can add or change payments later.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="pkg-deposit">
                    Down payment <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <PesoInput id="pkg-deposit" value={deposit} onChange={setDeposit} />
                </div>
                {depositMinor ? (
                  <div className="grid gap-2">
                    <Label htmlFor="pkg-deposit-date">{received ? 'Received on' : 'Due'}</Label>
                    <DatePickerField id="pkg-deposit-date" value={depositDate} onChange={(next) => next && setDepositDate(next)} clearable={false} />
                  </div>
                ) : null}
              </div>
              {depositMinor ? (
                <div className="flex items-center gap-3">
                  <Switch id="pkg-received" checked={received} onCheckedChange={setReceived} />
                  <Label htmlFor="pkg-received" className="text-sm font-normal">
                    {received ? 'The down payment is in' : 'Still to come'}
                  </Label>
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="pkg-balance">
                  {rest !== null && rest > 0 ? `Balance of ${formatMoney(rest)} due` : 'Balance due'}{' '}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <DatePickerField
                  id="pkg-balance"
                  value={balanceDue}
                  onChange={(next) => {
                    setBalanceTouched(true);
                    setBalanceDue(next);
                  }}
                  placeholder="Not decided yet"
                />
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="pkg-note">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="pkg-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What the package covers…" maxLength={1000} rows={2} />
          </div>

          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => guard.close(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={submit}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {editing ? 'Save changes' : 'Create package'}
          </Button>
        </DialogFooter>
      </DialogContent>
      <DiscardChangesDialog guard={guard} />
    </Dialog>
  );
}
