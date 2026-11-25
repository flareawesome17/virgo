'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ChevronRight, Info } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/*
 * The parts every form is made of, as on the phone (components/Form.tsx
 * there), at the web's sizes: 44px fields and buttons instead of 52pt.
 */

/** The class for an Input inside a form: 44px, one radius. */
export const FORM_INPUT = 'h-11 rounded-xl px-3.5 text-sm';
/** The class for a Textarea inside a form. */
export const FORM_TEXTAREA = 'min-h-[84px] rounded-xl px-3.5 py-2.5 text-sm';
/** The class for the one button in a FormFooter. */
export const FORM_SUBMIT = 'h-11 w-full rounded-xl text-[15px] font-semibold';

/** A label over its field, "optional" in grey, and a line under it that turns red when wrong. */
export function FormField({
  label,
  htmlFor,
  optional = false,
  hint,
  error,
  right,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  optional?: boolean;
  hint?: ReactNode;
  /** Replaces the hint, in red. */
  error?: ReactNode;
  /** At the end of the label's line: a counter. */
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-semibold">
          {label}
          {optional ? <span className="font-normal text-muted-foreground"> optional</span> : null}
        </label>
        {right ? <span className="text-xs tabular-nums text-muted-foreground">{right}</span> : null}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** One of a few choices, as a pill. Dark when chosen, never terracotta. */
export function ChoiceChip({
  on = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      {...props}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 [&_svg]:size-4',
        on ? 'bg-foreground text-background' : 'bg-muted text-foreground hover:bg-muted/70',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A titled group of fields. */
export function FormSection({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-2.5', className)}>
      <h3 className="text-base font-bold tracking-tight">{title}</h3>
      {children}
    </section>
  );
}

/** A card of rows: a setting on the left, what it is set to on the right. */
export function FormCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border/60 bg-card [&>*+*]:border-t [&>*+*]:border-border/40',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A row that opens something to choose from: label, value in bold, a chevron. */
export function FormRow({
  label,
  value,
  placeholder = false,
  className,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> & {
  label: ReactNode;
  value?: ReactNode;
  /** The value is a prompt ("Nobody yet"), drawn in grey. */
  placeholder?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50',
        className,
      )}
    >
      <span className="flex-1 text-secondary-foreground">{label}</span>
      {children ?? (
        <span className={cn('min-w-0 truncate font-semibold', placeholder && 'text-muted-foreground')}>
          {value}
        </span>
      )}
      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground/70" />
    </button>
  );
}

/** A row with a switch at its end. */
export function FormSwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm">
      <span className="flex flex-1 flex-col">
        <span className="text-secondary-foreground">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </label>
  );
}

/** Something to know before going on: a plan limit, who will see it. */
export function FormNotice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-xl bg-primary/10 px-3.5 py-3 text-[13px] leading-[18px] text-foreground',
        className,
      )}
    >
      <Info aria-hidden className="mt-px size-4 shrink-0 text-primary" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * The foot of a form: one filled button the width of the form, with an
 * optional line above it ("Still needs a date"). No Cancel: the X in the
 * dialog's corner closes it.
 */
export function FormFooter({
  note,
  children,
  className,
}: {
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2 border-t border-border pt-3', className)}>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      {children}
    </div>
  );
}
