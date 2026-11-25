'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoney, type MoneySaving } from '@/api';
import { ChoiceChip, FORM_SUBMIT, FormCard, FormFooter } from '@/components/kit';
import { FORM_DIALOG, FORM_DIALOG_FOOT, FORM_DIALOG_TITLE, problem } from '@/components/money/saving-bits';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useMoveMoneySaving } from '@/hooks/useMoney';
import { useOpeningKey } from '@/lib/discard-guard';

/** A payment that has just come in, to be asked about. */
export interface SetAsideOffer {
  amountMinor: number;
  /** Who it was from, in the person's words. */
  from: string | null;
}

const SHARES = [10, 20, 30] as const;

export type SetAsideDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The payment being asked about. */
  offer: SetAsideOffer;
  savings: MoneySaving[];
};

/**
 * "Set some of it aside?", asked once a payment has been marked as received:
 * the phone's sheet (SetAsideSheet) as a dialog, with its arithmetic.
 *
 * A share of what just came in, into the savings that are ticked, split
 * evenly in whole pesos with the odd centavos to the first. It is a question,
 * not a rule: "Not this time" is as good an answer, and nothing is put aside
 * that was not chosen here.
 */
export function SetAsideDialog(props: SetAsideDialogProps) {
  const opening = useOpeningKey(props.open);
  return <SetAsideForm key={opening} {...props} />;
}

function SetAsideForm({ open, onOpenChange, offer, savings }: SetAsideDialogProps) {
  const move = useMoveMoneySaving();
  const [share, setShare] = useState<(typeof SHARES)[number]>(20);
  // Which savings it goes into. The tax fund first, when there is one: tax on
  // what was just earned is the one thing that is certainly owed. Chosen as
  // it opens, so the list refetching does not undo what was ticked.
  const [chosen, setChosen] = useState<string[]>(() => {
    const tax = savings.find((saving) => saving.icon === 'tax');
    return tax ? [tax.id] : savings.slice(0, 1).map((saving) => saving.id);
  });
  const [busy, setBusy] = useState(false);

  // In whole pesos, so nobody is asked to move ₱4,499.50.
  const total = Math.floor((offer.amountMinor * share) / 100 / 100) * 100;
  const parts = useMemo(() => {
    const into = savings.filter((saving) => chosen.includes(saving.id));
    if (into.length === 0 || total <= 0) return [];
    const each = Math.floor(total / into.length / 100) * 100;
    return into.map((saving, at) => ({
      saving,
      amountMinor: at === 0 ? total - each * (into.length - 1) : each,
    }));
  }, [savings, chosen, total]);
  const ready = parts.length > 0 && parts.every((part) => part.amountMinor > 0) && !busy;

  const confirm = async () => {
    if (!ready) return;
    setBusy(true);
    const note = offer.from ? `From ${offer.from}` : 'From a payment';
    let failed: unknown = null;
    // One after another: each is its own small write, and a failure part-way
    // leaves the ones before it done, which is said below.
    let done = 0;
    for (const part of parts) {
      try {
        await move.mutateAsync({ id: part.saving.id, amountMinor: part.amountMinor, note });
        done += 1;
      } catch (error) {
        failed = error;
        break;
      }
    }
    setBusy(false);
    onOpenChange(false);
    if (failed) {
      toast.error(done > 0 ? 'Some of it was set aside' : "Couldn't set it aside", {
        description: `${done > 0 ? `${done} of ${parts.length} went through. ` : ''}${problem(failed)}`,
      });
    } else {
      toast.success(`Set aside ${formatMoney(total)}`);
    }
  };

  return (
    // Not closed from under a write that is part-way through its savings.
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent className={FORM_DIALOG}>
        <DialogHeader>
          <DialogTitle className={FORM_DIALOG_TITLE}>Set some of it aside?</DialogTitle>
          <DialogDescription>
            You just recorded {formatMoney(offer.amountMinor)}
            {offer.from ? ` from ${offer.from}` : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[26px] font-bold leading-8 tracking-tight tabular-nums" aria-live="polite">
            {formatMoney(total)}
          </span>
          <div className="flex gap-2" role="group" aria-label="Share of the payment">
            {SHARES.map((value) => (
              <ChoiceChip key={value} on={share === value} onClick={() => setShare(value)}>
                {value}%
              </ChoiceChip>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-muted-foreground">Into</span>
          <FormCard>
            {savings.map((saving) => {
              const on = chosen.includes(saving.id);
              const part = parts.find((p) => p.saving.id === saving.id);
              return (
                <label key={saving.id} className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 text-sm">
                  <Checkbox
                    checked={on}
                    onCheckedChange={() =>
                      setChosen((current) => (on ? current.filter((id) => id !== saving.id) : [...current, saving.id]))
                    }
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold">{saving.name}</span>
                  {part ? <span className="font-semibold tabular-nums">{formatMoney(part.amountMinor)}</span> : null}
                </label>
              );
            })}
          </FormCard>
        </div>

        <FormFooter className={FORM_DIALOG_FOOT}>
          <Button type="button" className={FORM_SUBMIT} disabled={!ready} onClick={() => void confirm()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? 'Setting it aside…' : ready ? `Set aside ${formatMoney(total)}` : 'Choose where it goes'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-xl font-semibold text-muted-foreground"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Not this time
          </Button>
        </FormFooter>
      </DialogContent>
    </Dialog>
  );
}
