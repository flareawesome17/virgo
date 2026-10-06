'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Columns3,
  Download,
  Inbox,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Plain = string | number | null | undefined;

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Applied to the header and every cell — alignment, width, tabular-nums. */
  className?: string;
  /**
   * Sortable. A function sorts the rows already loaded; `true` hands the
   * column's id to `onSortChange` for the server to order by. Paged lists must
   * use the server: sorting one page of fifty would look like the answer and
   * not be it.
   */
  sort?: true | ((row: T) => Plain);
  /** The value written to a CSV export. Columns without one are left out. */
  csv?: (row: T) => Plain;
  /** Whether the Columns menu offers to hide it. The first column never. */
  hideable?: boolean;
  defaultHidden?: boolean;
}

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

export interface Pagination {
  offset: number;
  limit: number;
  total: number;
  onOffsetChange: (offset: number) => void;
  onLimitChange?: (limit: number) => void;
}

const PAGE_SIZES = [25, 50, 100];

/** Elements a click on a row must leave alone rather than open the row. */
const INTERACTIVE =
  'a, button, input, select, textarea, label, [role="combobox"], [role="switch"], [role="checkbox"], [role="menuitem"]';

function columnsKey(id: string) {
  return `virgo.console.columns.${id}`;
}

function loadHidden<T>(id: string, columns: Column<T>[]): Set<string> {
  try {
    const raw = localStorage.getItem(columnsKey(id));
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* blocked storage: fall back to the defaults */
  }
  return new Set(columns.filter((c) => c.defaultHidden).map((c) => c.id));
}

function toCsv<T>(columns: Column<T>[], rows: T[]): string {
  const escape = (v: Plain) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    columns.map((c) => escape(c.header)).join(','),
    ...rows.map((row) => columns.map((c) => escape(c.csv!(row))).join(',')),
  ];
  // The byte-order mark is what makes Excel read the file as UTF-8, so names
  // with ñ or an emoji survive the trip.
  return `﻿${lines.join('\r\n')}`;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Every list in the console, drawn one way.
 *
 * Termix's tables: a toolbar over a hairline frame, small uppercase headers,
 * dense rows that light up under the pointer. Loading, failed and empty are
 * kept apart inside the frame — a console that shows "no users" when the API
 * is down is lying, and this codebase has had to fix that once already.
 */
export function DataTable<T>({
  id,
  columns,
  rows,
  rowKey,
  rowHref,
  isLoading,
  isError,
  isFetching,
  onRetry,
  empty = 'Nothing here yet',
  sort,
  onSortChange,
  pagination,
  search,
  filters,
  actions,
  exportName,
  expanded,
  onRowClick,
  columnPicker = columns.length > 5,
}: {
  /** Names the saved column choice. Unique per table. */
  id: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  /** Makes the whole row open this. Ctrl/⌘ or middle click opens a new tab. */
  rowHref?: (row: T) => string;
  onRowClick?: (row: T) => void;
  isLoading: boolean;
  isError: boolean;
  /** Refetching behind data already on screen. Dims the rows. */
  isFetching?: boolean;
  onRetry?: () => void;
  empty?: string;
  /** Server-side order. Without it, sortable columns sort what is loaded. */
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  pagination?: Pagination;
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  /** Chips or selects beside the search. */
  filters?: React.ReactNode;
  /** Buttons at the right of the toolbar. */
  actions?: React.ReactNode;
  /** Offers a CSV of the rows on screen, named after this. */
  exportName?: string;
  /** A second row under a row, for detail that does not fit across. */
  expanded?: (row: T) => React.ReactNode | null;
  /** The Columns menu. Offered by default once a table is wide enough to need it. */
  columnPicker?: boolean;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState(() => loadHidden(id, columns));
  const [clientSort, setClientSort] = useState<SortState | null>(null);

  const visible = columns.filter((c, i) => i === 0 || !hidden.has(c.id));
  const hideable = columnPicker ? columns.filter((c, i) => i > 0 && c.hideable !== false) : [];
  const activeSort = onSortChange ? sort : clientSort;

  const shown = useMemo(() => {
    if (!rows || onSortChange || !clientSort) return rows;
    const column = columns.find((c) => c.id === clientSort.key);
    if (!column || typeof column.sort !== 'function') return rows;
    const value = column.sort;
    const factor = clientSort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      // Blanks last in both directions: an empty "last seen" is not the oldest.
      if (x === null || x === undefined || x === '') return 1;
      if (y === null || y === undefined || y === '') return -1;
      return (typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), undefined, { numeric: true })) * factor;
    });
  }, [rows, columns, clientSort, onSortChange]);

  function toggleSort(column: Column<T>) {
    const next: SortState =
      activeSort?.key === column.id
        ? { key: column.id, dir: activeSort.dir === 'asc' ? 'desc' : 'asc' }
        : // Numbers and dates are usually wanted biggest or newest first.
          { key: column.id, dir: 'desc' };
    if (onSortChange) onSortChange(next);
    else setClientSort(next);
  }

  function setColumnHidden(columnId: string, hide: boolean) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (hide) next.add(columnId);
      else next.delete(columnId);
      try {
        localStorage.setItem(columnsKey(id), JSON.stringify([...next]));
      } catch {
        /* the choice lasts this visit only */
      }
      return next;
    });
  }

  function onRowActivate(row: T, e: React.MouseEvent<HTMLElement>) {
    const target = e.target as HTMLElement;
    // React bubbles events from portals along the component tree, so a click
    // inside a dialog or menu opened from this row arrives here too. Only a
    // click on the row itself counts.
    if (!e.currentTarget.contains(target)) return;
    if (target.closest(INTERACTIVE)) return;
    // Selecting text in a row to copy it is not a request to open it.
    if (window.getSelection()?.toString()) return;
    if (rowHref) {
      const href = rowHref(row);
      if (e.ctrlKey || e.metaKey || e.button === 1) window.open(href, '_blank');
      else router.push(href);
    } else {
      onRowClick?.(row);
    }
  }

  const exportable = visible.filter((c) => c.csv);
  const clickable = !!rowHref || !!onRowClick;
  const showToolbar = !!(search || filters || actions || hideable.length || exportName || onRetry);

  return (
    <div className="space-y-3">
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder}
                className="h-8 w-full rounded-md border bg-background pl-8 pr-7 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              {search.value && (
                <button
                  type="button"
                  aria-label="Clear the search"
                  onClick={() => search.onChange('')}
                  className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          )}
          {filters}
          <div className="ml-auto flex items-center gap-1.5">
            {actions}
            {hideable.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Columns3 className="size-3.5" />
                    <span className="hidden sm:inline">Columns</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="caption">Show columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {hideable.map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={!hidden.has(c.id)}
                      onCheckedChange={(on) => setColumnHidden(c.id, !on)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {c.header}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {exportName && exportable.length > 0 && (
              <Button
                variant="outline"
                disabled={!shown?.length}
                title={`A CSV of the ${shown?.length ?? 0} rows on screen`}
                onClick={() => shown && download(exportName, toCsv(exportable, shown))}
              >
                <Download className="size-3.5" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            )}
            {onRetry && (
              <Button
                variant="outline"
                size="icon"
                aria-label="Refresh"
                title="Refresh"
                onClick={onRetry}
              >
                <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} />
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                {visible.map((c) => {
                  const sorted = activeSort?.key === c.id ? activeSort.dir : null;
                  return (
                    <th
                      key={c.id}
                      aria-sort={
                        sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                      }
                      className={cn('h-9 whitespace-nowrap px-3 text-left align-middle first:pl-4', c.className)}
                    >
                      {c.sort ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c)}
                          className={cn(
                            'caption -mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground',
                            sorted && 'text-foreground',
                          )}
                        >
                          {c.header}
                          {sorted === 'asc' ? (
                            <ArrowUp className="size-3" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-50" />
                          )}
                        </button>
                      ) : (
                        <span className="caption">{c.header}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className={cn('transition-opacity', isFetching && !isLoading && 'opacity-60')}>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {visible.map((c) => (
                      <td key={c.id} className="px-3 py-3 first:pl-4">
                        <Skeleton className="h-4 w-full max-w-40" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={visible.length}>
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <AlertTriangle className="size-5 text-warning" />
                      <p className="text-sm font-medium">Could not load this</p>
                      <p className="text-xs text-muted-foreground">
                        The API did not answer. This is not an empty list.
                      </p>
                      {onRetry && (
                        <Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
                          Try again
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : !shown?.length ? (
                <tr>
                  <td colSpan={visible.length}>
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <Inbox className="size-5 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">{empty}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                shown.map((row) => {
                  const detail = expanded?.(row);
                  return (
                    <Fragment key={rowKey(row)}>
                      <tr
                        onClick={clickable ? (e) => onRowActivate(row, e) : undefined}
                        onAuxClick={rowHref ? (e) => e.button === 1 && onRowActivate(row, e) : undefined}
                        className={cn(
                          'border-b transition-colors last:border-0 hover:bg-muted/40',
                          clickable && 'cursor-pointer',
                          detail && 'bg-muted/30',
                        )}
                      >
                        {visible.map((c) => (
                          <td key={c.id} className={cn('px-3 py-2.5 align-middle first:pl-4', c.className)}>
                            {c.cell(row)}
                          </td>
                        ))}
                      </tr>
                      {detail && (
                        <tr className="border-b bg-muted/20 last:border-0">
                          <td colSpan={visible.length} className="p-0">
                            {detail}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.total > 0 && <Pager {...pagination} />}
      </div>
    </div>
  );
}

function Pager({ offset, limit, total, onOffsetChange, onLimitChange }: Pagination) {
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {(offset + 1).toLocaleString()}–{Math.min(offset + limit, total).toLocaleString()} of{' '}
        {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-3">
        {onLimitChange && (
          <label className="flex items-center gap-2">
            Rows
            <Select
              value={String(limit)}
              onValueChange={(v) => {
                onLimitChange(Number(v));
                onOffsetChange(0);
              }}
            >
              <SelectTrigger size="sm" className="h-7 w-[4.5rem] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
        <span className="tabular-nums">
          Page {page} of {pages}
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={offset === 0}
            onClick={() => onOffsetChange(Math.max(0, offset - limit))}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={offset + limit >= total}
            onClick={() => onOffsetChange(offset + limit)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A row of choices over a table: status, plan, kind. */
export function FilterChips<V extends string>({
  value,
  onChange,
  options,
}: {
  value: V;
  onChange: (value: V) => void;
  options: { value: V; label: string; count?: number }[];
}) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
              on
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
            {o.count !== undefined && o.count > 0 && (
              <span className="tabular-nums opacity-70">{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
