'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  formatMoney,
  monthLabel,
  monthOf,
  monthRange,
  savingMonthlyPace,
  type MoneySaving,
  type MoneySavingMove,
} from '@/api';
import { CARD } from '@/components/kit';
import { shortDay } from '@/components/money/money-bits';
import {
  problem,
  SavingBar,
  savingLine,
  savingStanding,
  SavingTile,
  useTaxOwed,
  type SavingStanding,
} from '@/components/money/saving-bits';
import { SavingDialog } from '@/components/money/saving-dialog';
import { SavingMoveDialog } from '@/components/money/saving-move-dialog';
import { ErrorState, ListSkeleton } from '@/components/states';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useDeleteMoneySavingMove, useMoneySaving, useMoneySavings, useMoneySummary } from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

/** A saving in the grid: what it is, what it holds, how far along. Choosing it opens it beside the grid. */
function SavingCard({
  saving,
  standing,
  today,
  chosen,
  onChoose,
}: {
  saving: MoneySaving;
  standing: SavingStanding;
  today: string;
  chosen: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={onChoose}
      className={cn(
        'flex min-h-[164px] min-w-0 flex-col gap-2.5 rounded-[20px] bg-card text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
        // A pixel less padding under the thicker border, so nothing inside moves.
        chosen ? 'border-2 border-foreground p-[13px]' : 'border border-border/60 p-3.5 hover:border-border',
      )}
    >
      <SavingTile icon={saving.icon} met={standing.met} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold leading-5">{saving.name}</span>
        <span className="truncate text-xl font-bold leading-[26px] tracking-tight tabular-nums">
          {formatMoney(saving.balanceMinor)}
        </span>
      </span>
      <span className="flex-1" />
      {standing.progress !== null && <SavingBar progress={standing.progress} met={standing.met} />}
      <span
        className={cn(
          'truncate text-xs leading-4',
          standing.covers ? 'font-semibold text-success' : 'text-muted-foreground',
        )}
      >
        {savingLine(saving, standing, today)}
      </span>
    </button>
  );
}

/**
 * The chosen saving: what it holds against what it is for, what that asks of
 * each month, and everything that went in and out.
 *
 * Adding is the filled button, because that is what a saving is for; taking
 * out sits beside it, quieter.
 */
function SavingPanel({
  saving,
  standing,
  today,
  onEdit,
  onMove,
}: {
  saving: MoneySaving;
  standing: SavingStanding;
  today: string;
  onEdit: () => void;
  onMove: (direction: 'in' | 'out') => void;
}) {
  const { moves, isLoading, loadFailed, refetch } = useMoneySaving(saving.id);
  const removeMove = useDeleteMoneySavingMove();
  // The line being asked about outlives the question, so it doesn't change
  // under the closing animation.
  const [removing, setRemoving] = useState<MoneySavingMove | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  const pace = savingMonthlyPace(saving, today);
  const about =
    standing.left === null && !standing.covers
      ? 'A running total. Add a goal in Edit to see how far there is to go.'
      : [savingLine(saving, standing, today), pace !== null ? `about ${formatMoney(pace)} a month` : null]
          .filter(Boolean)
          .join(' · ');

  const remove = () => {
    if (!removing) return;
    removeMove.mutate(
      { id: saving.id, moveId: removing.id },
      {
        onSuccess: () => setRemoveOpen(false),
        onError: (error) => toast.error("Couldn't remove it", { description: problem(error) }),
      },
    );
  };

  return (
    <aside
      aria-label={saving.name}
      className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 rounded-[20px] border border-border/60 bg-card p-5"
    >
      <div className="flex items-center gap-3">
        <SavingTile icon={saving.icon} met={standing.met} />
        <h2 className="min-w-0 flex-1 truncate text-base font-bold">{saving.name}</h2>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Edit
        </button>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[28px] font-bold leading-9 tracking-tight tabular-nums">
          {formatMoney(saving.balanceMinor)}
        </span>
        {saving.goalMinor ? (
          <span className="text-sm tabular-nums text-muted-foreground">of {formatMoney(saving.goalMinor)}</span>
        ) : null}
      </div>
      {standing.progress !== null && <SavingBar progress={standing.progress} met={standing.met} tall />}
      <p className={cn('text-[13px]', standing.covers ? 'font-semibold text-success' : 'text-muted-foreground')}>
        {about}
      </p>
      <div className="flex gap-2">
        {/* This panel's own action: the one filled button on Savings besides the bar's. */}
        <Button className="h-10 flex-1 rounded-[10px] font-semibold" onClick={() => onMove('in')}>
          <Plus className="size-4" />
          Add money
        </Button>
        <Button
          variant="secondary"
          className="h-10 flex-1 rounded-[10px] font-semibold"
          disabled={saving.balanceMinor <= 0}
          onClick={() => onMove('out')}
        >
          Take out
        </Button>
      </div>

      <div className="flex flex-col pt-1">
        <h3 className="pb-1 text-[13px] font-semibold text-muted-foreground">History</h3>
        {isLoading ? (
          <div className="flex flex-col gap-2 py-2">
            <Skeleton className="h-9 rounded-lg" />
            <Skeleton className="h-9 rounded-lg" />
          </div>
        ) : loadFailed && moves.length === 0 ? (
          <ErrorState message="Could not load what went in and out." onRetry={() => void refetch()} />
        ) : moves.length === 0 ? (
          <p className="py-2 text-[13px] leading-[19px] text-muted-foreground">
            Nothing yet. When you put money aside for this, add it here so the total stays true.
          </p>
        ) : (
          <>
            <ul>
              {moves.map((move) => {
                const added = move.amountMinor > 0;
                return (
                  <li key={move.id} className="border-t border-border/40 first:border-t-0">
                    {/* The phone removes a line on a long press; a click asks the same question here. */}
                    <button
                      type="button"
                      onClick={() => {
                        setRemoving(move);
                        setRemoveOpen(true);
                      }}
                      className="flex min-h-[52px] w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm font-semibold">{added ? 'Added' : 'Taken out'}</span>
                        <span className="truncate text-[13px] text-muted-foreground">
                          {shortDay(move.movedOn, today)}
                          {move.note ? ` · ${move.note}` : ''}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-sm font-semibold tabular-nums',
                          added ? 'text-success' : 'text-secondary-foreground',
                        )}
                      >
                        {added ? '+' : '−'}
                        {formatMoney(Math.abs(move.amountMinor))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="pt-2 text-xs text-muted-foreground">Click a line to remove it.</p>
          </>
        )}
      </div>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this line?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing
                ? `${removing.amountMinor > 0 ? 'Added' : 'Taken out'} ${formatMoney(Math.abs(removing.amountMinor))} on ${shortDay(removing.movedOn, today)}. Removing it changes what this saving holds.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              disabled={removeMove.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {removeMove.isPending ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

/**
 * Savings: everything being put aside, and what is left that is not. The
 * phone's page (mobile/components/money/SavingsPage.tsx) with the saving it
 * opens on a screen of its own shown beside the grid instead.
 *
 * As many as the person wants. The total leads; beside it, what went in this
 * month and what of the month's money has no job yet. Virgo holds none of it,
 * which is said once, under the grid, in plain words.
 */
export function SavingsTab({
  month,
  today,
  chosenId,
  onChoose,
  onRecordExpense,
}: {
  /** The month Money is on, YYYY-MM: what "this month" means here. */
  month: string;
  today: string;
  /** The saving asked for in the address; the first one is shown without it. */
  chosenId: string | null;
  onChoose: (id: string | null) => void;
  /** Opens a new expense, for money that came out of a saving and was spent. */
  onRecordExpense: () => void;
}) {
  const range = monthRange(month);
  const { savings, totalMinor, monthMinor, isLoading, loadFailed, refetch } = useMoneySavings(month);
  const summary = useMoneySummary(range.from, range.to);
  const taxOwedMinor = useTaxOwed(savings, today);

  // What each dialog holds outlives its closing, so it doesn't change under
  // the closing animation.
  const [form, setForm] = useState<{ saving?: MoneySaving }>({});
  const [formOpen, setFormOpen] = useState(false);
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [moveOpen, setMoveOpen] = useState(false);
  const [taken, setTaken] = useState<{ amountMinor: number; name: string } | null>(null);
  const [takenOpen, setTakenOpen] = useState(false);

  const openForm = (saving?: MoneySaving) => {
    setForm({ saving });
    setFormOpen(true);
  };

  const chosen = savings.find((saving) => saving.id === chosenId) ?? savings[0];
  const thisMonth = month === monthOf(today);
  const s = summary.summary;
  // In less out for the month, less what of it was set aside; unknown until the month's totals are in.
  const free = s ? s.incomeMinor - s.expenseMinor - monthMinor : null;

  if (isLoading && savings.length === 0) return <ListSkeleton rows={3} />;
  if (loadFailed && savings.length === 0) {
    return <ErrorState message="Could not load your savings." onRetry={() => void refetch()} />;
  }

  const note = (
    <p className="text-[13px] leading-[18px] text-muted-foreground">
      Virgo doesn’t hold your money. These are your own notes of what you’ve put aside, wherever you keep it.
    </p>
  );

  return (
    <>
      {savings.length === 0 ? (
        // Nothing yet: what it is for, and the one thing to do about it.
        <div className="flex max-w-xl flex-col gap-5">
          <div className={cn(CARD, 'flex flex-col items-start p-5')}>
            <h2 className="text-2xl font-bold leading-[30px] tracking-tight">Put some aside</h2>
            <p className="mt-2 text-[15px] leading-[22px] text-muted-foreground">
              For the next lens, the tax bill, the slow months. Make as many as you like, and move a share into them
              whenever a client pays.
            </p>
            <Button
              variant="secondary"
              className="mt-5 h-10 rounded-[10px] pl-3 pr-4 font-semibold"
              onClick={() => openForm()}
            >
              <Plus className="size-4" />
              New saving
            </Button>
          </div>
          {note}
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-7">
          <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-5">
            <div className={cn(CARD, 'flex flex-wrap items-center gap-x-10 gap-y-4 px-5 py-4')}>
              <div className="flex flex-[1_1_200px] flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-muted-foreground">Set aside</span>
                <span className="text-[28px] font-bold leading-9 tracking-tight tabular-nums">
                  {formatMoney(totalMinor)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">
                  {thisMonth ? 'Added this month' : `Added in ${monthLabel(month, today)}`}
                </span>
                <span className={cn('text-[15px] font-semibold tabular-nums', monthMinor > 0 && 'text-success')}>
                  {monthMinor > 0 ? '+' : ''}
                  {formatMoney(monthMinor)}
                </span>
              </div>
              {free !== null && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Kept, not set aside</span>
                  <span className="text-[15px] font-semibold tabular-nums">{formatMoney(Math.max(free, 0))}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
              {savings.map((saving) => (
                <SavingCard
                  key={saving.id}
                  saving={saving}
                  standing={savingStanding(saving, taxOwedMinor)}
                  today={today}
                  chosen={saving.id === chosen?.id}
                  onChoose={() => onChoose(saving.id)}
                />
              ))}
              <button
                type="button"
                onClick={() => openForm()}
                className="flex min-h-[164px] flex-col items-center justify-center gap-2 rounded-[20px] border-[1.5px] border-dashed border-border text-[15px] font-semibold text-secondary-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Plus className="size-[22px]" aria-hidden />
                New saving
              </button>
            </div>

            {note}
          </div>

          {chosen && (
            <SavingPanel
              // Keyed, so a question about one saving's line is not left open over another's.
              key={chosen.id}
              saving={chosen}
              standing={savingStanding(chosen, taxOwedMinor)}
              today={today}
              onEdit={() => openForm(chosen)}
              onMove={(next) => {
                setDirection(next);
                setMoveOpen(true);
              }}
            />
          )}
        </div>
      )}

      <SavingDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        saving={form.saving}
        onCreated={(made) => onChoose(made.id)}
        // The address stops naming a saving that is gone; the first one shows.
        onDeleted={() => onChoose(null)}
      />
      {chosen && (
        <SavingMoveDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          saving={chosen}
          direction={direction}
          onMoved={(moved, amountMinor) => {
            if (moved !== 'out') return;
            // Money that left a saving was spent on something, and an expense is
            // what keeps the month's totals true. Offered, never done for them.
            setTaken({ amountMinor, name: chosen.name });
            setTakenOpen(true);
          }}
        />
      )}
      <AlertDialog open={takenOpen} onOpenChange={setTakenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Record it as an expense too?</AlertDialogTitle>
            <AlertDialogDescription>
              {taken
                ? `${formatMoney(taken.amountMinor)} came out of ${taken.name}. If you spent it on work, record the expense so your totals stay right.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction onClick={onRecordExpense}>Record expense</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
