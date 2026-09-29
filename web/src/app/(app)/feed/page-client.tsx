'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Heart, ImageIcon, Loader2, MessageCircle, Bookmark } from 'lucide-react';
import { AppShell, PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ShowcaseFilm } from '@/components/media/showcase-film';
import { useFeed, useLike } from '@/hooks/useShowcases';
import { makerOf, type FeedItem } from '@/api';
import { cn } from '@/lib/utils';

/**
 * The feed, on a larger screen.
 *
 * A single column rather than a grid: the point of a showcase is the note
 * under it, and a grid of covers is a contact sheet, which is a different
 * thing and one the profile already does.
 *
 * Liking works here — the hook is shared with the phone. Keeping and commenting
 * are not offered yet: both need UI that does not exist on the web, and a
 * button that leads nowhere is worse than its absence.
 */
export default function PageClient() {
  const [scope, setScope] = useState<'everyone' | 'connections'>('everyone');
  const { items, isLoading, loadFailed, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useFeed(scope);

  return (
    <AppShell title="Feed">
      <div className="mx-auto w-full max-w-2xl px-6 py-6">
        <PageHeader
          title="Feed"
          description="What other people are making, and how they made it."
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
            {items.map((item) => (
              <Placard key={item.id} item={item} />
            ))}

            {hasNextPage && (
              <div className="grid place-items-center py-4">
                <Button
                  variant="secondary"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                >
                  {isFetchingNextPage ? 'Loading…' : 'Show more'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Placard({ item }: { item: FeedItem }) {
  const like = useLike();
  const cover = item.pieces[0];
  // Never read straight off the payload: see makerOf.
  const maker = makerOf(item);

  return (
    <Card className="overflow-hidden py-0">
      {cover &&
        (cover.kind === 'video' ? (
          // The film brings its own frame, so the count sits over it — and
          // does not take clicks, which belong to play and pause.
          <div className="relative">
            <ShowcaseFilm piece={cover} alt={item.title ?? ''} />
            {item.pieces.length > 1 && (
              <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-bold text-white">
                {item.pieces.length}
              </span>
            )}
          </div>
        ) : (
          <div className="relative aspect-[4/5] w-full bg-muted">
            {/* `url` is the 640 px B2 copy, which next/image is allowed to load.
                displaySources is never passed: the media host is not in its
                allow-list. A film's `url` is its poster frame, written to the
                same bucket, so it loads here on the same terms. */}
            <Image
              src={cover.url}
              alt={item.title ?? ''}
              fill
              sizes="(max-width: 768px) 100vw, 672px"
              className="object-cover"
            />
            {item.pieces.length > 1 && (
              <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-bold text-white">
                {item.pieces.length}
              </span>
            )}
          </div>
        ))}

      <div className="p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-sm font-bold text-primary">
            {maker.avatarUrl ? (
              <Image src={maker.avatarUrl} alt="" width={36} height={36} />
            ) : (
              maker.displayName.charAt(0).toUpperCase()
            )}
          </span>
          <div className="min-w-0 flex-1">
            {maker.handle ? (
              <Link href={`/u/${maker.handle}`} className="text-sm font-bold hover:underline">
                {maker.displayName}
              </Link>
            ) : (
              <p className="text-sm font-bold">{maker.displayName}</p>
            )}
            <p className="truncate text-xs text-muted-foreground">
              {[maker.title, item.location].filter(Boolean).join(' · ')}
            </p>
          </div>
          {item.showHire && maker.handle && (
            <Button asChild size="sm">
              <Link href={`/hire/${maker.handle}`}>Hire</Link>
            </Button>
          )}
        </div>

        {item.title && <h2 className="mt-3 text-[17px] font-semibold">{item.title}</h2>}
        {item.caption && (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.caption}</p>
        )}

        {(item.craftNote || item.craftTags.length > 0) && (
          <div className="mt-4 border-t pt-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
              How it was made
            </p>
            {item.craftNote && <p className="mt-1.5 text-sm leading-6">{item.craftNote}</p>}
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
          >
            <Heart className={cn('size-4', item.likedByMe && 'fill-current')} />
            {item.likeCount > 0 ? item.likeCount : 'Like'}
          </button>
          <span className="flex items-center gap-1.5">
            <MessageCircle className="size-4" />
            {item.commentCount}
          </span>
          <span className="flex items-center gap-1.5">
            <Bookmark className={cn('size-4', item.keptByMe && 'fill-current')} />
            {item.keptCount}
          </span>
        </div>
      </div>
    </Card>
  );
}
