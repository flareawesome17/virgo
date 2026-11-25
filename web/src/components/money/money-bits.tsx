'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Briefcase, Clock, Link2, Paperclip, Repeat, Users } from 'lucide-react';
import {
  categoryLabel,
  dateOfIso,
  formatMoney,
  isOverdue,
  methodLabel,
  type MoneyEntry,
  type MoneyKind,
  type MoneyPackage,
  type MoneySuggestion,
} from '@/api';
import { CARD, DateTile, dateTileParts } from '@/components/kit';
import { CategoryIcon } from '@/components/money/icons';
import { Button } from '@/components/ui/button';
import { useMoneyEntries } from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

/*
 * What Money's pages share: how a day and an amount are written, what is
 * still owed, and the rows and cards its lists are made of.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A button on a row: 36px, the radius the rows' tiles have. */
export const ROW_BUTTON = 'h-9 shrink-0 rounded-[10px] px-3.5 text-sm font-semibold';
/** The same button on the desktop app's 40px rows: 26px. */
export const DENSE_BUTTON = 'h-[26px] shrink-0 rounded-[7px] px-2 text-xs font-semibold';
/**
 * The dark button, over `variant="secondary"`: the thing to do on a row,
 * without spending the page's one filled button on it.
 */
export const DARK_BUTTON = 'bg-foreground text-background hover:bg-foreground/85';

/** "+₱15,000" in, "−₱350.50" out. */
export function signed(kind: MoneyKind, minor: number): string {
  return `${kind === 'income' ? '+' : '−'}${formatMoney(minor)}`;
}

/** A day's income less its expenses, signed the same way. */
export function signedNet(minor: number): string {
  return `${minor > 0 ? '+' : minor < 0 ? '−' : ''}${formatMoney(Math.abs(minor))}`;
}

/** Whole days from `from` to `to`, both YYYY-MM-DD; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** "4 days late", "Due today", "Due in 6 days". */
export function dueLine(day: string, today: string): { text: string; late: boolean } {
  const days = daysBetween(today, day);
  if (days < 0) return { text: `${-days} ${days === -1 ? 'day' : 'days'} late`, late: true };
  if (days === 0) return { text: 'Due today', late: false };
  return { text: `Due in ${days} ${days === 1 ? 'day' : 'days'}`, late: false };
}

/** "12 Nov", with the year when it is not this one. */
export function shortDay(day: string, today: string): string {
  const short = `${Number(day.slice(8, 10))} ${(MONTHS[Number(day.slice(5, 7)) - 1] ?? '').slice(0, 3)}`;
  return day.slice(0, 4) === today.slice(0, 4) ? short : `${short} ${day.slice(0, 4)}`;
}

/** "Today", "Yesterday", "Thu, 12 Nov", or "12 Nov 2025" for another year. */
export function dayHeading(day: string, today: string): string {
  if (day === today) return 'Today';
  if (daysBetween(day, today) === 1) return 'Yesterday';
  if (day.slice(0, 4) !== today.slice(0, 4)) return shortDay(day, today);
  return `${WEEKDAYS[dateOfIso(day).getDay()]}, ${shortDay(day, today)}`;
}

/** "November 2026": a month with its year, whichever year it is. */
export function monthAndYear(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1] ?? month} ${month.slice(0, 4)}`;
}

/** "March", or "March 2028" outside this year: the month a day falls in. */
export function monthOfDay(day: string, today: string): string {
  const name = MONTHS[Number(day.slice(5, 7)) - 1] ?? day.slice(0, 7);
  return day.slice(0, 4) === today.slice(0, 4) ? name : `${name} ${day.slice(0, 4)}`;
}

/** What an unpaid entry is still worth to the person: the fee less what the client withholds. */
export const netOf = (entry: MoneyEntry) => entry.amountMinor - (entry.withheldMinor ?? 0);
export const nameOf = (entry: MoneyEntry) => entry.counterparty || categoryLabel(entry.kind, entry.category);

/** Asked for the same way by every Money page, so they share one cached list. */
const UNPAID = { unpaid: true, limit: 100 } as const;

/**
 * Everything not paid yet, whatever the month, soonest due first: a client
 * who owes from August still owes in October.
 */
export function useOwed(today: string) {
  const unpaid = useMoneyEntries(UNPAID);
  const { entries } = unpaid;
  const owed = useMemo(() => {
    // An entry marked paid leaves on the click; the list is read again after.
    const waiting = entries
      .filter((entry) => entry.paidOn === null)
      .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
    const toYou = waiting.filter((entry) => entry.kind === 'income');
    const late = toYou.filter((entry) => isOverdue(entry, today));
    return {
      /** What clients still owe. */
      toYou,
      /** Expenses still to pay. */
      byYou: waiting.filter((entry) => entry.kind === 'expense'),
      late,
      owedMinor: toYou.reduce((sum, entry) => sum + netOf(entry), 0),
      lateMinor: late.reduce((sum, entry) => sum + netOf(entry), 0),
    };
  }, [entries, today]);
  return { ...owed, isLoading: unpaid.isLoading, loadFailed: unpaid.loadFailed, refetch: unpaid.refetch };
}

/**
 * The one thing that is late, said once, and the way to the rest. Draws
 * nothing while nothing is late.
 */
export function LateNotice({
  owed,
  today,
  onOpenOwed,
  dense = false,
}: {
  owed: Pick<ReturnType<typeof useOwed>, 'late' | 'lateMinor'>;
  today: string;
  onOpenOwed: () => void;
  /** The desktop app's: one 32px line. */
  dense?: boolean;
}) {
  const worst = owed.late[0];
  if (!worst) return null;
  return (
    <button
      type="button"
      onClick={onOpenOwed}
      className={cn(
        'flex items-center bg-destructive/10 text-left text-destructive outline-none transition-colors hover:bg-destructive/15 focus-visible:ring-3 focus-visible:ring-destructive/30',
        dense ? 'min-h-8 gap-2 rounded-lg px-3 py-1' : 'min-h-12 gap-2.5 rounded-[14px] px-3.5 py-2 text-sm',
      )}
    >
      <Clock className={cn('shrink-0', dense ? 'size-3.5' : 'size-4')} aria-hidden />
      <span className={cn('min-w-0 flex-1', dense && 'truncate')}>
        <span className="font-semibold">
          {formatMoney(owed.lateMinor)} is {dueLine(worst.occurredOn, today).text}.
        </span>{' '}
        {owed.late.length === 1 ? nameOf(worst) : `${nameOf(worst)} and ${owed.late.length - 1} more`}
      </span>
      <span className={cn('shrink-0 font-semibold', dense && 'text-xs')}>See Owed</span>
    </button>
  );
}

const ROW_TILE = 'grid size-10 shrink-0 place-items-center rounded-xl bg-muted';

/** A paid entry in its day's card. The whole row opens it. */
export function EntryRow({ entry, onOpen }: { entry: MoneyEntry; onOpen: () => void }) {
  const income = entry.kind === 'income';
  const label = categoryLabel(entry.kind, entry.category);
  const cancelled = !!entry.booking?.cancelled;
  const reference = entry.reference?.trim();
  const detail = cancelled
    ? 'Booking cancelled'
    : [
        entry.counterparty ? label : null,
        methodLabel(entry.method),
        // "Ref 8841", unless that is already how they wrote it.
        reference ? (/^ref/i.test(reference) ? reference : `Ref ${reference}`) : null,
      ]
        .filter(Boolean)
        .join(' · ');
  return (
    <li className="border-t border-border/40 first:border-t-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[60px] w-full items-center gap-3 py-2 pl-2.5 pr-4 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
      >
        <span className={ROW_TILE}>
          <CategoryIcon kind={entry.kind} slug={entry.category} className="size-[18px]" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{entry.counterparty || label}</span>
            {(entry.recurringId ?? null) !== null && (
              <Repeat className="size-[13px] shrink-0 text-muted-foreground" aria-label="Repeats every month" />
            )}
            {entry.receipt && (
              <Paperclip className="size-[13px] shrink-0 text-muted-foreground" aria-label="Has a receipt" />
            )}
          </span>
          {detail && (
            <span className={cn('truncate text-[13px]', cancelled ? 'text-destructive' : 'text-muted-foreground')}>
              {detail}
            </span>
          )}
        </span>
        <span
          className={cn(
            'shrink-0 text-[15px] font-semibold tabular-nums',
            income ? 'text-success' : 'text-secondary-foreground',
          )}
        >
          {signed(entry.kind, entry.amountMinor)}
        </span>
      </button>
    </li>
  );
}

/** A booking Money offers to record, with its two answers. */
export function SuggestionRow({
  suggestion,
  onRecord,
  onDismiss,
  dense = false,
}: {
  suggestion: MoneySuggestion;
  onRecord: () => void;
  onDismiss: () => void;
  /** The desktop app's: one 40px line, without the tile. */
  dense?: boolean;
}) {
  const income = suggestion.kind === 'income';
  const Icon = income ? Briefcase : Users;
  // Money going out says so: the other person's name alone reads as income.
  const who = income ? suggestion.counterparty : `To ${suggestion.counterparty}`;
  const button = dense ? DENSE_BUTTON : ROW_BUTTON;
  return (
    <li
      className={cn(
        'flex flex-wrap items-center border-t border-border/40 first:border-t-0',
        dense ? 'min-h-10 gap-2 py-1 pl-3 pr-2' : 'min-h-16 gap-3 py-2 pl-2.5 pr-3',
      )}
    >
      {!dense && (
        <span className={ROW_TILE}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
      )}
      <span
        className={cn('flex min-w-0', dense ? 'flex-[1_1_200px] items-baseline gap-2' : 'flex-[1_1_220px] flex-col')}
      >
        <span className={cn('truncate font-semibold', !dense && 'text-sm')}>
          {suggestion.role ? `${suggestion.role}, ${suggestion.postTitle}` : suggestion.postTitle}
        </span>
        <span className={cn('truncate text-muted-foreground', dense ? 'min-w-0 flex-1' : 'text-[13px]')}>
          {suggestion.amountMinor !== null ? `${who} · agreed at ${formatMoney(suggestion.amountMinor)}` : who}
        </span>
      </span>
      <Button
        variant="secondary"
        className={button}
        aria-label={`Not this — don't offer ${suggestion.postTitle} again`}
        onClick={onDismiss}
      >
        Not this
      </Button>
      <Button
        variant="secondary"
        className={cn(button, DARK_BUTTON)}
        aria-label={`Record ${income ? 'income from' : 'expense to'} ${suggestion.counterparty}`}
        onClick={onRecord}
      >
        Record
      </Button>
    </li>
  );
}

/** A payment still waiting: its day on a tile, how late or how soon, and the way to say it came. */
export function OwedRow({
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
  const income = entry.kind === 'income';
  const name = nameOf(entry);
  const due = dueLine(entry.occurredOn, today);
  const cancelled = !!entry.booking?.cancelled;
  const tile = dateTileParts(entry.occurredOn);
  // What it was for: their own note first, the category when the name is the client's.
  const what =
    entry.note?.trim().split('\n')[0] || (entry.counterparty ? categoryLabel(entry.kind, entry.category) : '');
  return (
    <li className="flex min-h-16 flex-wrap items-center gap-3 border-t border-border/40 py-1.5 pl-2.5 pr-3 first:border-t-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-[1_1_220px] items-center gap-3 rounded-xl text-left outline-none transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <DateTile top={tile.month} day={tile.day} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{name}</span>
          <span className="truncate text-[13px] text-muted-foreground">
            {what ? `${what} · ` : ''}
            <span className={cn((due.late || cancelled) && 'font-semibold text-destructive')}>
              {cancelled ? 'Booking cancelled' : due.text}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-[15px] font-semibold tabular-nums">{formatMoney(netOf(entry))}</span>
      </button>
      <Button
        variant="secondary"
        className={cn(ROW_BUTTON, income && due.late && DARK_BUTTON)}
        aria-label={income ? `Mark ${name} as received` : `Mark ${name} as paid`}
        onClick={onPaid}
      >
        {income ? 'Got it' : 'Paid'}
      </Button>
    </li>
  );
}

/** One package: the job, the client, a bar for how much is in, and what is left and when. */
export function PackageCard({ pkg, today }: { pkg: MoneyPackage; today: string }) {
  const percent = pkg.paidInFull
    ? 100
    : pkg.totalMinor > 0
      ? Math.round(Math.min(1, pkg.receivedMinor / pkg.totalMinor) * 100)
      : 0;
  const left = `${formatMoney(pkg.balanceMinor)} left`;
  const status = pkg.paidInFull
    ? 'Paid in full'
    : pkg.nextDueOn
      ? `${left} · ${pkg.overdue ? 'overdue since' : 'due'} ${shortDay(pkg.nextDueOn, today)}`
      : `${left} · no date set`;
  return (
    <Link
      href={`/money/packages/${pkg.id}`}
      className={cn(
        CARD,
        'flex flex-col gap-2.5 p-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50',
      )}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{pkg.title}</span>
          {pkg.shareUrl && (
            <Link2 className="size-3.5 shrink-0 text-muted-foreground" aria-label="Statement shared" />
          )}
        </span>
        {pkg.clientName && (
          <span className="max-w-[45%] shrink-0 truncate text-[13px] text-muted-foreground">{pkg.clientName}</span>
        )}
      </span>
      <span
        role="img"
        aria-label={`${percent} percent paid`}
        className="flex h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <span
          className={cn('rounded-full', pkg.paidInFull ? 'bg-success' : 'bg-secondary-foreground')}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="flex justify-between gap-2 text-[13px]">
        <span
          className={cn(
            'min-w-0 truncate font-semibold',
            pkg.paidInFull ? 'text-success' : pkg.overdue ? 'text-destructive' : 'text-foreground',
          )}
        >
          {status}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {pkg.paidInFull
            ? formatMoney(pkg.totalMinor)
            : `${formatMoney(pkg.receivedMinor)} of ${formatMoney(pkg.totalMinor)}`}
        </span>
      </span>
    </Link>
  );
}
