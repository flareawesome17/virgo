'use client';

import { ChevronDown, ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type KindFilter = 'all' | 'image' | 'video' | 'audio';
export type OrderFilter = 'newest' | 'oldest';

export const KINDS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'image', label: 'Photos' },
  { key: 'video', label: 'Films' },
  { key: 'audio', label: 'Audio' },
];

const ORDERS: { key: OrderFilter; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
];

/**
 * Kind and order, behind one button that says what it is narrowing to.
 *
 * They were a row of four tabs and a button beside it, the widest things on
 * the toolbar for the two settings least often changed. The phone folds them
 * into one sheet called "Show and sort"; this is the same thing as a menu,
 * and the button always reads what the grid is showing: "Films · newest first".
 */
export function ShowAndSort({
  kind,
  order,
  counts,
  onKind,
  onOrder,
  dense = false,
}: {
  kind: KindFilter;
  order: OrderFilter;
  /** How many of each kind the section on screen holds. */
  counts: { image: number; video: number; audio: number; other: number };
  onKind: (kind: KindFilter) => void;
  onOrder: (order: OrderFilter) => void;
  /** The desktop app's: a quiet 30px button in 13px type, with no outline. */
  dense?: boolean;
}) {
  const showing = KINDS.find((option) => option.key === kind)?.label ?? KINDS[0].label;
  const sorted = (ORDERS.find((option) => option.key === order)?.label ?? ORDERS[0].label).toLowerCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={dense ? 'secondary' : 'outline'}
          aria-label={`Show and sort: ${showing}, ${sorted}`}
          className={cn(
            'gap-1.5 font-semibold',
            dense
              ? 'h-[30px] rounded-lg pr-3 pl-2.5 text-[13px]'
              : 'h-9 rounded-[10px] border-border/60 bg-card pr-3.5 pl-2.5 text-sm',
          )}
        >
          <ListFilter className="size-4" aria-hidden />
          {showing} · {sorted}
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Show</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={kind} onValueChange={(value) => onKind(value as KindFilter)}>
          {KINDS.map((option) => {
            const n =
              option.key === 'all'
                ? counts.image + counts.video + counts.audio + counts.other
                : counts[option.key];
            return (
              <DropdownMenuRadioItem key={option.key} value={option.key}>
                <span className="flex-1">{option.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{n.toLocaleString()}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Order</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={order} onValueChange={(value) => onOrder(value as OrderFilter)}>
          {ORDERS.map((option) => (
            <DropdownMenuRadioItem key={option.key} value={option.key}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
