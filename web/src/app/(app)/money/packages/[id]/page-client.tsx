'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Copy, Link2, Paperclip, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  dayLabel,
  formatMoney,
  isOverdue,
  methodLabel,
  payMethodName,
  todayIso,
  type MoneyEntry,
} from '@/api';
import { PageHeader, Screen } from '@/components/app-shell';
import { CenteredSpinner, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
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
import { MoneyEntryDialog } from '@/components/money/money-entry-dialog';
import { PackageDialog } from '@/components/money/package-dialog';
import {
  useDeleteMoneyPackage,
  useMoneyPackage,
  useMoneyPayMethods,
  useShareMoneyPackage,
  useUnshareMoneyPackage,
  useUpdateMoneyEntry,
} from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

function message(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.status !== 0 ? error.message : fallback;
}

function PaymentRow({ entry, today, onOpen, onMarkPaid }: { entry: MoneyEntry; today: string; onOpen: () => void; onMarkPaid?: () => void }) {
  const overdue = isOverdue(entry, today);
  return (
    <li className="flex items-center gap-3 border-b px-4 last:border-b-0">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left hover:opacity-80">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            {entry.paidOn ? `Received ${dayLabel(entry.paidOn, today)}` : `${overdue ? 'Overdue — was due' : 'Due'} ${dayLabel(entry.occurredOn, today)}`}
            {entry.receipt && <Paperclip className="size-3 text-muted-foreground" aria-label="Has a receipt" />}
          </span>
          <span className={cn('block truncate text-xs', overdue ? 'text-destructive' : 'text-muted-foreground')}>
            {[methodLabel(entry.method), entry.reference, entry.note].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className={cn('text-sm font-bold tabular-nums', entry.paidOn && 'text-success')}>
          {formatMoney(entry.amountMinor)}
        </span>
      </button>
      {onMarkPaid && (
        <Button size="sm" variant="secondary" className="h-7 px-2.5 text-xs" onClick={onMarkPaid}>
          Got it
        </Button>
      )}
    </li>
  );
}

/** One package — the phone's screen (mobile/app/(app)/money/packages/[id].tsx). */
export default function PackagePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const today = todayIso();
  const { pkg, entries, isLoading, loadFailed, refetch } = useMoneyPackage(id);
  const { payMethods } = useMoneyPayMethods();
  const share = useShareMoneyPackage();
  const unshare = useUnshareMoneyPackage();
  const remove = useDeleteMoneyPackage();
  const update = useUpdateMoneyEntry();
  const [editingPackage, setEditingPackage] = useState(false);
  const [entryDialog, setEntryDialog] = useState<{ entry?: MoneyEntry }>({});
  const [entryOpen, setEntryOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!pkg) {
    return (
      <Screen title="Package">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {isLoading ? (
            <CenteredSpinner />
          ) : (
            <ErrorState
              message={loadFailed ? 'Could not load this package.' : 'This package was deleted.'}
              onRetry={loadFailed ? () => void refetch() : undefined}
            />
          )}
        </div>
      </Screen>
    );
  }

  const progress = pkg.totalMinor > 0 ? Math.min(100, (pkg.receivedMinor / pkg.totalMinor) * 100) : 0;

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Statement link copied', { description: 'Paste it to your client — in Messenger, Viber or a text.' });
    } catch {
      toast.message('Statement link', { description: url });
    }
  };

  const shareStatement = () =>
    share.mutate(pkg.id, {
      onSuccess: ({ url }) => void copy(url),
      onError: (error) => toast.error("Couldn't share it", { description: message(error, 'Please try again.') }),
    });

  const openEntry = (entry?: MoneyEntry) => {
    setEntryDialog({ entry });
    setEntryOpen(true);
  };

  const markPaid = (entry: MoneyEntry) =>
    update.mutate(
      { id: entry.id, paidOn: todayIso() },
      { onError: (error) => toast.error("Couldn't mark it paid", { description: message(error, 'Please try again.') }) },
    );

  return (
    <Screen title={pkg.title}>
      <PageHeader
        title={pkg.title}
        description={[pkg.clientName, pkg.eventDate ? dayLabel(pkg.eventDate, today) : null].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setEditingPackage(true)}>
              <Pencil className="size-4" />
              Edit
            </Button>
            <Button size="sm" variant="secondary" disabled={share.isPending} onClick={shareStatement}>
              <Link2 className="size-4" />
              {pkg.shareUrl ? 'Copy statement link' : 'Share statement'}
            </Button>
            <Button size="sm" onClick={() => openEntry()}>
              <Plus className="size-4" />
              Record payment
            </Button>
          </>
        }
      />
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/money">
            <ArrowLeft className="size-4" />
            Money
          </Link>
        </Button>

        <Card>
          <CardContent className="py-5">
            {pkg.paidInFull ? (
              <p className="text-2xl font-bold text-success">Paid in full</p>
            ) : (
              <p className="text-3xl font-bold tracking-tight tabular-nums">
                {formatMoney(pkg.balanceMinor)} <span className="text-base font-semibold text-muted-foreground">left</span>
              </p>
            )}
            <Progress value={progress} className="mt-3 h-2" />
            <p className="mt-2 text-sm text-muted-foreground tabular-nums">
              {formatMoney(pkg.receivedMinor)} paid of {formatMoney(pkg.totalMinor)}
            </p>
            {!pkg.paidInFull && pkg.nextDueOn && (
              <p className={cn('mt-3 text-sm font-semibold', pkg.overdue && 'text-destructive')}>
                {pkg.overdue ? 'A payment is overdue — it was due' : 'Next payment due'} {dayLabel(pkg.nextDueOn, today)}
              </p>
            )}
          </CardContent>
        </Card>

        {pkg.shareUrl && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1">Shared — anyone with the link can see this statement.</span>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void copy(pkg.shareUrl as string)}>
              <Copy className="size-3.5" />
              Copy link
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              disabled={unshare.isPending}
              onClick={() =>
                unshare.mutate(pkg.id, {
                  onSuccess: () => toast.success('Sharing stopped', { description: 'The old link no longer works.' }),
                  onError: (error) => toast.error("Couldn't stop sharing", { description: message(error, 'Please try again.') }),
                })
              }
            >
              Stop sharing
            </Button>
          </div>
        )}

        <h3 className="mb-2 mt-6 px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Payments</h3>
        <Card className="py-0">
          <ul>
            {entries.map((entry) => (
              <PaymentRow
                key={entry.id}
                entry={entry}
                today={today}
                onOpen={() => openEntry(entry)}
                onMarkPaid={entry.paidOn === null ? () => markPaid(entry) : undefined}
              />
            ))}
            {pkg.unscheduledMinor > 0 && !pkg.paidInFull && (
              <li className="px-4">
                <button type="button" onClick={() => openEntry()} className="flex w-full items-center justify-between gap-3 py-3 text-left hover:opacity-80">
                  <span>
                    <span className="block text-sm font-semibold">{formatMoney(pkg.unscheduledMinor)} not scheduled yet</span>
                    <span className="block text-xs text-muted-foreground">Add it as a payment, with when it is due</span>
                  </span>
                  <Plus className="size-4 text-muted-foreground" />
                </button>
              </li>
            )}
            {entries.length === 0 && pkg.unscheduledMinor === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">No payments yet.</li>
            )}
          </ul>
        </Card>

        <Link href="/money/pay-methods" className="mt-5 block">
          <Card className="transition-colors hover:border-primary/40">
            <CardContent className="flex items-center gap-3 py-4">
              <Wallet className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">How clients pay you</p>
                <p className="truncate text-xs text-muted-foreground">
                  {payMethods.length > 0 ? payMethods.map(payMethodName).join(' · ') : 'Add GCash, Maya or bank details for your statements'}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        {pkg.note && <p className="mt-5 px-1 text-sm text-muted-foreground">{pkg.note}</p>}

        <Button variant="ghost" className="mt-6 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="size-4" />
          Delete package
        </Button>
      </div>

      <PackageDialog open={editingPackage} onOpenChange={setEditingPackage} pkg={pkg} />
      <MoneyEntryDialog open={entryOpen} onOpenChange={setEntryOpen} entry={entryDialog.entry} pkg={entryDialog.entry ? undefined : pkg} />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this package?</AlertDialogTitle>
            <AlertDialogDescription>
              Payments still due are deleted with it. Payments you have received stay in your Money.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate(pkg.id, {
                  onSuccess: () => {
                    toast.success('Package deleted');
                    router.push('/money');
                  },
                  onError: (error) => toast.error("Couldn't delete it", { description: message(error, 'Please try again.') }),
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
