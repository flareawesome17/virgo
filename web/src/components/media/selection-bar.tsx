'use client';

import type { ReactNode } from 'react';
import { Download, FolderInput, ImageIcon, Link2, Loader2, Plus, Trash2, X } from 'lucide-react';
import type { AlbumSection } from '@/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { dockFloorCss } from '@/lib/edge-offsets';
import { cn } from '@/lib/utils';

/**
 * A button on the dark bar. The page's own quiet buttons hover to the page's
 * pale grey, which on the inverted card is the wrong way round.
 */
const ITEM =
  'flex h-8 shrink-0 items-center gap-1.5 rounded-md pr-2.5 pl-2 text-[13px] font-semibold outline-none transition-colors hover:bg-background/15 focus-visible:ring-2 focus-visible:ring-background/60 disabled:pointer-events-none disabled:opacity-50 aria-expanded:bg-background/15 [&_svg]:size-4 [&_svg]:shrink-0';

/*
 * The accent and the red on the inverted card: each pulled toward the card's
 * own ink, so they are lighter on the dark bar of the light theme and darker
 * on the pale bar of the dark one. As the page uses them they are dim on both.
 */
const ACCENT = 'text-[color-mix(in_oklch,var(--primary),var(--background)_40%)]';
const DANGER = 'text-[color-mix(in_oklch,var(--destructive),var(--background)_50%)]';

/** A word beside its glyph; the glyph alone where a phone has no room for five words. */
function Word({ children }: { children: ReactNode }) {
  return <span className="max-sm:sr-only">{children}</span>;
}

/**
 * What can be done with the files chosen, as a dark bar floating at the foot
 * of the page.
 *
 * It was a second toolbar that took the place of the first at the top of the
 * grid, a screen away from the tiles being ticked at the bottom of a long
 * album. Here it stays under the hand, as the phone's does. An action the
 * person may not take is left out by leaving out its prop.
 */
export function SelectionBar({
  count,
  selectAllLabel,
  onSelectAll,
  onClear,
  busy,
  move,
  download,
  link,
  onCover,
  onDelete,
}: {
  count: number;
  /** "Select all", or "Select all loaded" while there are pages still to come. */
  selectAllLabel: string;
  onSelectAll: () => void;
  onClear: () => void;
  /** Something is already being done with the selection. */
  busy: boolean;
  move?: {
    sections: AlbumSection[];
    /** A section's id, or null for none. */
    onMove: (sectionId: string | null) => void;
    onNew: () => void;
  };
  download?: { pending: boolean; run: () => void };
  link?: { pending: boolean; run: () => void };
  /** Only for one photograph, and only for the owner. */
  onCover?: () => void;
  onDelete?: () => void;
}) {
  const said = count === 0 ? 'Select files' : `${count.toLocaleString()} selected`;
  const actions = count > 0 && !!(move || download || link || onCover || onDelete);

  return (
    <div
      // Above whatever else has the bottom of the window: the film playing in
      // the corner, a message box.
      className="pointer-events-none sticky z-30 flex justify-center"
      style={{ bottom: `calc(1rem + ${dockFloorCss()})` }}
    >
      <div
        role="toolbar"
        aria-label="Selection"
        className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-foreground py-1.5 pr-1.5 pl-3.5 text-background shadow-[0_12px_32px_rgb(0_0_0/0.3)] [scrollbar-width:none]"
      >
        <p className="mr-1.5 shrink-0 text-[13px] font-semibold tabular-nums" aria-live="polite">
          {said}
        </p>
        <button type="button" onClick={onSelectAll} className={cn(ITEM, 'px-2', ACCENT)}>
          {selectAllLabel}
        </button>
        {actions && <span aria-hidden className="mx-1.5 h-[18px] w-px shrink-0 bg-background/20" />}
        {count > 0 && (
          <>
            {move && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" disabled={busy} aria-label="Move to a section" className={ITEM}>
                    <FolderInput aria-hidden />
                    <Word>Move</Word>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="center" sideOffset={10} className="w-56">
                  {move.sections.map((section) => (
                    <DropdownMenuItem key={section.id} onSelect={() => move.onMove(section.id)}>
                      <span className="flex-1 truncate">{section.name}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{section.count}</span>
                    </DropdownMenuItem>
                  ))}
                  {move.sections.length > 0 && (
                    <>
                      <DropdownMenuItem onSelect={() => move.onMove(null)}>No section</DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onSelect={move.onNew}>
                    <Plus className="size-4" />
                    New section…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {download && (
              <button type="button" disabled={busy} onClick={download.run} aria-label="Download as one zip" className={ITEM}>
                {download.pending ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
                <Word>Download</Word>
              </button>
            )}
            {link && (
              <button
                type="button"
                disabled={busy || link.pending}
                onClick={link.run}
                aria-label="Make a client link to these"
                className={ITEM}
              >
                {link.pending ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />}
                <Word>Link</Word>
              </button>
            )}
            {onCover && (
              <button type="button" disabled={busy} onClick={onCover} aria-label="Set as cover" className={ITEM}>
                <ImageIcon aria-hidden />
                <Word>Cover</Word>
              </button>
            )}
            {onDelete && (
              <button type="button" disabled={busy} onClick={onDelete} className={cn(ITEM, DANGER)}>
                <Trash2 aria-hidden />
                <Word>Delete</Word>
              </button>
            )}
          </>
        )}
        <button type="button" onClick={onClear} aria-label="Stop selecting" className={cn(ITEM, 'w-8 justify-center px-0')}>
          <X aria-hidden />
        </button>
      </div>
    </div>
  );
}
