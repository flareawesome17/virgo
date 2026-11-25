'use client';

import type { ReactNode } from 'react';

/**
 * One of a few choices, as a row in a FormCard: a radio, the choice in bold
 * and a quiet line under it saying what it means.
 *
 * A real radio input, so the arrow keys move between the rows of one `name`
 * and a screen reader counts them, with nothing written to make either work.
 * Dark when chosen, like a chip: terracotta is the button's.
 */
export function RadioRow({
  name,
  checked,
  onSelect,
  label,
  detail,
  disabled,
}: {
  /** Shared by the rows of one question. */
  name: string;
  checked: boolean;
  onSelect: () => void;
  label: ReactNode;
  detail?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/50 has-[:disabled]:cursor-default has-[:disabled]:opacity-60 has-[:focus-visible]:bg-muted/50">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        className="size-[18px] shrink-0 accent-foreground"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">{label}</span>
        {detail ? (
          <span className="text-[13px] leading-[18px] text-muted-foreground">{detail}</span>
        ) : null}
      </span>
    </label>
  );
}
