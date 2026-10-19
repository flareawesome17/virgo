'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ImageIcon, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ShowcaseCard } from '@/components/showcase/showcase-card';
import { ShowcaseHost } from '@/components/showcase/showcase-host';
import { useFeed } from '@/hooks/useShowcases';
import { cn } from '@/lib/utils';

/**
 * The feed, on a larger screen.
 *
 * One feed, one column of posts drawn the way the big feeds have taught
 * everybody to read one (see ShowcaseCard). There was an Everyone/Connections
 * switch here; the owner folded it into one feed, as the phone did.
 *
 * Posting is the bar's Create, or the button here when the feed is empty;
 * your own posts carry their own "…" to share, edit, make private or delete.
 */
export default function PageClient() {
  const {
    items,
    isLoading,
    loadFailed,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useFeed('everyone');
  const top = useRef<HTMLDivElement>(null);

  /*
   * Asked for, never done behind somebody's back. The feed no longer
   * refetches on focus or when it goes stale — doing so pushed new posts in
   * at the top and moved whatever was being read — so this is how new posts
   * arrive. Back to the top afterwards, which is where they are.
   */
  const refresh = () => {
    void refetch().then((result) => {
      if (result.isError) {
        toast.error("Couldn't refresh the feed", {
          description: 'Check your connection and try again.',
        });
        return;
      }
      top.current?.scrollIntoView({ block: 'start' });
    });
  };

  return (
    <Screen title="Feed">
      <ShowcaseHost>
        {/* As wide as a card: the posts are the page, and a wider column
            only spread the words under them thinner. */}
        <div ref={top} className="mx-auto w-full max-w-[532px] px-4 py-6">
          <PageHeader
            title="Feed"
            description="What other people are making, and how they made it."
            // On a phone the button sits above the posts, in this column.
            className="-mx-4 -mt-3 mb-4"
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={refresh}
                disabled={isLoading || isRefetching}
              >
                <RefreshCw className={cn(isRefetching && 'animate-spin')} />
                {isRefetching ? 'Refreshing…' : 'Refresh'}
              </Button>
            }
          />

          {isLoading ? (
            <div className="grid place-items-center py-20 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : loadFailed && items.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="font-medium">Could not load the feed</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Check your connection and try again.
              </p>
              <Button className="mt-4" onClick={() => void refetch()}>
                Try again
              </Button>
            </Card>
          ) : items.length === 0 ? (
            <Card className="p-10 text-center">
              <ImageIcon className="mx-auto size-7 text-muted-foreground" />
              <p className="mt-3 font-medium">Nothing here yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A piece of work, and a note on how you made it. Yours could be the first.
              </p>
              <Button asChild className="mt-4">
                <Link href="/showcase/new">Post a showcase</Link>
              </Button>
            </Card>
          ) : (
            <div className="grid gap-6">
              {items.map((item, i) => (
                <ShowcaseCard key={item.id} item={item} priority={i === 0} />
              ))}

              {isFetchNextPageError ? (
                // A failed page looked like the end of the feed, with nothing
                // to try again with.
                <div className="grid place-items-center gap-2 py-4 text-sm text-muted-foreground">
                  <p>Couldn&rsquo;t load more.</p>
                  <Button variant="secondary" onClick={() => void fetchNextPage()}>
                    Try again
                  </Button>
                </div>
              ) : hasNextPage ? (
                <MoreOnScroll loading={isFetchingNextPage} onReach={() => void fetchNextPage()} />
              ) : (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  You&rsquo;re all caught up.
                </p>
              )}
            </div>
          )}
        </div>
      </ShowcaseHost>
    </Screen>
  );
}

/**
 * The next page, fetched as the end of the feed comes into view, as the phone
 * does. It was a "Show more" button every twelve cards. The button stays, for
 * a browser without IntersectionObserver and for anyone who gets there first.
 */
function MoreOnScroll({ loading, onReach }: { loading: boolean; onReach: () => void }) {
  const marker = useRef<HTMLDivElement>(null);
  const reach = useRef(onReach);
  const busy = useRef(loading);
  useEffect(() => {
    reach.current = onReach;
    busy.current = loading;
  }, [onReach, loading]);

  useEffect(() => {
    const el = marker.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // A little before the end, so the next cards are there when it arrives.
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Never a second request while one is out.
        if (entry.isIntersecting && !busy.current) reach.current();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={marker} className="grid place-items-center py-4">
      <Button variant="secondary" disabled={loading} onClick={onReach}>
        {loading ? 'Loading…' : 'Show more'}
      </Button>
    </div>
  );
}
