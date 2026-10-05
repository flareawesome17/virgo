'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ComponentType } from 'react';
import { Bookmark, CloudOff, ImageIcon, Loader2, Play } from 'lucide-react';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMyShowcases, useProfileTaste, useProfileWork, useShelves } from '@/hooks/useShowcases';
import { showcaseStatus, type Showcase, type ShowcaseStatus } from '@/api';
import { cn } from '@/lib/utils';

export type WorkTasteTab = 'work' | 'taste';

/**
 * The two halves of a creative: what they made, and what they respond to.
 *
 * The phone's ProfileWorkTaste. One component for both profiles, so the page
 * somebody visits and the page you see of yourself are drawn from the same
 * shape.
 *
 * Your own reads your own lists rather than the by-handle ones. Those need a
 * handle, and posting does not, so anybody without one saw nothing over posts
 * they had made. Your own list also keeps what you took down and your drafts,
 * marked, which is the one place to find them again; and your private
 * shelves, which nobody else sees.
 */
export function ProfileWorkTaste({
  handle,
  isSelf,
  firstName,
  tab,
  onTab,
}: {
  handle: string | null;
  isSelf: boolean;
  firstName: string;
  tab: WorkTasteTab;
  onTab: (tab: WorkTasteTab) => void;
}) {
  // Both pairs are called, one of them switched off: hooks cannot be chosen
  // by a condition, only disabled by one.
  const visitorWork = useProfileWork(isSelf ? undefined : (handle ?? undefined));
  const visitorTaste = useProfileTaste(isSelf ? undefined : (handle ?? undefined));
  const ownWork = useMyShowcases({ enabled: isSelf });
  const ownTaste = useShelves({ enabled: isSelf });
  const work = isSelf ? ownWork : visitorWork;
  const taste = isSelf ? ownTaste : visitorTaste;

  return (
    <div className="mt-5">
      <Tabs value={tab} onValueChange={(v) => onTab(v as WorkTasteTab)}>
        <TabsList>
          <TabsTrigger value="work">Work</TabsTrigger>
          <TabsTrigger value="taste">Taste</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'work' ? (
        work.isLoading ? (
          <Spinner />
        ) : work.loadFailed && work.showcases.length === 0 ? (
          <Failed what="this work" onRetry={() => void work.refetch()} />
        ) : work.showcases.length === 0 ? (
          <Card className="mt-4">
            <EmptyState
              icon={ImageIcon}
              title={isSelf ? 'You have not posted anything yet' : `${firstName} has not posted yet`}
              description={
                isSelf
                  ? 'A showcase is a piece of work and a note on how you made it. It goes on your profile and into the feed.'
                  : 'When they post work, it will show up here.'
              }
              action={
                isSelf ? (
                  <Button asChild>
                    <Link href="/showcase/new">Post a showcase</Link>
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-1.5 overflow-hidden rounded-xl sm:grid-cols-3">
              {work.showcases.map((showcase) => (
                <WorkTile key={showcase.id} showcase={showcase} isSelf={isSelf} />
              ))}
            </div>
            {/* A page at a time; a visitor saw the newest 24 and no way on. */}
            {!isSelf && visitorWork.hasNextPage && (
              <div className="grid place-items-center gap-2 pt-4">
                {visitorWork.isFetchNextPageError && (
                  <p className="text-xs text-muted-foreground">Couldn&rsquo;t load more.</p>
                )}
                <Button
                  variant="secondary"
                  disabled={visitorWork.isFetchingNextPage}
                  onClick={() => void visitorWork.fetchNextPage()}
                >
                  {visitorWork.isFetchingNextPage
                    ? 'Loading…'
                    : visitorWork.isFetchNextPageError
                      ? 'Try again'
                      : 'Show more'}
                </Button>
              </div>
            )}
          </>
        )
      ) : taste.isLoading ? (
        <Spinner />
      ) : taste.loadFailed && taste.shelves.length === 0 ? (
        <Failed what="these shelves" onRetry={() => void taste.refetch()} />
      ) : taste.shelves.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={Bookmark}
            title={isSelf ? 'Nothing kept yet' : `${firstName} has not kept anything yet`}
            description={
              isSelf
                ? 'Keep work you respond to from the feed. What you keep says as much about you as what you make.'
                : 'What somebody keeps says as much about them as what they make.'
            }
            action={
              isSelf ? (
                <Button asChild>
                  <Link href="/feed">Open the feed</Link>
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {taste.shelves.map((shelf) => (
            <Link
              key={shelf.id}
              // Somebody else's shelf is read through the public route; the
              // default is your own, and asking for a shelf that is not yours
              // there answers 404.
              href={
                isSelf
                  ? `/shelf/${shelf.id}`
                  : `/shelf/${shelf.id}?own=0&name=${encodeURIComponent(shelf.name)}`
              }
              aria-label={`${shelf.name}, ${shelf.count} kept`}
              className="group block rounded-xl outline-offset-2"
            >
              <span className="relative block aspect-square overflow-hidden rounded-xl bg-muted">
                {shelf.coverUrl ? (
                  <Image
                    src={shelf.coverUrl}
                    alt=""
                    fill
                    sizes="(max-width: 900px) 50vw, 300px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <span className="grid size-full place-items-center">
                    <Bookmark className="size-5 text-muted-foreground" />
                  </span>
                )}
              </span>
              <p className="mt-1.5 truncate text-[13px] font-semibold group-hover:underline">{shelf.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {shelf.count} kept{shelf.isPublic ? '' : ' · Private'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** The cover of one showcase, opening the post. */
function WorkTile({ showcase, isSelf }: { showcase: Showcase; isSelf: boolean }) {
  const cover = showcase.pieces[0];
  return (
    <Link
      href={`/showcase/${showcase.id}`}
      aria-label={showcase.title ?? 'Open this showcase'}
      className="group relative block aspect-square overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {/* Positioned itself: next/image's `fill` is measured against its direct
          parent, not the link around it. */}
      <figure className="relative size-full">
        {cover && (
          <Image
            src={cover.url}
            alt={showcase.title ?? ''}
            fill
            sizes="(max-width: 900px) 50vw, 300px"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
        {cover?.kind === 'video' && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="grid size-10 place-items-center rounded-full bg-black/50 text-white">
              <Play size={16} fill="currentColor" />
            </span>
          </span>
        )}
        {showcase.pieces.length > 1 && (
          <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white">
            {showcase.pieces.length}
          </span>
        )}
        {isSelf && <StatusBadge status={showcaseStatus(showcase)} />}
        {showcase.title && (
          <figcaption className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/75 to-transparent p-2.5 text-[12px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            {showcase.title}
          </figcaption>
        )}
      </figure>
    </Link>
  );
}

/** Only on your own work, and only when it is not out for everyone. */
function StatusBadge({ status }: { status: ShowcaseStatus }) {
  if (status === 'live') return null;
  const label = status === 'draft' ? 'Draft' : status === 'down' ? 'Taken down' : 'Removed by Virgo';
  return (
    <span
      className={cn(
        'absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold',
        status === 'removed' ? 'bg-destructive text-white' : 'bg-foreground/75 text-background',
      )}
    >
      {label}
    </span>
  );
}

function Spinner() {
  return (
    <div className="grid place-items-center py-14 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

function Failed({ what, onRetry }: { what: string; onRetry: () => void }) {
  const Icon: ComponentType<{ className?: string }> = CloudOff;
  return (
    <Card className="mt-4">
      <EmptyState
        icon={Icon}
        title={`Could not load ${what}`}
        description="Check your connection and try again."
        action={<Button onClick={onRetry}>Try again</Button>}
      />
    </Card>
  );
}
