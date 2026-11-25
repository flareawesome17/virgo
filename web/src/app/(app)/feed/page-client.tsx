'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Check, ImageIcon, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CARD } from '@/components/kit';
import { ShowcaseCard } from '@/components/showcase/showcase-card';
import { ShowcaseHost } from '@/components/showcase/showcase-host';
import { useAuth } from '@/hooks/useAuth';
import { useFeed } from '@/hooks/useShowcases';
import { cn } from '@/lib/utils';

/**
 * The feed, on a larger screen.
 *
 * One feed, one column of posts drawn the way the phone draws them (see
 * ShowcaseCard). There was an Everyone/Connections switch here; the owner
 * folded it into one feed, as the phone did.
 *
 * Posting is the bar's Create, the card at the head of the column, or the
 * button here when the feed is empty; your own posts carry their own "⋯" to
 * share, edit, make private or delete.
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

  const backToTop = () => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    top.current?.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
  };

  return (
    <Screen title="Feed">
      <ShowcaseHost>
        {/* As wide as a card: the posts are the page, and a wider column
            only spread the words under them thinner. */}
        <div ref={top} className="mx-auto w-full max-w-[572px] px-4 pb-12 pt-7">
          <PageHeader
            title="Feed"
            description="What other people are making, and how they made it."
            // On a phone the button sits above the posts, in this column.
            className="-mx-4 -mt-4 mb-4"
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
            <div className={cn(CARD, 'p-10 text-center')}>
              <p className="font-medium">Could not load the feed</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Check your connection and try again.
              </p>
              <Button className="mt-4" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className={cn(CARD, 'p-10 text-center')}>
              <ImageIcon className="mx-auto size-7 text-muted-foreground" />
              <p className="mt-3 font-medium">Nothing here yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A piece of work, and a note on how you made it. Yours could be the first.
              </p>
              <Button asChild className="mt-4">
                <Link href="/showcase/new">Post a showcase</Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-7">
              <PostPrompt />

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
                <FeedEnd onTop={backToTop} />
              )}
            </div>
          )}
        </div>
      </ShowcaseHost>
    </Screen>
  );
}

/**
 * "Show a piece of your work": the way to post, at the head of the feed.
 *
 * The bar's Create does the same. This is for whoever is reading the feed
 * and has not thought to look there. The whole card is the link; "Post" is
 * drawn as a button but is part of it.
 */
function PostPrompt() {
  const { profile, user } = useAuth();
  const name = profile?.displayName?.trim() || user?.email || '';

  return (
    <Link
      href="/showcase/new"
      className={cn(
        CARD,
        'flex min-h-14 items-center gap-3 pl-3 pr-2.5 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50',
      )}
    >
      <Avatar className="size-8">
        {profile?.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" />}
        <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-[15px] text-muted-foreground">
        Show a piece of your work
      </span>
      <span className="flex h-9 items-center gap-1.5 rounded-xl bg-muted px-3.5 text-sm font-semibold text-foreground">
        <ImageIcon aria-hidden className="size-4" />
        Post
      </span>
    </Link>
  );
}

/**
 * The end of the feed: said plainly, with the two things left to do. Both
 * quiet: every card above already has a filled button of its own.
 */
function FeedEnd({ onTop }: { onTop: () => void }) {
  return (
    <div className={cn(CARD, 'flex flex-col items-center px-5 py-6 text-center')}>
      <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-muted">
        <Check aria-hidden strokeWidth={2.4} className="size-[22px] text-secondary-foreground" />
      </span>
      <h2 className="text-[17px] font-bold leading-6">You have seen it all</h2>
      <p className="mt-1.5 text-[15px] leading-[22px] text-muted-foreground">
        That is every piece of work on the feed. Add yours, and say how you made it.
      </p>
      <div className="mt-4 flex w-full flex-wrap gap-2">
        <Button
          asChild
          variant="secondary"
          className="h-11 flex-1 rounded-xl px-4 text-[15px] font-semibold"
        >
          <Link href="/showcase/new">Post your work</Link>
        </Button>
        <Button
          variant="outline"
          className="h-11 flex-1 rounded-xl px-4 text-[15px] font-semibold"
          onClick={onTop}
        >
          Back to the top
        </Button>
      </div>
    </div>
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
