'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import { Button } from '@/components/ui/button';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem } from '@/components/ui/select';
import { FormFooter, FormNotice, FormRow } from '@/components/kit';
import { cn } from '@/lib/utils';

/*
 * What the form dialogs share beyond the kit's form parts: the dialog's own
 * frame, and the two kinds of row the kit's FormRow cannot be, one that is
 * typed into and one that opens a list.
 */

/** A field's fill inside a form dialog: white, so it reads as a card on the page colour. */
export const FORM_FIELD_FILL = 'bg-card';

/** The corners a row needs in a card that cannot clip, where its hover fill would square them off. */
export const FORM_ROW_CORNERS = 'first:rounded-t-[15px] last:rounded-b-[15px]';

/**
 * The inside of a form dialog: its name and an X, the fields on the page's
 * own colour, and one button held at the foot however tall the form grows.
 *
 * No Cancel. The X, Escape and a click outside all close it, and all three
 * go through the dialog's own onOpenChange, which is where a form with
 * something typed in it asks first.
 */
export function FormDialogContent({
  title,
  description,
  notice = false,
  wide = false,
  note,
  footer,
  children,
}: {
  title: string;
  /** What the form is for. Read out to a screen reader; shown only as a `notice`. */
  description: string;
  /** Shows the description at the top: something to know before going on. */
  notice?: boolean;
  /** 460px rather than 400px, for the form with the most in it. */
  wide?: boolean;
  /** A line above the button. */
  note?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <DialogContent
      showCloseButton={false}
      className={cn(
        'flex flex-col gap-0 overflow-hidden rounded-[20px] bg-background p-0',
        wide ? 'sm:max-w-[460px]' : 'sm:max-w-[400px]',
      )}
    >
      <div className="flex min-h-14 shrink-0 items-center gap-2 pl-5 pr-3">
        <DialogTitle className="min-w-0 flex-1 truncate text-[17px] font-bold leading-6 tracking-tight">
          {title}
        </DialogTitle>
        <DialogClose asChild>
          <Button type="button" variant="ghost" size="icon-lg" className="rounded-[10px]" aria-label="Close">
            <X />
          </Button>
        </DialogClose>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pb-5 pt-1">
        {notice ? (
          <FormNotice>
            <DialogDescription className="text-[13px] leading-[18px] text-foreground">
              {description}
            </DialogDescription>
          </FormNotice>
        ) : (
          <DialogDescription className="sr-only">{description}</DialogDescription>
        )}
        {children}
      </div>
      <FormFooter note={note} className="shrink-0 px-5 pb-5">
        {footer}
      </FormFooter>
    </DialogContent>
  );
}

/**
 * A row typed into where it stands: a date, a time. The kit's FormRow is a
 * button that opens something, and a date still has to take typing.
 */
export function FormInputRow({
  label,
  htmlFor,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex min-h-12 items-center gap-3 pl-4 pr-3 text-sm transition-colors focus-within:bg-muted/50',
        className,
      )}
    >
      <label htmlFor={htmlFor} className="flex-1 text-secondary-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/** The class for a date or time input at the end of a FormInputRow. */
export const FORM_ROW_INPUT =
  'h-9 min-w-0 rounded-lg bg-transparent px-1 text-right text-sm font-semibold tabular-nums outline-none disabled:opacity-50';

/** A FormRow that opens a short list to choose one from. */
export function FormSelectRow({
  id,
  label,
  value,
  display,
  placeholder = false,
  onValueChange,
  options,
  className,
}: {
  id?: string;
  label: ReactNode;
  value: string | undefined;
  /** What the row shows for the value: the chosen option's name, or a prompt. */
  display: ReactNode;
  /** `display` is a prompt, drawn in grey. */
  placeholder?: boolean;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger asChild>
        <FormRow id={id} label={label} value={display} placeholder={placeholder} className={className} />
      </SelectPrimitive.Trigger>
      {/* Under the row, not over it: the list has no value of its own in the
          row to line up with. */}
      <SelectContent position="popper" align="end">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
