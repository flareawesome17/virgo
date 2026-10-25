'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeletedWorkspaces, useRestoreWorkspace } from '@/hooks/useWorkspaces';
import type { DeletedWorkspace } from '@/api';
import { plural, TRASH_EXPLAINER, trashLine } from '@/lib/workspaces';

/**
 * Recently deleted: the owner's deleted workspaces, for the 30 days before
 * they go for good, each with a Restore button.
 *
 * Rows do not open: a deleted workspace has nothing to open until it is back.
 * Restoring puts everything back where it was and opens it.
 */
export default function PageClient() {
  const router = useRouter();
  const { workspaces, isLoading, loadFailed, refetch } = useDeletedWorkspaces();
  const restore = useRestoreWorkspace();
  const restoring = restore.isPending ? restore.variables : null;

  const restoreOne = (workspace: DeletedWorkspace) =>
    restore.mutate(workspace.id, {
      onSuccess: () => {
        toast.success(`${workspace.name} is back`);
        router.push(`/workspaces/${workspace.id}`);
      },
      // At the plan's limit, the message says what to do about it.
      onError: (err: Error) => toast.error('Could not restore it', { description: err.message }),
    });

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
        description={isLoading ? undefined : plural(workspaces.length, 'workspace')}
      />

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 sm:px-6 py-6">
        {isLoading && workspaces.length === 0 ? (
          <div className="grid gap-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        ) : loadFailed && workspaces.length === 0 ? (
          <ErrorState message="Could not load Recently deleted." onRetry={() => refetch()} />
        ) : workspaces.length === 0 ? (
          <Card>
            <EmptyState icon={Trash2} title="Nothing deleted" description={TRASH_EXPLAINER} />
          </Card>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{TRASH_EXPLAINER}</p>
            <Card className="divide-y divide-border p-0">
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
                  <Button
                    size="sm"
                    onClick={() => restoreOne(workspace)}
                    disabled={restoring !== null}
                    aria-label={`Restore ${workspace.name}`}
                  >
                    {restoring === workspace.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                    Restore
                  </Button>
                </div>
              ))}
            </Card>
          </>
        )}
      </div>
    </Screen>
  );
}
