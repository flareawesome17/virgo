'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Paperclip, Search } from 'lucide-react';
import {
  categoryLabel,
  formatMoney,
  methodLabel,
  monthLabel,
  monthOf,
  shiftMonth,
  type MoneyEntry,
  type MoneyKind,
  type MoneySuggestion,
} from '@/api';
import { FilterChip, HintBar, Panel, Pill } from '@/components/kit';
import {
  EmptyMonth,
  MONEY_FILTERS,
  TOTALS_NOTE,
  useMonthActivity,
  withheldLine,
  type MoneyFilter,
} from '@/components/money/activity-tab';
import {
  DARK_BUTTON,
  DENSE_BUTTON,
  dueLine,
  LateNotice,
  monthAndYear,
  nameOf,
  netOf,
  shortDay,
  signed,
  SuggestionRow,
} from '@/components/money/money-bits';
import { SavingBar, savingStanding, useTaxOwed } from '@/components/money/saving-bits';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { IS_DESKTOP, IS_WINDOWS } from '@/lib/desktop';
import { cn } from '@/lib/utils';

/** The ledger's five columns, shared by its head and every row so they line up. */
const COLUMNS = 'grid grid-cols-[76px_minmax(140px,2fr)_minmax(160px,3fr)_110px_100px] items-center gap-3 px-3';

/** How many the side column lists before it sends you to the page that has them all. */
const OWED_SHOWN = 3;
const SAVINGS_SHOWN = 4;

/** What works on this page, along its foot. The handler takes Ctrl and ⌘ alike. */
const HINTS: Array<[keys: string, does: string]> = [
  ['N', 'Add entry'],
  ['↑ ↓', 'Move'],
  ['Enter', 'Open the entry'],
  [IS_WINDOWS ? 'Ctrl E' : '⌘E', 'Export this month'],
];

/** Anything open over the page that the keys belong to instead. */
const OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/** Whether a key press landed somewhere that takes typing. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || !!el.closest?.('input, textarea, select, [role="textbox"]'));
}

/** What "Find an entry" reads: who, what (the note and the category) and the reference. */
function searchText(entry: MoneyEntry): string {
  return [entry.counterparty, entry.note, categoryLabel(entry.kind, entry.category), entry.reference]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

/** One line of the ledger. A click chooses it; a double click, or Enter, opens it. */
function LedgerRow({
  entry,
  today,
  index,
  chosen,
  tabbable,
  onChoose,
  onOpen,
}: {
  entry: MoneyEntry;
  today: string;
  index: number;
  chosen: boolean;
  /** The one row Tab stops on: the chosen one, or the first while none is. */
  tabbable: boolean;
  onChoose: () => void;
  onOpen: () => void;
}) {
  const paidOn = entry.paidOn;
  const cancelled = !!entry.booking?.cancelled;
  const due = paidOn === null ? dueLine(entry.occurredOn, today) : null;
  // Their own note first; the category only when the name beside it is not already it.
  const noted =
    entry.note?.trim().split('\n')[0] || (entry.counterparty ? categoryLabel(entry.kind, entry.category) : '');
  const repeats = (entry.recurringId ?? null) !== null;
  const what = repeats ? (noted ? `${noted}, every month` : 'Every month') : noted;
  const how =
    paidOn === null
      ? 'Not paid yet'
      : [methodLabel(entry.method), entry.reference?.trim()].filter(Boolean).join(' · ');
  return (
    <div
      role="row"
      data-row={index}
      aria-selected={chosen}
      tabIndex={tabbable ? 0 : -1}
      onClick={onChoose}
      // Tabbed to or clicked, the row with the focus is the chosen one, so Enter never opens another.
      onFocus={onChoose}
      onDoubleClick={onOpen}
      className={cn(
        COLUMNS,
        // The margin keeps a row scrolled to the top clear of the pinned head.
        'h-10 scroll-mt-8 cursor-default select-none rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
        chosen ? 'bg-muted' : 'hover:bg-muted/50',
      )}
    >
      <span role="gridcell" className="truncate tabular-nums text-muted-foreground">
        {/* No year: the month above names it, and the column has no room. */}
        {paidOn === null ? `Due ${Number(entry.occurredOn.slice(8, 10))}` : shortDay(paidOn, paidOn)}
      </span>
      <span role="gridcell" className="truncate font-semibold">
        {nameOf(entry)}
      </span>
      <span role="gridcell" className="flex min-w-0 items-center gap-1.5 text-secondary-foreground">
        <span className="truncate">{what}</span>
        {entry.receipt && (
          <Paperclip className="size-[13px] shrink-0 text-muted-foreground" aria-label="Has a receipt" />
        )}
        {cancelled ? (
          <Pill tone="late">Booking cancelled</Pill>
        ) : due ? (
          // "Due" is already in the first column: "4 days late", "in 6 days", "today".
          <Pill tone={due.late ? 'late' : 'neutral'}>{due.text.replace(/^Due /, '')}</Pill>
        ) : null}
      </span>
      <span role="gridcell" className="truncate text-muted-foreground">
        {how}
      </span>
      {/* Never cut short: a long amount runs into the row's own padding instead. */}
      <span
        role="gridcell"
        className={cn(
          'whitespace-nowrap text-right font-semibold tabular-nums',
          paidOn !== null && entry.kind === 'income' && 'text-success',
        )}
      >
        {paidOn === null ? formatMoney(netOf(entry)) : signed(entry.kind, entry.amountMinor)}
      </span>
    </div>
  );
}

/** Rows shaped like the ledger's, so nothing jumps when the month lands. */
function LedgerSkeleton() {
  return (
    <div aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className={cn(COLUMNS, 'h-10')}>
          <Skeleton className="h-3.5 w-12" />
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="ml-auto h-3.5 w-14" />
        </div>
      ))}
    </div>
  );
}

/** A payment still waiting, in the side column: who, how late or how soon, and the way to say it came. */
function OwedLine({
  entry,
  today,
  onOpen,
  onPaid,
}: {
  entry: MoneyEntry;
  today: string;
  onOpen: () => void;
  onPaid: () => void;
}) {
  const name = nameOf(entry);
  const due = dueLine(entry.occurredOn, today);
  const cancelled = !!entry.booking?.cancelled;
  return (
    <li className="flex min-h-11 items-center gap-2 border-t border-border/40 py-1 pl-3 pr-2 first:border-t-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{name}</span>
          <span
            className={cn(
              'truncate text-xs',
              due.late || cancelled ? 'font-semibold text-destructive' : 'text-muted-foreground',
            )}
          >
            {cancelled ? 'Booking cancelled' : due.text}
          </span>
        </span>
        <span className="shrink-0 font-semibold tabular-nums">{formatMoney(netOf(entry))}</span>
      </button>
      <Button
        variant="secondary"
        className={cn(DENSE_BUTTON, due.late && DARK_BUTTON)}
        aria-label={`Mark ${name} as received`}
        onClick={onPaid}
      >
        Got it
      </Button>
    </li>
  );
}

/**
 * Activity in the desktop app: the month as a ledger.
 *
 * The same month the web's ActivityTab shows, read through the same hook,
 * laid out for a window that stays open beside the work: one 40px line an
 * entry, what is not paid yet first, and a side column with what was kept,
 * who still owes and what has been put aside. The page fills the sheet's
 * height: the ledger scrolls in its own column, the side column stays put
 * and the shortcuts are pinned along the foot. Under about 1000px of sheet
 * the side column drops below the ledger and the two scroll as one.
 *
 * The keys: N adds an entry, the arrows move the chosen row, Enter opens it
 * and Ctrl E exports the month. Each is also a click: the bar's Add entry, a
 * row, a double click on it, and the first line of the bar's Export menu.
 */
export function DesktopActivity({
  month,
  today,
  filter,
  exporting,
  onMonth,
  onFilter,
  onOpenOwed,
  onOpenEntry,
  onRecord,
  onAdd,
  onPaid,
  onOpenSaving,
  onExport,
}: {
  /** YYYY-MM. */
  month: string;
  today: string;
  filter: MoneyFilter;
  /** An export is already on its way. */
  exporting: boolean;
  onMonth: (month: string) => void;
  onFilter: (filter: MoneyFilter) => void;
  onOpenOwed: () => void;
  onOpenEntry: (entry: MoneyEntry) => void;
  onRecord: (suggestion: MoneySuggestion) => void;
  onAdd: (kind: MoneyKind) => void;
  /** "Got it": marks it received and, with a saving to put it in, asks about setting some aside. */
  onPaid: (entry: MoneyEntry) => void;
  onOpenSaving: (id: string) => void;
  /** The month on screen, as the Export menu's first line does it. */
  onExport: () => void;
}) {
  const { list, saved, owed, dismiss, offered, isThisMonth, inMinor, outMinor, keptMinor, withheldMinor } =
    useMonthActivity(month, today, filter);
  const taxOwedMinor = useTaxOwed(saved.savings, today);

  const [query, setQuery] = useState('');
  const [chosenId, setChosenId] = useState<string | null>(null);
  const rowsEl = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    // Not paid yet first, soonest due first; then what was paid, newest first.
    const unpaid = list.entries
      .filter((entry) => entry.paidOn === null)
      .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
    const paid = list.entries
      .filter((entry) => entry.paidOn !== null)
      .sort((a, b) => (b.paidOn ?? '').localeCompare(a.paidOn ?? ''));
    const all = [...unpaid, ...paid];
    // Narrows what is loaded and asks the server for nothing. Every word has to be somewhere in the row.
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return all;
    return all.filter((entry) => {
      const text = searchText(entry);
      return words.every((word) => text.includes(word));
    });
  }, [list.entries, query]);

  // By id, so the choice stays on its entry when the list is narrowed or read again.
  const chosenIndex = rows.findIndex((entry) => entry.id === chosenId);
  const loading = list.isLoading;
  const failed = list.loadFailed && list.entries.length === 0;
  const empty = !loading && !failed && list.entries.length === 0 && offered.length === 0;

  const move = (to: number) => {
    const entry = rows[to];
    if (!entry) return;
    setChosenId(entry.id);
    const row = rowsEl.current?.querySelector<HTMLElement>(`[data-row="${to}"]`);
    // The focus goes with the choice, so Enter opens this row and not a button left focused elsewhere.
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: 'nearest' });
  };

  // An effect event, so the one listener below always sees the rows and the choice as they are now.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || isTyping(event.target)) return;
    if (document.querySelector(OVERLAY)) return;

    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() !== 'e' || event.altKey || event.shiftKey) return;
      event.preventDefault();
      if (!event.repeat && !exporting) onExport();
      return;
    }
    if (event.altKey) return;

    switch (event.key) {
      case 'n':
      case 'N':
        if (event.repeat) return;
        event.preventDefault();
        // As the bar's Add entry: income, unless expenses are what is showing.
        onAdd(filter === 'expense' ? 'expense' : 'income');
        return;
      case 'ArrowDown':
      case 'ArrowUp': {
        if (rows.length === 0) return;
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const last = rows.length - 1;
        move(chosenIndex < 0 ? (step > 0 ? 0 : last) : Math.min(Math.max(chosenIndex + step, 0), last));
        return;
      }
      case 'Enter': {
        const entry = rows[chosenIndex];
        // A focused button, link or tab keeps its own Enter.
        const control = (event.target as HTMLElement | null)?.closest?.(
          'a[href], button, summary, [role="button"], [role="menuitem"], [role="tab"]',
        );
        if (!entry || event.repeat || control) return;
        event.preventDefault();
        onOpenEntry(entry);
        return;
      }
    }
  });

  useEffect(() => {
    if (!IS_DESKTOP) return;
    const handle = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);

  return (
    <div role="tabpanel" aria-label="Activity" className="@container flex h-full min-h-0 flex-col text-[13px]">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto @[1000px]:flex-row @[1000px]:overflow-hidden">
        <div className="flex min-w-0 flex-col px-2 py-2.5 @[1000px]:min-h-0 @[1000px]:flex-1">
          <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-[7px]"
              aria-label="Previous month"
              onClick={() => onMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft className="size-[15px]" />
            </Button>
            <h2 className="text-sm font-bold">{monthAndYear(month)}</h2>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-[7px]"
              aria-label="Next month"
              // Nothing is paid in a month that has not come.
              disabled={isThisMonth}
              onClick={() => onMonth(shiftMonth(month, 1))}
            >
              <ChevronRight className="size-[15px]" />
            </Button>
            {!isThisMonth && (
              <Button variant="link" size="sm" className="font-semibold" onClick={() => onMonth(monthOf(today))}>
                This month
              </Button>
            )}
            <span className="flex-1" />
            <div className="flex items-center gap-1.5" role="group" aria-label="Show">
              {MONEY_FILTERS.map(([key, label]) => (
                <FilterChip key={key} dense on={filter === key} onClick={() => onFilter(key)}>
                  {label}
                </FilterChip>
              ))}
            </div>
            <label className="flex h-[30px] w-[220px] items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
              <Search className="size-[13px] shrink-0 text-muted-foreground" aria-hidden />
              <input
                type="search"
                aria-label="Find an entry"
                placeholder="Find an entry"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>

          <div className="@[1000px]:min-h-0 @[1000px]:flex-1 @[1000px]:overflow-y-auto">
            {(owed.late.length > 0 || (!loading && !failed && offered.length > 0)) && (
              <div className="flex flex-col gap-2 px-1 pb-2">
                <LateNotice dense owed={owed} today={today} onOpenOwed={onOpenOwed} />
                {/* Agreed bookings not recorded yet: each is a click from right. */}
                {!loading && !failed && offered.length > 0 && (
                  <section className="flex flex-col gap-1">
                    <h2 className="px-2 text-xs font-semibold text-muted-foreground">From your bookings</h2>
                    <ul className="overflow-hidden rounded-[10px] border border-border/60 bg-card">
                      {offered.map((suggestion) => (
                        <SuggestionRow
                          key={suggestion.bookingId}
                          dense
                          suggestion={suggestion}
                          onRecord={() => onRecord(suggestion)}
                          onDismiss={() => dismiss.mutate(suggestion.bookingId)}
                        />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {loading ? (
              <LedgerSkeleton />
            ) : failed ? (
              <div className="px-1">
                <ErrorState message="Could not load your money entries." onRetry={() => void list.refetch()} />
              </div>
            ) : empty ? (
              <div className="px-1">
                <EmptyMonth month={month} today={today} onAdd={onAdd} />
              </div>
            ) : list.entries.length === 0 ? null : rows.length === 0 ? (
              <p className="px-3 py-3 text-muted-foreground">Nothing matches “{query.trim()}”.</p>
            ) : (
              <div role="grid" aria-label={`Entries in ${monthAndYear(month)}`}>
                <div
                  role="row"
                  className={cn(
                    COLUMNS,
                    'sticky top-0 z-10 min-h-[30px] border-b border-border/40 bg-background text-xs font-semibold text-muted-foreground',
                  )}
                >
                  <span role="columnheader">Date</span>
                  <span role="columnheader">Who</span>
                  <span role="columnheader">What</span>
                  <span role="columnheader">How</span>
                  <span role="columnheader" className="text-right">
                    Amount
                  </span>
                </div>
                <div role="rowgroup" ref={rowsEl} className="pt-0.5">
                  {rows.map((entry, index) => (
                    <LedgerRow
                      key={entry.id}
                      entry={entry}
                      today={today}
                      index={index}
                      chosen={index === chosenIndex}
                      tabbable={index === Math.max(chosenIndex, 0)}
                      onChoose={() => setChosenId(entry.id)}
                      onOpen={() => onOpenEntry(entry)}
                    />
                  ))}
                </div>
              </div>
            )}

            <p className="px-3 pb-1 pt-3 text-xs leading-[17px] text-muted-foreground">{TOTALS_NOTE}</p>
          </div>
        </div>

        <aside
          aria-label="The month, what is owed and savings"
          className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(240px,1fr))] items-start gap-3 border-t border-border p-3 @[1000px]:flex @[1000px]:w-[280px] @[1000px]:flex-col @[1000px]:items-stretch @[1000px]:overflow-y-auto @[1000px]:border-l @[1000px]:border-t-0"
        >
          {/* The month: what was kept leads, and the bar explains it. */}
          {/* shrink-0 on each: a panel clips its own overflow, so a short window would squash it instead of scrolling the column. */}
          <Panel title={`Kept in ${monthLabel(month, today)}`} className="shrink-0">
            <div className="flex flex-col gap-2.5 px-3 pb-3 pt-2.5">
              <span
                className={cn(
                  'truncate text-[22px] font-bold leading-7 tracking-tight tabular-nums',
                  keptMinor < 0 && 'text-destructive',
                )}
              >
                {formatMoney(keptMinor)}
              </span>
              {/* In against out, as one bar: how much of what came in is still here. */}
              <span
                role="img"
                aria-label={`In ${formatMoney(inMinor)}, out ${formatMoney(outMinor)}`}
                className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted"
              >
                {inMinor > 0 && <span className="bg-success" style={{ flex: inMinor }} />}
                {outMinor > 0 && <span className="bg-muted-foreground/40" style={{ flex: outMinor }} />}
              </span>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span className="min-w-0 flex-1 truncate">
                  In <span className="font-semibold tabular-nums text-foreground">{formatMoney(inMinor)}</span>
                </span>
                <span className="min-w-0 flex-1 truncate">
                  Out <span className="font-semibold tabular-nums text-foreground">{formatMoney(outMinor)}</span>
                </span>
              </div>
              {withheldMinor > 0 && (
                <p className="text-xs leading-[17px] text-muted-foreground">{withheldLine(withheldMinor)}</p>
              )}
            </div>
          </Panel>

          {owed.toYou.length > 0 && (
            <Panel
              title="Owed to you"
              right={<span className="text-xs font-semibold tabular-nums">{formatMoney(owed.owedMinor)}</span>}
              className="shrink-0"
            >
              <ul>
                {owed.toYou.slice(0, OWED_SHOWN).map((entry) => (
                  <OwedLine
                    key={entry.id}
                    entry={entry}
                    today={today}
                    onOpen={() => onOpenEntry(entry)}
                    onPaid={() => onPaid(entry)}
                  />
                ))}
              </ul>
              {owed.toYou.length > OWED_SHOWN && (
                <button
                  type="button"
                  onClick={onOpenOwed}
                  className="flex min-h-9 items-center justify-between gap-2 border-t border-border/40 px-3 text-left text-xs font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
                >
                  See all
                  <ChevronRight className="size-3.5 shrink-0" aria-hidden />
                </button>
              )}
            </Panel>
          )}

          {saved.savings.length > 0 && (
            <Panel
              title="Savings"
              right={<span className="text-xs font-semibold tabular-nums">{formatMoney(saved.totalMinor)}</span>}
              className="shrink-0"
            >
              <ul>
                {saved.savings.slice(0, SAVINGS_SHOWN).map((saving) => {
                  const standing = savingStanding(saving, taxOwedMinor);
                  return (
                    <li key={saving.id} className="border-t border-border/40 first:border-t-0">
                      <button
                        type="button"
                        onClick={() => onOpenSaving(saving.id)}
                        className="flex w-full flex-col gap-1.5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
                      >
                        <span className="flex justify-between gap-2">
                          <span className="truncate font-semibold">{saving.name}</span>
                          <span className="shrink-0 tabular-nums text-secondary-foreground">
                            {formatMoney(saving.balanceMinor)}
                          </span>
                        </span>
                        {/* A running total has no goal to draw a bar against. */}
                        {standing.progress !== null && (
                          <SavingBar thin progress={standing.progress} met={standing.met} />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </aside>
      </div>

      <HintBar hints={HINTS} className="shrink-0" />
    </div>
  );
}
