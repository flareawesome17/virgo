'use client';

import { useState } from 'react';
import { Popover } from 'radix-ui';
import { Check, Plus, Tags } from 'lucide-react';
import { TAG_COLORS, type Tag, type TagColor } from '@/api/console';
import { useCreateTag, useTags } from '@/hooks/useConsole';
import { cn } from '@/lib/utils';

const CHIP: Record<TagColor, string> = {
  neutral: 'bg-muted text-foreground',
  terracotta: 'bg-primary/15 text-primary',
  green: 'bg-success/15 text-success',
  amber: 'bg-warning/15 text-warning',
  red: 'bg-destructive/15 text-destructive',
  blue: 'bg-info/15 text-info',
  violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
};

const SWATCH: Record<TagColor, string> = {
  neutral: 'bg-muted-foreground',
  terracotta: 'bg-primary',
  green: 'bg-success',
  amber: 'bg-warning',
  red: 'bg-destructive',
  blue: 'bg-info',
  violet: 'bg-violet-500',
};

export function TagChip({ tag, className }: { tag: Pick<Tag, 'label' | 'color'>; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-[11px] font-medium',
        CHIP[tag.color] ?? CHIP.neutral,
        className,
      )}
    >
      {tag.label}
    </span>
  );
}

/**
 * Picks tags from the shared list, and makes a new one when the search names
 * something that does not exist yet.
 *
 * `selected` decides the ticks; `onToggle` is called per tag, so the same
 * picker serves one customer (save the set) and many (add or remove one).
 */
export function TagPicker({
  selected,
  onToggle,
  canCreate,
  trigger,
  align = 'start',
}: {
  selected: Set<string>;
  onToggle: (tag: Tag, on: boolean) => void;
  canCreate: boolean;
  trigger: React.ReactNode;
  align?: 'start' | 'end';
}) {
  const { data: tags } = useTags();
  const create = useCreateTag();
  const [query, setQuery] = useState('');
  const [color, setColor] = useState<TagColor>('neutral');

  const term = query.trim();
  const shown = (tags ?? []).filter((t) => t.label.toLowerCase().includes(term.toLowerCase()));
  const exact = (tags ?? []).some((t) => t.label.toLowerCase() === term.toLowerCase());

  return (
    <Popover.Root onOpenChange={(open) => !open && setQuery('')}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={6}
          className="z-50 w-64 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={canCreate ? 'Find or make a tag…' : 'Find a tag…'}
            maxLength={32}
            className="mb-1 h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring"
          />
          <ul className="max-h-60 overflow-y-auto">
            {shown.map((t) => {
              const on = selected.has(t.id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(t, !on)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <span
                      className={cn(
                        'grid size-4 shrink-0 place-items-center rounded border',
                        on && 'border-primary bg-primary text-primary-foreground',
                      )}
                    >
                      {on && <Check className="size-3" />}
                    </span>
                    <TagChip tag={t} />
                    <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                      {t.customers}
                    </span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && !term && (
              <li className="px-2 py-3 text-center text-xs text-muted-foreground">No tags yet.</li>
            )}
          </ul>
          {canCreate && term && !exact && (
            <div className="mt-1 border-t pt-1.5">
              <div className="mb-1.5 flex gap-1 px-1">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      'size-4 rounded-full ring-offset-1 ring-offset-popover',
                      SWATCH[c],
                      color === c && 'ring-2 ring-ring',
                    )}
                  />
                ))}
              </div>
              <button
                type="button"
                disabled={create.isPending}
                onClick={() =>
                  create.mutate(
                    { label: term, color },
                    {
                      onSuccess: (tag) => {
                        setQuery('');
                        onToggle(tag as Tag, true);
                      },
                    },
                  )
                }
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <Plus className="size-3.5" />
                Make <TagChip tag={{ label: term, color }} />
              </button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The button that opens a TagPicker, in the console's toolbar style. */
export function TagButton({ label = 'Tags', ...props }: React.ComponentProps<'button'> & { label?: string }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
        props.className,
      )}
    >
      <Tags className="size-3.5" />
      {label}
    </button>
  );
}
