'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoney, pesosToMinor, todayIso, type MoneySaving } from '@/api';
import { DiscardChangesDialog } from '@/components/discard-changes-dialog';
import { FORM_INPUT, FORM_SUBMIT, FormField, FormFooter } from '@/components/kit';
import { dayHeading } from '@/components/money/money-bits';
import {
  DateRow,
  FORM_DIALOG,
  FORM_DIALOG_FOOT,
  FORM_DIALOG_TITLE,
  PesoInput,
  problem,
} from '@/components/money/saving-bits';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useMoveMoneySaving } from '@/hooks/useMoney';
import { useDiscardGuard, useGuardedClose, useOpeningKey } from '@/lib/discard-guard';

export type SavingMoveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: MoneySaving;
  direction: 'in' | 'out';
  /** After the money has moved; what was taken out may want recording as an expense. */
  onMoved?: (direction: 'in' | 'out', amountMinor: number) => void;
};

/**
 * Putting money into a saving, or taking it out: the phone's sheet
 * (SavingMoveSheet) as a dialog, with the day it moved.
 *
 * One dialog for both: the same things are asked, how much, when and what
 * for, and only the word on the button changes.
 */
export function SavingMoveDialog(props: SavingMoveDialogProps) {
  const opening = useOpeningKey(props.open);
  return <SavingMoveForm key={opening} {...props} />;
}

function SavingMoveForm({ open, onOpenChange, saving, direction, onMoved }: SavingMoveDialogProps) {
  const move = useMoveMoneySaving();
  const today = todayIso();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');

  const { dirty } = useDiscardGuard({ amount, date, note }, open);
  const guard = useGuardedClose(dirty, onOpenChange);

  const minor = pesosToMinor(amount);
  const out = direction === 'out';
  const wrong = amount.trim().length > 0 && minor === null;
  const tooMuch = out && minor !== null && minor > saving.balanceMinor;
  const ready = minor !== null && !tooMuch;

  const submit = () => {
    if (!ready || minor === null || move.isPending) return;
    move.mutate(
      { id: saving.id, amountMinor: out ? -minor : minor, note: note.trim() || null, movedOn: date },
      {
        onSuccess: () => {
          onOpenChange(false);
          onMoved?.(direction, minor);
        },
        onError: (error) =>
          toast.error(out ? "Couldn't take it out" : "Couldn't add it", { description: problem(error) }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={guard.close}>
      <DialogContent className={FORM_DIALOG}>
        <DialogHeader>
          <DialogTitle className={FORM_DIALOG_TITLE}>{out ? 'Take money out' : 'Add money'}</DialogTitle>
          <DialogDescription>
            {saving.name} holds {formatMoney(saving.balanceMinor)}
          </DialogDescription>
        </DialogHeader>

        {/* A form, so Enter saves from any field. */}
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FormField
            label="Amount"
            htmlFor="saving-move-amount"
            error={
              tooMuch
                ? 'That is more than it holds.'
                : wrong
                  ? 'Enter an amount in pesos, like 5000.'
                  : undefined
            }
          >
            <PesoInput
              id="saving-move-amount"
              value={amount}
              onChange={setAmount}
              invalid={wrong || tooMuch}
              autoFocus
            />
          </FormField>

          <DateRow label="Date" value={date} display={dayHeading(date, today)} onChange={setDate} to={today} />

          <FormField label="Note" htmlFor="saving-move-note" optional>
            <Input
              id="saving-move-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={out ? 'What it went on, if you like' : 'Where it came from, if you like'}
              maxLength={200}
              autoComplete="off"
              className={FORM_INPUT}
            />
          </FormField>

          <FormFooter className={FORM_DIALOG_FOOT}>
            <Button type="submit" className={FORM_SUBMIT} disabled={!ready || move.isPending}>
              {move.isPending && <Loader2 className="size-4 animate-spin" />}
              {move.isPending
                ? 'Saving…'
                : minor !== null && ready
                  ? `${out ? 'Take out' : 'Add'} ${formatMoney(minor)}`
                  : out
                    ? 'Take out'
                    : 'Add money'}
            </Button>
          </FormFooter>
        </form>
      </DialogContent>
      <DiscardChangesDialog guard={guard} />
    </Dialog>
  );
}
