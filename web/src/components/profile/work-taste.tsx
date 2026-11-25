'use client';

import Link from 'next/link';
import { useState, type ComponentType } from 'react';
import {
  Bookmark,
  ChevronRight,
  CloudOff,
  ImageIcon,
  Loader2,
  Lock,
  Play,
  Plus,
} from 'lucide-react';
import { CARD } from '@/components/kit';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShelfMosaic, shelfCoverUrls } from '@/components/showcase/kept-grid';
import { NewShelfDialog } from '@/components/showcase/new-shelf-form';
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
 * Two across on a phone-sized window, then as many 220px tiles as fit: the
 * one grid for a profile's work and for its shelves.
 */
const TILES =
  'grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-x-5 sm:gap-y-6';

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
 * nobody else sees.
 *
 * Your own Taste leads with All kept — everything you kept, whatever shelf
 * it is on — as a row of its own, then the shelves as tiles, and last a
 * dashed tile that makes another.
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
  const [addingShelf, setAddingShelf] = useState(false);

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
              <div className={cn(TILES, 'mt-4')}>
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
          <div className="mt-4 flex flex-col gap-6">
            {showAllKept && (
              <AllKeptRow
                total={allKept.total}
                urls={allKept.entries.slice(0, 4).map((entry) => entry.url)}
              />
            )}

            <section className="flex flex-col gap-4">
              <h2 className="text-base font-bold leading-6 tracking-tight">
                Shelves{' '}
                <span className="font-medium text-muted-foreground">
                  {taste.shelves.length} {taste.shelves.length === 1 ? 'shelf' : 'shelves'}
                </span>
              </h2>
              <ul className={TILES}>
                {taste.shelves.map((shelf) => (
                  <ShelfTile
                    key={shelf.id}
                    // Somebody else's shelf is read through the public route; the
                    // default is your own, and asking for a shelf that is not
                    // yours there answers 404. It is told whose it is, too: the
                    // shelf itself does not say.
                    href={
                      isSelf
                        ? `/shelf/${shelf.id}`
                        : `/shelf/${shelf.id}?own=0&name=${encodeURIComponent(shelf.name)}&by=${encodeURIComponent(firstName)}`
                    }
                    name={shelf.name}
                    count={shelf.count}
                    urls={shelfCoverUrls(shelf)}
                    isPrivate={!shelf.isPublic}
                  />
                ))}
                {isSelf && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setAddingShelf(true)}
                      className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-muted-foreground/40 text-[15px] font-semibold text-secondary-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <Plus aria-hidden className="size-[22px]" />
                      New shelf
                    </button>
                  </li>
                )}
              </ul>
            </section>
          </div>
        )}
      </div>

      <ShowcaseDialog showcaseId={open} onClose={() => setOpen(null)} />
      {isSelf && <NewShelfDialog open={addingShelf} onClose={() => setAddingShelf(false)} />}
    </ShowcaseHost>
  );
}

/**
 * Everything you kept, whatever shelf it is on: one row across the page
 * rather than a tile among the shelves, because it is not one of them.
 */
function AllKeptRow({ total, urls }: { total: number; urls: string[] }) {
  const pieces = `${total} ${total === 1 ? 'piece' : 'pieces'}`;
  return (
    <Link
      href="/kept"
      aria-label={`All kept, ${pieces}, only you see this list`}
      className={cn(
        CARD,
        'flex min-h-[84px] items-center gap-4 py-3 pl-3 pr-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50',
      )}
    >
      <ShelfMosaic urls={urls} className="w-[60px] shrink-0 rounded-[10px]" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold leading-5">All kept</span>
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {pieces} · only you see this list
        </span>
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground/70" />
    </Link>
  );
}

/** A shelf as a cover: up to four of the newest things on it, its name and count. */
function ShelfTile({
  href,
  name,
  count,
  urls,
  isPrivate,
}: {
  href: string;
  name: string;
  count: number;
  urls: string[];
  isPrivate: boolean;
}) {
  return (
    <li className="min-w-0">
      <Link
        href={href}
        aria-label={`${name}, ${count} kept, ${isPrivate ? 'private' : 'public'}`}
        className="group flex flex-col gap-2 outline-none"
      >
        <ShelfMosaic
          urls={urls}
          className="rounded-2xl ring-ring/50 transition-opacity group-hover:opacity-90 group-focus-visible:ring-3 motion-reduce:transition-none"
        />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold leading-5">{name}</span>
          <span className="flex items-center gap-[5px] text-[13px] leading-[18px] text-muted-foreground">
            {isPrivate && <Lock aria-hidden className="size-3 shrink-0" />}
            {count} kept · {isPrivate ? 'Private' : 'Public'}
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * One showcase: its cover upright, 4:5, with its title and what kind of work
 * it is under it, as on the phone. A square cut a portrait photograph down
 * to its middle. A click opens the post over the profile; a click for a new
 * tab still goes to its own page.
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
  const about = [showcase.category, showcase.keptCount > 0 ? `${showcase.keptCount} kept` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link
      href={`/showcase/${showcase.id}`}
      onClick={(event) => {
        if (opensInPlace(event)) onOpen();
      }}
      aria-label={showcase.title ?? 'Open this showcase'}
      className="group flex min-w-0 flex-col outline-none"
    >
      <span className="relative block aspect-[4/5] overflow-hidden rounded-2xl bg-muted ring-ring/50 group-focus-visible:ring-3">
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
      </span>
      {showcase.title && (
        <span className="mt-2 truncate text-sm font-semibold leading-5">{showcase.title}</span>
      )}
      <span
        className={cn(
          'truncate text-xs leading-4 text-muted-foreground',
          !showcase.title && 'mt-2',
        )}
      >
        {about || 'Post'}
      </span>
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
