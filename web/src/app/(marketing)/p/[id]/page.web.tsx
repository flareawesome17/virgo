/* eslint-disable @next/next/no-img-element -- the post's own web copies, already sized by the API, from hosts next/image would have to proxy */
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { Heart, MapPin } from 'lucide-react';
import type { PublicShowcase, ShowcasePiece } from '@/api';
import { APP_URL, SIGN_IN_URL, SIGN_UP_URL } from '@/components/landing/links';
import { Credits, MoreLinks } from '@/components/story/page/chapters/closing';
import { ShareFilm } from './share-film';
import {
  SITE,
  canonicalUrl,
  headline,
  makerName,
  postedOn,
  readShowcase,
  shareStill,
  summary,
} from './share-data';

/**
 * The page a shared post opens: virgo.ph/p/<id>.
 *
 * The one place somebody's work is shown to the open web, and only work its
 * maker showed to everyone — the API refuses anything else with one 404, and
 * so does this page. It exists for two readers: the person a link was sent
 * to, who should see the work whole and find their way into Virgo, and the
 * crawler behind every chat app's link preview, which needs the title, the
 * words and one good still in the <head>.
 *
 * A server component with one small client island (a film, when there is
 * one). Rendered per request and never cached, so a post made private stops
 * showing here at once. `web.tsx`, like the other per-request pages on this
 * site: nothing here can be exported to a static desktop build.
 */
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2EDE8]';
const SERIF = '[font-family:var(--font-display),ui-serif,Georgia,serif]';

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const showcase = await readShowcase(id);
  // The page answers 404, with layout.tsx's "not available" metadata.
  if (!showcase) return {};

  const title = `${headline(showcase)} · Virgo`;
  const description = summary(showcase);
  const url = canonicalUrl(showcase.id);
  const still = shareStill(showcase.pieces[0]);
  const alt = `${headline(showcase)}, by ${makerName(showcase)}`;
  const image = { url: still.url, width: still.width, height: still.height, alt };

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    // Open to whoever has the link, and to the previews chat apps draw, but
    // not listed by search engines: profiles left the open web on purpose,
    // and a maker sharing one post has not asked for it to be found by name.
    robots: { index: false, follow: true },
    openGraph: {
      type: 'article',
      url,
      siteName: 'Virgo',
      title,
      description,
      publishedTime: showcase.publishedAt,
      // Named, so the marketing site's own card never stands in for the work.
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

export default async function SharedShowcasePage({ params }: Params) {
  const { id } = await params;
  const showcase = await readShowcase(id);
  if (!showcase) notFound();

  const name = makerName(showcase);
  const title = headline(showcase);
  const posted = postedOn(showcase.publishedAt);
  const openInApp = `${APP_URL}/showcase/${showcase.id}`;

  return (
    <div className="relative isolate min-h-svh bg-[#161311] text-[#F2EDE8] [overflow-x:clip]">
      {/* A warm key light above the work, settling into the night. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70svh] bg-[radial-gradient(60%_55%_at_50%_0%,rgba(209,138,90,0.16),rgba(22,19,17,0)_70%)]"
      />

      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pt-4 sm:px-8 sm:pt-6">
        <a
          href={SITE}
          aria-label="Virgo"
          className={`inline-flex min-h-10 items-center gap-2 rounded-md opacity-80 transition-opacity hover:opacity-100 ${FOCUS}`}
        >
          <span
            aria-hidden
            className="block size-6 bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: 'url(/logo.png)' }}
          />
          <span aria-hidden className="font-mono text-[11px] uppercase tracking-[0.42em]">
            Virgo
          </span>
        </a>
        <nav aria-label="Account" className="flex items-center gap-1.5 sm:gap-2">
          <a
            href={SIGN_IN_URL}
            className={`inline-flex min-h-9 items-center rounded-full border border-white/10 bg-[#161311]/60 px-3.5 text-[13px] font-medium text-[#D8CCC4] transition-colors hover:text-[#F2EDE8] ${FOCUS}`}
          >
            Sign in
          </a>
          <a
            href={SIGN_UP_URL}
            className={`inline-flex min-h-9 items-center rounded-full bg-[#D18A5A] px-4 text-[13px] font-semibold text-[#161311] transition-colors hover:bg-[#E09A69] ${FOCUS}`}
          >
            Join Virgo
          </a>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-8 sm:pt-12">
        <article aria-labelledby="showcase-title">
          <Byline showcase={showcase} />

          <div className="mt-6 flex flex-col gap-3 sm:gap-4">
            {showcase.pieces.map((piece, index) => (
              <Piece
                key={piece.fileKey}
                piece={piece}
                index={index}
                count={showcase.pieces.length}
                title={title}
                name={name}
              />
            ))}
          </div>

          <div className="mt-8">
            <h1
              id="showcase-title"
              className={`text-balance text-[clamp(1.9rem,1.3rem+2.4vw,2.9rem)] leading-[1.05] tracking-[-0.012em] ${SERIF}`}
            >
              {title}
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-[0.16em] text-[#A08E84]">
              {showcase.location?.trim() && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin aria-hidden className="size-3.5" />
                  {showcase.location.trim()}
                </span>
              )}
              {posted && <time dateTime={showcase.publishedAt}>{posted}</time>}
              {showcase.likeCount > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Heart aria-hidden className="size-3.5" />
                  {showcase.likeCount === 1 ? '1 like' : `${showcase.likeCount.toLocaleString('en-PH')} likes`}
                </span>
              )}
            </p>
            {showcase.caption?.trim() && (
              <p className="mt-5 whitespace-pre-line text-pretty text-[1.0625rem] leading-[1.6] text-[#D8CCC4]">
                {showcase.caption.trim()}
              </p>
            )}
          </div>
        </article>

        <section
          aria-labelledby="join-title"
          className="mt-14 rounded-2xl border border-[#2A2522] bg-[#1A1614]/80 p-6 sm:p-8"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-[#D18A5A]">Virgo</p>
          <h2 id="join-title" className={`mt-3 text-balance text-[1.75rem] leading-[1.1] ${SERIF}`}>
            See more of {name}’s work, and find the people you shoot with.
          </h2>
          <p className="mt-3 max-w-[52ch] text-pretty text-[15px] leading-relaxed text-[#BCADA3]">
            Photographers, videographers, editors and HMUAs in the Philippines show their work on Virgo, get
            hired, and run the whole job in one place.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href={openInApp}
              className={`inline-flex min-h-12 items-center justify-center rounded-full bg-[#D18A5A] px-7 text-base font-semibold text-[#161311] shadow-[0_14px_44px_-14px_rgba(209,138,90,0.75)] transition-colors hover:bg-[#E09A69] ${FOCUS}`}
            >
              Open in Virgo
            </a>
            <a
              href={SIGN_UP_URL}
              className={`inline-flex min-h-12 items-center justify-center rounded-full bg-[#F2EDE8] px-7 text-base font-semibold text-[#161311] transition-colors hover:bg-white ${FOCUS}`}
            >
              Join Virgo
            </a>
            <a
              href={`${SITE}/download`}
              className={`inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 px-6 text-base font-semibold text-[#F2EDE8] transition-colors hover:border-white/35 ${FOCUS}`}
            >
              Get the app
            </a>
          </div>
        </section>
      </main>

      <footer className="flex flex-col items-center gap-8 border-t border-white/[0.06] px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-12 sm:px-8">
        <MoreLinks />
        <Credits data={false} honesty={false} />
      </footer>
    </div>
  );
}

/** Who made it: their face, name and title, linked to their profile once it is published. */
function Byline({ showcase }: { showcase: PublicShowcase }) {
  const name = makerName(showcase);
  const { avatarUrl, handle, title } = showcase.maker;
  const initial = name.slice(0, 1).toUpperCase();

  const body = (
    <>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          width={44}
          height={44}
          decoding="async"
          className="size-11 shrink-0 rounded-full bg-[#2A2522] object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-full bg-[#2A2522] text-base font-semibold text-[#D8CCC4]"
        >
          {initial}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold text-[#F2EDE8]">{name}</span>
        {title?.trim() && <span className="block truncate text-[13px] text-[#A08E84]">{title.trim()}</span>}
      </span>
    </>
  );

  return handle ? (
    <a
      href={`${SITE}/@${handle}`}
      className={`-mx-1 inline-flex max-w-full items-center gap-3 rounded-xl px-1 py-1 transition-colors hover:bg-white/[0.04] ${FOCUS}`}
    >
      {body}
    </a>
  ) : (
    <div className="inline-flex max-w-full items-center gap-3 py-1">{body}</div>
  );
}

/** Never taller than this much of the screen, so a portrait is seen whole. */
const MAX_HEIGHT_SVH = 88;

/**
 * A piece's box, when its shape is known: its own aspect ratio, as wide as
 * the column allows and no taller than the screen. Set before anything
 * loads, so the page does not jump as the work arrives. Unknown, the media
 * sizes itself within the same limits.
 */
function frameOf(piece: ShowcasePiece): {
  size: { width: number; height: number } | Record<string, never>;
  style: CSSProperties | undefined;
} {
  if (!piece.width || !piece.height) return { size: {}, style: undefined };
  const ratio = piece.width / piece.height;
  return {
    size: { width: piece.width, height: piece.height },
    style: {
      aspectRatio: `${piece.width} / ${piece.height}`,
      width: `min(100%, ${(MAX_HEIGHT_SVH * ratio).toFixed(3)}svh)`,
    },
  };
}

/**
 * One piece, whole: at its own shape, never cropped, no taller than the
 * screen. The first is fetched first; the rest wait until they are near.
 */
function Piece({
  piece,
  index,
  count,
  title,
  name,
}: {
  piece: ShowcasePiece;
  index: number;
  count: number;
  title: string;
  name: string;
}) {
  const label = count > 1 ? `${title}, by ${name} (${index + 1} of ${count})` : `${title}, by ${name}`;
  const { size, style } = frameOf(piece);
  const media = 'mx-auto block h-auto max-h-[88svh] max-w-full';

  if (piece.kind === 'video') {
    return (
      <figure className="overflow-hidden rounded-xl border border-white/[0.06] bg-black">
        {piece.playbackUrl ? (
          <ShareFilm
            src={piece.playbackUrl}
            poster={piece.url}
            label={label}
            className={media}
            style={style}
            {...size}
          />
        ) : (
          <img
            src={piece.url}
            alt={label}
            decoding="async"
            {...size}
            style={style}
            className={`${media} ${style ? '' : 'w-auto'}`}
          />
        )}
      </figure>
    );
  }

  const srcSet = piece.displaySources.map((source) => `${source.url} ${source.width}w`).join(', ');
  return (
    <figure className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#0F0D0C]">
      <img
        src={piece.url}
        srcSet={srcSet || undefined}
        sizes={srcSet ? '(min-width: 768px) 704px, calc(100vw - 32px)' : undefined}
        alt={label}
        decoding="async"
        {...(index === 0 ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
        {...size}
        style={style}
        className={`${media} ${style ? '' : 'w-auto'}`}
      />
    </figure>
  );
}
