'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Bookmark, Heart, ImageIcon, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ShowcaseFilm } from '@/components/media/showcase-film';
import { PieceCarousel, PieceImage, feedAspect } from '@/components/showcase/showcase-media';
import { ShowcaseMenu } from '@/components/showcase/showcase-menu';
import { ShowcaseReportDialog } from '@/components/showcase/report-dialog';
import { useKeepFlow } from '@/components/showcase/keep-flow';
import { useAuth } from '@/hooks/useAuth';
import { useFeed, useLike } from '@/hooks/useShowcases';
import { makerOf, type FeedItem } from '@/api';
import { cn } from '@/lib/utils';

/**
 * How wide a card's picture is drawn, for the srcset: the 672 px column less
 * its padding, or the screen less the same padding below that.
 */
const CARD_SIZES = '(max-width: 672px) calc(100vw - 48px), 624px';

/** A caption or note longer than this is cut short on the card, with "more". */
const CAPTION_CUT = 140;
const NOTE_CUT = 200;

/**
 * The feed, on a larger screen.
 *
 * A single column rather than a grid: the point of a showcase is the note
 * under it, and a grid of covers is a contact sheet, which is a different
 * thing and one the profile already does.
 *
 * Each card is the phone's: the work at its own shape, every piece of a set a
 * swipe or a click away, and a heart, a keep and a "…" that behave as they do
 * there. Posting and editing still happen on the phone.
 */
export default function PageClient() {
  const [scope, setScope] = useState<'everyone' | 'connections'>('everyone');
  const { user } = useAuth();
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
  } = useFeed(scope);
  const keepFlow = useKeepFlow(user?.id);
  const [reporting, setReporting] = useState<string | null>(null);
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
      <div ref={top} className="mx-auto w-full max-w-2xl px-6 py-6">
        <PageHeader
          title="Feed"
          description="What other people are making, and how they made it."
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

        <div className="mt-4 flex gap-2">
          {(['everyone', 'connections'] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={scope === s ? 'default' : 'secondary'}
              onClick={() => setScope(s)}
            >
              {s === 'everyone' ? 'Everyone' : 'Connections'}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-20 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : loadFailed && items.length === 0 ? (
          <Card className="mt-4 p-10 text-center">
            <p className="font-medium">Could not load the feed</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your connection and try again.
            </p>
            <Button className="mt-4" onClick={() => void refetch()}>
              Try again
            </Button>
          </Card>
        ) : items.length === 0 ? (
          <Card className="mt-4 p-10 text-center">
            <ImageIcon className="mx-auto size-7 text-muted-foreground" />
            <p className="mt-3 font-medium">
              {scope === 'connections' ? 'Nothing from your connections yet' : 'Nothing here yet'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Showcases are posted from the phone app.
            </p>
          </Card>
        ) : (
          <div className="mt-4 space-y-5">
            {items.map((item, i) => (
              <Placard
                key={item.id}
                item={item}
                mine={!!user && item.userId === user.id}
                priority={i === 0}
                onKeep={keepFlow.onKeep}
                onReport={setReporting}
              />
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
              <div className="grid place-items-center py-4">
                <Button
                  variant="secondary"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                >
                  {isFetchingNextPage ? 'Loading…' : 'Show more'}
                </Button>
              </div>
            ) : (
              <p className="py-4 text-center text-xs text-muted-foreground">
                You&rsquo;re all caught up.
              </p>
            )}
          </div>
        )}
      </div>

      {keepFlow.element}
      <ShowcaseReportDialog showcaseId={reporting} onClose={() => setReporting(null)} />
    </Screen>
  );
}

function Placard({
  item,
  mine,
  priority,
  onKeep,
  onReport,
}: {
  item: FeedItem;
  /**
   * Your own post. Your own work is in the feed, and offering to keep it, hire
   * you or report it is either refused by the server or absurd.
   */
  mine: boolean;
  /** The first card, whose picture is what the page is waiting on. */
  priority: boolean;
  onKeep: (item: FeedItem) => void;
  onReport: (showcaseId: string) => void;
}) {
  // By id, so a fast double click is queued rather than raced, and the
  // server's count — everyone else's likes included — is written back.
  const like = useLike(item.id);
  // Never read straight off the payload: see makerOf.
  const maker = makerOf(item);
  const aspect = feedAspect(item.pieces[0]);
  const href = `/showcase/${item.id}`;
  const label = item.title ?? `${maker.displayName}'s showcase`;
  // Your own profile needs no published handle; anybody else's is only
  // reachable once they have published one.
  const profileHref = mine ? '/profile' : maker.handle ? `/u/${maker.handle}` : null;

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {item.pieces.length > 0 && (
        <PieceCarousel
          pieces={item.pieces}
          aspect={aspect}
          label={label}
          renderPage={(piece, i) =>
            // A film is its own control, so it is not wrapped in the link to
            // the post — a click meant for play would otherwise navigate
            // away from the thing it was meant to start.
            piece.kind === 'video' ? (
              <ShowcaseFilm piece={piece} alt={item.title ?? ''} aspect={aspect} />
            ) : (
              <Link
                href={href}
                aria-label={`${label}. Open the post.`}
                draggable={false}
                className="block size-full"
              >
                <PieceImage
                  piece={piece}
                  alt={item.title ?? ''}
                  sizes={CARD_SIZES}
                  priority={priority && i === 0}
                />
              </Link>
            )
          }
        />
      )}

      <div className={cn('p-5', item.pieces.length > 1 && 'pt-3')}>
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-sm font-bold text-primary">
            {maker.avatarUrl ? (
              <Image src={maker.avatarUrl} alt="" width={36} height={36} />
            ) : (
              maker.displayName.charAt(0).toUpperCase()
            )}
          </span>
          <div className="min-w-0 flex-1">
            {profileHref ? (
              <Link href={profileHref} className="text-sm font-bold hover:underline">
                {maker.displayName}
              </Link>
            ) : (
              <p className="text-sm font-bold">{maker.displayName}</p>
            )}
            <p className="truncate text-xs text-muted-foreground">
              {[maker.title, item.location].filter(Boolean).join(' · ')}
            </p>
          </div>
          {item.showHire && maker.handle && !mine && (
            <Button asChild size="sm">
              <Link href={`/hire/${maker.handle}`}>Hire</Link>
            </Button>
          )}
          {!mine && <ShowcaseMenu maker={maker} onReport={() => onReport(item.id)} />}
        </div>

        {item.title && (
          <h2 className="mt-3 text-[17px] font-semibold">
            <Link href={href} className="hover:underline">
              {item.title}
            </Link>
          </h2>
        )}
        {item.caption && (
          <p className="mt-1 line-clamp-3 text-sm leading-6 text-muted-foreground">
            {item.caption}
          </p>
        )}
        {item.caption && item.caption.length > CAPTION_CUT && <More href={href} />}

        {(item.craftNote || item.craftTags.length > 0) && (
          <div className="mt-4 border-t pt-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
              How it was made
            </p>
            {item.craftNote && (
              <p className="mt-1.5 line-clamp-4 text-sm leading-6">{item.craftNote}</p>
            )}
            {item.craftNote && item.craftNote.length > NOTE_CUT && <More href={href} />}
            {item.craftTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {item.craftTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center gap-4 border-t pt-4 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => like.mutate({ showcaseId: item.id, liked: !item.likedByMe })}
            className={cn(
              'flex items-center gap-1.5 font-medium transition-colors hover:text-foreground',
              item.likedByMe && 'text-destructive hover:text-destructive',
            )}
            aria-pressed={item.likedByMe}
            aria-label={
              item.likedByMe
                ? `Liked, ${item.likeCount}. Click to unlike.`
                : `Like. ${item.likeCount} so far.`
            }
          >
            <Heart className={cn('size-4', item.likedByMe && 'fill-current')} />
            {item.likeCount > 0 ? item.likeCount : 'Like'}
          </button>
          <Link
            href={`${href}#comments`}
            className="flex items-center gap-1.5 font-medium transition-colors hover:text-foreground"
            aria-label={
              item.commentCount > 0 ? `${item.commentCount} comments. Open the post.` : 'Comment'
            }
          >
            <MessageCircle className="size-4" />
            {item.commentCount > 0 ? item.commentCount : 'Comment'}
          </Link>

          {mine ? (
            // Keeping your own work is refused, so it is not offered; how
            // many people kept it is what is worth seeing on your own post.
            item.keptCount > 0 && (
              <span className="ml-auto flex items-center gap-1.5 font-medium">
                <Bookmark className="size-4" />
                {item.keptCount} kept
              </span>
            )
          ) : (
            <Button
              size="sm"
              variant={item.keptByMe ? 'secondary' : 'default'}
              onClick={() => onKeep(item)}
              aria-pressed={item.keptByMe}
              aria-label={item.keptByMe ? 'Kept. Change where.' : 'Keep this'}
              className={cn('ml-auto', item.keptByMe && 'text-primary')}
            >
              {/* Filled once it is yours: an outline that means "kept" and an
                  outline that means "keep" are the same picture. */}
              <Bookmark className={cn(item.keptByMe && 'fill-current')} />
              {item.keptByMe ? 'Kept' : 'Keep'}
              {item.keptCount > 0 ? ` · ${item.keptCount}` : ''}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/** The rest of a caption or note that the card cut short. */
function More({ href }: { href: string }) {
  return (
    <Link href={href} className="mt-0.5 inline-block text-xs font-bold text-primary hover:underline">
      more
    </Link>
  );
}
