'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CloudOff, ImageOff } from 'lucide-react';
import { Screen } from '@/components/app-shell';
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

/**
 * One showcase on its own page.
 *
 * The feed's cards no longer lead here — everything the page offered is on
 * the card — so this is where a notification, a shared link or a new tab
 * lands. It draws the same card, with the caption and the note open, the
 * thread under it rather than in a dialog, and a way to open a photograph
 * as large as the window allows.
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
  const label = showcase.title ?? `${makerOf(showcase).displayName}'s showcase`;
  // The lightbox steps through photographs only; a film plays where it sits.
  const photos = showcase.pieces.filter((piece) => piece.kind !== 'video');

  // The comment button goes to the box under the post rather than a dialog
  // over it: the thread is already on the page.
  const toComposer = () => {
    const thread = document.getElementById('comments');
    thread?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    thread?.querySelector('textarea')?.focus({ preventScroll: true });
  };

  return (
    <Screen title={showcase.title ?? 'Showcase'}>
      <ShowcaseHost>
        <div className="mx-auto w-full max-w-[532px] px-4 py-6">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-4 text-muted-foreground"
            onClick={goBack}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>

          {mine && <StatusBanner showcase={showcase} className="mb-4" />}

          <ShowcaseCard
            item={showcase}
            variant="page"
            priority
            onDeleted={() => router.replace('/profile')}
            onComment={toComposer}
            onOpenPhoto={(piece) => setViewing(photos.indexOf(piece))}
          />

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
      </ShowcaseHost>
    </Screen>
  );
}
