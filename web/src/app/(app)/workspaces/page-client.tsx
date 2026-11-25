'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Archive, ArrowLeft, ChevronRight, FolderOpen, Plus, Search, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { CARD, FilterChip } from '@/components/kit';
import { EmptyState, ErrorState } from '@/components/states';
import { WorkspaceInvitations } from '@/components/workspace-invitations';
import { WorkspaceCard } from '@/components/workspaces/workspace-card';
import { CreateWorkspaceDialog } from '@/components/workspaces/create-workspace-dialog';
import { DesktopWorkspaces } from '@/components/workspaces/desktop-workspaces';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDeletedWorkspaces, useWorkspaces } from '@/hooks/useWorkspaces';
import { useAlbums } from '@/hooks/useAlbums';
import { useUsage } from '@/hooks/useUsage';
import { IS_DESKTOP } from '@/lib/desktop';
import { plural } from '@/lib/workspaces';
import { cn } from '@/lib/utils';

type Scope = 'all' | 'yours' | 'shared';
type Sort = 'last_activity_at' | 'name' | 'created_at';

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'yours', label: 'Yours' },
  { value: 'shared', label: 'Shared with you' },
];

const SORTS: { value: Sort; label: string }[] = [
  { value: 'last_activity_at', label: 'Recent activity' },
  { value: 'name', label: 'Name' },
  { value: 'created_at', label: 'Newest' },
];

/** As many across as fit at 300px each, and one across on a phone. */
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-x-5 gap-y-7';

/** A place to go from the end of the list: its name, how many are in it, a chevron. */
function PlaceRow({
  href,
  icon: Icon,
  label,
  count,
  divided,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  count: number;
  divided: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={`${label}, ${count}`}
      className={cn(
        'flex min-h-[52px] items-center gap-3 px-4 transition-colors hover:bg-muted/50',
        divided && 'border-t border-border/40',
      )}
    >
      <Icon className="size-[18px] shrink-0 text-secondary-foreground" aria-hidden />
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <span className="text-[13px] tabular-nums text-muted-foreground">{count}</span>
      <ChevronRight className="size-[15px] shrink-0 text-muted-foreground/70" aria-hidden />
    </Link>
  );
}

function WorkspacesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<Scope>('all');
  const [sort, setSort] = useState<Sort>('last_activity_at');
  const showArchived = searchParams.get('archived') === '1';

  const { workspaces, archivedCount, isLoading, loadFailed, refetch } = useWorkspaces({
    limit: 100,
    orderBy: sort,
    direction: sort === 'name' ? 'asc' : 'desc',
    archived: showArchived ? 'only' : 'exclude',
  });
  // For covers, and for what a member can do in the albums shared with them.
  const { albums } = useAlbums({ limit: 100 });
  // Beside the archive, so a workspace deleted by mistake is found where it was.
  const { workspaces: deleted } = useDeletedWorkspaces();
  const { atWorkspaceLimit, usage, loadFailed: usageFailed } = useUsage();

  const limitReached = useCallback(() => {
    // Nothing can be bought yet, so there is no upgrade to point at.
    toast.error('Workspace limit reached', {
      description: `Your ${usage?.plan ?? 'free'} plan includes ${usage?.workspaces.limit} workspace${usage?.workspaces.limit === 1 ? '' : 's'}. Archived ones count too, so delete one you have finished with to add another.`,
    });
  }, [usage]);

  // ?new=1 opens the dialog, so "New workspace" links from anywhere land here
  // already open rather than needing a second click. Applied during render
  // when the link arrives, rather than in an effect; the effect only takes it
  // back out of the URL, so a refresh does not reopen the dialog.
  //
  // It waits for the plan to be known and is held to the same limit as the
  // button. The link used to open the form regardless, so somebody at the
  // limit filled it in and was then refused by the server.
  const linkedNew = searchParams.get('new') === '1';
  const usageKnown = usage !== undefined || usageFailed;
  const [appliedNew, setAppliedNew] = useState(false);
  if (linkedNew && usageKnown && !appliedNew) {
    setAppliedNew(true);
    if (!atWorkspaceLimit) setCreating(true);
  }
  if (!linkedNew && appliedNew) setAppliedNew(false);

  useEffect(() => {
    if (!linkedNew || !appliedNew) return;
    if (atWorkspaceLimit) limitReached();
    router.replace('/workspaces');
  }, [linkedNew, appliedNew, atWorkspaceLimit, limitReached, router]);

  const yours = workspaces.filter((w) => w.is_owner);
  const shared = workspaces.filter((w) => !w.is_owner);
  // Only when there is something to tell apart: a filter with one side empty
  // is a control that does nothing. And only while its chips are on the page,
  // so the archive is never narrowed by a choice nobody can see or undo.
  const scoped = !showArchived && yours.length > 0 && shared.length > 0;
  const query = search.trim().toLowerCase();
  const inScope = scoped && scope === 'yours' ? yours : scoped && scope === 'shared' ? shared : workspaces;
  const filtered = query
    ? inScope.filter(
        (w) =>
          w.name.toLowerCase().includes(query) ||
          (w.description ?? '').toLowerCase().includes(query) ||
          w.owner.name.toLowerCase().includes(query),
      )
    : inScope;
  const albumCount = workspaces.reduce((sum, w) => sum + w.album_count, 0);
  const counts: Record<Scope, number> = {
    all: workspaces.length,
    yours: yours.length,
    shared: shared.length,
  };

  const startCreate = () => {
    if (atWorkspaceLimit) {
      limitReached();
      return;
    }
    setCreating(true);
  };

  const showAll = () => {
    setSearch('');
    setScope('all');
  };

  const summary = showArchived
    ? `${plural(workspaces.length, 'archived workspace')}`
    : [
        yours.length > 0 && `${yours.length} yours`,
        shared.length > 0 && `${shared.length} shared with you`,
        plural(albumCount, 'album'),
      ]
        .filter(Boolean)
        .join(' · ');

  // The desktop app's own layout: a table with the chosen workspace beside
  // it. The queries, the filter, the order and the search are the ones
  // above, handed over as they are; the web's grid below is untouched.
  if (IS_DESKTOP) {
    return (
      <Screen title="Workspaces">
        <DesktopWorkspaces
          archived={showArchived}
          workspaces={workspaces}
          shown={filtered}
          albums={albums}
          loading={isLoading}
          failed={loadFailed}
          onRetry={() => refetch()}
          scopes={SCOPES}
          scoped={scoped}
          scope={scope}
          onScope={setScope}
          counts={counts}
          sort={sort}
          onSort={setSort}
          search={search}
          onSearch={setSearch}
          onShowAll={showAll}
          archivedCount={archivedCount}
          deletedCount={deleted.length}
        />
        {/* Still here for a ?new=1 link, which opens it from the page. */}
        <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
      </Screen>
    );
  }

  return (
    <Screen title="Workspaces">
      <PageHeader
        title={
          showArchived ? (
            <span className="flex items-center gap-2">
              <Button size="icon" variant="ghost" className="-ml-2 shrink-0" aria-label="Back to workspaces" onClick={() => router.push('/workspaces')}>
                <ArrowLeft className="size-4" />
              </Button>
              Archived
            </span>
          ) : (
            'Workspaces'
          )
        }
        description={isLoading ? undefined : summary}
        // No "New workspace" here: that is the bar's Create, as on the
        // phone. The empty state keeps its own, for a first one.
      />

      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-12 pt-6 sm:px-6">
        {/* Above the toolbar and the grid on purpose: an invitation is the one
            thing here that expires on someone else's patience. */}
        {!showArchived && <WorkspaceInvitations />}

        <div className="flex flex-wrap items-center gap-2">
          {scoped && (
            <div role="group" aria-label="Show" className="flex flex-wrap items-center gap-2">
              {SCOPES.map(({ value, label }) => (
                <FilterChip
                  key={value}
                  on={scope === value}
                  // With how many each holds, so the choice is not a guess.
                  count={counts[value]}
                  onClick={() => setScope(value)}
                >
                  {label}
                </FilterChip>
              ))}
            </div>
          )}

          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger
                className="w-40 shrink-0 rounded-[10px] bg-card font-semibold data-[size=default]:h-9"
                aria-label="Sort by"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative min-w-0 flex-1 sm:w-60 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground" />
              <Input
                id="workspace-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search workspaces"
                aria-label="Search workspaces"
                className="h-9 rounded-[10px] bg-card pl-9"
              />
            </div>
          </div>
        </div>

        {isLoading && workspaces.length === 0 ? (
          <div className={GRID}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2.5">
                <Skeleton className="aspect-[16/10] rounded-[14px]" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3.5 w-1/2" />
              </div>
            ))}
          </div>
        ) : loadFailed && workspaces.length === 0 ? (
          // Not "No workspaces yet" — that would tell someone their own work
          // is gone when the request simply never arrived.
          <ErrorState message="Could not load your workspaces." onRetry={() => refetch()} />
        ) : filtered.length === 0 ? (
          <div className={CARD}>
            {workspaces.length > 0 ? (
              // Narrowed down to nothing, which is not the same as having none.
              <EmptyState
                icon={Search}
                title="Nothing matches"
                description={query ? `No workspace matches “${search.trim()}”.` : 'Nothing here yet.'}
                action={
                  <Button variant="secondary" onClick={showAll}>
                    Show all
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={showArchived ? Archive : FolderOpen}
                title={showArchived ? 'Nothing archived' : 'No workspaces yet'}
                description={
                  showArchived
                    ? 'Archive a workspace from its settings when the job is done.'
                    : 'A workspace holds the albums, schedule and people for one client.'
                }
                action={
                  showArchived ? undefined : (
                    <Button onClick={startCreate}>
                      <Plus className="size-4" />
                      Create your first workspace
                    </Button>
                  )
                }
              />
            )}
          </div>
        ) : (
          <div className={GRID}>
            {filtered.map((workspace) => (
              <WorkspaceCard key={workspace.id} workspace={workspace} albums={albums} />
            ))}
          </div>
        )}

        {/* One quiet group at the end, in the rows Settings uses: these are
            places to go, not work, so they do not look like workspaces. */}
        {!showArchived && (archivedCount > 0 || deleted.length > 0) && (
          <nav aria-label="Archived and deleted" className={cn(CARD, 'flex max-w-[560px] flex-col overflow-hidden')}>
            {archivedCount > 0 && (
              <PlaceRow
                href="/workspaces?archived=1"
                icon={Archive}
                label="Archived"
                count={archivedCount}
                divided={false}
              />
            )}
            {deleted.length > 0 && (
              <PlaceRow
                href="/workspaces/deleted"
                icon={Trash2}
                label="Recently deleted"
                count={deleted.length}
                divided={archivedCount > 0}
              />
            )}
          </nav>
        )}
      </div>

      <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </Screen>
  );
}

export default function WorkspacesPage() {
  return (
    <Suspense fallback={null}>
      <WorkspacesContent />
    </Suspense>
  );
}
