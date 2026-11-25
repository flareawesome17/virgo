'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useOptimistic, useState, useTransition } from 'react';
import { ChevronDown, Download, Layers, Loader2, Plus, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  monthLabel,
  monthOf,
  monthRange,
  todayIso,
  type MoneyEntry,
  type MoneyKind,
  type MoneySuggestion,
} from '@/api';
import { PageHeader, Screen } from '@/components/app-shell';
import { Kbd } from '@/components/kit';
import { ActivityTab, type MoneyFilter } from '@/components/money/activity-tab';
import { DesktopActivity } from '@/components/money/desktop-activity';
import { netOf } from '@/components/money/money-bits';
import { MoneyEntryDialog } from '@/components/money/money-entry-dialog';
import { MoneyTabs, type MoneyTab } from '@/components/money/money-tabs';
import { OwedTab } from '@/components/money/owed-tab';
import { PackageDialog } from '@/components/money/package-dialog';
import { PayQrDialog } from '@/components/money/pay-qr-dialog';
import { SavingsTab } from '@/components/money/savings-tab';
import { SetAsideDialog, type SetAsideOffer } from '@/components/money/set-aside-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMoneyExport, useMoneyPayMethods, useMoneySavings, useUpdateMoneyEntry } from '@/hooks/useMoney';
import { IS_DESKTOP } from '@/lib/desktop';
import { cn } from '@/lib/utils';

/** The pages that live on this route. Insights is the fourth tab, on a route of its own. */
type HereTab = Exclude<MoneyTab, 'insights'>;
const HERE: Record<string, HereTab> = { activity: 'activity', owed: 'owed', savings: 'savings' };
const TAB_NAMES: Record<HereTab, string> = { activity: 'Activity', owed: 'Owed', savings: 'Savings' };

type DialogState = { kind?: MoneyKind; entry?: MoneyEntry; suggestion?: MoneySuggestion };

/**
 * Suspense is required, not decorative: useSearchParams (for ?tab= and
 * ?saving=) opts the tree into client rendering, and Next fails the build
 * without a boundary.
 */
export default function MoneyPage() {
  return (
    <Suspense fallback={null}>
      <Money />
    </Suspense>
  );
}

/**
 * Money: one person's own ledger, in four pages, as on the phone
 * (mobile/app/(app)/money/index.tsx) and laid out for a wider window.
 *
 * Activity is the month: what moved, by day, beside what was kept. Owed is
 * what has not been paid yet, whatever the month. Savings is what has been
 * put aside. Insights is the year, on its own route. This page holds what
 * they share: the bar's buttons, the month, and the dialogs they open.
 *
 * The desktop app puts the tabs in its bar and lays Activity out as a ledger
 * (components/money/desktop-activity.tsx); everything else here is shared.
 */
function Money() {
  const router = useRouter();
  const params = useSearchParams();
  const today = todayIso();
  const [month, setMonth] = useState(() => monthOf(today));
  const [filter, setFilter] = useState<MoneyFilter>('all');
  // What the dialog holds outlives its closing, so it doesn't change under
  // the closing animation.
  const [dialog, setDialog] = useState<DialogState>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const openDialog = (next: DialogState) => {
    setDialog(next);
    setDialogOpen(true);
  };
  const [packageOpen, setPackageOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [offer, setOffer] = useState<SetAsideOffer | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);

  const { payMethods } = useMoneyPayMethods();
  const saved = useMoneySavings(month);
  const update = useUpdateMoneyEntry();
  const exporter = useMoneyExport();

  /*
   * The tab and the chosen saving live in the URL, so each can be linked to
   * and Back does not walk through every click. Shown at once and written
   * with replace: the address catches up a moment after the page does.
   */
  const requested = params.get('tab') ?? '';
  // hasOwn, so ?tab=constructor is not handed a function off the prototype.
  const urlTab: HereTab = Object.hasOwn(HERE, requested) ? HERE[requested] : 'activity';
  const [tab, showTab] = useOptimistic(urlTab);
  const [savingId, showSaving] = useOptimistic(params.get('saving'));
  const [, startTransition] = useTransition();

  const setTab = (next: MoneyTab) => {
    if (next === 'insights') {
      // On the year and month this page is on, as its button here used to.
      router.push(`/money/insights?year=${month.slice(0, 4)}&month=${month}`);
      return;
    }
    startTransition(() => {
      showTab(next);
      router.replace(next === 'activity' ? '/money' : `/money?tab=${next}`, { scroll: false });
    });
  };
  const chooseSaving = (id: string | null) =>
    startTransition(() => {
      showSaving(id);
      router.replace(id ? `/money?tab=savings&saving=${encodeURIComponent(id)}` : '/money?tab=savings', {
        scroll: false,
      });
    });
  // From Activity's side column in the desktop app: the tab and the saving in one step.
  const openSaving = (id: string) =>
    startTransition(() => {
      showTab('savings');
      showSaving(id);
      router.replace(`/money?tab=savings&saving=${encodeURIComponent(id)}`, { scroll: false });
    });

  // The form inside has the Income and Expense switch; it opens on income
  // unless expenses are what is showing.
  const addEntry = () => openDialog({ kind: tab === 'activity' && filter === 'expense' ? 'expense' : 'income' });

  const range = monthRange(month);
  const year = month.slice(0, 4);

  const markPaid = (entry: MoneyEntry) =>
    update.mutate(
      { id: entry.id, paidOn: todayIso() },
      {
        onSuccess: () => {
          // Money that has just arrived is the moment to put some aside, when
          // there is a saving to put it in. With none the question is dropped.
          if (entry.kind === 'income' && saved.savings.length > 0) {
            setOffer({ amountMinor: netOf(entry), from: entry.counterparty ?? null });
            setOfferOpen(true);
          }
        },
        onError: (error) =>
          toast.error("Couldn't mark it paid", {
            description: error instanceof ApiError && error.status !== 0 ? error.message : 'Please try again.',
          }),
      },
    );

  const exportRange = (from: string, to: string) =>
    exporter.mutate(
      { from, to },
      {
        // A link to the file, which the browser saves rather than opens:
        // the server sends it as an attachment.
        onSuccess: (url) => window.location.assign(url),
        onError: (error) =>
          toast.error("Couldn't export", {
            description:
              error instanceof ApiError && error.status !== 0 ? error.message : 'Check your connection and try again.',
          }),
      },
    );

  return (
    <Screen title="Money">
      <PageHeader
        title="Money"
        // The desktop app's bar is one line: the tabs go where the description would.
        description={IS_DESKTOP ? undefined : 'Only you can see this'}
        beside={IS_DESKTOP ? <MoneyTabs dense value={tab} onChange={setTab} /> : undefined}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant={IS_DESKTOP ? 'secondary' : 'outline'} size="sm" disabled={exporter.isPending}>
                  {exporter.isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  Export
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  A CSV for Excel, Google Sheets or your accountant
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => exportRange(range.from, range.to)}>
                  {monthLabel(month, today)}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportRange(`${year}-01-01`, `${year}-12-31`)}>
                  All of {year}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Show QR, for a client at the desk; with no way to pay saved yet, the place to add one. */}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => (payMethods.length === 0 ? router.push('/money/pay-methods') : setQrOpen(true))}
            >
              <QrCode className="size-4" />
              Show QR
            </Button>
            {/* Not in the desktop app's bar: a package starts from Owed, or from the shell's Create. */}
            {!IS_DESKTOP && (
              <Button size="sm" variant="secondary" onClick={() => setPackageOpen(true)}>
                <Layers className="size-4" />
                Package
              </Button>
            )}
            {/* The page's one filled button. */}
            <Button size="sm" aria-keyshortcuts={IS_DESKTOP ? 'N' : undefined} onClick={addEntry}>
              <Plus className="size-4" />
              Add entry
              {IS_DESKTOP && <Kbd className="ml-0.5 bg-transparent px-0 text-current opacity-80">N</Kbd>}
            </Button>
          </>
        }
      />

      {IS_DESKTOP && tab === 'activity' ? (
        <DesktopActivity
          month={month}
          today={today}
          filter={filter}
          exporting={exporter.isPending}
          onMonth={setMonth}
          onFilter={setFilter}
          onOpenOwed={() => setTab('owed')}
          onOpenEntry={(entry) => openDialog({ entry })}
          onRecord={(suggestion) => openDialog({ suggestion })}
          onAdd={(kind) => openDialog({ kind })}
          onPaid={markPaid}
          onOpenSaving={openSaving}
          onExport={() => exportRange(range.from, range.to)}
        />
      ) : (
        <div
          className={cn(
            'mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-12 sm:px-6',
            // The desktop app's tabs are in its bar, so the page starts a little lower.
            IS_DESKTOP ? 'pt-5' : 'pt-3',
          )}
        >
          {!IS_DESKTOP && <MoneyTabs value={tab} onChange={setTab} />}

          <div role="tabpanel" aria-label={TAB_NAMES[tab]}>
            {tab === 'activity' ? (
              <ActivityTab
                month={month}
                today={today}
                filter={filter}
                onMonth={setMonth}
                onFilter={setFilter}
                onOpenOwed={() => setTab('owed')}
                onOpenEntry={(entry) => openDialog({ entry })}
                onRecord={(suggestion) => openDialog({ suggestion })}
                onAdd={(kind) => openDialog({ kind })}
              />
            ) : tab === 'owed' ? (
              <OwedTab
                today={today}
                onOpenEntry={(entry) => openDialog({ entry })}
                onPaid={markPaid}
                onNewPackage={() => setPackageOpen(true)}
              />
            ) : (
              <SavingsTab
                month={month}
                today={today}
                chosenId={savingId}
                onChoose={chooseSaving}
                onRecordExpense={() => openDialog({ kind: 'expense' })}
              />
            )}
          </div>
        </div>
      )}

      <MoneyEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        kind={dialog.kind}
        entry={dialog.entry}
        suggestion={dialog.suggestion}
      />
      <PackageDialog
        open={packageOpen}
        onOpenChange={setPackageOpen}
        onCreated={(pkg) => router.push(`/money/packages/${pkg.id}`)}
      />
      <PayQrDialog open={qrOpen} onOpenChange={setQrOpen} payMethods={payMethods} />
      {offer && <SetAsideDialog open={offerOpen} onOpenChange={setOfferOpen} offer={offer} savings={saved.savings} />}
    </Screen>
  );
}
