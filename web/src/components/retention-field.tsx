'use client';

import { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  addDaysToKey,
  daysBetweenKeys,
  MAX_RETENTION_DAYS,
  RETENTION_DAY_PRESETS,
  retentionDateLabel,
  retentionDaysLabel,
  todayDateKey,
  type Retention,
} from '@/api';

/** YYYY-MM-DD to a local Date, at noon so no zone tips it into another day. */
function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/** The same day `months` later, or the month's last day when it has fewer. */
function monthsLater(key: string, months: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

const QUICK_DATES = [
  { label: '1 month', months: 1 },
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '1 year', months: 12 },
];

const CHOICES: { mode: Retention['mode']; title: string; detail: string }[] = [
  { mode: 'forever', title: 'Until I delete them', detail: 'Nothing is removed on its own.' },
  {
    mode: 'days',
    title: 'For a set time after each upload',
    detail: 'Each file goes that long after it was added.',
  },
  {
    mode: 'until',
    title: 'Until a date',
    detail: 'Everything is kept through the day you pick, then removed.',
  },
];

/**
 * How long an album keeps its files: until deleted, a window after each
 * upload, or until a date picked on a calendar.
 *
 * The web offered five fixed windows and nothing else. A contract that says
 * "until 31 March" could not be entered on either client.
 */
export function RetentionField({
  value,
  onChange,
}: {
  value: Retention;
  onChange: (next: Retention) => void;
}) {
  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label="Keep the files" className="grid overflow-hidden rounded-lg border">
        {CHOICES.map((choice, i) => {
          const checked = value.mode === choice.mode;
          return (
            <button
              key={choice.mode}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => {
                if (checked) return;
                if (choice.mode === 'forever') onChange({ mode: 'forever' });
                if (choice.mode === 'days') onChange({ mode: 'days', days: 30 });
                if (choice.mode === 'until') onChange({ mode: 'until', date: '' });
              }}
              className={cn(
                'flex items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                i > 0 && 'border-t',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2',
                  checked ? 'border-primary' : 'border-muted-foreground/40',
                )}
              >
                {checked && <span className="size-2 rounded-full bg-primary" />}
              </span>
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{choice.title}</span>
                <span className="text-xs text-muted-foreground">{choice.detail}</span>
              </span>
            </button>
          );
        })}
      </div>

      {value.mode === 'days' && (
        <DaysField days={value.days} onChange={(days) => onChange({ mode: 'days', days })} />
      )}
      {value.mode === 'until' && (
        <DateField date={value.date} onChange={(date) => onChange({ mode: 'until', date })} />
      )}
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'h-8 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function DaysField({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  const [typing, setTyping] = useState(
    !(RETENTION_DAY_PRESETS as readonly number[]).includes(days),
  );
  const problem =
    !Number.isInteger(days) || days < 1
      ? 'At least 1 day.'
      : days > MAX_RETENTION_DAYS
        ? 'At most 3,650 days (ten years).'
        : null;

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div role="radiogroup" aria-label="How long after each upload" className="flex flex-wrap gap-2">
        {RETENTION_DAY_PRESETS.map((d) => (
          <Pill
            key={d}
            on={!typing && days === d}
            onClick={() => {
              setTyping(false);
              onChange(d);
            }}
          >
            {retentionDaysLabel(d)}
          </Pill>
        ))}
        <Pill on={typing} onClick={() => setTyping(true)}>
          Other
        </Pill>
      </div>
      {typing && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_RETENTION_DAYS}
            value={Number.isFinite(days) && days > 0 ? days : ''}
            onChange={(e) => onChange(e.target.value === '' ? 0 : Math.floor(Number(e.target.value)))}
            aria-label="Days after each upload"
            aria-invalid={!!problem}
            className="w-28"
            autoFocus
          />
          <span className="text-sm text-muted-foreground">days after each upload</span>
        </div>
      )}
      <p className={cn('text-xs', problem && typing ? 'text-destructive' : 'text-muted-foreground')}>
        {problem && typing
          ? problem
          : `Each file is removed ${retentionDaysLabel(days)} after it was uploaded. This can't be undone.`}
      </p>
    </div>
  );
}

/** The last day, on a calendar, with the days kept drawn across it. */
function DateField({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const today = todayDateKey();
  const first = addDaysToKey(today, 1);
  const last = addDaysToKey(today, MAX_RETENTION_DAYS);
  const [month, setMonth] = useState(() => keyToDate(date || first));
  const selected = date ? keyToDate(date) : undefined;
  const span = date ? daysBetweenKeys(today, date) : 0;

  const pick = (key: string) => {
    onChange(key);
    setMonth(keyToDate(key));
  };

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div role="radiogroup" aria-label="Quick dates" className="flex flex-wrap gap-2">
        {QUICK_DATES.map((q) => {
          const key = monthsLater(today, q.months);
          return (
            <Pill key={q.label} on={date === key} onClick={() => pick(key)}>
              {q.label}
            </Pill>
          );
        })}
      </div>
      <Calendar
        mode="single"
        selected={selected}
        onSelect={(day) => day && pick(todayDateKey(day))}
        month={month}
        onMonthChange={setMonth}
        captionLayout="dropdown"
        startMonth={keyToDate(first)}
        endMonth={keyToDate(last)}
        disabled={[{ before: keyToDate(first) }, { after: keyToDate(last) }]}
        modifiers={
          date && span > 1
            ? { kept: { from: keyToDate(today), to: keyToDate(addDaysToKey(date, -1)) } }
            : undefined
        }
        modifiersClassNames={{ kept: 'bg-primary/10 rounded-none' }}
        className="mx-auto p-0"
      />
      <p aria-live="polite" className={cn('text-xs', date ? 'text-foreground' : 'text-muted-foreground')}>
        {date
          ? `Kept for ${span} ${span === 1 ? 'day' : 'days'}, until ${retentionDateLabel(date)}. Removed in the overnight clean-up after. This can't be undone.`
          : 'Pick the last day the files are kept.'}
      </p>
    </div>
  );
}
