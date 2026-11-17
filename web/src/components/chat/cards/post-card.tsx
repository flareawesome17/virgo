'use client';

/* eslint-disable @next/next/no-img-element -- a signed thumbnail, already small */

import Link from 'next/link';
import { useState } from 'react';
import { GalleryVerticalEnd, Play } from 'lucide-react';
import { useMediaAutoLoad } from '@/components/chat/connection';
import type { PostCardContext } from '@/api';
import {
  BlurredStandIn,
  CardKindLabel,
  ClickToLoad,
  GoneNote,
  cardShell,
  type CardEnv,
} from '@/components/chat/cards/card-parts';

/** Its title, or whose it is. */
export function postCardTitle(post: NonNullable<PostCardContext['post']>): string {
  return post.title?.trim() || `A post by ${post.makerName}`;
}

/** "Yours · 128 likes", "Ana Lim · 1 like". */
export function postCardByline(post: NonNullable<PostCardContext['post']>, meId: string | undefined): string {
  const likes = `${post.likeCount} like${post.likeCount === 1 ? '' : 's'}`;
  return `${post.makerId === meId ? 'Yours' : post.makerName} · ${likes}`;
}

/**
 * A post (board ChatCards): the work small, its title and who made it.
 * Opens the post. Its picture waits for a click on a weak signal, as a link
 * preview's does.
 */
export function PostCard({ context, env }: { context: PostCardContext | null; env: CardEnv }) {
  const { autoLoad } = useMediaAutoLoad();
  const [revealed, setRevealed] = useState(false);
  const post = context?.post;

  if (!post) {
    return (
      <div className={cardShell(env.mine, 'flex w-72 flex-col gap-1.5 px-3.5 py-3')}>
        <CardKindLabel icon={GalleryVerticalEnd}>Post</CardKindLabel>
        <GoneNote>This post isn&apos;t up any more.</GoneNote>
      </div>
    );
  }

  const show = autoLoad || revealed;
  const held = !show && !!post.thumbUrl;
  const title = postCardTitle(post);

  return (
    <Link
      href={`/showcase/${post.id}`}
      onClick={(event) => {
        if (!held) return;
        event.preventDefault();
        setRevealed(true);
      }}
      aria-label={held ? `Load the picture: ${title}` : `Open ${title}`}
      className={cardShell(
        env.mine,
        'flex w-72 items-center gap-3 p-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <span className="relative block h-[90px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-muted">
        {show ? (
          post.thumbUrl && (
            <img src={post.thumbUrl} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
          )
        ) : (
          <BlurredStandIn src={post.blur} />
        )}
        {post.film && (
          <span className="absolute bottom-1 left-1 grid size-5 place-items-center rounded bg-black/65 text-white">
            <Play className="size-3 fill-current" aria-label="Film" />
          </span>
        )}
        {held && <ClickToLoad small />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-bold text-muted-foreground">Post</span>
        <span className="line-clamp-2 text-sm font-semibold leading-5">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{postCardByline(post, env.meId)}</span>
      </span>
    </Link>
  );
}
