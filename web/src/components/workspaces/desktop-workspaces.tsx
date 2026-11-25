'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';
import { Archive, ArrowDown, ArrowUp, Folder, FolderOpen, Plus, Search } from 'lucide-react';
import { formatBytes, type Album, type MediaAccess, type Workspace } from '@/api';
import { PageHeader } from '@/components/app-shell';
import { FilterChip, HintBar, Pill } from '@/components/kit';
import { useCreate } from '@/components/shell/create';
import { EmptyState, ErrorState } from '@/components/states';
import { WorkspaceInvitations } from '@/components/workspace-invitations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { IS_WINDOWS } from '@/lib/desktop';
import { plural, relativeTime, roleInSentence } from '@/lib/workspaces';
import { cn } from '@/lib/utils';
import {
  DesktopWorkspacePane,
  DesktopWorkspacePaneSkeleton,
  PANE_UPLOAD_TRIGGER,
} from './desktop-workspace-pane';
import { workspaceCover, workspaceTint, yoursLine } from './workspace-card';

// The page's own two choices, as it keeps them.
type Scope = 'all' | 'yours' | 'shared';
type Sort = 'last_activity_at' | 'name' | 'created_at';

/** The table's columns, on its headings and on every row, so they line up. */
const COLS =
  'grid grid-cols-[minmax(150px,3fr)_70px_70px_80px_minmax(100px,2fr)_90px] items-center gap-3 px-3';

/** Under this much sheet the preview goes, and the table has the width. */
const PANE_FROM = 1000;

/** The key beside N and U, as the title bar names it beside K. */
const MOD = IS_WINDOWS ? 'Ctrl ' : '⌘';

/** Anything open over the page: its keys are its own while it is. */
const OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/** Whether a key press landed somewhere that takes typing. */
function isTyping(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  return !!el?.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
  );
}

/** Whether Enter already means something where it landed: a button or a link has its own. */
function takesEnter(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  return !!el?.closest('a[href], button, summary, [role="button"], [role="menuitem"], [role="tab"]');
}

/** Whether an element is at least this wide, kept true as the window is resized. */
function useWidthAtLeast(element: HTMLElement | null, min: number): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!element) return () => {};
      const observer = new ResizeObserver(onChange);
      observer.observe(element);
      return () => observer.disconnect();
    },
    [element],
  );
  return useSyncExternalStore(
    subscribe,
    () => (element ? element.clientWidth >= min : false),
    () => false,
  );
}

/** What a member can do across the albums they were given, if it is one thing. */
function sharedAccess(workspace: Workspace, albums: Album[]): string | null {
  const mine = albums.filter(
    (a) => a.workspace_id === workspace.id && a.my_access && a.my_access !== 'owner',
  );
  if (mine.length === 0) return null;
  const levels = new Set(mine.map((a) => a.my_access as MediaAccess));
  const count = plural(mine.length, 'album');
  if (levels.size > 1) return count;
  const [level] = [...levels];
  const verb = { view: 'view', download: 'download from', upload: 'upload to', manage: 'manage' }[level];
  return `${verb} ${count}`;
}

/**
 * Whose a workspace is, in the web tile's words: "Yours · 3 members", or its
 * owner and what you are in it. The tile builds the member's half inside
 * itself, so that half is said again here, word for word.
 */
function whoseLine(workspace: Workspace, albums: Album[]): string {
  if (workspace.is_owner) return yoursLine(workspace);
  return [
    workspace.owner.name,
    `you’re ${roleInSentence(workspace.my_role, true)}`,
    sharedAccess(workspace, albums),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * A column's heading. A button where the list can be put in that column's
 * order, plain words where it cannot: the API orders by name, by activity
 * and by age, and nothing else.
 */
function Heading({
  label,
  sorted,
  onSort,
  right = false,
}: {
  label: string;
  /** The way it runs, when this is the column the list is in order of. */
  sorted?: 'ascending' | 'descending';
  onSort?: () => void;
  right?: boolean;
}) {
  const Arrow = sorted === 'ascending' ? ArrowUp : ArrowDown;
  return (
    <span
      role="columnheader"
      aria-sort={onSort ? (sorted ?? 'none') : undefined}
      className={cn('flex min-w-0', right && 'justify-end')}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          title={`Sort by ${label.toLowerCase()}`}
          className={cn(
            'inline-flex items-center gap-1 rounded outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
            sorted && 'text-foreground',
          )}
        >
          {label}
          {sorted && <Arrow aria-hidden className="size-3" />}
        </button>
      ) : (
        label
      )}
    </span>
  );
}

/** Rows in the shape of the ones on their way. */
function RowSkeletons() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} aria-hidden className={cn(COLS, 'h-11')}>
          <span className="flex items-center gap-2.5">
            <Skeleton className="h-6 w-8 shrink-0 rounded-md" />
            <Skeleton className="h-3.5 w-2/5" />
          </span>
          <Skeleton className="ml-auto h-3 w-4" />
          <Skeleton className="ml-auto h-3 w-7" />
          <Skeleton className="ml-auto h-3 w-10" />
          <Skeleton className="h-3 w-3/5" />
          <Skeleton className="ml-auto h-3 w-8" />
        </div>
      ))}
    </>
  );
}

/**
 * Workspaces in the desktop app: a table to move through, and the one chosen
 * shown beside it.
 *
 * The web's tiles are for somebody choosing by the photograph. Here the list
 * is worked down with the arrows, so each workspace is one 44px row of what
 * can be compared (albums, files, size, whose it is, when it last moved) and
 * its photograph, albums and schedule are in the pane, without opening it.
 *
 * The page keeps the queries, the filter, the order and the search; this
 * only lays them out, and keeps which row is chosen.
 */
export function DesktopWorkspaces({
  archived,
  workspaces,
  shown,
  albums,
  loading,
  failed,
  onRetry,
  scopes,
  scoped,
  scope,
  onScope,
  counts,
  sort,
  onSort,
  search,
  onSearch,
  onShowAll,
  archivedCount,
  deletedCount,
}: {
  /** The archive, not the list. */
  archived: boolean;
  /** Everything loaded, before the filter and the search. */
  workspaces: Workspace[];
  /** What the filter and the search leave: the rows. */
  shown: Workspace[];
  /** For covers, and for what a member can do in the albums shared with them. */
  albums: Album[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  scopes: { value: Scope; label: string }[];
  /** Whether there is anything for the chips to tell apart. */
  scoped: boolean;
  scope: Scope;
  onScope: (scope: Scope) => void;
  counts: Record<Scope, number>;
  sort: Sort;
  onSort: (sort: Sort) => void;
  search: string;
  onSearch: (search: string) => void;
  onShowAll: () => void;
  archivedCount: number;
  deletedCount: number;
}) {
  const router = useRouter();
  const create = useCreate();
  // In state, not a ref: the width is read from it while rendering.
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const roomy = useWidthAtLeast(root, PANE_FROM);

  // One row is always chosen: the one last picked while it is still listed,
  // else the first. Worked out, not stored, so a search that drops the chosen
  // row moves the choice with it and needs no effect to do so.
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosen = shown.find((w) => w.id === chosenId) ?? shown[0] ?? null;
  // Whose Upload menu is open, by workspace: moving the choice closes it.
  const [uploadFor, setUploadFor] = useState<string | null>(null);

  const openWorkspace = (id: string) => router.push(`/workspaces/${id}`);
  // Through Create, as its menu does, so the plan's limit is checked first.
  const newWorkspace = () => create.open('workspace');

  // The page's keys: the arrows move the choice, Enter opens it, and with
  // Ctrl, N starts a workspace and U an upload to the one chosen.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (isTyping(event.target) || document.querySelector(OVERLAY)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const held = event.ctrlKey || event.metaKey;

    if (held && !event.altKey && !event.shiftKey) {
      if (key === 'n') {
        event.preventDefault();
        if (!event.repeat) newWorkspace();
      } else if (key === 'u') {
        // Only where the pane shows an Upload: the key does what the button does.
        if (!chosen || !root?.querySelector(PANE_UPLOAD_TRIGGER)) return;
        event.preventDefault();
        if (!event.repeat) setUploadFor(chosen.id);
      }
      return;
    }
    if (held || event.altKey || event.shiftKey || !chosen) return;

    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      const at = shown.findIndex((w) => w.id === chosen.id) + (key === 'ArrowDown' ? 1 : -1);
      const next = shown[Math.min(shown.length - 1, Math.max(0, at))];
      setChosenId(next.id);
      const row = root?.querySelector<HTMLElement>(`[data-row="${CSS.escape(next.id)}"]`);
      if (!row) return;
      // Focus goes along only when a row had it: a press from anywhere else
      // on the page moves the choice without taking focus from where it was.
      if (document.activeElement?.hasAttribute('data-row')) row.focus({ preventScroll: true });
      row.scrollIntoView({ block: 'nearest' });
    } else if (key === 'Enter' && !event.repeat && !takesEnter(event.target)) {
      event.preventDefault();
      openWorkspace(chosen.id);
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const firstLoad = loading && workspaces.length === 0;
  const query = search.trim();
  // The web's own order for each: names from A, the rest newest first.
  const sortedBy = (column: Sort) =>
    sort === column ? (column === 'name' ? 'ascending' : 'descending') : undefined;

  return (
    <>
      <PageHeader
        // No way back drawn here: the title bar has back and forward.
        title={archived ? 'Archived' : 'Workspaces'}
        beside={
          scoped ? (
            <div role="group" aria-label="Show" className="flex items-center gap-2">
              {scopes.map(({ value, label }) => (
                <FilterChip
                  key={value}
                  dense
                  on={scope === value}
                  // With how many each holds, so the choice is not a guess.
                  count={counts[value]}
                  onClick={() => onScope(value)}
                >
                  {label}
                </FilterChip>
              ))}
            </div>
          ) : undefined
        }
        actions={
          <>
            {/* At the height of the shell's Create, which they sit beside. */}
            <div className="relative w-40 min-[1100px]:w-[220px]">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 size-[13px] -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="workspace-search"
                type="search"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search workspaces"
                aria-label="Search workspaces"
                className="h-7 rounded-lg bg-card pl-8 text-[13px] md:text-[13px]"
              />
            </div>
            {/* Quiet: the filled one in this bar is the shell's Create. */}
            <Button variant="secondary" size="sm" onClick={newWorkspace}>
              <Plus />
              New workspace
            </Button>
          </>
        }
      />

      <div ref={setRoot} className="flex h-full min-h-0 flex-col text-[13px]">
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-2 pb-2">
            {/* Above the table on purpose: an invitation is the one thing
                here that expires on someone else's patience. */}
            {!archived && (
              <div className="px-1 pt-3 empty:hidden">
                <WorkspaceInvitations />
              </div>
            )}

            {failed && workspaces.length === 0 && !firstLoad ? (
              // Not "No workspaces yet": that would tell someone their own
              // work is gone when the request simply never arrived.
              <div className="p-3">
                <ErrorState message="Could not load your workspaces." onRetry={onRetry} />
              </div>
            ) : shown.length === 0 && !firstLoad ? (
              <div className="grid flex-1 place-items-center">
                {workspaces.length > 0 ? (
                  // Narrowed down to nothing, which is not the same as having none.
                  <EmptyState
                    icon={Search}
                    title="Nothing matches"
                    description={query ? `No workspace matches “${query}”.` : 'Nothing here yet.'}
                    action={
                      <Button variant="secondary" onClick={onShowAll}>
                        Show all
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={archived ? Archive : FolderOpen}
                    title={archived ? 'Nothing archived' : 'No workspaces yet'}
                    description={
                      archived
                        ? 'Archive a workspace from its settings when the job is done.'
                        : 'A workspace holds the albums, schedule and people for one client.'
                    }
                    action={
                      archived ? undefined : (
                        // Quiet here: the filled button on this screen is Create, in the bar.
                        <Button variant="secondary" onClick={newWorkspace}>
                          <Plus className="size-4" />
                          Create your first workspace
                        </Button>
                      )
                    }
                  />
                )}
              </div>
            ) : (
              <div
                role="grid"
                aria-label={archived ? 'Archived workspaces' : 'Workspaces'}
                aria-busy={firstLoad}
                className="flex flex-col gap-0.5"
              >
                <div
                  role="row"
                  className={cn(
                    COLS,
                    'sticky top-0 z-[1] h-10 bg-background pt-2 text-xs font-semibold text-muted-foreground',
                  )}
                >
                  <Heading label="Name" sorted={sortedBy('name')} onSort={() => onSort('name')} />
                  <Heading label="Albums" right />
                  <Heading label="Files" right />
                  <Heading label="Size" right />
                  <Heading label="Who" />
                  <Heading
                    label="Last activity"
                    right
                    sorted={sortedBy('last_activity_at')}
                    onSort={() => onSort('last_activity_at')}
                  />
                </div>

                {firstLoad ? (
                  <RowSkeletons />
                ) : (
                  shown.map((workspace) => {
                    const on = workspace.id === chosen?.id;
                    const cover = workspaceCover(workspace, albums);
                    return (
                      <div
                        key={workspace.id}
                        role="row"
                        aria-selected={on}
                        // The chosen row is the list's one stop for Tab.
                        tabIndex={on ? 0 : -1}
                        data-row={workspace.id}
                        onClick={() => setChosenId(workspace.id)}
                        onDoubleClick={() => openWorkspace(workspace.id)}
                        className={cn(
                          COLS,
                          // The margins keep a row the arrows reach clear of the headings.
                          'min-h-11 cursor-default select-none scroll-mb-2 scroll-mt-10 rounded-[10px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
                          on ? 'bg-muted' : 'hover:bg-muted/50',
                        )}
                      >
                        <span role="gridcell" className="flex min-w-0 items-center gap-2.5">
                          <span
                            aria-hidden
                            className="grid h-6 w-8 shrink-0 place-items-center overflow-hidden rounded-md"
                            style={{ backgroundColor: workspaceTint(workspace) }}
                          >
                            {cover ? (
                              // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, not an asset to optimise
                              <img src={cover} alt="" loading="lazy" className="size-full object-cover" />
                            ) : (
                              <Folder
                                className="size-3.5"
                                style={{ color: workspace.accent_color || 'var(--primary)' }}
                              />
                            )}
                          </span>
                          <span className="truncate font-semibold">{workspace.name}</span>
                          {workspace.archived_at && <Pill>Archived</Pill>}
                        </span>
                        <span role="gridcell" className="text-right tabular-nums">
                          {workspace.album_count.toLocaleString()}
                        </span>
                        <span role="gridcell" className="text-right tabular-nums">
                          {workspace.media_count.toLocaleString()}
                        </span>
                        {/* Blank for a member: the API keeps the owner's storage to itself. */}
                        <span role="gridcell" className="text-right tabular-nums">
                          {workspace.storage_bytes ? formatBytes(workspace.storage_bytes) : ''}
                        </span>
                        <span role="gridcell" className="truncate text-secondary-foreground">
                          {whoseLine(workspace, albums)}
                        </span>
                        <span role="gridcell" className="text-right text-muted-foreground">
                          <time dateTime={workspace.last_activity_at}>
                            {relativeTime(workspace.last_activity_at)}
                          </time>
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Places to go, not work: two quiet words under the last row. */}
            {!archived && (archivedCount > 0 || deletedCount > 0) && (
              <nav aria-label="Archived and deleted" className="flex gap-4 px-3 pb-1 pt-3 text-xs">
                {archivedCount > 0 && (
                  <Link
                    href="/workspaces?archived=1"
                    className="font-semibold text-secondary-foreground hover:text-foreground hover:underline"
                  >
                    Archived · {archivedCount.toLocaleString()}
                  </Link>
                )}
                {deletedCount > 0 && (
                  <Link
                    href="/workspaces/deleted"
                    className="font-semibold text-secondary-foreground hover:text-foreground hover:underline"
                  >
                    Recently deleted · {deletedCount.toLocaleString()}
                  </Link>
                )}
              </nav>
            )}
          </div>

          {/* Its own albums and schedule load inside it: the table never waits. */}
          {roomy &&
            (chosen ? (
              <DesktopWorkspacePane
                key={chosen.id}
                workspace={chosen}
                whose={whoseLine(chosen, albums)}
                listAlbums={albums}
                uploadOpen={uploadFor === chosen.id}
                onUploadOpenChange={(open) => setUploadFor(open ? chosen.id : null)}
              />
            ) : firstLoad ? (
              <DesktopWorkspacePaneSkeleton />
            ) : null)}
        </div>

        <HintBar
          className="shrink-0"
          hints={[
            ['↑ ↓', 'Move'],
            ['Enter', 'Open'],
            [`${MOD}N`, 'New workspace'],
            // The upload is the pane's, so its key goes when the pane does.
            ...(roomy ? ([[`${MOD}U`, 'Upload to the one chosen']] as [string, string][]) : []),
          ]}
        />
      </div>
    </>
  );
}
