'use client';

import { useState, type DragEvent } from 'react';
import { ArrowDown, ArrowUp, Heart, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
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
}: {
  albumId: string;
  layout: 'rail' | 'chips';
  counts: SectionCounts;
  value: SectionFilter;
  onChange: (value: SectionFilter) => void;
  canManage: boolean;
  onDropFiles: (keys: string[], sectionId: string | null) => void;
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
          className="size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
        <nav aria-label="Sections" className="space-y-1">
          <div className="flex items-center justify-between px-2 pb-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sections</p>
            {canManage && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Add a section"
                onClick={() => setNaming({ initial: '' })}
              >
                <Plus className="size-4" />
              </Button>
            )}
          </div>
          {list.map((entry) => {
            const active = value === entry.key;
            const index = entry.section ? counts.sections.indexOf(entry.section) : -1;
            return (
              <div
                key={entry.key}
                {...dropProps(entry)}
                className={cn(
                  'group flex items-center gap-1 rounded-lg transition-colors',
                  active ? 'bg-accent' : 'hover:bg-accent/60',
                  over === entry.key && 'bg-primary/10 ring-2 ring-primary ring-inset',
                )}
              >
                <button
                  type="button"
                  onClick={() => onChange(entry.key)}
                  aria-current={active ? 'true' : undefined}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left text-sm"
                >
                  {entry.key === 'picked' ? (
                    <Heart className="size-3.5 shrink-0 fill-primary text-primary" aria-hidden />
                  ) : (
                    <span
                      aria-hidden
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        entry.key === 'all' ? 'bg-foreground/60' : entry.key === 'none' ? 'bg-border' : 'bg-primary',
                      )}
                    />
                  )}
                  <span className={cn('min-w-0 flex-1 truncate', active ? 'font-semibold' : 'font-medium text-foreground/85')}>
                    {entry.label}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{entry.count.toLocaleString()}</span>
                </button>
                {canManage && entry.section && menu(entry.section, index)}
              </div>
            );
          })}
          {canManage && counts.sections.length === 0 && (
            <p className="px-2.5 pt-2 text-xs leading-relaxed text-muted-foreground">
              Group the album into chapters — Prep, Ceremony, Reception — and the client link shows them as chapters too.
            </p>
          )}
        </nav>
      ) : (
        <div role="tablist" aria-label="Sections" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
          {list.map((entry) => {
            const active = value === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChange(entry.key)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                  active ? 'border-transparent bg-foreground font-semibold text-background' : 'bg-card hover:bg-accent',
                )}
              >
                {entry.key === 'picked' && <Heart className={cn('size-3.5', active ? 'fill-background' : 'fill-primary text-primary')} aria-hidden />}
                {entry.label}
                <span className={cn('text-xs tabular-nums', active ? 'text-background/70' : 'text-muted-foreground')}>
                  {entry.count.toLocaleString()}
                </span>
              </button>
            );
          })}
          {canManage && (
            <button
              type="button"
              onClick={() => setNaming({ initial: '' })}
              className="flex shrink-0 items-center gap-1 rounded-full border border-dashed px-3.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" aria-hidden />
              Section
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
