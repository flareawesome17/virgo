'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Archive, ArrowLeft, FolderOpen, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { EmptyState, ErrorState } from '@/components/states';
import { WorkspaceInvitations } from '@/components/workspace-invitations';
import { WorkspaceCard } from '@/components/workspaces/workspace-card';
import { CreateWorkspaceDialog } from '@/components/workspaces/create-workspace-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useAlbums } from '@/hooks/useAlbums';
import { useUsage } from '@/hooks/useUsage';
import { plural } from '@/lib/workspaces';
import { cn } from '@/lib/utils';

type Scope = 'all' | 'yours' | 'shared';
type Sort = 'last_activity_at' | 'name' | 'created_at';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'last_activity_at', label: 'Recent activity' },
  { value: 'name', label: 'Name' },
  { value: 'created_at', label: 'Newest' },
];

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
  const { atWorkspaceLimit, usage, loadFailed: usageFailed } = useUsage();

  const limitReached = useCallback(() => {
    // Nothing can be bought yet, so there is no upgrade to point at.
    toast.error('Workspace limit reached', {
      description: `Your ${usage?.plan ?? 'free'} plan includes ${usage?.workspaces.limit} workspace${usage?.workspaces.limit === 1 ? '' : 's'}. Delete or archive one to add another.`,
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
  const query = search.trim().toLowerCase();
  const inScope = scope === 'yours' ? yours : scope === 'shared' ? shared : workspaces;
  const filtered = query
    ? inScope.filter(
        (w) =>
          w.name.toLowerCase().includes(query) ||
          (w.description ?? '').toLowerCase().includes(query) ||
          w.owner.name.toLowerCase().includes(query),
      )
    : inScope;
  const albumCount = workspaces.reduce((sum, w) => sum + w.album_count, 0);

  const startCreate = () => {
    if (atWorkspaceLimit) {
      limitReached();
      return;
    }
    setCreating(true);
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

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 sm:px-6 py-6">
        {/* Above the toolbar and the grid on purpose: an invitation is the one
            thing here that expires on someone else's patience. */}
        {!showArchived && <WorkspaceInvitations />}

        <div className="flex flex-wrap items-center gap-2.5">
          {!showArchived && yours.length > 0 && shared.length > 0 && (
            <div role="group" aria-label="Show" className="flex gap-0.5 rounded-[10px] bg-muted p-0.5">
              {(
                [
                  ['all', 'All'],
                  ['yours', `Yours · ${yours.length}`],
                  ['shared', `Shared with you · ${shared.length}`],
                ] as [Scope, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={scope === value}
                  onClick={() => setScope(value)}
                  className={cn(
                    'h-8 rounded-lg px-3.5 text-[13px] transition-colors',
                    scope === value
                      ? 'bg-card font-semibold text-foreground shadow-xs'
                      : 'font-medium text-secondary-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-9 w-40" aria-label="Sort by">
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

          <div className="relative w-full max-w-64 flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="workspace-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workspaces"
              aria-label="Search workspaces"
              className="h-9 pl-9"
            />
          </div>

          {!showArchived && archivedCount > 0 && (
            <Button
              variant="ghost"
              className="ml-auto text-secondary-foreground"
              onClick={() => router.push('/workspaces?archived=1')}
            >
              <Archive className="size-4" />
              Archived · {archivedCount}
            </Button>
          )}
        </div>

        {isLoading && workspaces.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        ) : loadFailed && workspaces.length === 0 ? (
          // Not "No workspaces yet" — that would tell someone their own work
          // is gone when the request simply never arrived.
          <ErrorState message="Could not load your workspaces." onRetry={() => refetch()} />
        ) : filtered.length === 0 ? (
          <Card>
            <EmptyState
              icon={showArchived ? Archive : FolderOpen}
              title={query ? 'No matches' : showArchived ? 'Nothing archived' : 'No workspaces yet'}
              description={
                query
                  ? `Nothing matched “${search.trim()}”.`
                  : showArchived
                    ? 'Archive a workspace from its settings when the job is done.'
                    : 'A workspace holds the albums, schedule and people for one client.'
              }
              action={
                query || showArchived ? undefined : (
                  <Button onClick={startCreate}>
                    <Plus className="size-4" />
                    Create your first workspace
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((workspace) => (
              <WorkspaceCard key={workspace.id} workspace={workspace} albums={albums} />
            ))}
          </div>
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
