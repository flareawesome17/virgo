'use client';

import { useState } from 'react';
import { CalendarIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * A date, chosen from a calendar rather than typed.
 *
 * `<input type="date">` renders as the browser sees fit — Chrome's is a bare
 * `mm/dd/yyyy` mask with a tiny glyph, which is both out of keeping with every
 * other control here and ambiguous about the order of the parts to anyone
 * outside the US.
 *
 * The value stays a `YYYY-MM-DD` string because that is what the API takes and
 * what the database stores; `Date` only exists inside this component.
 */
export function DatePickerField({
  value,
  onChange,
  placeholder = 'Pick a date',
  fromDate,
  clearable = true,
  id,
}: {
  /** `YYYY-MM-DD`, or '' for unset. */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Earliest selectable day, also `YYYY-MM-DD`. */
  fromDate?: string;
  clearable?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);

  // Parsed as local midday, not midnight. `new Date('2026-08-17')` is UTC, so
  // anywhere west of Greenwich it renders as the 16th — the classic off-by-one
  // that makes a date picker show the day before the one that was chosen.
  const selected = value ? new Date(`${value}T12:00:00`) : undefined;
  const from = fromDate ? new Date(`${fromDate}T12:00:00`) : undefined;

  const label = selected
    ? selected.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : placeholder;

  /** Local parts, for the same reason: toISOString would shift the day. */
  const toIsoDay = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              'flex-1 justify-start gap-2 font-normal',
              !selected && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="size-4 shrink-0" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? from}
            disabled={from ? { before: from } : undefined}
            onSelect={(date) => {
              onChange(date ? toIsoDay(date) : '');
              setOpen(false);
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>

      {clearable && value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear date"
          onClick={() => onChange('')}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
