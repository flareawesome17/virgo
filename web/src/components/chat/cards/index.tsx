'use client';

import {
  budgetRangeLabel,
  myPlanAnswer,
  planWhenLine,
  rateLabel,
  type AlbumCardContext,
  type BookingCardContext,
  type CardKind,
  type ConversationMessage,
  type DatePlanCardContext,
  type JobPostCardContext,
  type PackageCardContext,
  type PostCardContext,
} from '@/api';
import type { CardEnv } from '@/components/chat/cards/card-parts';
import { AlbumPhotosCard, albumCardLines } from '@/components/chat/cards/album-card';
import { BookingCard, bookingCardLabel, bookingCardTitle, bookingCardWhen } from '@/components/chat/cards/booking-card';
import { JobPostCard, jobCardLine, jobStatusWord } from '@/components/chat/cards/job-post-card';
import { PostCard, postCardByline, postCardTitle } from '@/components/chat/cards/post-card';
import { PackageCard, packageCardMoney } from '@/components/chat/cards/package-card';
import { DatePlanCard, planTallyLine } from '@/components/chat/cards/date-card';

export type { CardEnv } from '@/components/chat/cards/card-parts';

/**
 * Whether a card sits centred, as the app's own words, or on its sender's
 * side. A booking is an agreement between two people, so it is centred like
 * "job accepted"; everything else is something one person showed the chat.
 */
export function cardIsCentred(kind: CardKind): boolean {
  return kind === 'booking';
}

/** A Virgo thing shared in the chat, drawn by its kind. */
export function ChatCard({ message, env }: { message: ConversationMessage & { kind: CardKind }; env: CardEnv }) {
  const context = message.context ?? null;
  switch (message.kind) {
    case 'album-photos':
      return <AlbumPhotosCard context={context as AlbumCardContext | null} env={env} />;
    case 'booking':
      return <BookingCard context={context as BookingCardContext | null} env={env} />;
    case 'job-post':
      return <JobPostCard context={context as JobPostCardContext | null} env={env} />;
    case 'post':
      return <PostCard context={context as PostCardContext | null} env={env} />;
    case 'package':
      return <PackageCard context={context as PackageCardContext | null} env={env} />;
    case 'date-plan':
      return <DatePlanCard messageId={message.id} context={context as DatePlanCardContext | null} env={env} />;
  }
}

/**
 * The card read out, for its row's label: what it is and what it says, as
 * a screen reader should hear it before reaching its buttons.
 */
export function cardReadout(message: ConversationMessage & { kind: CardKind }, env: CardEnv): string {
  const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(', ');
  switch (message.kind) {
    case 'album-photos': {
      const album = (message.context as AlbumCardContext | null)?.album;
      if (!album) return 'Album photos, no longer shared';
      const [first, second] = albumCardLines(album, env);
      return join('Album photos', first, second);
    }
    case 'booking': {
      const booking = (message.context as BookingCardContext | null)?.booking;
      if (!booking) return 'Booking, no longer available';
      const rate = rateLabel(booking.rateMinor, booking.currency);
      return join(bookingCardLabel(booking), bookingCardTitle(booking), bookingCardWhen(booking), rate && `rate ${rate}`);
    }
    case 'job-post': {
      const job = (message.context as JobPostCardContext | null)?.job;
      if (!job) return 'Job post, no longer available';
      return join('Job post', job.title, jobCardLine(job), budgetRangeLabel(job.budgetMin, job.budgetMax), jobStatusWord(job));
    }
    case 'post': {
      const post = (message.context as PostCardContext | null)?.post;
      if (!post) return 'Post, no longer up';
      return join(post.film ? 'Post, a film' : 'Post', postCardTitle(post), postCardByline(post, env.meId));
    }
    case 'package': {
      const pkg = (message.context as PackageCardContext | null)?.package;
      if (!pkg) return 'Package, no longer shared';
      return join('Package', pkg.title, packageCardMoney(pkg), !pkg.statementUrl && 'statement no longer shared');
    }
    case 'date-plan': {
      const plan = (message.context as DatePlanCardContext | null)?.plan;
      if (!plan) return 'Date, removed';
      const { going, rest } = planTallyLine(plan, env);
      const me = myPlanAnswer(plan, env.meId);
      const yours =
        me === 'accepted'
          ? "you're going"
          : me === 'declined'
            ? "you can't go"
            : me === 'pending'
              ? "you haven't answered"
              : null;
      return join('Date', plan.title, planWhenLine(plan), yours, going, rest);
    }
  }
}
