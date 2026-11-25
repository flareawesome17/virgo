'use client';

import { useState, type DragEvent } from 'react';
import { ArrowDown, ArrowUp, Heart, Link2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AlbumSection } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useCreateSection,
  useDeleteSection,
  useRenameSection,
  useReorderSections,
} from '@/hooks/useAlbumSections';
import { FilterChip } from '@/components/kit';
import { cn } from '@/lib/utils';
import { ALBUM_FILES_DRAG } from './album-grid';

/** Everything, one section, the files in none, or what the client picked. */
export type SectionFilter = 'all' | 'none' | 'picked' | string;

export interface SectionCounts {
  sections: AlbumSection[];
  total: number;
  unsorted: number;
  picked: number;
}

function problem(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Please try again.';
}

/**
 * Hides a dense row's count whenever its options button shows: under the
 * pointer, with the keyboard on the button, or with its menu open.
 */
const COUNT_UNDER_OPTIONS =
  'group-hover:invisible group-has-[[aria-haspopup=menu]:focus-visible]:invisible group-has-[[data-state=open]]:invisible';

interface Entry {
  key: SectionFilter;
  label: string;
  count: number;
  section?: AlbumSection;
  /** Where a drop of files onto this entry files them: a section id, or null for none. */
  dropTo?: string | null;
}

function entries({ sections, total, unsorted, picked }: SectionCounts): Entry[] {
  return [
    { key: 'all', label: 'All media', count: total },
    ...sections.map((section) => ({
      key: section.id,
      label: section.name,
      count: section.count,
      section,
      dropTo: section.id,
    })),
    ...(sections.length > 0 ? [{ key: 'none', label: 'Unsorted', count: unsorted, dropTo: null }] : []),
    ...(picked > 0 ? [{ key: 'picked', label: 'Client picks', count: picked }] : []),
  ];
}

/**
 * The album's own chapters, down the side on a wide screen and across the top
 * on a narrow one.
 *
 * A section holds media of any kind — the ceremony's photographs and its film
 * together — so kind is a filter over it rather than the album's only axis.
 * On the rail, files dragged from the grid can be dropped onto a section.
 */
export function AlbumSections({
  albumId,
  layout,
  counts,
  value,
  onChange,
  canManage,
  onDropFiles,
  onShareSection,
  dense = false,
}: {
  albumId: string;
  layout: 'rail' | 'chips';
  counts: SectionCounts;
  value: SectionFilter;
  onChange: (value: SectionFilter) => void;
  canManage: boolean;
  onDropFiles: (keys: string[], sectionId: string | null) => void;
  /** A client link to just this section; absent for someone who cannot share. */
  onShareSection?: (section: AlbumSection) => void;
  /** The desktop app's: 32px rows in 13px type, for a rail 160px wide. */
  dense?: boolean;
}) {
  const [naming, setNaming] = useState<{ id?: string; initial: string } | null>(null);
  const [deleting, setDeleting] = useState<AlbumSection | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const create = useCreateSection(albumId);
  const rename = useRenameSection(albumId);
  const reorder = useReorderSections(albumId);
  const remove = useDeleteSection(albumId);
  const list = entries(counts);

  const move = (id: string, step: -1 | 1) => {
    const ids = counts.sections.map((section) => section.id);
    const from = ids.indexOf(id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    reorder.mutate(ids, { onError: (error) => toast.error('Could not reorder', { description: problem(error) }) });
  };

  const save = (name: string) => {
    const target = naming;
    setNaming(null);
    if (!target) return;
    if (target.id) {
      rename.mutate(
        { id: target.id, name },
        { onError: (error) => toast.error('Could not rename', { description: problem(error) }) },
      );
    } else {
      create.mutate(name, {
        onSuccess: (section) => onChange(section.id),
        onError: (error) => toast.error('Could not add the section', { description: problem(error) }),
      });
    }
  };

  const dropProps = (entry: Entry) =>
    entry.dropTo === undefined || !canManage
      ? {}
      : {
          onDragOver: (event: DragEvent) => {
            if (!event.dataTransfer.types.includes(ALBUM_FILES_DRAG)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setOver(entry.key);
          },
          onDragLeave: () => setOver((current) => (current === entry.key ? null : current)),
          onDrop: (event: DragEvent) => {
            const raw = event.dataTransfer.getData(ALBUM_FILES_DRAG);
            setOver(null);
            if (!raw) return;
            event.preventDefault();
            try {
              const keys = JSON.parse(raw) as unknown;
              if (Array.isArray(keys) && keys.every((key) => typeof key === 'string')) {
                onDropFiles(keys, entry.dropTo ?? null);
              }
            } catch {
              // Not ours: ignore.
            }
          },
        };

  const menu = (section: AlbumSection, index: number) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Options for ${section.name}`}
          className={cn(
            'shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
            dense ? 'size-6' : 'size-7',
          )}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onShareSection && (
          <>
            <DropdownMenuItem onSelect={() => onShareSection(section)}>
              <Link2 className="size-4" />
              Client link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => setNaming({ id: section.id, initial: section.name })}>
          <Pencil className="size-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem disabled={index === 0} onSelect={() => move(section.id, -1)}>
          <ArrowUp className="size-4" />
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem disabled={index === counts.sections.length - 1} onSelect={() => move(section.id, 1)}>
          <ArrowDown className="size-4" />
          Move down
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(section)}>
          <Trash2 className="size-4" />
          Delete section
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      {layout === 'rail' ? (
        <nav aria-label="Sections" className="flex flex-col gap-0.5">
          <p className={cn('pb-1.5 text-xs font-semibold text-muted-foreground', dense ? 'px-2' : 'px-2.5')}>
            Sections
          </p>
          {list.map((entry) => {
            const active = value === entry.key;
            const index = entry.section ? counts.sections.indexOf(entry.section) : -1;
            const optioned = canManage && !!entry.section;
            return (
              <div
                key={entry.key}
                {...dropProps(entry)}
                className={cn(
                  'group flex items-center transition-colors',
                  // The chosen one is a white card on the page, as a row is in
                  // the sidebar. The desktop app's rail sits on the sheet
                  // itself, and its chosen row is the pale fill one has there.
                  dense
                    ? cn('relative h-8 rounded-lg', active ? 'bg-muted' : 'hover:bg-muted/60')
                    : cn('h-9 rounded-[10px]', active ? 'bg-card ring-1 ring-border/60' : 'hover:bg-muted'),
                  over === entry.key && 'bg-primary/10 ring-2 ring-primary ring-inset',
                )}
              >
                <button
                  type="button"
                  onClick={() => onChange(entry.key)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex h-full min-w-0 flex-1 items-center text-left',
                    dense ? 'gap-1.5 rounded-lg px-2 text-[13px]' : 'gap-2 rounded-[10px] px-2.5 text-sm',
                  )}
                >
                  {entry.key === 'picked' && (
                    <Heart
                      className={cn('shrink-0 fill-primary text-primary', dense ? 'size-3' : 'size-3.5')}
                      aria-hidden
                    />
                  )}
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate',
                      active ? 'font-semibold text-foreground' : 'font-medium text-secondary-foreground',
                    )}
                  >
                    {entry.label}
                  </span>
                  <span
                    className={cn(
                      'tabular-nums text-muted-foreground',
                      dense ? 'text-xs' : 'text-[13px] font-medium',
                      // Gives its place to the options while they show.
                      dense && optioned && COUNT_UNDER_OPTIONS,
                    )}
                  >
                    {entry.count.toLocaleString()}
                  </span>
                </button>
                {optioned && entry.section && (
                  // At 160px there is no room to keep a place for the options
                  // beside the count: they are laid over it, so the counts
                  // stay in one column down the rail.
                  <span className={dense ? 'absolute inset-y-0 right-1 flex items-center' : 'pr-1'}>
                    {menu(entry.section, index)}
                  </span>
                )}
              </div>
            );
          })}
          {canManage && (
            <button
              type="button"
              onClick={() => setNaming({ initial: '' })}
              className={cn(
                'flex items-center text-left font-medium text-muted-foreground transition-colors hover:text-foreground',
                dense ? 'h-8 gap-1.5 rounded-lg px-2 text-[13px]' : 'h-9 gap-2 rounded-[10px] px-2.5 text-sm',
              )}
            >
              <Plus className={dense ? 'size-3.5' : 'size-4'} aria-hidden />
              Add a section
            </button>
          )}
          {canManage && counts.sections.length === 0 && (
            <p className={cn('pt-1 text-xs leading-relaxed text-muted-foreground', dense ? 'px-2' : 'px-2.5')}>
              Group the album into chapters — Prep, Ceremony, Reception — and the client link shows them as chapters too.
            </p>
          )}
        </nav>
      ) : (
        // Chips where there is no room for the rail: they narrow the grid, so
        // they are the kit's, dark when chosen.
        <div
          role="group"
          aria-label="Sections"
          className={cn(
            'no-scrollbar flex items-center gap-2 overflow-x-auto py-1',
            // Out to the edges of whatever holds it: the page's gutters, or
            // the desktop app's narrower column.
            dense ? '-mx-3 px-3' : '-mx-4 px-4 sm:-mx-6 sm:px-6',
          )}
        >
          {list.map((entry) => {
            const active = value === entry.key;
            return (
              <FilterChip
                key={entry.key}
                dense={dense}
                on={active}
                count={entry.count}
                icon={
                  entry.key === 'picked' ? (
                    <Heart className={active ? 'fill-background' : 'fill-primary text-primary'} aria-hidden />
                  ) : undefined
                }
                onClick={() => onChange(entry.key)}
              >
                {entry.label}
              </FilterChip>
            );
          })}
          {canManage && (
            <button
              type="button"
              onClick={() => setNaming({ initial: '' })}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-full border border-dashed font-semibold text-muted-foreground hover:text-foreground',
                dense ? 'h-[26px] px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
              )}
            >
              <Plus className="size-3.5" aria-hidden />
              Add a section
            </button>
          )}
          {canManage && list.find((entry) => entry.key === value)?.section && (
            <span className="shrink-0">
              {menu(
                list.find((entry) => entry.key === value)!.section!,
                counts.sections.findIndex((section) => section.id === value),
              )}
            </span>
          )}
        </div>
      )}

      <NameDialog
        open={!!naming}
        initial={naming?.initial ?? ''}
        title={naming?.id ? 'Rename section' : 'New section'}
        onCancel={() => setNaming(null)}
        onSave={save}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Only the section goes. Its {deleting?.count.toLocaleString()} file{deleting?.count === 1 ? '' : 's'} stay in the album, unsorted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const section = deleting;
                setDeleting(null);
                if (!section) return;
                if (value === section.id) onChange('all');
                remove.mutate(section.id, {
                  onError: (error) => toast.error('Could not delete', { description: problem(error) }),
                });
              }}
            >
              Delete section
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function NameDialog({
  open,
  initial,
  title,
  onCancel,
  onSave,
}: {
  open: boolean;
  initial: string;
  title: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        {/* Inside the content, which unmounts on close: each opening starts
            from `initial` without an effect copying it into state. */}
        <NameForm initial={initial} title={title} onCancel={onCancel} onSave={onSave} />
      </DialogContent>
    </Dialog>
  );
}

function NameForm({
  initial,
  title,
  onCancel,
  onSave,
}: {
  initial: string;
  title: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const ready = value.trim().length > 0;

  return (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) onSave(value.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Prep, Ceremony, Reception — whatever the day was made of.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-2">
            <Label htmlFor="section-name">Name</Label>
            <Input
              id="section-name"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={60}
              placeholder="Ceremony"
              autoFocus
            />
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready}>
              Save
            </Button>
          </DialogFooter>
        </form>
  );
}
