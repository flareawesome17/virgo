'use client';

import { useState } from 'react';
import {
  Camera,
  Check,
  Heart,
  House,
  PiggyBank,
  Plane,
  ReceiptText,
  Shield,
  Umbrella,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  ApiError,
  dateOfIso,
  formatMoney,
  isoDay,
  savingProgress,
  type MoneySaving,
  type SavingIcon,
} from '@/api';
import { FORM_INPUT, FormCard, FormRow } from '@/components/kit';
import { monthOfDay } from '@/components/money/money-bits';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMoneyTax } from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

/*
 * What the Savings page and its dialogs share: a saving's picture and bar,
 * the words for how far along it is, and the form pieces the kit has no
 * part for (an amount in pesos, a date chosen from a row).
 */

/** The server keeps a word for a saving's picture; this is the picture, as on the phone. */
const GLYPHS: Record<SavingIcon, LucideIcon> = {
  gear: Camera,
  tax: ReceiptText,
  safety: Shield,
  slow: Umbrella,
  trip: Plane,
  home: House,
  family: Heart,
  other: PiggyBank,
};

/** What each picture is called on its chip. */
export const SAVING_ICON_NAMES: Record<SavingIcon, string> = {
  gear: 'Gear',
  tax: 'Tax fund',
  safety: 'Safety net',
  slow: 'Slow months',
  trip: 'A trip',
  home: 'Home',
  family: 'Family',
  other: 'Something else',
};

/** A saving's picture, drawn: a component, so the icon is never one made during another's render. */
export function SavingGlyph({ icon, className }: { icon: SavingIcon; className?: string }) {
  const Icon = GLYPHS[icon] ?? PiggyBank;
  return <Icon className={className} aria-hidden />;
}

/** Where a saving stands against what it is for. */
export interface SavingStanding {
  /** 0 to 1 for the bar; null draws no bar. */
  progress: number | null;
  /** Centavos still to go; null with no goal. */
  left: number | null;
  /** A tax fund holding at least what the year's estimate says is still to pay. */
  covers: boolean;
  /** There, by its goal or by covering the tax: the tile and the bar turn green. */
  met: boolean;
}

/**
 * `taxOwedMinor` is the year's tax still to pay, as Tax help estimates it;
 * null while it is not known. A tax fund's own goal, while still ahead, is
 * what it is measured against: they chose it.
 */
export function savingStanding(
  saving: Pick<MoneySaving, 'icon' | 'balanceMinor' | 'goalMinor'>,
  taxOwedMinor: number | null,
): SavingStanding {
  const left = saving.goalMinor ? Math.max(saving.goalMinor - saving.balanceMinor, 0) : null;
  const covers =
    saving.icon === 'tax' &&
    !left &&
    taxOwedMinor !== null &&
    taxOwedMinor > 0 &&
    saving.balanceMinor >= taxOwedMinor;
  return { progress: covers ? 1 : savingProgress(saving), left, covers, met: covers || left === 0 };
}

/**
 * The year's tax still to pay, as Tax help estimates it, for savingStanding.
 * Asked for only when there is a tax fund to hold against it.
 */
export function useTaxOwed(savings: Pick<MoneySaving, 'icon'>[], today: string): number | null {
  const hasTaxFund = savings.some((saving) => saving.icon === 'tax');
  const { tax } = useMoneyTax(Number(today.slice(0, 4)), { enabled: hasTaxFund });
  return tax?.estimates ? tax.estimates[tax.estimates.lowest].stillToPayMinor : null;
}

/** What stands under a saving's amount: "₱23,000 to go · by March". */
export function savingLine(
  saving: Pick<MoneySaving, 'targetDate'>,
  standing: SavingStanding,
  today: string,
): string {
  if (standing.covers) return 'Covers what you owe';
  if (standing.left === null) return 'No goal set';
  if (standing.left === 0) return 'Goal reached';
  const by = saving.targetDate ? ` · by ${monthOfDay(saving.targetDate, today)}` : '';
  return `${formatMoney(standing.left)} to go${by}`;
}

/** A saving's picture on the neutral tile every row has; green and ticked once it is there. */
export function SavingTile({ icon, met }: { icon: SavingIcon; met: boolean }) {
  return (
    <span
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-xl',
        met ? 'bg-success/15 text-success' : 'bg-muted text-foreground',
      )}
    >
      {met ? (
        <Check className="size-[19px]" strokeWidth={2.6} aria-hidden />
      ) : (
        <SavingGlyph icon={icon} className="size-[19px]" />
      )}
    </span>
  );
}

/** The bar under a saving: how far along it is. Green once it is there. */
export function SavingBar({
  progress,
  met,
  tall = false,
  thin = false,
}: {
  progress: number;
  met: boolean;
  tall?: boolean;
  /** The desktop app's side panel: 4px. */
  thin?: boolean;
}) {
  const percent = Math.round(Math.min(Math.max(progress, 0), 1) * 100);
  return (
    <span
      role="img"
      aria-label={`${percent} percent saved`}
      className={cn('flex shrink-0 overflow-hidden rounded-full bg-muted', tall ? 'h-2' : thin ? 'h-1' : 'h-1.5')}
    >
      <span
        className={cn('rounded-full', met ? 'bg-success' : 'bg-secondary-foreground')}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

/** Why a save failed, in the server's words when it gave any. */
export function problem(error: unknown): string {
  return error instanceof ApiError && error.status !== 0 ? error.message : 'Check your connection and try again.';
}

/** A form in a dialog, as the redesign draws it: more room, a rounder corner. */
export const FORM_DIALOG = 'gap-5 rounded-[20px] p-5 sm:max-w-md';
export const FORM_DIALOG_TITLE = 'text-lg font-bold leading-6 tracking-tight';
/** FormFooter's rule, run out to the dialog's edges. */
export const FORM_DIALOG_FOOT = '-mx-5 px-5';

/** An amount in pesos: the sign, then the figure. */
export function PesoInput({
  id,
  value,
  onChange,
  invalid = false,
  autoFocus = false,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
        ₱
      </span>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        className={cn(FORM_INPUT, 'pl-8 tabular-nums')}
      />
    </div>
  );
}

/**
 * A date as a row that opens a calendar: the label on the left, the day in
 * bold on the right, as every form's date is on the phone.
 */
export function DateRow({
  label,
  value,
  display,
  onChange,
  from,
  to,
  clearable = false,
}: {
  label: string;
  /** YYYY-MM-DD, or '' for none. */
  value: string;
  /** What the row says: the day, or what having none is called. */
  display: string;
  onChange: (next: string) => void;
  /** The first and last days that can be chosen, YYYY-MM-DD. */
  from?: string;
  to?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? dateOfIso(value) : undefined;
  const first = from ? dateOfIso(from) : undefined;
  const last = to ? dateOfIso(to) : undefined;
  return (
    <FormCard>
      <div className="flex items-center">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <FormRow label={label} value={display} placeholder={!value} className="min-w-0 flex-1" />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected ?? first ?? last}
              disabled={[...(first ? [{ before: first }] : []), ...(last ? [{ after: last }] : [])]}
              onSelect={(date) => {
                // A second click on the chosen day is not a way to clear a date that has to be there.
                if (date) onChange(isoDay(date));
                else if (clearable) onChange('');
                setOpen(false);
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
        {clearable && value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mr-2 shrink-0"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => onChange('')}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
    </FormCard>
  );
}
