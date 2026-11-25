'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, CloudOff, ImageOff } from 'lucide-react';
import { PageHeader, Screen } from '@/components/app-shell';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { CommentThread } from '@/components/showcase/comment-thread';
import { PieceLightbox } from '@/components/showcase/piece-lightbox';
import { ShowcaseCard } from '@/components/showcase/showcase-card';
import { ShowcaseHost } from '@/components/showcase/showcase-host';
import { StatusBanner } from '@/components/showcase/status-banner';
import { useAuth } from '@/hooks/useAuth';
import { useShowcase } from '@/hooks/useShowcases';
import { ApiError, makerOf } from '@/api';
import { IS_DESKTOP } from '@/lib/desktop';

/**
 * One showcase on its own page.
 *
 * The feed's cards no longer lead here — everything the page offered is on
 * the card — so this is where a notification, a shared link or a new tab
 * lands. It draws the card's parts in two columns: the work large on the
 * left, with the set's thumbnails under it and a way to open a photograph
 * as large as the window allows; on the right who made it, the words, the
 * note open, and the thread written out on the page rather than in a dialog.
 */
export default function ShowcasePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { showcase, error, isLoading, loadFailed, refetch } = useShowcase(id);
  const [viewing, setViewing] = useState<number | null>(null);

  /*
   * A comment notification links here with #comments. The browser looks for
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
            title="This post is no longer available"
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
  const maker = makerOf(showcase);
  const label = showcase.title ?? `${maker.displayName}'s showcase`;
  // The lightbox steps through photographs only; a film plays where it sits.
  const photos = showcase.pieces.filter((piece) => piece.kind !== 'video');

  // The comment button goes to the box under the thread rather than a dialog
  // over the post: the thread is already on the page. With comments off
  // there is no box, and it goes to the thread instead.
  const toComposer = () => {
    const thread = document.getElementById('comments');
    const box = thread?.querySelector('textarea');
    (box ?? thread)?.scrollIntoView({ block: box ? 'center' : 'start', behavior: 'smooth' });
    box?.focus({ preventScroll: true });
  };

  return (
    <Screen title={showcase.title ?? 'Showcase'}>
      {/* Where the post sits, in the shell's bar. On a phone-sized window
          there is room for its title alone, and an arrow back. */}
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
            {/* The desktop title bar already has back and forward. */}
            {!IS_DESKTOP && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-ml-2 shrink-0 sm:hidden"
                aria-label="Back"
                onClick={goBack}
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <Link
              href="/feed"
              className="hidden shrink-0 font-medium text-muted-foreground hover:text-foreground sm:inline"
            >
              Feed
            </Link>
            <ChevronRight
              className="hidden size-3.5 shrink-0 text-muted-foreground/70 sm:block"
              aria-hidden
            />
            <span className="truncate">{showcase.title ?? 'Showcase'}</span>
          </span>
        }
      />

      <ShowcaseHost>
        <div className="mx-auto w-full max-w-[1240px] px-4 pb-12 pt-7 sm:px-6">
          {mine && <StatusBanner showcase={showcase} className="mb-6" />}

          <ShowcaseCard
            item={showcase}
            variant="page"
            priority
            onDeleted={() => router.replace('/profile')}
            onComment={toComposer}
            onOpenPhoto={(piece) => setViewing(photos.indexOf(piece))}
          >
            <CommentThread
              showcaseId={showcase.id}
              isOwner={mine}
              makerId={showcase.userId}
              total={showcase.commentCount}
              userId={user?.id}
            />
          </ShowcaseCard>
        </div>

        <PieceLightbox
          pieces={photos}
          index={viewing}
          title={label}
          makerName={maker.displayName}
          craftTags={showcase.craftTags}
          onIndexChange={setViewing}
          onClose={() => setViewing(null)}
        />
      </ShowcaseHost>
    </Screen>
  );
}
