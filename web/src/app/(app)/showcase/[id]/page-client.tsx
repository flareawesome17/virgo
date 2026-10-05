'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Bookmark, CloudOff, Heart, ImageOff, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Screen } from '@/components/app-shell';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ShowcaseFilm } from '@/components/media/showcase-film';
import { CommentThread } from '@/components/showcase/comment-thread';
import { useKeepFlow } from '@/components/showcase/keep-flow';
import { PieceLightbox } from '@/components/showcase/piece-lightbox';
import { ShowcaseReportDialog } from '@/components/showcase/report-dialog';
import { PieceImage, naturalAspect } from '@/components/showcase/showcase-media';
import { ShowcaseMenu } from '@/components/showcase/showcase-menu';
import { OwnShowcaseMenu } from '@/components/showcase/owner-menu';
import { useAuth } from '@/hooks/useAuth';
import { useLike, useShowcase, useShowcaseActions } from '@/hooks/useShowcases';
import { ApiError, makerOf, showcaseStatus, type ShowcasePiece } from '@/api';
import { cn } from '@/lib/utils';

/** How wide a piece is drawn: the same column as the feed. */
const COLUMN_SIZES = '(max-width: 672px) calc(100vw - 48px), 624px';

/**
 * The tallest a piece's frame may be, as width over height. A phone's 9:16
 * frame is shown whole inside a 4:5 one rather than cropped, so one portrait
 * film is not taller than the window it is watched in. Anything wider than
 * that is drawn at exactly its own shape.
 */
const TALLEST = 4 / 5;

/**
 * One showcase, whole.
 *
 * The feed shows the set and as much of the note as fits; this is where every
 * piece is shown at its own shape — nothing cropped — opens large to look at
 * closely, and where the thread under it is read and added to.
 */
export default function ShowcasePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { showcase, error, isLoading, loadFailed, refetch } = useShowcase(id);
  const like = useLike(id);
  const keepFlow = useKeepFlow(user?.id);
  const { setPublished } = useShowcaseActions();
  const [reporting, setReporting] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);

  /*
   * A card's comment count links here with #comments. The browser looks for
   * that anchor before the post has drawn, finds nothing and stays at the
   * top, so it is looked for again once the post is on the page.
   */
  const ready = showcase !== null;
  const jumped = useRef(false);
  useEffect(() => {
    if (!ready || jumped.current) return;
    jumped.current = true;
    if (window.location.hash === '#comments') {
      document.getElementById('comments')?.scrollIntoView({ block: 'start' });
    }
  }, [ready]);

  // Opened from a shared link there is no page to go back to, and back would
  // leave the app altogether.
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push('/feed');
  };

  if (!showcase) {
    if (isLoading) {
      return (
        <Screen title="Showcase">
          <CenteredSpinner />
        </Screen>
      );
    }
    // Gone is not offline. A post taken down or deleted must not say "check
    // your connection", with a Try again that can only ever fail again.
    const gone = error instanceof ApiError && (error.status === 404 || error.status === 403);
    return (
      <Screen title="Showcase">
        {gone || !loadFailed ? (
          <EmptyState
            icon={ImageOff}
            title="This showcase isn't here any more"
            description="The person who posted it took it down or deleted it."
            action={<Button onClick={() => router.push('/feed')}>Back to the feed</Button>}
          />
        ) : (
          <EmptyState
            icon={CloudOff}
            title="Couldn't load this showcase"
            description="Check your connection and try again."
            action={<Button onClick={() => void refetch()}>Try again</Button>}
          />
        )}
      </Screen>
    );
  }

  const mine = !!user && showcase.userId === user.id;
  // Never read straight off the payload: see makerOf.
  const maker = makerOf(showcase);
  // Only ever not 'live' for the owner: nobody else is sent anything else.
  const status = showcaseStatus(showcase);
  const label = showcase.title ?? `${maker.displayName}'s showcase`;
  // The lightbox steps through photographs only; a film plays where it sits.
  const photos = showcase.pieces.filter((piece) => piece.kind !== 'video');
  // Your own profile needs no published handle; anybody else's is only
  // reachable once they have published one.
  const profileHref = mine ? '/profile' : maker.handle ? `/u/${maker.handle}` : null;

  const putBackUp = () => {
    setPublished.mutate(
      { id: showcase.id, published: true },
      { onError: () => toast.error("Couldn't change that. Try again.") },
    );
  };

  return (
    <Screen title={showcase.title ?? 'Showcase'}>
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-4 text-muted-foreground"
          onClick={goBack}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        {mine && status !== 'live' && (
          <StatusBanner status={status} pending={setPublished.isPending} onRestore={putBackUp} />
        )}

        <Card className="gap-0 overflow-hidden py-0">
          <div className="grid gap-1">
            {showcase.pieces.map((piece, i) => (
              <Piece
                key={piece.fileKey}
                piece={piece}
                alt={
                  showcase.pieces.length > 1 ? `${label}, ${i + 1} of ${showcase.pieces.length}` : label
                }
                priority={i === 0}
                onOpen={() => setViewing(photos.indexOf(piece))}
              />
            ))}
          </div>

          <div className="p-5">
            {/* Who made it, and what you can do about it. */}
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-sm font-bold text-primary">
                {maker.avatarUrl ? (
                  <Image src={maker.avatarUrl} alt="" width={40} height={40} />
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
                {maker.title && (
                  <p className="truncate text-xs text-muted-foreground">{maker.title}</p>
                )}
              </div>
              {showcase.showHire && maker.handle && !mine && (
                <Button asChild size="sm">
                  <Link href={`/hire/${maker.handle}`}>Hire</Link>
                </Button>
              )}
              {mine ? (
                <OwnShowcaseMenu
                  showcase={showcase}
                  onDeleted={() => router.replace('/profile')}
                />
              ) : (
                <ShowcaseMenu maker={maker} onReport={() => setReporting(showcase.id)} />
              )}
            </div>

            <div className="mt-4 flex gap-2.5">
              <Button
                variant="outline"
                className={cn('flex-1', showcase.likedByMe && 'text-destructive hover:text-destructive')}
                onClick={() => like.mutate({ showcaseId: showcase.id, liked: !showcase.likedByMe })}
                aria-pressed={showcase.likedByMe}
                aria-label={showcase.likedByMe ? 'Liked. Click to unlike.' : 'Like'}
              >
                <Heart className={cn(showcase.likedByMe && 'fill-current')} />
                {showcase.likeCount > 0 ? showcase.likeCount : 'Like'}
              </Button>
              {/* Keeping your own work is refused by the server, so it is not
                  offered here either. */}
              {!mine && (
                <Button
                  variant={showcase.keptByMe ? 'secondary' : 'default'}
                  className={cn('flex-1', showcase.keptByMe && 'text-primary')}
                  onClick={() => keepFlow.onKeep(showcase)}
                  aria-pressed={showcase.keptByMe}
                  aria-label={showcase.keptByMe ? 'Kept. Change where.' : 'Keep this'}
                >
                  <Bookmark className={cn(showcase.keptByMe && 'fill-current')} />
                  {showcase.keptByMe ? 'Kept' : 'Keep'}
                </Button>
              )}
            </div>

            <div className="mt-5">
              {showcase.title && (
                <h1 className="text-xl font-bold leading-7">{showcase.title}</h1>
              )}
              {showcase.location && (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-3.5" />
                  {showcase.location}
                </p>
              )}
              {showcase.caption && (
                <p className="mt-3 whitespace-pre-line text-sm leading-6">{showcase.caption}</p>
              )}

              {(showcase.craftNote || showcase.craftTags.length > 0) && (
                <div className="mt-5 border-t pt-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
                    How it was made
                  </p>
                  {showcase.craftNote && (
                    <p className="mt-2 whitespace-pre-line text-sm leading-6">
                      {showcase.craftNote}
                    </p>
                  )}
                  {showcase.craftTags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {showcase.craftTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
                    Written by the photographer. Virgo never reads this from the file.
                  </p>
                </div>
              )}

              {showcase.keptCount > 0 && (
                <p className="mt-5 text-xs text-muted-foreground">
                  Kept by {showcase.keptCount} {showcase.keptCount === 1 ? 'person' : 'people'}
                </p>
              )}
            </div>
          </div>
        </Card>

        <div className="mt-6">
          <CommentThread
            showcaseId={showcase.id}
            isOwner={mine}
            total={showcase.commentCount}
            userId={user?.id}
          />
        </div>
      </div>

      <PieceLightbox
        pieces={photos}
        index={viewing}
        title={label}
        onIndexChange={setViewing}
        onClose={() => setViewing(null)}
      />
      {keepFlow.element}
      <ShowcaseReportDialog showcaseId={reporting} onClose={() => setReporting(null)} />
    </Screen>
  );
}

/**
 * One piece, whole: at its own shape, inside a frame no taller than 4:5. A
 * photograph opens in the lightbox; a film is its own control.
 */
function Piece({
  piece,
  alt,
  priority,
  onOpen,
}: {
  piece: ShowcasePiece;
  alt: string;
  priority: boolean;
  onOpen: () => void;
}) {
  const aspect = Math.max(TALLEST, naturalAspect(piece));

  if (piece.kind === 'video') {
    return <ShowcaseFilm piece={piece} alt={alt} aspect={aspect} fit="contain" />;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${alt}. Open it large.`}
      className="relative block w-full cursor-zoom-in bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      style={{ aspectRatio: aspect }}
    >
      <PieceImage
        piece={piece}
        alt={alt}
        sizes={COLUMN_SIZES}
        fit="contain"
        priority={priority}
      />
    </button>
  );
}

/**
 * What the owner is told about a post that is not live. Nobody else ever sees
 * one, so this is the only place its state is said out loud.
 */
function StatusBanner({
  status,
  pending,
  onRestore,
}: {
  status: 'draft' | 'down' | 'removed';
  pending: boolean;
  onRestore: () => void;
}) {
  if (status === 'removed') {
    return (
      <div className="mb-4 rounded-xl bg-destructive/10 p-4">
        <p className="text-sm font-bold text-destructive">Virgo took this down</p>
        <p className="mt-1 text-sm leading-6">
          It was reported and reviewed, and only you can see it now. If you think that was a
          mistake, tell us.
        </p>
        <Link
          href="/support"
          className="mt-2 inline-block text-sm font-bold text-primary hover:underline"
        >
          Contact support
        </Link>
      </div>
    );
  }
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl bg-secondary p-4">
      <div className="flex-1">
        <p className="text-sm font-bold">{status === 'draft' ? 'Not posted yet' : 'Taken down'}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">Only you can see it.</p>
      </div>
      <Button size="sm" onClick={onRestore} disabled={pending}>
        {status === 'draft' ? 'Post it' : 'Put back up'}
      </Button>
    </div>
  );
}
