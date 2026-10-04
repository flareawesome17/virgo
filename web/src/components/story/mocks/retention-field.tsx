import { Check, ChevronDown, X } from 'lucide-react';
import { CLIENT } from '../data/story';
import { KEEP_HELPER, NEW_ALBUM, RETENTION_CHOSEN, RETENTION_OPTIONS } from '../data/strings/ch7';

/**
 * "Keep files for", from the web's New album dialog (`new-album-dialog.tsx`):
 * the one place the retention is set. It is chosen when the album is made,
 * and no screen changes it later — so Ch7 shows it as a flashback.
 *
 * The control is the app's Select drawn as plain elements: the h-8 trigger
 * (input/30, 12 px radius, a muted ChevronDown), the 12 px muted helper,
 * and, open, Radix's item-aligned list — the current choice laid over the
 * trigger, 14 px rows, the highlight on the accent surface, a check on the
 * selected one. The web's six choices, in order; the phone offers different
 * ones, which is why the page never lists them.
 *
 * Variants: `field` (the label, the select and the helper) and `dialog` (the
 * whole New album dialog around it: title, description, the name typed in,
 * an empty description, Cancel and Create album; a popover surface, 16.8 px
 * radius, ring foreground/10).
 *
 * States, styled from the root's `data-state`:
 * - `until`: as the dialog opens — "Until I delete them", "Files stay until
 *   you remove them."
 * - `open`: the list open over it, "90 days after upload" highlighted.
 * - `chosen` (rest): "90 days after upload", "Each file is deleted 90 days
 *   after it is uploaded. This cannot be undone."
 * Both values and both helpers are always drawn, stacked, so the trigger
 * keeps one width through the flip and a stage can crossfade them.
 *
 * Parts: retention-field (data-state), retention-select, retention-value
 * (data-value), retention-list, retention-option (data-value, data-on),
 * retention-helper (data-value); new-album-dialog in the dialog variant.
 */

export type RetentionFieldState = 'until' | 'open' | 'chosen';

const UNTIL = RETENTION_OPTIONS[0];
const CHOSEN = RETENTION_OPTIONS.find((o) => o.value === RETENTION_CHOSEN) ?? RETENTION_OPTIONS[3];

/** Shown values: the first choice until one is made. */
const VALUE_CLASS = {
  until: 'opacity-100 group-data-[state=chosen]/ret:opacity-0',
  chosen: 'opacity-0 group-data-[state=chosen]/ret:opacity-100',
} as const;

function Field() {
  return (
    <div className="grid gap-2">
      <span className="flex items-center gap-2 text-sm font-medium leading-none">{NEW_ALBUM.keep}</span>
      <div className="relative w-fit">
        <span
          data-part="retention-select"
          className="flex h-8 w-fit items-center justify-between gap-1.5 rounded-lg border border-[#362F2B] bg-[rgba(54,47,43,0.3)] py-2 pl-2.5 pr-2 text-sm whitespace-nowrap"
        >
          <span className="grid">
            <span data-part="retention-value" data-value={UNTIL.value} className={`col-start-1 row-start-1 ${VALUE_CLASS.until}`}>
              {UNTIL.label}
            </span>
            <span data-part="retention-value" data-value={CHOSEN.value} className={`col-start-1 row-start-1 ${VALUE_CLASS.chosen}`}>
              {CHOSEN.label}
            </span>
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-[#A08E84]" />
        </span>

        {/* Radix's item-aligned list, placed as SelectItemAlignedPosition
            places it: the current choice's text where the value's text was
            (1 px border + 10 px padding against the item's 6 px, so 5 px in),
            its 28 px row centred on the 32 px trigger (2 px down), and at
            least as wide as the rest of the trigger, so it ends where the
            trigger ends. */}
        <div
          data-part="retention-list"
          className="absolute left-[5px] top-0.5 z-30 min-w-[calc(100%-5px)] overflow-hidden rounded-lg bg-[#1E1B18] text-[#F2EDE8] opacity-0 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] ring-1 ring-[rgba(242,237,232,0.1)] group-data-[state=open]/ret:opacity-100"
        >
          {RETENTION_OPTIONS.map((o) => {
            const highlighted = o.value === CHOSEN.value;
            const selected = o.value === UNTIL.value;
            return (
              <span
                key={o.value}
                data-part="retention-option"
                data-value={o.value}
                data-on={highlighted ? '' : undefined}
                className={`relative flex w-full items-center gap-1.5 rounded-md py-1 pl-1.5 pr-8 text-sm whitespace-nowrap ${
                  highlighted ? 'bg-[#2A2522]' : ''
                }`}
              >
                <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                  {selected && <Check aria-hidden className="size-4" />}
                </span>
                {o.label}
              </span>
            );
          })}
        </div>
      </div>
      <p className="grid text-xs text-[#A08E84]">
        <span data-part="retention-helper" data-value={UNTIL.value} className={`col-start-1 row-start-1 ${VALUE_CLASS.until}`}>
          {KEEP_HELPER.none}
        </span>
        <span data-part="retention-helper" data-value={CHOSEN.value} className={`col-start-1 row-start-1 ${VALUE_CLASS.chosen}`}>
          {KEEP_HELPER.days}
        </span>
      </p>
    </div>
  );
}

export function RetentionField({
  state = 'chosen',
  variant = 'field',
  className = '',
}: {
  state?: RetentionFieldState;
  variant?: 'field' | 'dialog';
  className?: string;
}) {
  if (variant === 'field') {
    return (
      <div
        aria-hidden
        data-part="retention-field"
        data-state={state}
        className={`group/ret font-sans text-[#F2EDE8] ${className}`}
      >
        <Field />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      data-part="retention-field"
      data-state={state}
      className={`group/ret font-sans text-[#F2EDE8] ${className}`}
    >
      <div
        data-part="new-album-dialog"
        className="relative grid w-full max-w-sm gap-4 rounded-xl bg-[#1E1B18] p-4 text-sm ring-1 ring-[rgba(242,237,232,0.1)]"
      >
        <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-[min(var(--radius-md),12px)]">
          <X aria-hidden className="size-4" />
        </span>
        <div className="flex flex-col gap-2">
          <p className="text-base font-medium leading-none">{NEW_ALBUM.title}</p>
          <p className="text-sm text-[#A08E84]">{NEW_ALBUM.description}</p>
        </div>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <span className="flex items-center gap-2 text-sm font-medium leading-none">{NEW_ALBUM.name}</span>
            <span className="flex h-8 w-full min-w-0 items-center truncate rounded-lg border border-[#362F2B] bg-[rgba(54,47,43,0.3)] px-2.5 py-1 text-sm">
              {CLIENT.album}
            </span>
          </div>
          <div className="grid gap-2">
            <span className="flex items-center gap-2 text-sm font-medium leading-none">{NEW_ALBUM.descriptionLabel}</span>
            <span className="flex min-h-16 w-full rounded-lg border border-[#362F2B] bg-[rgba(54,47,43,0.3)] px-2.5 py-2 text-sm text-[#A08E84]">
              {NEW_ALBUM.descriptionPlaceholder}
            </span>
          </div>
          <Field />
        </div>

        <div className="-mx-4 -mb-4 flex flex-row justify-end gap-2 rounded-b-xl border-t border-[#362F2B] bg-[rgba(42,37,34,0.5)] p-4">
          <span className="inline-flex h-8 items-center rounded-lg border border-[#362F2B] bg-[rgba(54,47,43,0.3)] px-2.5 text-sm font-medium">
            {NEW_ALBUM.cancel}
          </span>
          <span className="inline-flex h-8 items-center rounded-lg bg-[#A85D35] px-2.5 text-sm font-medium text-white">
            {NEW_ALBUM.create}
          </span>
        </div>
      </div>
    </div>
  );
}
