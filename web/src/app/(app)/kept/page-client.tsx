'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bookmark, CloudOff } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { BackButton } from '@/components/back-button';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { showcaseActionMessage } from '@/components/showcase/action-message';
import { KeptGrid } from '@/components/showcase/kept-grid';
import { ShowcaseDialog } from '@/components/showcase/showcase-dialog';
import { ShowcaseHost } from '@/components/showcase/showcase-host';
import { useAllKept, useShelfActions } from '@/hooks/useShowcases';
import { queryKeys, shelvesApi, type ShelfEntry } from '@/api';

/**
 * Everything you have kept, on any shelf, newest first and once each.
 *
 * Only ever yours: it is the sum of your shelves, private ones included, so
 * nobody else is shown it. A click opens the post over the grid; one that has
 * gone since it was kept says so and offers to take it off.
 */
export default function AllKeptPage() {
  const queryClient = useQueryClient();
  const { entries, total, isLoading, loadFailed, refetch } = useAllKept();
  const { unkeep } = useShelfActions();
  const [open, setOpen] = useState<ShelfEntry | null>(null);
  const [removing, setRemoving] = useState(false);

  /*
   * Off every shelf it is on. An entry here does not say which shelves those
   * are, so they are asked for first — the same question the Keep dialog
   * asks — and it is taken off each in turn.
   */
  const takeOffEverywhere = async (entry: ShelfEntry) => {
    setRemoving(true);
    try {
      const { data } = await queryClient.fetchQuery({
        queryKey: queryKeys.shelves.holding(entry.showcaseId),
        queryFn: () => shelvesApi.mine(entry.showcaseId),
        staleTime: 0,
      });
      const holding = data.filter((shelf) => shelf.holds);
      for (const [i, shelf] of holding.entries()) {
        await unkeep.mutateAsync({
          shelfId: shelf.id,
          showcaseId: entry.showcaseId,
          stillKept: i < holding.length - 1,
        });
      }
      // Nothing held it any more (it went with the post): the list was stale.
      if (holding.length === 0) await refetch();
      setOpen(null);
      toast.success(
        holding.length > 1 ? `Taken off ${holding.length} shelves` : 'Taken off your shelf',
      );
    } catch (error) {
      toast.error("Couldn't take it off", { description: showcaseActionMessage(error, 'unkeep') });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Screen title="All kept">
      <ShowcaseHost>
        <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
          <BackButton fallback="/profile" />
        </div>
        <PageHeader
          title="All kept"
          description={total > 0 ? `${total} kept · Only you see this` : 'Only you see this'}
        />

        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {isLoading ? (
            <CenteredSpinner />
          ) : loadFailed && entries.length === 0 ? (
            <EmptyState
              icon={CloudOff}
              title="Could not load what you kept"
              description="Check your connection and try again."
              action={<Button onClick={() => void refetch()}>Try again</Button>}
            />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="Nothing kept yet"
              description="Keep work you respond to from the feed. It all gathers here, whichever shelf it is on."
              action={
                <Button asChild>
                  <Link href="/feed">Open the feed</Link>
                </Button>
              }
            />
          ) : (
            <KeptGrid entries={entries} onOpen={setOpen} />
          )}
        </div>

        <ShowcaseDialog
          showcaseId={open?.showcaseId ?? null}
          onClose={() => setOpen(null)}
          note={open?.note}
          // Only once it has gone: while it is there, its bookmark says
          // which shelves it is on and moves or takes it off them.
          removal={
            open
              ? {
                  label: 'Take it off your shelves',
                  pending: removing,
                  onRemove: () => void takeOffEverywhere(open),
                }
              : undefined
          }
        />
      </ShowcaseHost>
    </Screen>
  );
}
