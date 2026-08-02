'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { FolderOpen, Images, Loader2, Plus, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell, PageHeader } from '@/components/app-shell';
import { EmptyState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateWorkspace, useWorkspaces } from '@/hooks/useWorkspaces';
import { useAlbums } from '@/hooks/useAlbums';
import { useUsage } from '@/hooks/useUsage';

function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const create = useCreateWorkspace();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, description: description.trim() || null },
      {
        onSuccess: (workspace) => {
          onOpenChange(false);
          setName('');
          setDescription('');
          router.push(`/workspaces/${workspace.id}`);
        },
        onError: (err: Error) => toast.error('Could not create workspace', {
          description: err.message,
        }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>
            A workspace holds the albums, schedule and collaborators for one
            client or one strand of work.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Reyes Wedding"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ws-description">Description</Label>
            <Textarea
              id="ws-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || create.isPending}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Create workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkspacesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const { workspaces, isLoading } = useWorkspaces({ limit: 100 });
  const { albums } = useAlbums({ limit: 200 });
  const { atWorkspaceLimit, usage } = useUsage();

  // ?new=1 opens the dialog, so "New workspace" links from anywhere land here
  // already open rather than needing a second click.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreating(true);
      router.replace('/workspaces');
    }
  }, [searchParams, router]);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? workspaces.filter(
        (w) =>
          w.name.toLowerCase().includes(query) ||
          (w.description ?? '').toLowerCase().includes(query),
      )
    : workspaces;

  const albumsFor = (workspaceId: string) =>
    albums.filter((a) => a.workspace_id === workspaceId);

  const startCreate = () => {
    if (atWorkspaceLimit) {
      toast.error('Workspace limit reached', {
        description: `Your ${usage?.plan ?? 'free'} plan includes ${usage?.workspaces.limit} workspace${usage?.workspaces.limit === 1 ? '' : 's'}. Delete one or upgrade to add another.`,
        action: { label: 'See plans', onClick: () => router.push('/settings/plans') },
      });
      return;
    }
    setCreating(true);
  };

  return (
    <AppShell title="Workspaces">
      <PageHeader
        title="Workspaces"
        description={`${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} · ${albums.length} album${albums.length === 1 ? '' : 's'}`}
        actions={
          <Button onClick={startCreate}>
            <Plus className="size-4" />
            New workspace
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="relative mb-5 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workspaces"
            className="pl-9"
          />
        </div>

        {isLoading && workspaces.length === 0 ? (
          <ListSkeleton rows={3} />
        ) : filtered.length === 0 ? (
          <Card>
            <EmptyState
              icon={FolderOpen}
              title={query ? 'No matches' : 'No workspaces yet'}
              description={
                query
                  ? `Nothing matched “${search.trim()}”.`
                  : 'A workspace holds the albums, schedule and collaborators for one client.'
              }
              action={
                query ? undefined : (
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
            {filtered.map((workspace) => {
              const workspaceAlbums = albumsFor(workspace.id);
              const cover = workspaceAlbums.find((a) => a.cover_url)?.cover_url;
              return (
                <Link key={workspace.id} href={`/workspaces/${workspace.id}`}>
                  <Card className="h-full overflow-hidden py-0 transition-colors hover:border-primary/40">
                    <div className="aspect-[16/9] bg-muted">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cover}
                          alt=""
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="grid size-full place-items-center">
                          <FolderOpen className="size-7 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <CardContent className="px-4 pb-4">
                      <p className="truncate font-semibold">{workspace.name}</p>
                      {workspace.description && (
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          {workspace.description}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Images className="size-3.5" />
                          {workspaceAlbums.length} album
                          {workspaceAlbums.length === 1 ? '' : 's'}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Users className="size-3.5" />
                          {workspace.collaborator_count ?? 0}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </AppShell>
  );
}

export default function WorkspacesPage() {
  return (
    <Suspense fallback={null}>
      <WorkspacesContent />
    </Suspense>
  );
}
