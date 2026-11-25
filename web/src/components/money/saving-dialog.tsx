'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  minorToPesos,
  pesosToMinor,
  SAVING_ICONS,
  todayIso,
  type MoneySaving,
  type SavingIcon,
} from '@/api';
import { DiscardChangesDialog } from '@/components/discard-changes-dialog';
import { ChoiceChip, FORM_INPUT, FORM_SUBMIT, FormField, FormFooter } from '@/components/kit';
import { shortDay } from '@/components/money/money-bits';
import {
  DateRow,
  FORM_DIALOG,
  FORM_DIALOG_FOOT,
  FORM_DIALOG_TITLE,
  PesoInput,
  problem,
  SAVING_ICON_NAMES,
  SavingGlyph,
} from '@/components/money/saving-bits';
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
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCreateMoneySaving, useDeleteMoneySaving, useUpdateMoneySaving } from '@/hooks/useMoney';
import { useDiscardGuard, useGuardedClose, useOpeningKey } from '@/lib/discard-guard';

export type SavingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present to change that saving; absent to make a new one. */
  saving?: MoneySaving;
  /** Told once a new saving is made, after the dialog has closed. */
  onCreated?: (saving: MoneySaving) => void;
  /** Told once the saving being changed has been deleted instead. */
  onDeleted?: () => void;
};

/**
 * A saving, new or being changed: the phone's form (mobile/app/(app)/money/
 * savings/new.tsx) as a dialog. Keyed on the opening, so each starts afresh.
 *
 * Only the name is asked for. A goal and a date each make the saving say
 * more, and each can be left for later.
 */
export function SavingDialog(props: SavingDialogProps) {
  const opening = useOpeningKey(props.open);
  return <SavingForm key={opening} {...props} />;
}

function SavingForm({ open, onOpenChange, saving, onCreated, onDeleted }: SavingDialogProps) {
  const create = useCreateMoneySaving();
  const update = useUpdateMoneySaving();
  const remove = useDeleteMoneySaving();
  const today = todayIso();

  const [name, setName] = useState(saving?.name ?? '');
  const [icon, setIcon] = useState<SavingIcon>(saving?.icon ?? 'other');
  const [goal, setGoal] = useState(saving?.goalMinor ? minorToPesos(saving.goalMinor) : '');
  const [by, setBy] = useState(saving?.targetDate ?? '');
  const [starting, setStarting] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { dirty } = useDiscardGuard({ name, icon, goal, by, starting }, open);
  const guard = useGuardedClose(dirty, onOpenChange);

  const goalMinor = goal.trim() ? pesosToMinor(goal) : null;
  const startingMinor = starting.trim() ? pesosToMinor(starting) : null;
  const goalWrong = goal.trim().length > 0 && goalMinor === null;
  const startingWrong = starting.trim().length > 0 && startingMinor === null;
  const busy = create.isPending || update.isPending;
  const canSave = name.trim().length > 0 && !goalWrong && !startingWrong;

  const save = () => {
    if (!canSave || busy) return;
    // Where it is kept is the phone's to set: left out, the server keeps what is there.
    const fields = { name: name.trim(), icon, goalMinor, targetDate: by || null };
    if (saving) {
      update.mutate(
        { id: saving.id, ...fields },
        {
          onSuccess: () => onOpenChange(false),
          onError: (error) => toast.error("Couldn't save it", { description: problem(error) }),
        },
      );
      return;
    }
    create.mutate(
      { ...fields, ...(startingMinor ? { startingMinor } : {}) },
      {
        onSuccess: (made) => {
          onOpenChange(false);
          onCreated?.(made);
        },
        onError: (error) => toast.error("Couldn't create it", { description: problem(error) }),
      },
    );
  };

  const deleteSaving = () => {
    if (!saving) return;
    remove.mutate(saving.id, {
      onSuccess: () => {
        setConfirmDelete(false);
        onOpenChange(false);
        onDeleted?.();
      },
      onError: (error) => toast.error("Couldn't delete it", { description: problem(error) }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={guard.close}>
      <DialogContent className={FORM_DIALOG}>
        <DialogHeader>
          <DialogTitle className={FORM_DIALOG_TITLE}>{saving ? 'Edit saving' : 'New saving'}</DialogTitle>
          <DialogDescription className="sr-only">
            Your own note of money you have put aside. Virgo doesn’t hold it.
          </DialogDescription>
        </DialogHeader>

        {/* A form, so Enter saves from any field. */}
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <FormField label="What is it for?" htmlFor="saving-name">
            <Input
              id="saving-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New lens, 70–200"
              maxLength={80}
              autoFocus={!saving}
              autoComplete="off"
              className={FORM_INPUT}
            />
          </FormField>

          <FormField label="Picture">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Picture">
              {SAVING_ICONS.map((value) => (
                <ChoiceChip key={value} on={icon === value} onClick={() => setIcon(value)}>
                  <SavingGlyph icon={value} />
                  {SAVING_ICON_NAMES[value]}
                </ChoiceChip>
              ))}
            </div>
          </FormField>

          <FormField
            label="How much do you need?"
            htmlFor="saving-goal"
            optional
            hint="Leave it empty to keep a running total."
            error={goalWrong ? 'Enter an amount in pesos, like 85000.' : undefined}
          >
            <PesoInput id="saving-goal" value={goal} onChange={setGoal} invalid={goalWrong} />
          </FormField>

          <DateRow
            label="By when"
            value={by}
            display={by ? shortDay(by, today) : 'No date'}
            onChange={setBy}
            from={today}
            clearable
          />

          {saving ? (
            <Button
              type="button"
              variant="ghost"
              className="h-10 self-center rounded-xl px-4 font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
              Delete saving
            </Button>
          ) : (
            <FormField
              label="Already have some?"
              htmlFor="saving-starting"
              optional
              error={startingWrong ? 'Enter an amount in pesos, like 5000.' : undefined}
            >
              <PesoInput id="saving-starting" value={starting} onChange={setStarting} invalid={startingWrong} />
            </FormField>
          )}

          <FormFooter className={FORM_DIALOG_FOOT}>
            <Button type="submit" className={FORM_SUBMIT} disabled={!canSave || busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {saving ? 'Save changes' : 'Create saving'}
            </Button>
          </FormFooter>
        </form>
      </DialogContent>
      <DiscardChangesDialog guard={guard} />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this saving?</AlertDialogTitle>
            <AlertDialogDescription>
              The saving and its history go. Your money is wherever you keep it: Virgo never held it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteSaving();
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
