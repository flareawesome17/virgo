'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Images, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeletedAlbums, useRestoreAlbum } from '@/hooks/useAlbums';
import { useDeletedWorkspaces, useRestoreWorkspace } from '@/hooks/useWorkspaces';
import type { DeletedAlbum, DeletedWorkspace } from '@/api';
import { albumTrashLine, plural, TRASH_EXPLAINER, trashLine } from '@/lib/workspaces';

/**
 * Recently deleted: the owner's deleted albums and workspaces, for the 30
 * days before they go for good with their files, each with a Restore button.
 * Nothing here counts toward storage, which is why deleting makes room.
 *
 * Rows do not open: a deleted album or workspace has nothing to open until it
 * is back. Restoring puts everything back where it was and opens it.
 */
export default function PageClient() {
  const router = useRouter();
  const deletedWorkspaces = useDeletedWorkspaces();
  const deletedAlbums = useDeletedAlbums();
  const restoreWorkspace = useRestoreWorkspace();
  const restoreAlbum = useRestoreAlbum();
  const { workspaces } = deletedWorkspaces;
  const { albums } = deletedAlbums;

  const restoring = restoreWorkspace.isPending
    ? restoreWorkspace.variables
    : restoreAlbum.isPending
      ? restoreAlbum.variables
      : null;
  const busy = restoring !== null;

  // At the plan's limit, or without room for its files, the message says what
  // to do about it.
  const refused = (err: Error) => toast.error('Could not restore it', { description: err.message });

  const restoreOneWorkspace = (workspace: DeletedWorkspace) =>
    restoreWorkspace.mutate(workspace.id, {
      onSuccess: () => {
        toast.success(`${workspace.name} is back`);
        router.push(`/workspaces/${workspace.id}`);
      },
      onError: refused,
    });

  const restoreOneAlbum = (album: DeletedAlbum) =>
    restoreAlbum.mutate(album.id, {
      onSuccess: () => {
        toast.success(`${album.name} is back`);
        router.push(`/albums/${album.id}`);
      },
      onError: refused,
    });

  const isLoading = deletedWorkspaces.isLoading || deletedAlbums.isLoading;
  const nothing = workspaces.length === 0 && albums.length === 0;
  const loadFailed = deletedWorkspaces.loadFailed || deletedAlbums.loadFailed;
  const counts = [
    albums.length > 0 ? plural(albums.length, 'album') : null,
    workspaces.length > 0 || albums.length === 0 ? plural(workspaces.length, 'workspace') : null,
  ].filter(Boolean);

  const restoreButton = (id: string, name: string, onClick: () => void) => (
    <Button size="sm" onClick={onClick} disabled={busy} aria-label={`Restore ${name}`}>
      {restoring === id ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
      Restore
    </Button>
  );

  return (
    <Screen title="Recently deleted">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="-ml-2 shrink-0"
              aria-label="Back to workspaces"
              onClick={() => router.push('/workspaces')}
            >
              <ArrowLeft className="size-4" />
            </Button>
            Recently deleted
          </span>
        }
        description={isLoading ? undefined : counts.join(' · ')}
      />

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 sm:px-6 py-6">
        {isLoading && nothing ? (
          <div className="grid gap-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        ) : loadFailed && nothing ? (
          <ErrorState
            message="Could not load Recently deleted."
            onRetry={() => {
              void deletedWorkspaces.refetch();
              void deletedAlbums.refetch();
            }}
          />
        ) : nothing ? (
          <Card>
            <EmptyState icon={Trash2} title="Nothing deleted" description={TRASH_EXPLAINER} />
          </Card>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{TRASH_EXPLAINER}</p>
            {albums.length > 0 && (
              <Section title="Albums">
                {albums.map((album) => (
                  <div key={album.id} className="flex items-center gap-4 px-5 py-4">
                    {album.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={album.cover_url}
                        alt=""
                        loading="lazy"
                        className="size-10 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
                      >
                        <Images className="size-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{album.name}</p>
                      <p className="text-xs text-muted-foreground">{albumTrashLine(album)}</p>
                    </div>
                    {restoreButton(album.id, album.name, () => restoreOneAlbum(album))}
                  </div>
                ))}
              </Section>
            )}
            {workspaces.length > 0 && (
              <Section title="Workspaces">
                {workspaces.map((workspace) => (
                  <div key={workspace.id} className="flex items-center gap-4 px-5 py-4">
                    <span
                      aria-hidden
                      className="size-10 shrink-0 rounded-xl"
                      style={{ backgroundColor: workspace.accent_color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{workspace.name}</p>
                      <p className="text-xs text-muted-foreground">{trashLine(workspace)}</p>
                    </div>
                    {restoreButton(workspace.id, workspace.name, () => restoreOneWorkspace(workspace))}
                  </div>
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </Screen>
  );
}

/** One kind of thing in Recently deleted, under its heading. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <Card className="divide-y divide-border p-0">{children}</Card>
    </section>
  );
}
