'use client';

import Link from 'next/link';
import { useState, type ComponentType } from 'react';
import { Bookmark, CloudOff, ImageIcon, Loader2, Lock, Play } from 'lucide-react';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShelfMosaic, shelfCoverUrls } from '@/components/showcase/kept-grid';
import { opensInPlace } from '@/components/showcase/open-in-place';
import { ShowcaseDialog } from '@/components/showcase/showcase-dialog';
import { ShowcaseHost } from '@/components/showcase/showcase-host';
import { PieceImage } from '@/components/showcase/showcase-media';
import {
  useAllKept,
  useMyShowcases,
  useProfileTaste,
  useProfileWork,
  useShelves,
} from '@/hooks/useShowcases';
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
 * they had made. Your own list also keeps your private posts, marked, which
 * is the one place to find them again; and your private shelves, which
 * nobody else sees, after "All kept", which is everything on all of them.
 *
 * A post opens over the profile, drawn as the feed draws it, as it does from
 * a shelf: one way of looking at a post wherever it is found.
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
  const allKept = useAllKept({ enabled: isSelf });
  const work = isSelf ? ownWork : visitorWork;
  const taste = isSelf ? ownTaste : visitorTaste;
  const [open, setOpen] = useState<string | null>(null);

  // "All kept" leads your own Taste once there is anything kept at all.
  const showAllKept = isSelf && allKept.total > 0;
  const tasteLoading = taste.isLoading || (isSelf && allKept.isLoading);

  return (
    <ShowcaseHost>
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
                  <WorkTile
                    key={showcase.id}
                    showcase={showcase}
                    isSelf={isSelf}
                    onOpen={() => setOpen(showcase.id)}
                  />
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
        ) : tasteLoading ? (
          <Spinner />
        ) : taste.loadFailed && taste.shelves.length === 0 && !showAllKept ? (
          <Failed what="these shelves" onRetry={() => void taste.refetch()} />
        ) : taste.shelves.length === 0 && !showAllKept ? (
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
          <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3">
            {showAllKept && (
              <ShelfTile
                href="/kept"
                name="All kept"
                count={allKept.total}
                urls={allKept.entries.slice(0, 4).map((entry) => entry.url)}
                detail="Only you"
              />
            )}
            {taste.shelves.map((shelf) => (
              <ShelfTile
                key={shelf.id}
                // Somebody else's shelf is read through the public route; the
                // default is your own, and asking for a shelf that is not
                // yours there answers 404.
                href={
                  isSelf
                    ? `/shelf/${shelf.id}`
                    : `/shelf/${shelf.id}?own=0&name=${encodeURIComponent(shelf.name)}`
                }
                name={shelf.name}
                count={shelf.count}
                urls={shelfCoverUrls(shelf)}
                detail={shelf.isPublic ? undefined : 'Private'}
              />
            ))}
          </ul>
        )}
      </div>

      <ShowcaseDialog showcaseId={open} onClose={() => setOpen(null)} />
    </ShowcaseHost>
  );
}

/** A shelf as a cover: up to four of the newest things on it, its name and count. */
function ShelfTile({
  href,
  name,
  count,
  urls,
  detail,
}: {
  href: string;
  name: string;
  count: number;
  urls: string[];
  /** "Private", or who sees it, when that is not everyone. */
  detail?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-label={`${name}, ${count} kept${detail ? `, ${detail.toLowerCase()}` : ''}`}
        className="group block rounded-xl outline-offset-2"
      >
        <ShelfMosaic
          urls={urls}
          className="transition-opacity group-hover:opacity-90 motion-reduce:transition-none"
        />
        <p className="mt-1.5 truncate text-[13px] font-semibold group-hover:underline">{name}</p>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {count} kept
          {detail && (
            <>
              <span aria-hidden>·</span>
              <Lock className="size-3" />
              {detail}
            </>
          )}
        </p>
      </Link>
    </li>
  );
}

/**
 * The cover of one showcase. A click opens the post over the profile; a
 * click for a new tab still goes to its own page.
 */
function WorkTile({
  showcase,
  isSelf,
  onOpen,
}: {
  showcase: Showcase;
  isSelf: boolean;
  onOpen: () => void;
}) {
  const cover = showcase.pieces[0];
  return (
    <Link
      href={`/showcase/${showcase.id}`}
      onClick={(event) => {
        if (opensInPlace(event)) onOpen();
      }}
      aria-label={showcase.title ?? 'Open this showcase'}
      className="group relative block aspect-square overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {cover && (
        <PieceImage
          piece={cover}
          alt={showcase.title ?? ''}
          sizes="(max-width: 640px) 50vw, 300px"
          className="transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
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
        <span className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/75 to-transparent p-2.5 text-[12px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          {showcase.title}
        </span>
      )}
    </Link>
  );
}

/** Only on your own work, and only when it is not out for everyone. */
function StatusBadge({ status }: { status: ShowcaseStatus }) {
  if (status === 'live') return null;
  return (
    <span
      className={cn(
        'absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
        status === 'removed' ? 'bg-destructive text-white' : 'bg-foreground/75 text-background',
      )}
    >
      {status !== 'removed' && <Lock className="size-2.5" />}
      {status === 'removed' ? 'Removed by Virgo' : 'Private'}
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
